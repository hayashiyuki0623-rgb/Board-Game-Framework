/**
 * 🔷 ブロックス・デュオ (Blokus Duo) Component
 * Board Arena Plugin
 */

(function () {
  const BOARD_SIZE = 14;
  const EMPTY = 0;
  const P1 = 1; // 紫 (Violet)
  const P2 = 2; // オレンジ (Orange)

  // デュオの公式起点マス
  const START_POINTS = {
    [P1]: { r: 4, c: 4 },
    [P2]: { r: 9, c: 9 }
  };

  // 全21種類のポリオミノピース定義 (大文字アルファベットID)
  const PIECE_DEFINITIONS = [
    // 1マス
    { id: 'I1', shape: [[1]] },
    // 2マス
    { id: 'I2', shape: [[1, 1]] },
    // 3マス
    { id: 'I3', shape: [[1, 1, 1]] },
    { id: 'L3', shape: [[1, 0], [1, 1]] },
    // 4マス
    { id: 'I4', shape: [[1, 1, 1, 1]] },
    { id: 'L4', shape: [[1, 0], [1, 0], [1, 1]] },
    { id: 'T4', shape: [[1, 1, 1], [0, 1, 0]] },
    { id: 'O4', shape: [[1, 1], [1, 1]] },
    { id: 'Z4', shape: [[1, 1, 0], [0, 1, 1]] },
    // 5マス (ペントミノ 12種)
    { id: 'I5', shape: [[1, 1, 1, 1, 1]] },
    { id: 'L5', shape: [[1, 0], [1, 0], [1, 0], [1, 1]] },
    { id: 'Y5', shape: [[0, 1], [1, 1], [0, 1], [0, 1]] },
    { id: 'N5', shape: [[1, 0], [1, 1], [0, 1], [0, 1]] },
    { id: 'P5', shape: [[1, 1], [1, 1], [1, 0]] },
    { id: 'U5', shape: [[1, 0, 1], [1, 1, 1]] },
    { id: 'V5', shape: [[1, 0, 0], [1, 0, 0], [1, 1, 1]] },
    { id: 'T5', shape: [[1, 1, 1], [0, 1, 0], [0, 1, 0]] },
    { id: 'F5', shape: [[0, 1, 1], [1, 1, 0], [0, 1, 0]] },
    { id: 'Z5', shape: [[1, 1, 0], [0, 1, 0], [0, 1, 1]] },
    { id: 'W5', shape: [[1, 0, 0], [1, 1, 0], [0, 1, 1]] },
    { id: 'X5', shape: [[0, 1, 0], [1, 1, 1], [0, 1, 0]] }
  ];

  window.BoardArena.registerGame({
    id: 'blokus',
    name: 'ブロックス (Blokus Duo)',
    category: 'ボードゲーム',
    icon: '🔷',
    players: '2人',
    playTime: '10-20分',
    description: 'テトリスのようなブロックを配置する超人気陣取りゲーム！「角と角で繋ぐ」シンプルなルールで熱い頭脳戦！',

    mount(container, bridge) {
      let board = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(EMPTY));
      
      // 各プレイヤーの手持ちピースID
      let availablePieces = {
        [P1]: new Set(PIECE_DEFINITIONS.map(p => p.id)),
        [P2]: new Set(PIECE_DEFINITIONS.map(p => p.id))
      };

      let currentTurn = P1;
      const myPlayer = bridge.isHost ? P1 : P2;
      let isGameOver = false;

      // 選択中ピース状態
      let selectedPieceId = null;
      let currentShape = null; // 2D配列 (回転・反転適用後)
      let hoverCell = null;    // { r, c }

      container.innerHTML = `
        <div class="blokus-wrapper">
          <div class="blokus-top-bar">
            <div class="turn-badge" id="blk-turn-badge">紫の手番です</div>
            <div class="blokus-scores">
              <span class="blk-sc p1">紫: <span id="blk-p1-sc">0</span>マス</span>
              <span class="blk-sc-vs">vs</span>
              <span class="blk-sc p2">橙: <span id="blk-p2-sc">0</span>マス</span>
            </div>
            <button id="blk-pass-btn" class="btn btn-sm btn-subtle" title="置ける場所がない場合はパス">パス</button>
          </div>

          <!-- 14×14 盤面 -->
          <div class="blokus-board-container">
            <div id="blokus-grid" class="blokus-grid"></div>
          </div>

          <!-- ピース操作ツールバー -->
          <div class="blokus-piece-controls">
            <div class="ctrl-group">
              <button id="blk-rotate-btn" class="btn btn-sm btn-secondary" title="回転 (Rキー)">🔄 回転 [R]</button>
              <button id="blk-flip-btn" class="btn btn-sm btn-secondary" title="反転 (Fキー)">⇄ 反転 [F]</button>
              <button id="blk-clear-btn" class="btn btn-sm btn-subtle">❌ 解除</button>
            </div>
            <div class="selected-piece-preview" id="blk-selected-preview">ピースを選択してください</div>
          </div>

          <!-- 手持ちピーストレイ -->
          <div class="blokus-tray-wrapper">
            <div class="tray-title">手持ちピース (クリックで選択):</div>
            <div class="blokus-tray" id="blk-hand-tray"></div>
          </div>

          <!-- 結果バナー -->
          <div id="blokus-result" class="blokus-result-banner hidden">
            <span id="blk-res-text">勝敗</span>
            <button id="blk-restart-btn" class="btn btn-sm btn-primary">再戦する</button>
          </div>
        </div>
      `;

      const gridEl = container.querySelector('#blokus-grid');
      const turnBadge = container.querySelector('#blk-turn-badge');
      const p1ScEl = container.querySelector('#blk-p1-sc');
      const p2ScEl = container.querySelector('#blk-p2-sc');
      const passBtn = container.querySelector('#blk-pass-btn');
      const rotateBtn = container.querySelector('#blk-rotate-btn');
      const flipBtn = container.querySelector('#blk-flip-btn');
      const clearBtn = container.querySelector('#blk-clear-btn');
      const selectedPreviewEl = container.querySelector('#blk-selected-preview');
      const handTrayEl = container.querySelector('#blk-hand-tray');
      const resBanner = container.querySelector('#blokus-result');
      const resText = container.querySelector('#blk-res-text');
      const restartBtn = container.querySelector('#blk-restart-btn');

      // スタイル定義
      if (!document.getElementById('blokus-custom-css')) {
        const style = document.createElement('style');
        style.id = 'blokus-custom-css';
        style.textContent = `
          .blokus-wrapper { display: flex; flex-direction: column; align-items: center; width: 100%; max-width: 520px; }
          .blokus-top-bar { width: 100%; display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
          .blokus-scores { display: flex; gap: 8px; font-weight: 800; font-size: 14px; align-items: center; }
          .blk-sc { padding: 4px 10px; border-radius: 8px; }
          .blk-sc.p1 { background: #6b21a8; color: #f3e8ff; border: 1px solid #a855f7; }
          .blk-sc.p2 { background: #c2410c; color: #ffedd5; border: 1px solid #f97316; }
          .blk-sc-vs { color: #64748b; font-size: 11px; }

          .blokus-board-container { width: 100%; aspect-ratio: 1/1; padding: 10px; background: #0f172a; border-radius: 14px; border: 2px solid #334155; box-shadow: 0 12px 30px rgba(0,0,0,0.6); }
          .blokus-grid { width: 100%; height: 100%; display: grid; grid-template-columns: repeat(14, 1fr); grid-template-rows: repeat(14, 1fr); gap: 1px; background: #1e293b; border: 1px solid #475569; }
          .blk-cell { background: #0f172a; position: relative; cursor: pointer; transition: background 0.1s; }
          .blk-cell.start-p1::after { content: '●'; position: absolute; color: #a855f7; font-size: 10px; top: 50%; left: 50%; transform: translate(-50%, -50%); opacity: 0.8; }
          .blk-cell.start-p2::after { content: '●'; position: absolute; color: #f97316; font-size: 10px; top: 50%; left: 50%; transform: translate(-50%, -50%); opacity: 0.8; }
          
          .blk-cell.filled-p1 { background: #9333ea; border: 1px solid #c084fc; box-shadow: inset 0 0 4px rgba(255,255,255,0.4); }
          .blk-cell.filled-p2 { background: #ea580c; border: 1px solid #fb923c; box-shadow: inset 0 0 4px rgba(255,255,255,0.4); }
          
          /* ホバープレビュー */
          .blk-cell.preview-valid { background: rgba(74, 222, 128, 0.6) !important; border: 1px dashed #4ade80; }
          .blk-cell.preview-invalid { background: rgba(239, 68, 68, 0.5) !important; border: 1px dashed #ef4444; }

          .blokus-piece-controls { display: flex; justify-content: space-between; align-items: center; width: 100%; margin: 8px 0; background: #1e293b; padding: 6px 12px; border-radius: 10px; border: 1px solid #334155; }
          .ctrl-group { display: flex; gap: 6px; }
          .selected-piece-preview { font-size: 12px; font-weight: 700; color: #94a3b8; display: flex; align-items: center; gap: 8px; }

          .blokus-tray-wrapper { width: 100%; background: #111827; padding: 10px; border-radius: 12px; border: 1px solid #1f2937; margin-top: 4px; }
          .tray-title { font-size: 12px; color: #94a3b8; font-weight: 700; margin-bottom: 6px; }
          .blokus-tray { display: flex; flex-wrap: wrap; gap: 6px; max-height: 120px; overflow-y: auto; padding: 4px; }
          
          .tray-card { background: #1e293b; padding: 4px; border-radius: 6px; cursor: pointer; border: 1px solid #334155; transition: all 0.15s; display: flex; align-items: center; justify-content: center; }
          .tray-card:hover { border-color: #38bdf8; transform: translateY(-2px); }
          .tray-card.active { border-color: #facc15; background: #334155; box-shadow: 0 0 8px rgba(250, 204, 21, 0.5); }
          .tray-card.disabled { opacity: 0.2; pointer-events: none; }

          .mini-piece { display: grid; gap: 1px; }
          .mini-block { width: 8px; height: 8px; border-radius: 1px; }
          .mini-block.on-p1 { background: #a855f7; }
          .mini-block.on-p2 { background: #f97316; }

          .blokus-result-banner { margin-top: 10px; background: #1e293b; border: 1px solid #10b981; padding: 10px 20px; border-radius: 12px; display: flex; gap: 14px; align-items: center; font-weight: 700; color: #10b981; }
        `;
        document.head.appendChild(style);
      }

      function initGame() {
        board = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(EMPTY));
        availablePieces[P1] = new Set(PIECE_DEFINITIONS.map(p => p.id));
        availablePieces[P2] = new Set(PIECE_DEFINITIONS.map(p => p.id));
        currentTurn = P1;
        isGameOver = false;
        selectedPieceId = null;
        currentShape = null;
        hoverCell = null;
        resBanner.classList.add('hidden');
        render();
      }

      // ピースの回転 (90度時計回り)
      function rotateShape(shape) {
        return shape[0].map((_, i) => shape.map(row => row[i]).reverse());
      }

      // ピースの反転 (左右)
      function flipShape(shape) {
        return shape.map(row => [...row].reverse());
      }

      // 初手かどうか
      function isFirstMove(player) {
        return availablePieces[player].size === PIECE_DEFINITIONS.length;
      }

      // 配置ルールの完全検証
      function canPlacePiece(r, c, shape, player) {
        const rows = shape.length;
        const cols = shape[0].length;
        const first = isFirstMove(player);
        const startPt = START_POINTS[player];

        let touchesStart = false;
        let touchesCorner = false;

        for (let i = 0; i < rows; i++) {
          for (let j = 0; j < cols; j++) {
            if (shape[i][j] === 0) continue;
            const br = r + i;
            const bc = c + j;

            // 1. 盤面内チェック
            if (br < 0 || br >= BOARD_SIZE || bc < 0 || bc >= BOARD_SIZE) return false;

            // 2. 重なりチェック (マスが空であること)
            if (board[br][bc] !== EMPTY) return false;

            // 初手チェック: 起点マスを覆っているか
            if (first && br === startPt.r && bc === startPt.c) {
              touchesStart = true;
            }

            // 3. 辺（上下左右）の接触禁止チェック
            const adjEdges = [
              [br - 1, bc], [br + 1, bc], [br, bc - 1], [br, bc + 1]
            ];
            for (const [er, ec] of adjEdges) {
              if (er >= 0 && er < BOARD_SIZE && ec >= 0 && ec < BOARD_SIZE) {
                if (board[er][ec] === player) return false; // 自分のピースと辺が接したら即NG
              }
            }

            // 4. 角（斜め4箇所）の接触必須チェック (2手目以降)
            const adjCorners = [
              [br - 1, bc - 1], [br - 1, bc + 1],
              [br + 1, bc - 1], [br + 1, bc + 1]
            ];
            for (const [cr, cc] of adjCorners) {
              if (cr >= 0 && cr < BOARD_SIZE && cc >= 0 && cc < BOARD_SIZE) {
                if (board[cr][cc] === player) touchesCorner = true;
              }
            }
          }
        }

        if (first) return touchesStart;
        return touchesCorner;
      }

      // 着手実行
      function placePiece(r, c, shape, pieceId, player, isLocal = false) {
        const rows = shape.length;
        const cols = shape[0].length;

        for (let i = 0; i < rows; i++) {
          for (let j = 0; j < cols; j++) {
            if (shape[i][j] === 1) {
              board[r + i][c + j] = player;
            }
          }
        }

        availablePieces[player].delete(pieceId);

        if (isLocal) {
          bridge.send({
            game: 'blokus',
            type: 'move',
            r, c,
            shape,
            pieceId,
            player
          });
        }

        selectedPieceId = null;
        currentShape = null;
        hoverCell = null;

        // ターン交代
        currentTurn = currentTurn === P1 ? P2 : P1;

        updateScores();
        checkGameOver();
        render();
      }

      function updateScores() {
        let p1Score = 0, p2Score = 0;
        for (let r = 0; r < BOARD_SIZE; r++) {
          for (let c = 0; c < BOARD_SIZE; c++) {
            if (board[r][c] === P1) p1Score++;
            if (board[r][c] === P2) p2Score++;
          }
        }
        p1ScEl.textContent = p1Score;
        p2ScEl.textContent = p2Score;
      }

      function checkGameOver() {
        // 両者の手持ちがゼロ、または両者パスなどの終局判定
        if (availablePieces[P1].size === 0 && availablePieces[P2].size === 0) {
          endGame();
        }
      }

      function endGame() {
        isGameOver = true;
        const p1Score = parseInt(p1ScEl.textContent);
        const p2Score = parseInt(p2ScEl.textContent);

        let msg = '';
        if (p1Score > p2Score) msg = '🎉 紫 (P1) の勝利！';
        else if (p2Score > p1Score) msg = '🎉 橙 (P2) の勝利！';
        else msg = '引き分けです！';

        resText.textContent = `${msg} (${p1Score} vs ${p2Score})`;
        resBanner.classList.remove('hidden');
        bridge.showToast(msg);
      }

      // 描画
      function render() {
        const isConnected = bridge.isConnected();
        const isMyTurn = (!isConnected || currentTurn === myPlayer) && !isGameOver;
        const activePlayer = isConnected ? myPlayer : currentTurn;

        // ターンバッジ
        if (!isConnected) {
          turnBadge.textContent = `⏳ 待機中 (一人練習中: ${currentTurn === P1 ? '紫' : '橙'})`;
          turnBadge.style.color = currentTurn === P1 ? '#c084fc' : '#fb923c';
        } else if (currentTurn === P1) {
          turnBadge.textContent = myPlayer === P1 ? '🟢 あなたの手番 (紫)' : '相手の考え中… (紫)';
          turnBadge.style.color = '#c084fc';
        } else {
          turnBadge.textContent = myPlayer === P2 ? '🟢 あなたの手番 (橙)' : '相手の考え中… (橙)';
          turnBadge.style.color = '#fb923c';
        }

        // 選択中ピースプレビュー
        if (selectedPieceId && currentShape) {
          selectedPreviewEl.innerHTML = `選択中: <strong>${selectedPieceId}</strong> (${countBlocks(currentShape)}マス)`;
        } else {
          selectedPreviewEl.innerHTML = isMyTurn ? '下のトレイからピースを選択してください' : '相手がピースを選んでいます…';
        }

        // 手持ちトレイ描画
        renderTray(activePlayer);

        // 14×14 盤面描画
        gridEl.innerHTML = '';
        const previewPositions = getPreviewCells(activePlayer);

        for (let r = 0; r < BOARD_SIZE; r++) {
          for (let c = 0; c < BOARD_SIZE; c++) {
            const cell = document.createElement('div');
            cell.className = 'blk-cell';

            // 起点マーカー
            if (r === START_POINTS[P1].r && c === START_POINTS[P1].c && board[r][c] === EMPTY) cell.classList.add('start-p1');
            if (r === START_POINTS[P2].r && c === START_POINTS[P2].c && board[r][c] === EMPTY) cell.classList.add('start-p2');

            // 既に着手されたマス
            if (board[r][c] === P1) cell.classList.add('filled-p1');
            if (board[r][c] === P2) cell.classList.add('filled-p2');

            // ホバープレビュー
            if (previewPositions.cells.has(`${r},${c}`)) {
              cell.classList.add(previewPositions.valid ? 'preview-valid' : 'preview-invalid');
            }

            // マウスイベント (ホバー & クリック)
            if (isMyTurn && selectedPieceId && currentShape) {
              cell.addEventListener('mouseenter', () => {
                hoverCell = { r, c };
                render();
              });

              cell.addEventListener('click', () => {
                if (canPlacePiece(r, c, currentShape, activePlayer)) {
                  placePiece(r, c, currentShape, selectedPieceId, activePlayer, isConnected);
                }
              });
            }

            gridEl.appendChild(cell);
          }
        }
      }

      function countBlocks(shape) {
        return shape.flat().filter(v => v === 1).length;
      }

      function getPreviewCells(player = myPlayer) {
        const set = new Set();
        if (!hoverCell || !currentShape) return { cells: set, valid: false };

        const { r, c } = hoverCell;
        const valid = canPlacePiece(r, c, currentShape, player);
        const rows = currentShape.length;
        const cols = currentShape[0].length;

        for (let i = 0; i < rows; i++) {
          for (let j = 0; j < cols; j++) {
            if (currentShape[i][j] === 1) {
              const br = r + i;
              const bc = c + j;
              if (br >= 0 && br < BOARD_SIZE && bc >= 0 && bc < BOARD_SIZE) {
                set.add(`${br},${bc}`);
              }
            }
          }
        }
        return { cells: set, valid };
      }

      function renderTray(player) {
        handTrayEl.innerHTML = '';
        const myAvailable = availablePieces[player];

        PIECE_DEFINITIONS.forEach(p => {
          const isRemaining = myAvailable.has(p.id);
          const card = document.createElement('div');
          card.className = `tray-card ${isRemaining ? '' : 'disabled'} ${selectedPieceId === p.id ? 'active' : ''}`;

          // ミニピース描画
          const miniEl = document.createElement('div');
          miniEl.className = 'mini-piece';
          miniEl.style.gridTemplateColumns = `repeat(${p.shape[0].length}, 8px)`;

          for (let r = 0; r < p.shape.length; r++) {
            for (let c = 0; c < p.shape[0].length; c++) {
              const b = document.createElement('div');
              b.className = 'mini-block';
              if (p.shape[r][c] === 1) {
                b.classList.add(player === P1 ? 'on-p1' : 'on-p2');
              }
              miniEl.appendChild(b);
            }
          }
          card.appendChild(miniEl);

          if (isRemaining) {
            card.addEventListener('click', () => {
              const isConnected = bridge.isConnected();
              if ((isConnected && currentTurn !== myPlayer) || isGameOver) return;
              if (selectedPieceId === p.id) {
                selectedPieceId = null;
                currentShape = null;
              } else {
                selectedPieceId = p.id;
                currentShape = p.shape; // 初期形状
              }
              render();
            });
          }

          handTrayEl.appendChild(card);
        });
      }

      // 操作コントロール
      rotateBtn.addEventListener('click', () => {
        if (currentShape) {
          currentShape = rotateShape(currentShape);
          render();
        }
      });

      flipBtn.addEventListener('click', () => {
        if (currentShape) {
          currentShape = flipShape(currentShape);
          render();
        }
      });

      clearBtn.addEventListener('click', () => {
        selectedPieceId = null;
        currentShape = null;
        hoverCell = null;
        render();
      });

      // キーボードショートカット (Rで回転, Fで反転, ESCで解除)
      function onKeyDown(e) {
        if (e.key === 'r' || e.key === 'R') {
          if (currentShape) { currentShape = rotateShape(currentShape); render(); }
        } else if (e.key === 'f' || e.key === 'F') {
          if (currentShape) { currentShape = flipShape(currentShape); render(); }
        } else if (e.key === 'Escape') {
          selectedPieceId = null; currentShape = null; render();
        }
      }
      window.addEventListener('keydown', onKeyDown);

      // パスボタン
      passBtn.addEventListener('click', () => {
        const isConnected = bridge.isConnected();
        if ((isConnected && currentTurn !== myPlayer) || isGameOver) return;
        if (confirm('パスしますか？（置ける場所がない場合のみ推奨）')) {
          const passingPlayer = isConnected ? myPlayer : currentTurn;
          currentTurn = currentTurn === P1 ? P2 : P1;
          if (isConnected) {
            bridge.send({ game: 'blokus', type: 'pass', player: passingPlayer });
          }
          bridge.showToast('パスしました');
          render();
        }
      });

      // P2P 受信イベント
      bridge.onReceive((data) => {
        if (data.game !== 'blokus') return;
        if (data.type === 'move') {
          placePiece(data.r, data.c, data.shape, data.pieceId, data.player, false);
          bridge.showToast('相手がピースを配置しました');
        } else if (data.type === 'pass') {
          currentTurn = currentTurn === P1 ? P2 : P1;
          bridge.showToast('相手がパスしました');
          render();
        } else if (data.type === 'restart') {
          initGame();
          bridge.showToast('ブロックスの再戦が開始されました！');
        }
      });

      restartBtn.addEventListener('click', () => {
        initGame();
        bridge.send({ game: 'blokus', type: 'restart' });
        bridge.showToast('再戦を開始しました！');
      });

      bridge.onPlayerJoined(() => {
        initGame();
        bridge.showToast('対戦相手が合流しました！ブロックス開始！');
      });

      // 初期化
      initGame();

      // アンマウント時のリスナー解除
      return () => {
        window.removeEventListener('keydown', onKeyDown);
      };
    },

    unmount() {}
  });
})();
