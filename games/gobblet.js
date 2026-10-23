/**
 * 🧡 ゴブレットゴブラーズ (Gobblet Gobblers) Component
 * Board Arena Plugin
 */

(function () {
  const P1 = 1; // オレンジ (先手・ホスト)
  const P2 = 2; // ブルー (後手・ゲスト)

  const SIZES = {
    1: { name: '小', label: 'S', px: 28 },
    2: { name: '中', label: 'M', px: 42 },
    3: { name: '大', label: 'L', px: 58 }
  };

  const WIN_LINES = [
    // 横
    [[0,0],[0,1],[0,2]], [[1,0],[1,1],[1,2]], [[2,0],[2,1],[2,2]],
    // 縦
    [[0,0],[1,0],[2,0]], [[0,1],[1,1],[2,1]], [[0,2],[1,2],[2,2]],
    // 斜め
    [[0,0],[1,1],[2,2]], [[0,2],[1,1],[2,0]]
  ];

  window.BoardArena.registerGame({
    id: 'gobblet',
    name: 'ゴブレットゴブラーズ',
    category: 'ボードゲーム',
    icon: '👾',
    players: '2人',
    playTime: '3-5分',
    description: '3×3の進化系まるばつゲーム！小さいコマの上から「被せて」乗っ取れる白熱の心理戦！',

    mount(container, bridge) {
      // ゲーム状態
      let board = [
        [[], [], []],
        [[], [], []],
        [[], [], []]
      ];

      // 手持ちコマ (各サイズ2個ずつ)
      let hands = {
        [P1]: { 1: 2, 2: 2, 3: 2 },
        [P2]: { 1: 2, 2: 2, 3: 2 }
      };

      let currentTurn = P1;
      const myPlayer = bridge.isHost ? P1 : P2;
      let isGameOver = false;

      // 選択中のコマ
      // type: 'hand' (from hand) or 'board' (from board cell)
      let selectedPiece = null;

      container.innerHTML = `
        <div class="gobblet-wrapper">
          <div class="gobblet-status-bar">
            <div class="turn-badge" id="gob-turn-badge">オレンジの手番です</div>
            <div class="gobblet-hint" id="gob-hint">コマを選んでマスに置いてください</div>
          </div>

          <!-- P1 (オレンジ) 手持ちコマエリア -->
          <div class="gob-hand-section" id="p1-hand-area">
            <span class="hand-label p1-label">P1 (オレンジ) 手持ち:</span>
            <div class="hand-pieces" id="p1-pieces"></div>
          </div>

          <!-- 3×3 盤面 -->
          <div class="gobblet-board-frame">
            <div id="gobblet-grid" class="gobblet-grid"></div>
          </div>

          <!-- P2 (ブルー) 手持ちコマエリア -->
          <div class="gob-hand-section" id="p2-hand-area">
            <span class="hand-label p2-label">P2 (ブルー) 手持ち:</span>
            <div class="hand-pieces" id="p2-pieces"></div>
          </div>

          <!-- 結果バナー -->
          <div id="gobblet-result" class="gobblet-result-banner hidden">
            <span id="gob-res-text">勝敗結果</span>
            <button id="gob-restart-btn" class="btn btn-sm btn-primary">もう一度遊ぶ</button>
          </div>
        </div>
      `;

      const gridEl = container.querySelector('#gobblet-grid');
      const turnBadge = container.querySelector('#gob-turn-badge');
      const hintEl = container.querySelector('#gob-hint');
      const p1PiecesEl = container.querySelector('#p1-pieces');
      const p2PiecesEl = container.querySelector('#p2-pieces');
      const resBanner = container.querySelector('#gobblet-result');
      const resText = container.querySelector('#gob-res-text');
      const restartBtn = container.querySelector('#gob-restart-btn');

      // スタイル定義
      if (!document.getElementById('gobblet-custom-css')) {
        const style = document.createElement('style');
        style.id = 'gobblet-custom-css';
        style.textContent = `
          .gobblet-wrapper { display: flex; flex-direction: column; align-items: center; width: 100%; max-width: 440px; }
          .gobblet-status-bar { width: 100%; display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
          .gobblet-hint { font-size: 12px; color: #94a3b8; font-weight: 600; }
          .gob-hand-section { display: flex; align-items: center; justify-content: space-between; width: 100%; background: #161f2e; padding: 8px 14px; border-radius: 12px; margin: 4px 0; border: 1px solid #2b384a; }
          .hand-label { font-size: 12px; font-weight: 700; }
          .p1-label { color: #f97316; }
          .p2-label { color: #38bdf8; }
          .hand-pieces { display: flex; gap: 10px; align-items: center; }
          
          .hand-slot { display: flex; align-items: center; gap: 4px; padding: 4px 8px; border-radius: 8px; cursor: pointer; border: 2px solid transparent; background: #0f172a; transition: all 0.2s; }
          .hand-slot:hover { border-color: #64748b; }
          .hand-slot.selected { border-color: #facc15; box-shadow: 0 0 10px rgba(250, 204, 21, 0.6); transform: scale(1.08); }
          .slot-count { font-size: 13px; font-weight: 800; color: #fff; }

          /* 3×3 盤面 */
          .gobblet-board-frame { width: 100%; aspect-ratio: 1/1; padding: 12px; background: #291e14; border-radius: 16px; box-shadow: 0 14px 34px rgba(0,0,0,0.6); margin: 8px 0; }
          .gobblet-grid { width: 100%; height: 100%; background: #453220; display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(3, 1fr); gap: 6px; border: 3px solid #1a120b; border-radius: 8px; }
          .gob-cell { background: #5c432d; display: flex; justify-content: center; align-items: center; cursor: pointer; position: relative; border-radius: 6px; transition: background 0.2s; }
          .gob-cell:hover { background: #6e5137; }
          .gob-cell.valid-target { background: #3b5034; box-shadow: inset 0 0 12px #4ade80; }
          .gob-cell.selected-source { border: 2px solid #facc15; }

          /* コマの見た目（モンスターフェイス） */
          .gob-piece { border-radius: 50%; display: flex; justify-content: center; align-items: center; position: relative; cursor: pointer; box-shadow: 0 4px 10px rgba(0,0,0,0.5); transition: transform 0.2s; }
          .gob-piece.p1 { background: radial-gradient(circle at 35% 35%, #fb923c, #ea580c 70%, #9a3412); border: 2px solid #fdba74; }
          .gob-piece.p2 { background: radial-gradient(circle at 35% 35%, #38bdf8, #0284c7 70%, #0369a1); border: 2px solid #7dd3fc; }
          .gob-piece::before { content: '👀'; font-size: calc(var(--size) * 0.45px); line-height: 1; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.5)); }

          .gobblet-result-banner { margin-top: 10px; background: #1e293b; border: 1px solid #f59e0b; padding: 10px 20px; border-radius: 12px; display: flex; gap: 14px; align-items: center; font-weight: 700; color: #f59e0b; }
        `;
        document.head.appendChild(style);
      }

      function initGame() {
        board = [
          [[], [], []],
          [[], [], []],
          [[], [], []]
        ];
        hands[P1] = { 1: 2, 2: 2, 3: 2 };
        hands[P2] = { 1: 2, 2: 2, 3: 2 };
        currentTurn = P1;
        isGameOver = false;
        selectedPiece = null;
        resBanner.classList.add('hidden');
        render();
      }

      // あるマスに指定サイズのコマを置けるかチェック
      function canPlaceOnCell(r, c, size) {
        const stack = board[r][c];
        if (stack.length === 0) return true;
        const top = stack[stack.length - 1];
        // 対象マスのトップのコマより大きければ被せられる（ゴブラー！）
        return size > top.size;
      }

      // 勝利判定 (一番上のコマの色をチェック)
      function checkWinner() {
        for (const line of WIN_LINES) {
          const [a, b, c] = line;
          const topA = board[a[0]][a[1]].at(-1);
          const topB = board[b[0]][b[1]].at(-1);
          const topC = board[c[0]][c[1]].at(-1);

          if (topA && topB && topC) {
            if (topA.player === topB.player && topB.player === topC.player) {
              return topA.player;
            }
          }
        }
        return null;
      }

      // 着手実行
      function executeMove(moveData, isLocal = false) {
        const { from, to, player } = moveData;
        let movingPiece = null;

        // 1. 移動元のコマを取り出す
        if (from.type === 'hand') {
          hands[player][from.size]--;
          movingPiece = { player: player, size: from.size };
        } else if (from.type === 'board') {
          movingPiece = board[from.r][from.c].pop();
        }

        // 2. 移動先に配置（被せる）
        board[to.r][to.c].push(movingPiece);

        // ローカルの手なら相手に送信
        if (isLocal) {
          bridge.send({ game: 'gobblet', type: 'move', move: moveData });
        }

        // 3. 勝敗チェック
        // ※自分のコマを動かしたことで、下にあった相手のコマが現れて相手が勝つ場合もある！
        const winner = checkWinner();
        if (winner) {
          isGameOver = true;
          const winnerName = winner === P1 ? 'オレンジ (P1)' : 'ブルー (P2)';
          resText.textContent = `🎉 ${winnerName} の勝利！！`;
          resBanner.classList.remove('hidden');
          bridge.showToast(`${winnerName} の勝利！`);
        } else {
          // ターン交代
          currentTurn = currentTurn === P1 ? P2 : P1;
        }

        selectedPiece = null;
        render();
      }

      // 描画処理
      function render() {
        const isMyTurn = currentTurn === myPlayer && !isGameOver;

        // ステータス更新
        if (!isGameOver) {
          if (currentTurn === P1) {
            turnBadge.textContent = myPlayer === P1 ? '🟢 あなたの手番 (オレンジ)' : '相手の考え中… (オレンジ)';
            turnBadge.style.color = '#f97316';
          } else {
            turnBadge.textContent = myPlayer === P2 ? '🟢 あなたの手番 (ブルー)' : '相手の考え中… (ブルー)';
            turnBadge.style.color = '#38bdf8';
          }

          if (isMyTurn) {
            hintEl.textContent = selectedPiece ? '置くマスをクリックしてください' : '手持ちまたは盤面のコマを選んでください';
          } else {
            hintEl.textContent = '相手がコマを選んでいます…';
          }
        }

        // 手持ちエリアの描画
        renderHand(P1, p1PiecesEl, isMyTurn && currentTurn === P1);
        renderHand(P2, p2PiecesEl, isMyTurn && currentTurn === P2);

        // 3×3 盤面の描画
        gridEl.innerHTML = '';
        for (let r = 0; r < 3; r++) {
          for (let c = 0; c < 3; c++) {
            const cell = document.createElement('div');
            cell.className = 'gob-cell';
            const stack = board[r][c];
            const top = stack.at(-1);

            // コマの表示（一番上のみ表示）
            if (top) {
              const pieceEl = createPieceElement(top.player, top.size);
              cell.appendChild(pieceEl);

              // 盤面上の自分のコマをクリックして移動元として選択
              if (isMyTurn && top.player === myPlayer) {
                cell.addEventListener('click', (e) => {
                  e.stopPropagation();
                  if (selectedPiece && selectedPiece.type === 'board' && selectedPiece.r === r && selectedPiece.c === c) {
                    selectedPiece = null; // 選択解除
                  } else {
                    selectedPiece = { type: 'board', r: r, c: c, size: top.size };
                  }
                  render();
                });
              }
            }

            // 選択中のコマがある場合、配置可能か判定
            if (isMyTurn && selectedPiece) {
              // 移動元自身への移動は除外
              const isSource = selectedPiece.type === 'board' && selectedPiece.r === r && selectedPiece.c === c;
              if (isSource) {
                cell.classList.add('selected-source');
              } else if (canPlaceOnCell(r, c, selectedPiece.size)) {
                cell.classList.add('valid-target');
                cell.addEventListener('click', () => {
                  executeMove({
                    from: selectedPiece,
                    to: { r: r, c: c },
                    player: myPlayer
                  }, true);
                });
              }
            }

            gridEl.appendChild(cell);
          }
        }
      }

      function renderHand(player, containerEl, isSelectable) {
        containerEl.innerHTML = '';
        const hand = hands[player];

        [3, 2, 1].forEach((size) => {
          const count = hand[size];
          if (count > 0) {
            const slot = document.createElement('div');
            slot.className = 'hand-slot';
            if (selectedPiece && selectedPiece.type === 'hand' && selectedPiece.size === size && player === myPlayer) {
              slot.classList.add('selected');
            }

            const pEl = createPieceElement(player, size);
            slot.appendChild(pEl);

            const countEl = document.createElement('span');
            countEl.className = 'slot-count';
            countEl.textContent = `×${count}`;
            slot.appendChild(countEl);

            if (isSelectable) {
              slot.addEventListener('click', () => {
                if (selectedPiece && selectedPiece.type === 'hand' && selectedPiece.size === size) {
                  selectedPiece = null; // 解除
                } else {
                  selectedPiece = { type: 'hand', size: size };
                }
                render();
              });
            }
            containerEl.appendChild(slot);
          }
        });
      }

      function createPieceElement(player, size) {
        const el = document.createElement('div');
        el.className = `gob-piece ${player === P1 ? 'p1' : 'p2'}`;
        const px = SIZES[size].px;
        el.style.width = `${px}px`;
        el.style.height = `${px}px`;
        el.style.setProperty('--size', px);
        return el;
      }

      // P2Pパケット受信
      bridge.onReceive((data) => {
        if (data.game !== 'gobblet') return;
        if (data.type === 'move') {
          executeMove(data.move, false);
        } else if (data.type === 'restart') {
          initGame();
          bridge.showToast('ゴブレットゴブラーズの再戦が開始されました！');
        }
      });

      restartBtn.addEventListener('click', () => {
        initGame();
        bridge.send({ game: 'gobblet', type: 'restart' });
        bridge.showToast('再戦を開始しました！');
      });

      initGame();
    },

    unmount() {}
  });
})();
