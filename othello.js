/**
 * 🟢 P2P WebRTC オンラインオセロ (Othello Online)
 * PeerJS クラウド利用・ゼロサーバー設計
 */

const PEER_PREFIX = 'othello-p2p-v1-';
const BOARD_SIZE = 8;
const EMPTY = 0;
const BLACK = 1;
const WHITE = 2;

// 8方向のベクトル
const DIRECTIONS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],           [0, 1],
  [1, -1],  [1, 0],  [1, 1]
];

// UI要素
const boardEl = document.getElementById('board');
const lobbyModal = document.getElementById('lobby-modal');
const resultModal = document.getElementById('result-modal');
const statusPill = document.getElementById('connection-status');
const createBtn = document.getElementById('create-room-btn');
const joinBtn = document.getElementById('join-room-btn');
const joinInput = document.getElementById('join-code-input');
const roomInfo = document.getElementById('room-info');
const displayCode = document.getElementById('display-room-code');
const copyUrlBtn = document.getElementById('copy-url-btn');
const copyToast = document.getElementById('copy-toast');

const blackCard = document.getElementById('player-black-card');
const whiteCard = document.getElementById('player-white-card');
const blackCountEl = document.getElementById('black-count');
const whiteCountEl = document.getElementById('white-count');
const turnText = document.getElementById('turn-text');
const p1RoleText = document.getElementById('p1-role-text');
const p2RoleText = document.getElementById('p2-role-text');
const chatBubble = document.getElementById('chat-bubble');

const resultTitle = document.getElementById('result-title');
const resBlackCount = document.getElementById('res-black-count');
const resWhiteCount = document.getElementById('res-white-count');
const resultMessage = document.getElementById('result-message');
const rematchBtn = document.getElementById('rematch-btn');

// ゲーム状態
let board = [];
let currentTurn = BLACK; // 常に黒が先手
let myColor = null;      // ホスト = BLACK(1), ゲスト = WHITE(2)
let isGameOver = false;

// ネットワーク状態
let peer = null;
let conn = null;
let isHost = false;
let roomCode = '';
let isConnected = false;

// ==========================================
// 1. オセロ基本ロジック
// ==========================================

function initBoard() {
  board = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(EMPTY));
  
  // 初期配置
  board[3][3] = WHITE;
  board[3][4] = BLACK;
  board[4][3] = BLACK;
  board[4][4] = WHITE;

  currentTurn = BLACK;
  isGameOver = false;
  renderBoard();
  updateScoresAndTurn();
}

// ある位置に石を置いた時に反転できる石のリストを取得
function getFlippableDiscs(r, c, color) {
  if (board[r][c] !== EMPTY) return [];
  const opponent = color === BLACK ? WHITE : BLACK;
  let flippable = [];

  for (const [dr, dc] of DIRECTIONS) {
    let nr = r + dr;
    let nc = c + dc;
    let line = [];

    while (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && board[nr][nc] === opponent) {
      line.push([nr, nc]);
      nr += dr;
      nc += dc;
    }

    if (line.length > 0 && nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && board[nr][nc] === color) {
      flippable = flippable.concat(line);
    }
  }

  return flippable;
}

// 合法手（置ける場所）の一覧
function getValidMoves(color) {
  const moves = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const flips = getFlippableDiscs(r, c, color);
      if (flips.length > 0) {
        moves.push({ r, c, flips });
      }
    }
  }
  return moves;
}

// 石を着手する
function makeMove(r, c, color, isLocal = false) {
  const flips = getFlippableDiscs(r, c, color);
  if (flips.length === 0) return false;

  board[r][c] = color;
  for (const [fr, fc] of flips) {
    board[fr][fc] = color;
  }

  // ローカルの手なら相手に送信
  if (isLocal) {
    sendPacket({ type: 'move', r, c });
  }

  // ターン交代
  currentTurn = color === BLACK ? WHITE : BLACK;

  renderBoard();
  updateScoresAndTurn();

  // 次のプレイヤーの判定（パスまたは終局）
  checkNextTurn();
  return true;
}

