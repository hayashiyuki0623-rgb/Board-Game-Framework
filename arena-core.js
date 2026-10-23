/**
 * 🎲 BOARD ARENA - Platform Core Engine
 * マルチゲーム統合アーキテクチャ & WebRTC P2P基盤
 */

(function () {
  const PEER_PREFIX = 'board-arena-v1-';
  
  // プラットフォーム共通ステート
  const state = {
    games: new Map(),
    activeGame: null,
    peer: null,
    conn: null,
    isHost: false,
    roomCode: '',
    isConnected: false,
    localName: localStorage.getItem('ba_username') || 'プレイヤー',
    remoteName: '対戦相手',
    myPlayerIndex: 1 // 1=Host, 2=Guest
  };

  // UI要素
  const el = {
    catalogView: document.getElementById('catalog-view'),
    gameView: document.getElementById('game-view'),
    gamesGrid: document.getElementById('games-grid'),
    mountPoint: document.getElementById('game-mount-point'),
    networkStatus: document.getElementById('network-status'),
    usernameInput: document.getElementById('username-input'),
    logoBtn: document.getElementById('logo-btn'),
    backBtn: document.getElementById('back-to-catalog-btn'),
    activeGameTitle: document.getElementById('active-game-title'),
    shareRoomBtn: document.getElementById('share-room-btn'),
    
    p1Box: document.getElementById('p1-box'),
    p2Box: document.getElementById('p2-box'),
    p1NameDisplay: document.getElementById('p1-name-display'),
    p2NameDisplay: document.getElementById('p2-name-display'),
    matchStatusBadge: document.getElementById('match-status-badge'),
    
    lobbyModal: document.getElementById('lobby-modal'),
    lobbyGameTitle: document.getElementById('lobby-game-title'),
    createRoomBtn: document.getElementById('create-room-btn'),
    roomCreatedInfo: document.getElementById('room-created-info'),
    displayRoomCode: document.getElementById('display-room-code'),
    copyInviteUrlBtn: document.getElementById('copy-invite-url-btn'),
    copyToast: document.getElementById('copy-toast'),
    joinCodeInput: document.getElementById('join-code-input'),
    joinRoomBtn: document.getElementById('join-room-btn'),
    closeLobbyBtn: document.getElementById('close-lobby-btn'),
    chatToast: document.getElementById('chat-toast')
  };

  // ==========================================
  // 1. 公開 API (ゲームモジュール登録インターフェース)
  // ==========================================
  window.BoardArena = {
    registerGame(config) {
      if (!config.id) return;
      state.games.set(config.id, config);
      renderCatalogCard(config);
      checkInitialUrlRoute();
    }
  };

  // ==========================================
  // 2. カタログ画面レンダリング
  // ==========================================
  function renderCatalogCard(game) {
    const card = document.createElement('div');
    card.className = 'game-card';
    card.innerHTML = `
      <div>
        <div class="card-top">
          <div class="card-icon">${game.icon || '🎲'}</div>
          <div>
            <div class="card-title">${game.name}</div>
            <span class="card-badge">${game.category || 'ボードゲーム'}</span>
          </div>
        </div>
        <p class="card-desc">${game.description || ''}</p>
      </div>
      <div>
        <div class="card-meta">
          <span>👥 ${game.players || '2人対戦'}</span>
          <span>⏱️ ${game.playTime || '5-15分'}</span>
        </div>
        <button class="btn btn-primary card-btn">プレイする</button>
      </div>
    `;

    card.addEventListener('click', () => {
      openLobbyForGame(game.id);
    });

    el.gamesGrid.appendChild(card);
  }

  // ==========================================
  // 3. ロビー & モーダル処理
  // ==========================================
  let selectedGameId = null;

  function openLobbyForGame(gameId) {
    const game = state.games.get(gameId);
    if (!game) return;
    selectedGameId = gameId;

    el.lobbyGameTitle.textContent = `${game.icon || ''} ${game.name}`;
    el.roomCreatedInfo.classList.add('hidden');
    el.createRoomBtn.disabled = false;
    el.lobbyModal.classList.remove('hidden');
  }

  el.closeLobbyBtn.addEventListener('click', () => {
    el.lobbyModal.classList.add('hidden');
  });

  // ユーザー名変更
  el.usernameInput.value = state.localName;
  el.usernameInput.addEventListener('change', (e) => {
    state.localName = e.target.value.trim() || 'プレイヤー';
    localStorage.setItem('ba_username', state.localName);
    updatePlayersBar();
    if (state.isConnected) {
      sendPlatformPacket({ type: 'name_sync', name: state.localName });
    }
  });

  // ★ 部屋を作る（一人でも即座にゲーム盤面に入って待てる！）
  el.createRoomBtn.addEventListener('click', () => {
    state.isHost = true;
    state.myPlayerIndex = 1;
    state.isConnected = false;
    state.remoteName = '友達待機中…';
    state.roomCode = generateRoomCode();
    const fullPeerId = `${PEER_PREFIX}${selectedGameId}-${state.roomCode}`;

    if (state.peer) state.peer.destroy();
    initPeer(fullPeerId);

    // モーダルを閉じ、即座にゲーム画面に入場！
    el.lobbyModal.classList.add('hidden');
    launchGame(selectedGameId);

    // URLを自動クリップボードコピー
    const inviteUrl = getInviteUrl(selectedGameId, state.roomCode);
    navigator.clipboard.writeText(inviteUrl).catch(() => {});

    showToast(`部屋を作成しました (合言葉: ${state.roomCode})！招待URLをコピーしました`);
  });

  // 招待URLコピー
  el.copyInviteUrlBtn.addEventListener('click', () => copyInviteUrl());
  el.shareRoomBtn.addEventListener('click', () => copyInviteUrl());

  function getInviteUrl(gameId, code) {
    return `${window.location.origin}${window.location.pathname}?game=${gameId}&room=${code}`;
  }

  function copyInviteUrl() {
    if (!state.roomCode) {
      showToast('部屋が作成されていません');
      return;
    }
    const url = getInviteUrl(selectedGameId, state.roomCode);
    navigator.clipboard.writeText(url).then(() => {
      showToast('📋 招待URLをコピーしました！友達に送信してください');
    });
  }

  // 部屋に参加する
  el.joinRoomBtn.addEventListener('click', () => {
    const code = el.joinCodeInput.value.trim().toUpperCase();
    if (code.length < 4) {
      alert('4桁の合言葉を入力してください');
      return;
    }
    startJoin(selectedGameId, code);
  });

  function startJoin(gameId, code) {
    selectedGameId = gameId;
    state.isHost = false;
    state.myPlayerIndex = 2;
    state.isConnected = false;
    state.roomCode = code;
    state.remoteName = 'ホストに接続中…';
    const targetPeerId = `${PEER_PREFIX}${gameId}-${code}`;

    el.lobbyModal.classList.add('hidden');
    launchGame(selectedGameId);
    showToast(`ホスト (${code}) に接続中...`);

    if (state.peer) {
      state.conn = state.peer.connect(targetPeerId, { reliable: true });
      setupConnectionEvents();
    }
  }

  function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let c = '';
    for (let i = 0; i < 4; i++) c += chars.charAt(Math.floor(Math.random() * chars.length));
    return c;
  }

  // ==========================================
  // 4. WebRTC P2P (PeerJS) エンジン
  // ==========================================
  function initPeer(customId = null) {
    el.networkStatus.textContent = '接続待機中...';
    state.peer = customId ? new Peer(customId) : new Peer();

    state.peer.on('open', (id) => {
      el.networkStatus.textContent = '🟢 オンライン';
      el.networkStatus.classList.add('online');
    });

    state.peer.on('connection', (connection) => {
      state.conn = connection;
      setupConnectionEvents();
    });

    state.peer.on('error', (err) => {
      console.error('Peer error:', err);
      el.networkStatus.textContent = 'エラー: ' + err.type;
      el.networkStatus.classList.remove('online');
    });
  }

  const registeredGameDataListeners = new Set();
  const registeredPlayerJoinedListeners = new Set();

  function setupConnectionEvents() {
    state.conn.on('open', () => {
      state.isConnected = true;
      el.lobbyModal.classList.add('hidden');

      // プレイヤー名交換
      sendPlatformPacket({ type: 'name_sync', name: state.localName });

      updatePlayersBar();
      showToast('🎉 対戦相手が合流しました！ゲーム開始！');

      // ゲームコンポーネントに合流を通知
      registeredPlayerJoinedListeners.forEach(listener => listener());
    });

    state.conn.on('data', (data) => {
      handleIncomingPacket(data);
    });

    state.conn.on('close', () => {
      state.isConnected = false;
      alert('対戦相手の通信が切断されました。');
      exitToCatalog();
    });
  }

  function sendPlatformPacket(data) {
    if (state.conn && state.conn.open) {
      state.conn.send(data);
    }
  }

  function handleIncomingPacket(data) {
    if (data._platform) {
      if (data.type === 'name_sync') {
        state.remoteName = data.name;
        updatePlayersBar();
      } else if (data.type === 'emote') {
        showToast(`${state.remoteName}: ${data.msg}`);
      }
    } else {
      registeredGameDataListeners.forEach((listener) => listener(data));
    }
  }

  // ==========================================
  // 5. ゲームコンポーネントのマウント＆切替
  // ==========================================
  function launchGame(gameId) {
    const game = state.games.get(gameId);
    if (!game) return;

    if (state.activeGame && state.activeGame.unmount) {
      state.activeGame.unmount();
    }
    el.mountPoint.innerHTML = '';
    registeredGameDataListeners.clear();
    registeredPlayerJoinedListeners.clear();

    state.activeGame = game;
    el.activeGameTitle.textContent = `${game.icon || ''} ${game.name}`;

    el.catalogView.classList.remove('active');
    el.gameView.classList.add('active');

    updatePlayersBar();

    // ゲームモジュール用 P2P ブリッジ
    const p2pBridge = {
      isHost: state.isHost,
      myPlayerIndex: state.myPlayerIndex,
      isConnected: () => state.isConnected,
      getRoomCode: () => state.roomCode,
      getLocalName: () => state.localName,
      getRemoteName: () => state.remoteName,
      send(data) {
        if (state.conn && state.conn.open) {
          state.conn.send(data);
        }
      },
      onReceive(callback) {
        registeredGameDataListeners.add(callback);
      },
      onPlayerJoined(callback) {
        registeredPlayerJoinedListeners.add(callback);
      },
      showToast(msg) {
        showToast(msg);
      }
    };

    if (game.mount) {
      game.mount(el.mountPoint, p2pBridge);
    }
  }

  function updatePlayersBar() {
    if (state.isHost) {
      el.p1NameDisplay.textContent = `${state.localName} (あなた)`;
      el.p2NameDisplay.textContent = state.isConnected ? state.remoteName : `⏳ 待機中 (合言葉: ${state.roomCode})`;
      el.matchStatusBadge.textContent = state.isConnected ? '🟢 対戦中' : '⏳ 友達待機中';
      el.matchStatusBadge.style.color = state.isConnected ? '#4ade80' : '#f59e0b';
    } else {
      el.p1NameDisplay.textContent = state.remoteName;
      el.p2NameDisplay.textContent = `${state.localName} (あなた)`;
      el.matchStatusBadge.textContent = state.isConnected ? '🟢 対戦中' : '⏳ 接続中…';
      el.matchStatusBadge.style.color = state.isConnected ? '#4ade80' : '#38bdf8';
    }
  }

  // ゲーム一覧に戻る
  el.backBtn.addEventListener('click', () => {
    if (confirm('ゲーム一覧に戻りますか？現在の部屋は閉じられます。')) {
      if (state.conn) state.conn.close();
      exitToCatalog();
    }
  });

  el.logoBtn.addEventListener('click', () => {
    if (el.gameView.classList.contains('active')) {
      el.backBtn.click();
    }
  });

  function exitToCatalog() {
    if (state.activeGame && state.activeGame.unmount) {
      state.activeGame.unmount();
    }
    state.activeGame = null;
    state.isConnected = false;
    state.roomCode = '';
    el.mountPoint.innerHTML = '';

    el.gameView.classList.remove('active');
    el.catalogView.classList.add('active');
    window.history.replaceState({}, '', window.location.pathname);
  }

  // エモート
  document.querySelectorAll('.emote-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const msg = btn.dataset.msg;
      showToast(`あなた: ${msg}`);
      sendPlatformPacket({ _platform: true, type: 'emote', msg: msg });
    });
  });

  function showToast(text) {
    el.chatToast.textContent = text;
    el.chatToast.classList.remove('hidden');
    setTimeout(() => el.chatToast.classList.add('hidden'), 2500);
  }

  // URLパラメータ（?game=xxx&room=yyy）の自動参加チェック
  let urlRouteChecked = false;
  function checkInitialUrlRoute() {
    if (urlRouteChecked) return;
    const params = new URLSearchParams(window.location.search);
    const targetGame = params.get('game');
    const targetRoom = params.get('room');

    if (targetGame && targetRoom && state.games.has(targetGame)) {
      urlRouteChecked = true;
      startJoin(targetGame, targetRoom);
    }
  }

  // 初期化起動
  initPeer();
})();
