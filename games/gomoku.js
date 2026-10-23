/**
 * ⚪ 五目並べ Component (Board Arena Plugin)
 */

(function () {
  const BOARD_SIZE = 11; // 手軽に遊べる11×11
  const EMPTY = 0;
  const BLACK = 1;
  const WHITE = 2;

  const DIRECTIONS = [
    [1, 0],  // 横
    [0, 1],  // 縦
    [1, 1],  // 斜め右下
    [1, -1]  // 斜め左下
  ];

  window.BoardArena.registerGame({
    id: 'gomoku',
    name: '五目並べ (Connect 5)',
    category: 'ボードゲーム',
    icon: '⚪',
    players: '2人',
    playTime: '3-8分',
    description: '縦・横・斜めに先に石を5つ並べた方の勝利！シンプルで奥深い対戦ゲーム。',

    mount(container, bridge) {
      let board = [];
      let currentTurn = BLACK;
      const myColor = bridge.isHost ? BLACK : WHITE;
      let isGameOver = false;

      container.innerHTML = `
        <div class="gomoku-wrapper">
          <div class="gomoku-status-bar">
            <div class="turn-badge" id="gomoku-turn-badge">黒の手番です</div>
            <div class="gomoku-rule">先に5つ並べたら勝ち！</div>
          </div>
          <div class="gomoku-board-frame">
            <div id="gomoku-grid" class="gomoku-grid"></div>
          </div>
          <div id="gomoku-result" class="gomoku-result-banner hidden">
            <span id="gom-res-text">勝敗</span>
            <button id="gom-restart-btn" class="btn btn-sm btn-primary">再戦する</button>
          </div>
        </div>
      `;

      const gridEl = container.querySelector('#gomoku-grid');
      const turnBadge = container.querySelector('#gomoku-turn-badge');
      const resBanner = container.querySelector('#gomoku-result');
      const resText = container.querySelector('#gom-res-text');
      const restartBtn = container.querySelector('#gom-restart-btn');

      if (!document.getElementById('gomoku-custom-css')) {
        const style = document.createElement('style');
        style.id = 'gomoku-custom-css';
        style.textContent = `
          .gomoku-wrapper { display: flex; flex-direction: column; align-items: center; width: 100%; max-width: 480px; }
          .gomoku-status-bar { width: 100%; display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
          .gomoku-rule { font-size: 13px; color: #94a3b8; font-weight: 600; }
          .gomoku-board-frame { width: 100%; aspect-ratio: 1/1; padding: 10px; background: #d7ba89; border-radius: 12px; box-shadow: 0 12px 30px rgba(0,0,0,0.6); }
          .gomoku-grid { width: 100%; height: 100%; background: #e0c598; display: grid; grid-template-columns: repeat(11, 1fr); grid-template-rows: repeat(11, 1fr); gap: 1px; border: 2px solid #5c401b; }
          .gom-cell { background: #eed5ab; display: flex; justify-content: center; align-items: center; cursor: pointer; position: relative; }
          .gom-cell:hover { background: #fdf0d5; }
          .gom-piece { width: 84%; height: 84%; border-radius: 50%; box-shadow: 0 3px 6px rgba(0,0,0,0.4); animation: dropIn 0.2s ease; }
          .gom-piece.b { background: radial-gradient(circle at 35% 35%, #444, #000); }
          .gom-piece.w { background: radial-gradient(circle at 35% 35%, #fff, #cbd5e1); }
          .gomoku-result-banner { margin-top: 14px; background: #1e293b; border: 1px solid #38bdf8; padding: 10px 20px; border-radius: 12px; display: flex; gap: 14px; align-items: center; font-weight: 700; color: #38bdf8; }
          @keyframes dropIn { from { transform: scale(0.5); } to { transform: scale(1); } }
        `;
        document.head.appendChild(style);
      }

      function initGame() {
        board = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(EMPTY));
        currentTurn = BLACK;
        isGameOver = false;
        resBanner.classList.add('hidden');
        render();
      }

      function checkWin(r, c, color) {
        for (const [dr, dc] of DIRECTIONS) {
          let count = 1;
          // 正方向
          let nr = r + dr, nc = c + dc;
          while (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && board[nr][nc] === color) {
            count++; nr += dr; nc += dc;
          }
          // 逆方向
          nr = r - dr; nc = c - dc;
          while (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && board[nr][nc] === color) {
            count++; nr -= dr; nc -= dc;
          }
          if (count >= 5) return true;
        }
        return false;
      }

      function makeMove(r, c, color, isLocal = false) {
        if (board[r][c] !== EMPTY || isGameOver) return;
        board[r][c] = color;

        if (isLocal) {
          bridge.send({ game: 'gomoku', type: 'move', r, c });
        }

        if (checkWin(r, c, color)) {
          isGameOver = true;
          const winner = color === BLACK ? '黒 の勝利！' : '白 の勝利！';
          resText.textContent = `🎉 ${winner}`;
          resBanner.classList.remove('hidden');
          bridge.showToast(winner);
        } else {
          currentTurn = color === BLACK ? WHITE : BLACK;
        }

        render();
      }

      function render() {
        gridEl.innerHTML = '';
        const isConnected = bridge.isConnected();
        const isMyTurn = (!isConnected || currentTurn === myColor) && !isGameOver;
        const placeColor = isConnected ? myColor : currentTurn;

        for (let r = 0; r < BOARD_SIZE; r++) {
          for (let c = 0; c < BOARD_SIZE; c++) {
            const cell = document.createElement('div');
            cell.className = 'gom-cell';
            const val = board[r][c];

            if (val === BLACK) {
              cell.innerHTML = '<div class="gom-piece b"></div>';
            } else if (val === WHITE) {
              cell.innerHTML = '<div class="gom-piece w"></div>';
            } else {
              cell.addEventListener('click', () => {
                if (isMyTurn && !isGameOver) {
                  makeMove(r, c, placeColor, isConnected);
                }
              });
            }
            gridEl.appendChild(cell);
          }
        }

        if (!isGameOver) {
          if (!isConnected) {
            turnBadge.textContent = `⏳ 待機中 (一人練習中: ${currentTurn === BLACK ? '黒' : '白'}の手番)`;
          } else if (currentTurn === BLACK) {
            turnBadge.textContent = myColor === BLACK ? '🟢 あなたの手番 (黒)' : '相手が考え中… (黒)';
          } else {
            turnBadge.textContent = myColor === WHITE ? '🟢 あなたの手番 (白)' : '相手が考え中… (白)';
          }
        }
      }

      bridge.onPlayerJoined(() => {
        initGame();
        bridge.showToast('対戦相手が合流しました！五目並べ開始！');
      });

      bridge.onReceive((data) => {
        if (data.game !== 'gomoku') return;
        if (data.type === 'move') {
          const oppColor = myColor === BLACK ? WHITE : BLACK;
          makeMove(data.r, data.c, oppColor, false);
        } else if (data.type === 'restart') {
          initGame();
          bridge.showToast('五目並べの再戦が開始されました！');
        }
      });

      restartBtn.addEventListener('click', () => {
        initGame();
        bridge.send({ game: 'gomoku', type: 'restart' });
        bridge.showToast('再戦を開始しました！');
      });

      initGame();
    },

    unmount() {}
  });
})();