function checkNextTurn() {
  const validMoves = getValidMoves(currentTurn);

  if (validMoves.length === 0) {
    // パス発生！
    const opponent = currentTurn === BLACK ? WHITE : BLACK;
    const opponentMoves = getValidMoves(opponent);

    if (opponentMoves.length === 0) {
      // 両者置けないのでゲーム終了！
      endGame();
    } else {
      // パスして相手のターン
      const passedColor = currentTurn === BLACK ? '黒' : '白';
      showTurnNotification(`${passedColor}は置ける場所がないためパス！`);
      currentTurn = opponent;
      renderBoard();
      updateScoresAndTurn();
    }
  }
}

function endGame() {
  isGameOver = true;
  let blackCount = 0;
  let whiteCount = 0;

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] === BLACK) blackCount++;
      if (board[r][c] === WHITE) whiteCount++;
    }
  }

  resBlackCount.textContent = blackCount;
  resWhiteCount.textContent = whiteCount;

  let msg = '';
  if (blackCount > whiteCount) {
    msg = myColor === BLACK ? '🎉 あなたの勝利です！おめでとう！' : '敗北… 次は勝ちましょう！';
    resultTitle.textContent = '黒 の勝利！';
  } else if (whiteCount > blackCount) {
    msg = myColor === WHITE ? '🎉 あなたの勝利です！おめでとう！' : '敗北… 次は勝ちましょう！';
    resultTitle.textContent = '白 の勝利！';
  } else {
    msg = '引き分けです！いい勝負でした！';
    resultTitle.textContent = '引き分け！';
  }

  resultMessage.textContent = msg;
  resultModal.classList.remove('hidden');
}

// ==========================================
// 2. 盤面UIレンダリング
// ==========================================

function renderBoard() {
  boardEl.innerHTML = '';
  const isMyTurn = currentTurn === myColor && isConnected && !isGameOver;
  const validMoves = isMyTurn ? getValidMoves(myColor) : [];
  const validMap = new Set(validMoves.map(m => `${m.r},${m.c}`));

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.r = r;
      cell.dataset.c = c;

      const pieceColor = board[r][c];
      if (pieceColor !== EMPTY) {
        const piece = document.createElement('div');
        piece.className = `piece ${pieceColor === BLACK ? 'black' : 'white'}`;
        cell.appendChild(piece);
      } else if (validMap.has(`${r},${c}`)) {
        cell.classList.add('valid-move');
        cell.addEventListener('click', () => {
          if (currentTurn === myColor && isConnected && !isGameOver) {
            makeMove(r, c, myColor, true);
          }
        });
      }

      boardEl.appendChild(cell);
    }
  }
}

function updateScoresAndTurn() {
  let blackCount = 0;
  let whiteCount = 0;

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] === BLACK) blackCount++;
      if (board[r][c] === WHITE) whiteCount++;
    }
  }

  blackCountEl.textContent = blackCount;
  whiteCountEl.textContent = whiteCount;

  if (currentTurn === BLACK) {
    blackCard.classList.add('active-turn');
    whiteCard.classList.remove('active-turn');
    turnText.textContent = myColor === BLACK ? 'あなたの番です (黒)' : '相手の考え中… (黒)';
  } else {
    whiteCard.classList.add('active-turn');
    blackCard.classList.remove('active-turn');
    turnText.textContent = myColor === WHITE ? 'あなたの番です (白)' : '相手の考え中… (白)';
  }
}

function showTurnNotification(text) {
  chatBubble.textContent = text;
  chatBubble.classList.remove('hidden');
  setTimeout(() => chatBubble.classList.add('hidden'), 2500);
}

// ==========================================
// 3. WebRTC P2P (PeerJS) 通信ロジック
// ==========================================

