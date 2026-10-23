/**
 * 🃏 ポーカー (5-Card Draw Poker)
 * Board-Game-Framework Component
 */

(function () {
  const SUIT_SYMBOLS = ['♠', '♥', '♦', '♣'];
  const SUIT_COLORS = ['#0f172a', '#ef4444', '#3b82f6', '#10b981'];
  const RANK_NAMES = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };

  function evalHand(cards) {
    const ranks = cards.map(c => c.r).sort((a,b) => b - a);
    const suits = cards.map(c => c.s);
    const rCounts = {};
    ranks.forEach(r => rCounts[r] = (rCounts[r] || 0) + 1);

    const isFlush = suits.every(s => s === suits[0]);
    let isStraight = true;
    for(let i=0; i<4; i++) {
      if (ranks[i] - ranks[i+1] !== 1) isStraight = false;
    }
    if (!isStraight && JSON.stringify(ranks) === '[14,5,4,3,2]') isStraight = true;

    const counts = Object.values(rCounts).sort((a,b) => b - a);

    if (isFlush && isStraight) return { rank: 8, name: 'ストレートフラッシュ', score: 8000 + ranks[0] };
    if (counts[0] === 4) return { rank: 7, name: 'フォーカード', score: 7000 + ranks[0] };
    if (counts[0] === 3 && counts[1] === 2) return { rank: 6, name: 'フルハウス', score: 6000 + ranks[0] };
    if (isFlush) return { rank: 5, name: 'フラッシュ', score: 5000 + ranks[0] };
    if (isStraight) return { rank: 4, name: 'ストレート', score: 4000 + ranks[0] };
    if (counts[0] === 3) return { rank: 3, name: 'スリーカード', score: 3000 + ranks[0] };
    if (counts[0] === 2 && counts[1] === 2) return { rank: 2, name: 'ツーペア', score: 2000 + ranks[0] };
    if (counts[0] === 2) return { rank: 1, name: 'ワンペア', score: 1000 + ranks[0] };
    return { rank: 0, name: 'ハイカード', score: ranks[0] };
  }

  function createDeck() {
    const d = [];
    for(let s=0; s<4; s++) {
      for(let r=2; r<=14; r++) d.push({ s, r });
    }
    for (let i = d.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [d[i], d[j]] = [d[j], d[i]];
    }
    return d;
  }

  window.BoardArena.registerGame({
    id: 'poker',
    name: 'ポーカー (5カード・ドロー)',
    category: 'トランプゲーム',
    icon: '🃏',
    players: '2人',
    playTime: '2-5分',
    description: 'チップを賭けて戦う本格ポーカー！カード交換・ベット・コールの心理戦。',

    mount(container, bridge) {
      let isHost = bridge.isHost;
      let deck = [];
      let myCards = [];
      let oppCards = [];
      let selectedToExchange = [false, false, false, false, false];
      let myChips = 1000, oppChips = 1000;
      let pot = 0;
      let myBet = 0, oppBet = 0;
      let phase = 'BET1'; // BET1, DRAW, BET2, SHOWDOWN
      let oppShowdown = false;

      container.innerHTML = `
        <div class="pk-wrapper">
          <div class="pk-table">
            <!-- 相手エリア (上部) -->
            <div class="pk-player-area opp">
              <div class="pk-p-info">
                <span class="pk-p-name">対戦相手</span>
                <span class="pk-chips" id="pk-opp-chips">🪙 1,000</span>
              </div>
              <div class="pk-cards" id="pk-opp-cards"></div>
            </div>

            <!-- 中央ポット -->
            <div class="pk-pot-area">
              <div class="pk-pot-badge" id="pk-pot">POT: 0 🪙</div>
              <div class="pk-banner" id="pk-banner">ゲームスタート</div>
            </div>

            <!-- プレイヤーエリア (手前) -->
            <div class="pk-player-area me">
              <div class="pk-hand-name" id="pk-hand-name">あなたの役: 【 --- 】</div>
              <div class="pk-cards" id="pk-my-cards"></div>
              <div class="pk-p-info">
                <span class="pk-p-name">あなた</span>
                <span class="pk-chips" id="pk-my-chips">🪙 1,000</span>
              </div>
            </div>
          </div>

          <!-- アクション操作ボタンバー -->
          <div class="pk-actions" id="pk-actions">
            <button id="pk-btn-check" class="btn btn-secondary">✓ チェック</button>
            <button id="pk-btn-bet" class="btn btn-primary">🪙 ベット +20</button>
            <button id="pk-btn-call" class="btn btn-success" style="display:none;">🤝 コール</button>
            <button id="pk-btn-fold" class="btn btn-subtle">🏳️ 降りる</button>
            <button id="pk-btn-draw" class="btn btn-warning" style="display:none;">🔄 選択カードを交換</button>
            <button id="pk-btn-next" class="btn btn-primary" style="display:none;">➡️ 次の勝負へ</button>
          </div>
        </div>
      `;

      if (!document.getElementById('pk-custom-css')) {
        const style = document.createElement('style');
        style.id = 'pk-custom-css';
        style.textContent = `
          .pk-wrapper { display: flex; flex-direction: column; align-items: center; width: 100%; max-width: 820px; user-select: none; }
          .pk-table { width: 100%; aspect-ratio: 16/10; max-height: 480px; background: radial-gradient(circle, #0d5c2e 0%, #06381b 85%); border: 12px solid #3d2314; border-radius: 90px; box-shadow: inset 0 0 40px rgba(0,0,0,0.8), 0 16px 36px rgba(0,0,0,0.6); display: flex; flex-direction: column; justify-content: space-between; padding: 18px 30px; position: relative; }
          .pk-player-area { display: flex; flex-direction: column; align-items: center; width: 100%; }
          .pk-p-info { display: flex; gap: 14px; align-items: center; font-weight: bold; font-size: 14px; background: rgba(0,0,0,0.5); padding: 4px 14px; border-radius: 20px; color: #fff; margin: 4px 0; }
          .pk-chips { color: #facc15; }
          .pk-cards { display: flex; gap: 12px; min-height: 96px; align-items: center; }
          .pk-card { width: 68px; height: 96px; background: #fff; border-radius: 8px; border: 2px solid #cbd5e1; box-shadow: 0 4px 10px rgba(0,0,0,0.5); display: flex; flex-direction: column; justify-content: space-between; padding: 6px; cursor: pointer; transition: transform 0.15s, border-color 0.15s; position: relative; font-weight: bold; }
          .pk-card.selected { transform: translateY(-14px); border-color: #f59e0b; box-shadow: 0 8px 18px rgba(245,158,11,0.6); }
          .pk-card.back { background: repeating-linear-gradient(45deg, #1e3a8a, #1e3a8a 6px, #172554 6px, #172554 12px); border-color: #facc15; }
          .pk-c-rank { font-size: 15px; line-height: 1; }
          .pk-c-suit { font-size: 26px; align-self: center; }
          .pk-pot-area { text-align: center; }
          .pk-pot-badge { display: inline-block; background: rgba(0,0,0,0.7); border: 2px solid #facc15; color: #facc15; font-size: 20px; font-weight: bold; padding: 6px 20px; border-radius: 30px; }
          .pk-banner { color: #fef08a; font-weight: bold; font-size: 15px; margin-top: 6px; text-shadow: 0 2px 4px #000; min-height: 22px; }
          .pk-hand-name { color: #38bdf8; font-size: 15px; font-weight: bold; margin-bottom: 4px; text-shadow: 0 2px 4px #000; }
          .pk-actions { display: flex; gap: 12px; margin-top: 14px; }
        `;
        document.head.appendChild(style);
      }

      const potEl = container.querySelector('#pk-pot');
      const bannerEl = container.querySelector('#pk-banner');
      const myCardsEl = container.querySelector('#pk-my-cards');
      const oppCardsEl = container.querySelector('#pk-opp-cards');
      const myChipsEl = container.querySelector('#pk-my-chips');
      const oppChipsEl = container.querySelector('#pk-opp-chips');
      const handNameEl = container.querySelector('#pk-hand-name');

      const btnCheck = container.querySelector('#pk-btn-check');
      const btnBet = container.querySelector('#pk-btn-bet');
      const btnCall = container.querySelector('#pk-btn-call');
      const btnFold = container.querySelector('#pk-btn-fold');
      const btnDraw = container.querySelector('#pk-btn-draw');
      const btnNext = container.querySelector('#pk-btn-next');

      function startNewRound() {
        pot = 20;
        myChips -= 10;
        oppChips -= 10;
        myBet = 0; oppBet = 0;
        selectedToExchange = [false, false, false, false, false];
        oppShowdown = false;

        if (isHost) {
          deck = createDeck();
          const p1C = [deck.pop(), deck.pop(), deck.pop(), deck.pop(), deck.pop()];
          const p2C = [deck.pop(), deck.pop(), deck.pop(), deck.pop(), deck.pop()];
          myCards = p1C;
          oppCards = p2C;
          bridge.send({ game: 'poker', type: 'deal', p2Cards: p2C });
        }

        phase = 'BET1';
        bannerEl.textContent = '【ベット1】チェックするか、賭ける（ベット+20）か選んでください';
        showButtons(['check', 'bet', 'fold']);
        render();
      }

      function showButtons(list) {
        btnCheck.style.display = list.includes('check') ? '' : 'none';
        btnBet.style.display = list.includes('bet') ? '' : 'none';
        btnCall.style.display = list.includes('call') ? '' : 'none';
        btnFold.style.display = list.includes('fold') ? '' : 'none';
        btnDraw.style.display = list.includes('draw') ? '' : 'none';
        btnNext.style.display = list.includes('next') ? '' : 'none';
      }

      function render() {
        potEl.textContent = `POT: ${pot} 🪙`;
        myChipsEl.textContent = `🪙 ${myChips}`;
        oppChipsEl.textContent = `🪙 ${oppChips}`;

        // プレイヤーカード描画
        myCardsEl.innerHTML = '';
        myCards.forEach((c, idx) => {
          const cardEl = document.createElement('div');
          cardEl.className = 'pk-card' + (selectedToExchange[idx] ? ' selected' : '');
          const rStr = RANK_NAMES[c.r] || c.r;
          const sSym = SUIT_SYMBOLS[c.s];
          const sCol = SUIT_COLORS[c.s];
          cardEl.style.color = sCol;
          cardEl.innerHTML = `
            <div class="pk-c-rank">${rStr}</div>
            <div class="pk-c-suit">${sSym}</div>
            <div class="pk-c-rank" style="align-self:flex-end;">${rStr}</div>
          `;
          cardEl.addEventListener('click', () => {
            if (phase === 'DRAW') {
              selectedToExchange[idx] = !selectedToExchange[idx];
              render();
            }
          });
          myCardsEl.appendChild(cardEl);
        });

        // 相手カード描画
        oppCardsEl.innerHTML = '';
        oppCards.forEach(c => {
          const cardEl = document.createElement('div');
          if (oppShowdown) {
            cardEl.className = 'pk-card';
            const rStr = RANK_NAMES[c.r] || c.r;
            const sSym = SUIT_SYMBOLS[c.s];
            cardEl.style.color = SUIT_COLORS[c.s];
            cardEl.innerHTML = `
              <div class="pk-c-rank">${rStr}</div>
              <div class="pk-c-suit">${sSym}</div>
              <div class="pk-c-rank" style="align-self:flex-end;">${rStr}</div>
            `;
          } else {
            cardEl.className = 'pk-card back';
          }
          oppCardsEl.appendChild(cardEl);
        });

        if (myCards.length === 5) {
          const ev = evalHand(myCards);
          handNameEl.textContent = `あなたの役: 【 ${ev.name} 】`;
        }
      }

      // 受信処理
      bridge.onReceive(data => {
        if (data.game !== 'poker') return;
        if (data.type === 'deal') {
          myCards = data.p2Cards;
          oppCards = [{}, {}, {}, {}, {}];
          render();
        } else if (data.type === 'bet') {
          oppChips -= 20;
          pot += 20;
          bannerEl.textContent = '相手が【ベット +20】してきました！コールしますか？';
          showButtons(['call', 'fold']);
          render();
        } else if (data.type === 'check') {
          bannerEl.textContent = '相手がチェックしました。カード交換へ進みます！';
          phase = 'DRAW';
          showButtons(['draw']);
        } else if (data.type === 'call') {
          bannerEl.textContent = '相手がコールしました！';
          if (phase === 'BET1') {
            phase = 'DRAW';
            showButtons(['draw']);
          } else {
            doShowdown();
          }
          render();
        } else if (data.type === 'fold') {
          myChips += pot;
          bannerEl.textContent = '🎉 相手が降りました！あなたの勝利です！';
          showButtons(['next']);
        } else if (data.type === 'showdown_cards') {
          oppCards = data.cards;
          doShowdown();
        } else if (data.type === 'next_round') {
          startNewRound();
        }
      });

      function doShowdown() {
        oppShowdown = true;
        render();
        const myEv = evalHand(myCards);
        const oppEv = evalHand(oppCards);

        if (myEv.score > oppEv.score) {
          myChips += pot;
          bannerEl.textContent = `🎉 あなたの勝利！【${myEv.name}】 vs 【${oppEv.name}】 (獲得: ${pot}🪙)`;
        } else if (myEv.score < oppEv.score) {
          oppChips += pot;
          bannerEl.textContent = `💀 相手の勝利...【${myEv.name}】 vs 【${oppEv.name}】`;
        } else {
          myChips += Math.floor(pot / 2);
          oppChips += Math.floor(pot / 2);
          bannerEl.textContent = `引き分け！【${myEv.name}】`;
        }
        showButtons(['next']);
      }

      // ボタンアクション
      btnCheck.addEventListener('click', () => {
        bridge.send({ game: 'poker', type: 'check' });
        phase = 'DRAW';
        bannerEl.textContent = '【カード交換】交換したいカードをクリックして「交換」を押してください';
        showButtons(['draw']);
      });

      btnBet.addEventListener('click', () => {
        myChips -= 20;
        pot += 20;
        bridge.send({ game: 'poker', type: 'bet' });
        bannerEl.textContent = 'ベットしました！相手の応答を待機中...';
        showButtons([]);
        render();
      });

      btnCall.addEventListener('click', () => {
        myChips -= 20;
        pot += 20;
        bridge.send({ game: 'poker', type: 'call' });
        if (phase === 'BET1') {
          phase = 'DRAW';
          bannerEl.textContent = 'コールしました！カード交換へ進みます';
          showButtons(['draw']);
        } else {
          bridge.send({ game: 'poker', type: 'showdown_cards', cards: myCards });
          doShowdown();
        }
        render();
      });

      btnFold.addEventListener('click', () => {
        oppChips += pot;
        bridge.send({ game: 'poker', type: 'fold' });
        bannerEl.textContent = 'あなたは降りました (フォールド)';
        showButtons(['next']);
      });

      btnDraw.addEventListener('click', () => {
        if (isHost) {
          selectedToExchange.forEach((sel, i) => {
            if (sel) myCards[i] = deck.pop();
          });
        }
        selectedToExchange = [false, false, false, false, false];
        phase = 'BET2';
        bannerEl.textContent = '【最終ベット】チェックするかベットしてください';
        showButtons(['check', 'bet', 'fold']);
        render();
      });

      btnNext.addEventListener('click', () => {
        startNewRound();
        bridge.send({ game: 'poker', type: 'next_round' });
      });

      startNewRound();
    },

    unmount() {}
  });
})();