function initPeer(customId = null) {
  statusPill.textContent = 'PeerJS サーバー接続中...';

  peer = customId ? new Peer(customId) : new Peer();

  peer.on('open', (id) => {
    statusPill.textContent = '🟢 オンライン準備完了';
    statusPill.style.color = '#4ade80';
    checkUrlJoin();
  });

  peer.on('connection', (connection) => {
    conn = connection;
    setupConnection();
  });

  peer.on('error', (err) => {
    console.error('Peer error:', err);
    statusPill.textContent = '接続エラー: ' + err.type;
    statusPill.style.color = '#f87171';
  });
}

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// ホスト：部屋作成
createBtn.addEventListener('click', () => {
  if (!peer) return;
  isHost = true;
  myColor = BLACK;
  p1RoleText.textContent = 'あなた (黒・先手)';
  p2RoleText.textContent = '相手 (白・後手)';

  roomCode = generateRoomCode();
  const fullPeerId = PEER_PREFIX + roomCode;

  peer.destroy();
  initPeer(fullPeerId);

  displayCode.textContent = roomCode;
  roomInfo.classList.remove('hidden');
  createBtn.disabled = true;
  statusPill.textContent = `待機中... (合言葉: ${roomCode})`;
});

// 招待URLコピー
copyUrlBtn.addEventListener('click', () => {
  const url = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
  navigator.clipboard.writeText(url).then(() => {
    copyToast.classList.remove('hidden');
    setTimeout(() => copyToast.classList.add('hidden'), 2500);
  });
});

// ゲスト：合言葉で参加
joinBtn.addEventListener('click', () => {
  const code = joinInput.value.trim().toUpperCase();
  if (code.length < 4) {
    alert('4桁の合言葉を入力してください');
    return;
  }
  startJoin(code);
});

function startJoin(code) {
  isHost = false;
  myColor = WHITE;
  p1RoleText.textContent = '相手 (黒・先手)';
  p2RoleText.textContent = 'あなた (白・後手)';

  roomCode = code;
  const targetId = PEER_PREFIX + code;
  statusPill.textContent = `ホスト (${code}) に接続中...`;

  conn = peer.connect(targetId, { reliable: true });
  setupConnection();
}

// URLパラメータ自動参加
function checkUrlJoin() {
  const params = new URLSearchParams(window.location.search);
  const r = params.get('room');
  if (r && !isConnected && !isHost) {
    joinInput.value = r;
    startJoin(r);
  }
}

// 接続完了処理
function setupConnection() {
  conn.on('open', () => {
    isConnected = true;
    lobbyModal.classList.add('hidden');
    statusPill.textContent = `🟢 対戦中 (合言葉: ${roomCode})`;
    statusPill.style.color = '#4ade80';

    initBoard();
    showTurnNotification('対戦開始！黒の先手です');
  });

  conn.on('data', (data) => {
    handleNetworkData(data);
  });

  conn.on('close', () => {
    isConnected = false;
    alert('対戦相手の通信が切断されました。');
    location.reload();
  });
}

function sendPacket(data) {
  if (conn && conn.open) {
    conn.send(data);
  }
}

function handleNetworkData(data) {
  switch (data.type) {
    case 'move':
      const opponentColor = myColor === BLACK ? WHITE : BLACK;
      makeMove(data.r, data.c, opponentColor, false);
      break;

    case 'emote':
      showTurnNotification(data.msg);
      break;

    case 'rematch':
      if (confirm('相手から再戦のリクエストが届きました！再戦しますか？')) {
        resultModal.classList.add('hidden');
        initBoard();
        sendPacket({ type: 'rematch_accept' });
      }
      break;

    case 'rematch_accept':
      resultModal.classList.add('hidden');
      initBoard();
      showTurnNotification('再戦開始！');
      break;
  }
}

// エモート送信
document.querySelectorAll('.emote-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!isConnected) return;
    const msg = btn.dataset.msg;
    showTurnNotification(msg);
    sendPacket({ type: 'emote', msg });
  });
});

// 再戦ボタン
rematchBtn.addEventListener('click', () => {
  if (!isConnected) return;
  showTurnNotification('相手に再戦リクエストを送信しました…');
  sendPacket({ type: 'rematch' });
});

// 起動
initPeer();
