/**
 * 🟥 3D対戦ブロックバトル (CCレモンゲーム風)
 * Board-Game-Framework Component
 * 
 * 仕様:
 * - 自分: 赤ブロック / 敵: 青ブロック (四角いキューブ)
 * - 画角: TPS 30° 見下ろしアングル
 * - [1] 攻撃: チャージを1消費、0.5秒かけて相手に着弾
 * - [2] 防御: ガードシールド展開 (着弾時に無効化)
 * - [3] チャージ: 0.5秒かけてチャージ+1 (上限3)
 * - HP: 3 (♥♥♥)
 * - WebRTC P2P 完全リアルタイム同期
 */

(function () {
  const MAX_HP = 3;
  const MAX_CHARGE = 3;
  const CHARGE_DURATION = 500; // 0.5秒 (ms)
  const ATTACK_TRAVEL_TIME = 500; // 0.5秒 (ms)
  const GUARD_DURATION = 750; // ガード持続 (ms)

  window.BoardArena.registerGame({
    id: 'block_battle_3d',
    name: '3Dブロックバトル (CCレモン風)',
    category: '3D対戦アクション',
    icon: '🟥',
    players: '2人',
    playTime: '1-3分',
    description: '赤 vs 青の立体キューブ対戦！[1]攻撃(0.5秒着弾)・[2]防御・[3]チャージ(上限3)のCCレモン式心理戦バトル！',

    mount(container, bridge) {
      let isDestroyed = false;
      let animFrameId = null;

      // 状態管理
      // P1: Host(赤), P2: Guest(青)
      const isP1 = bridge.isHost;
      const myRole = isP1 ? 'p1' : 'p2';
      const oppRole = isP1 ? 'p2' : 'p1';

      let p1Hp = MAX_HP, p2Hp = MAX_HP;
      let p1Charge = 0, p2Charge = 0;
      let p1ChargingUntil = 0, p2ChargingUntil = 0;
      let p1GuardUntil = 0, p2GuardUntil = 0;
      let isGameOver = false;

      // オーディオシンセサイザー (Web Audio API)
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      function playTone(freq, type, dur, gainVal = 0.12) {
        try {
          if (audioCtx.state === 'suspended') audioCtx.resume();
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = type;
          osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
          gain.gain.setValueAtTime(gainVal, audioCtx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.start();
          osc.stop(audioCtx.currentTime + dur);
        } catch(e) {}
      }
      const sfx = {
        charge: () => {
          try {
            if (audioCtx.state === 'suspended') audioCtx.resume();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(240, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.5);
            gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.5);
          } catch(e) {}
        },
        attack: () => {
          try {
            if (audioCtx.state === 'suspended') audioCtx.resume();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(700, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(140, audioCtx.currentTime + 0.2);
            gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.2);
          } catch(e) {}
        },
        guard: () => playTone(520, 'sine', 0.25, 0.15),
        block: () => playTone(1800, 'square', 0.15, 0.1),
        hit: () => playTone(90, 'sawtooth', 0.3, 0.25),
        win: () => {
          [523.25, 659.25, 783.99, 1046.50].forEach((f, idx) => {
            setTimeout(() => playTone(f, 'triangle', 0.2, 0.18), idx * 110);
          });
        }
      };

      // UI HTML 注入
      container.innerHTML = `
        <div class="bb-wrapper">
          <!-- 上部ステータスバー -->
          <div class="bb-status-bar">
            <div class="bb-player-card ${isP1 ? 'you' : 'opp'}" id="bb-p1-card">
              <span class="bb-p-badge red">赤 (P1${isP1 ? '・YOU' : ''})</span>
              <div class="bb-hp" id="bb-p1-hp">♥♥♥</div>
              <div class="bb-charge" id="bb-p1-charge">★: 0/3</div>
            </div>

            <div class="bb-center-info">
              <div class="bb-banner" id="bb-banner">対戦スタート！</div>
              <div class="bb-charge-bar-wrap">
                <div class="bb-charge-bar-fill" id="bb-charge-fill"></div>
              </div>
            </div>

            <div class="bb-player-card ${!isP1 ? 'you' : 'opp'}" id="bb-p2-card">
              <span class="bb-p-badge blue">青 (P2${!isP1 ? '・YOU' : ''})</span>
              <div class="bb-hp" id="bb-p2-hp">♥♥♥</div>
              <div class="bb-charge" id="bb-p2-charge">★: 0/3</div>
            </div>
          </div>

          <!-- 3D WebGL キャンバス領域 -->
          <div class="bb-canvas-container" id="bb-canvas-container">
            <div id="bb-game-over-overlay" class="bb-overlay hidden">
              <h2 id="bb-result-title">YOU WIN!</h2>
              <button id="bb-retry-btn" class="btn btn-primary btn-lg">もう一度対戦する</button>
            </div>
          </div>

          <!-- 下部操作ボタンバー -->
          <div class="bb-actions-bar">
            <button id="bb-btn-1" class="bb-btn attack">
              <span class="k-hint">[1]</span>
              <span class="btn-label">⚔️ 攻撃 (0.5s着弾)</span>
            </button>
            <button id="bb-btn-2" class="bb-btn guard">
              <span class="k-hint">[2]</span>
              <span class="btn-label">🛡️ 防御 (ガード)</span>
            </button>
            <button id="bb-btn-3" class="bb-btn charge">
              <span class="k-hint">[3]</span>
              <span class="btn-label">⚡ チャージ (0.5s)</span>
            </button>
          </div>
          <div class="bb-guide-footer">
            キーボード [1] [2] [3] またはボタンをクリック！ CCレモンゲームの駆け引きでHPを削り合え！
          </div>
        </div>
      `;

      // スタイル定義
      if (!document.getElementById('bb-3d-css')) {
        const style = document.createElement('style');
        style.id = 'bb-3d-css';
        style.textContent = `
          .bb-wrapper { display: flex; flex-direction: column; align-items: center; width: 100%; max-width: 900px; user-select: none; }
          .bb-status-bar { width: 100%; display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; gap: 12px; }
          .bb-player-card { background: #151d2f; border: 2px solid #2d3b55; border-radius: 10px; padding: 10px 16px; min-width: 160px; text-align: center; }
          .bb-player-card.you { border-color: #38bdf8; box-shadow: 0 0 12px rgba(56,189,248,0.3); }
          .bb-p-badge { font-size: 13px; font-weight: bold; border-radius: 6px; padding: 2px 8px; display: inline-block; margin-bottom: 4px; }
          .bb-p-badge.red { background: rgba(239,68,68,0.25); color: #f87171; border: 1px solid #ef4444; }
          .bb-p-badge.blue { background: rgba(59,130,246,0.25); color: #60a5fa; border: 1px solid #3b82f6; }
          .bb-hp { font-size: 20px; color: #ef4444; letter-spacing: 2px; }
          .bb-charge { font-size: 15px; color: #facc15; font-weight: bold; }
          .bb-center-info { flex: 1; text-align: center; }
          .bb-banner { font-size: 16px; font-weight: bold; color: #fde047; margin-bottom: 6px; min-height: 24px; text-shadow: 0 2px 4px #000; }
          .bb-charge-bar-wrap { width: 100%; height: 8px; background: #0f172a; border-radius: 4px; overflow: hidden; border: 1px solid #334155; }
          .bb-charge-bar-fill { width: 0%; height: 100%; background: linear-gradient(90deg, #eab308, #fef08a); transition: width 0.05s linear; }
          .bb-canvas-container { position: relative; width: 100%; aspect-ratio: 16/9; max-height: 480px; background: #080c14; border-radius: 12px; overflow: hidden; box-shadow: 0 16px 36px rgba(0,0,0,0.6); border: 1px solid #2d3b55; }
          .bb-canvas-container canvas { width: 100% !important; height: 100% !important; display: block; }
          .bb-overlay { position: absolute; inset: 0; background: rgba(8,12,20,0.85); backdrop-filter: blur(6px); display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 20; gap: 16px; }
          .bb-overlay h2 { font-size: 38px; color: #facc15; text-shadow: 0 4px 10px rgba(0,0,0,0.8); }
          .bb-actions-bar { display: flex; gap: 16px; width: 100%; max-width: 680px; margin-top: 14px; }
          .bb-btn { flex: 1; padding: 12px; border-radius: 10px; border: 2px solid transparent; cursor: pointer; font-weight: bold; font-size: 15px; display: flex; flex-direction: column; align-items: center; gap: 2px; transition: all 0.15s; }
          .bb-btn:disabled { opacity: 0.35; cursor: not-allowed; }
          .bb-btn .k-hint { font-size: 11px; opacity: 0.7; }
          .bb-btn.attack { background: #991b1b; color: #fecaca; border-color: #ef4444; }
          .bb-btn.attack:hover:not(:disabled) { background: #dc2626; transform: translateY(-2px); }
          .bb-btn.guard { background: #1e3a8a; color: #bfdbfe; border-color: #3b82f6; }
          .bb-btn.guard:hover:not(:disabled) { background: #2563eb; transform: translateY(-2px); }
          .bb-btn.charge { background: #854d0e; color: #fef08a; border-color: #eab308; }
          .bb-btn.charge:hover:not(:disabled) { background: #ca8a04; transform: translateY(-2px); }
          .bb-guide-footer { font-size: 12px; color: #94a3b8; margin-top: 8px; text-align: center; }
        `;
        document.head.appendChild(style);
      }

      // 要素参照
      const canvasContainer = container.querySelector('#bb-canvas-container');
      const p1HpEl = container.querySelector('#bb-p1-hp');
      const p2HpEl = container.querySelector('#bb-p2-hp');
      const p1ChargeEl = container.querySelector('#bb-p1-charge');
      const p2ChargeEl = container.querySelector('#bb-p2-charge');
      const bannerEl = container.querySelector('#bb-banner');
      const chargeFill = container.querySelector('#bb-charge-fill');
      const overlayEl = container.querySelector('#bb-game-over-overlay');
      const resultTitle = container.querySelector('#bb-result-title');
      const retryBtn = container.querySelector('#bb-retry-btn');
      const btn1 = container.querySelector('#bb-btn-1');
      const btn2 = container.querySelector('#bb-btn-2');
      const btn3 = container.querySelector('#bb-btn-3');

      // --- Three.js 3D シーン初期化 ---
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0a0f18);

      const width = canvasContainer.clientWidth || 800;
      const height = canvasContainer.clientHeight || 450;
      const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);

      // TPS 30° 見下ろしカメラ設定
      // 手前(Z=4)の赤ブロックを見下ろし、奥(Z=-4)の青ブロックを視野に入れる
      camera.position.set(0, 5.2, 9.2);
      camera.rotation.x = -30 * (Math.PI / 180); // 30度下向き見下ろし

      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(width, height);
      renderer.shadowMap.enabled = true;
      canvasContainer.appendChild(renderer.domElement);

      // ライト
      const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
      dirLight.position.set(5, 12, 8);
      dirLight.castShadow = true;
      scene.add(dirLight);

      const ambLight = new THREE.AmbientLight(0x405570, 0.8);
      scene.add(ambLight);

      // アリーナフロア
      const floorGeo = new THREE.BoxGeometry(9, 0.4, 16);
      const floorMat = new THREE.MeshStandardMaterial({ color: 0x151f30, roughness: 0.5, metalness: 0.4 });
      const floor = new THREE.Mesh(floorGeo, floorMat);
      floor.position.set(0, -0.2, 0);
      floor.receiveShadow = true;
      scene.add(floor);

      // グリッド線
      const grid = new THREE.GridHelper(16, 16, 0x38bdf8, 0x1e293b);
      grid.position.set(0, 0.02, 0);
      scene.add(grid);

      // 1. 赤ブロック (P1: 手前 Z=3.8)
      const cubeGeo = new THREE.BoxGeometry(1.5, 1.5, 1.5);
      const redMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.3, metalness: 0.2 });
      const p1Cube = new THREE.Mesh(cubeGeo, redMat);
      p1Cube.position.set(0, 0.75, 3.8);
      p1Cube.castShadow = true;
      scene.add(p1Cube);

      // 目（バイザー）
      const eyeGeo = new THREE.BoxGeometry(1.1, 0.3, 0.1);
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const p1Eye = new THREE.Mesh(eyeGeo, eyeMat);
      p1Eye.position.set(0, 0.25, -0.76);
      p1Cube.add(p1Eye);

      // 2. 青ブロック (P2: 奥 Z=-3.8)
      const blueMat = new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.3, metalness: 0.2 });
      const p2Cube = new THREE.Mesh(cubeGeo, blueMat);
      p2Cube.position.set(0, 0.75, -3.8);
      p2Cube.castShadow = true;
      scene.add(p2Cube);

      const p2Eye = new THREE.Mesh(eyeGeo, eyeMat);
      p2Eye.position.set(0, 0.25, 0.76);
      p2Cube.add(p2Eye);

      // ガードシールド
      const shieldGeo = new THREE.BoxGeometry(2.4, 2.0, 0.1);
      const p1ShieldMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.65 });
      const p1Shield = new THREE.Mesh(shieldGeo, p1ShieldMat);
      p1Shield.position.set(0, 0.75, 2.6);
      p1Shield.visible = false;
      scene.add(p1Shield);

      const p2ShieldMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.65 });
      const p2Shield = new THREE.Mesh(shieldGeo, p2ShieldMat);
      p2Shield.position.set(0, 0.75, -2.6);
      p2Shield.visible = false;
      scene.add(p2Shield);

      // チャージオーブ (3D浮遊光球)
      const orbGeo = new THREE.SphereGeometry(0.2, 16, 16);
      const p1Orbs = [];
      const p2Orbs = [];
      for(let i=0; i<3; i++) {
        const o1 = new THREE.Mesh(orbGeo, new THREE.MeshBasicMaterial({ color: 0xfacc15 }));
        o1.visible = false;
        scene.add(o1);
        p1Orbs.push(o1);

        const o2 = new THREE.Mesh(orbGeo, new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
        o2.visible = false;
        scene.add(o2);
        p2Orbs.push(o2);
      }

      // プロジェクタイル (飛行中の弾)
      let activeBullets = [];

      function spawnBulletMesh(fromP1) {
        const bulletGeo = new THREE.SphereGeometry(0.35, 16, 16);
        const bulletMat = new THREE.MeshBasicMaterial({ color: fromP1 ? 0xff4422 : 0x00ccff });
        const mesh = new THREE.Mesh(bulletGeo, bulletMat);
        scene.add(mesh);

        const startZ = fromP1 ? 3.0 : -3.0;
        const targetZ = fromP1 ? -3.8 : 3.8;

        const b = {
          mesh,
          fromP1,
          startZ,
          targetZ,
          startTime: performance.now(),
          duration: ATTACK_TRAVEL_TIME
        };
        activeBullets.push(b);
      }

      // --- ゲームロジック ---
      function updateUI() {
        let p1H = '', p2H = '';
        for(let i=0; i<MAX_HP; i++) {
          p1H += i < p1Hp ? '♥' : '♡';
          p2H += i < p2Hp ? '♥' : '♡';
        }
        p1HpEl.textContent = p1H;
        p2HpEl.textContent = p2H;

        let p1C = '', p2C = '';
        for(let i=0; i<MAX_CHARGE; i++) {
          p1C += i < p1Charge ? '★' : '☆';
          p2C += i < p2Charge ? '★' : '☆';
        }
        p1ChargeEl.textContent = `★: ${p1Charge}/${MAX_CHARGE}`;
        p2ChargeEl.textContent = `★: ${p2Charge}/${MAX_CHARGE}`;

        const myCharge = isP1 ? p1Charge : p2Charge;
        const myCharging = (isP1 ? p1ChargingUntil : p2ChargingUntil) > performance.now();

        btn1.disabled = isGameOver || myCharge <= 0 || myCharging;
        btn2.disabled = isGameOver || myCharging;
        btn3.disabled = isGameOver || myCharge >= MAX_CHARGE || myCharging;
      }

      function actionCharge() {
        const now = performance.now();
        const myCharge = isP1 ? p1Charge : p2Charge;
        if (myCharge >= MAX_CHARGE || isGameOver) return;

        if (isP1) {
          p1ChargingUntil = now + CHARGE_DURATION;
          p1GuardUntil = 0;
        } else {
          p2ChargingUntil = now + CHARGE_DURATION;
          p2GuardUntil = 0;
        }

        sfx.charge();
        bannerEl.textContent = '⚡ チャージ中… (0.5秒)';
        bridge.send({ game: 'block_battle_3d', type: 'charge_start', role: myRole });
        updateUI();
      }

      function actionAttack() {
        const myCharge = isP1 ? p1Charge : p2Charge;
        if (myCharge <= 0 || isGameOver) return;

        if (isP1) {
          p1Charge--;
          p1GuardUntil = 0;
        } else {
          p2Charge--;
          p2GuardUntil = 0;
        }

        sfx.attack();
        spawnBulletMesh(isP1);
        bannerEl.textContent = '⚔️ 攻撃！ (0.5秒で着弾)';
        bridge.send({ game: 'block_battle_3d', type: 'attack', role: myRole });
        updateUI();
      }

      function actionGuard() {
        const now = performance.now();
        if (isGameOver) return;

        if (isP1) {
          p1GuardUntil = now + GUARD_DURATION;
          p1ChargingUntil = 0;
        } else {
          p2GuardUntil = now + GUARD_DURATION;
          p2ChargingUntil = 0;
        }

        sfx.guard();
        bannerEl.textContent = '🛡️ 防御シールド展開！';
        bridge.send({ game: 'block_battle_3d', type: 'guard', role: myRole });
        updateUI();
      }

      // 被弾判定
      function onBulletHitTarget(fromP1) {
        const now = performance.now();
        const targetIsP1 = !fromP1;
        const isGuarding = targetIsP1 ? p1GuardUntil > now : p2GuardUntil > now;

        if (isGuarding) {
          // ガード成功！
          sfx.block();
          bannerEl.textContent = '🛡️ ガード成功！ダメージ無効！';
        } else {
          // ヒット！
          sfx.hit();
          if (targetIsP1) {
            p1Hp = Math.max(0, p1Hp - 1);
            flashMesh(p1Cube, 0xffffff, 0xef4444);
          } else {
            p2Hp = Math.max(0, p2Hp - 1);
            flashMesh(p2Cube, 0xffffff, 0x3b82f6);
          }
          bannerEl.textContent = '💥 クリーンヒット！ (1ダメージ)';

          if (p1Hp <= 0 || p2Hp <= 0) {
            triggerGameOver();
          }
        }
        updateUI();
      }

      function flashMesh(mesh, flashCol, origCol) {
        mesh.material.color.setHex(flashCol);
        setTimeout(() => mesh.material.color.setHex(origCol), 180);
      }

      function triggerGameOver() {
        isGameOver = true;
        const iWon = (isP1 && p2Hp <= 0) || (!isP1 && p1Hp <= 0);
        resultTitle.textContent = iWon ? '🏆 YOU WIN! 勝利！' : '💀 YOU LOSE... 敗北';
        resultTitle.style.color = iWon ? '#facc15' : '#ef4444';
        overlayEl.classList.remove('hidden');
        if (iWon) sfx.win();
      }

      function resetMatch() {
        p1Hp = MAX_HP; p2Hp = MAX_HP;
        p1Charge = 0; p2Charge = 0;
        p1ChargingUntil = 0; p2ChargingUntil = 0;
        p1GuardUntil = 0; p2GuardUntil = 0;
        isGameOver = false;
        overlayEl.classList.add('hidden');
        bannerEl.textContent = '対戦スタート！';

        activeBullets.forEach(b => scene.remove(b.mesh));
        activeBullets = [];
        updateUI();
      }

      // 受信リスナー
      bridge.onReceive(data => {
        if (data.game !== 'block_battle_3d') return;
        const now = performance.now();

        if (data.type === 'charge_start') {
          if (data.role === 'p1') { p1ChargingUntil = now + CHARGE_DURATION; p1GuardUntil = 0; }
          else { p2ChargingUntil = now + CHARGE_DURATION; p2GuardUntil = 0; }
          sfx.charge();
          updateUI();
        } else if (data.type === 'attack') {
          if (data.role === 'p1') { p1Charge = Math.max(0, p1Charge - 1); p1GuardUntil = 0; spawnBulletMesh(true); }
          else { p2Charge = Math.max(0, p2Charge - 1); p2GuardUntil = 0; spawnBulletMesh(false); }
          sfx.attack();
          updateUI();
        } else if (data.type === 'guard') {
          if (data.role === 'p1') { p1GuardUntil = now + GUARD_DURATION; p1ChargingUntil = 0; }
          else { p2GuardUntil = now + GUARD_DURATION; p2ChargingUntil = 0; }
          sfx.guard();
          updateUI();
        } else if (data.type === 'reset') {
          resetMatch();
          bridge.showToast('バトルがリセットされました');
        }
      });

      // キーボードリスナー
      function onKeyDown(e) {
        if (isGameOver) return;
        if (e.key === '1') actionAttack();
        else if (e.key === '2') actionGuard();
        else if (e.key === '3') actionCharge();
      }
      window.addEventListener('keydown', onKeyDown);

      // ボタンリスナー
      btn1.addEventListener('click', actionAttack);
      btn2.addEventListener('click', actionGuard);
      btn3.addEventListener('click', actionCharge);
      retryBtn.addEventListener('click', () => {
        resetMatch();
        bridge.send({ game: 'block_battle_3d', type: 'reset' });
      });

      // --- レンダリングループ ---
      function animate() {
        if (isDestroyed) return;
        animFrameId = requestAnimationFrame(animate);

        const now = performance.now();

        // チャージ完了判定
        if (p1ChargingUntil > 0 && now >= p1ChargingUntil) {
          p1Charge = Math.min(MAX_CHARGE, p1Charge + 1);
          p1ChargingUntil = 0;
          updateUI();
        }
        if (p2ChargingUntil > 0 && now >= p2ChargingUntil) {
          p2Charge = Math.min(MAX_CHARGE, p2Charge + 1);
          p2ChargingUntil = 0;
          updateUI();
        }

        // チャージバー表示
        const myChargingUntil = isP1 ? p1ChargingUntil : p2ChargingUntil;
        if (myChargingUntil > now) {
          const remain = myChargingUntil - now;
          const pct = Math.max(0, Math.min(100, (1 - remain / CHARGE_DURATION) * 100));
          chargeFill.style.width = pct + '%';
        } else {
          chargeFill.style.width = '0%';
        }

        // シールド表示更新
        p1Shield.visible = p1GuardUntil > now;
        p2Shield.visible = p2GuardUntil > now;

        // オーブ浮遊更新
        const t = now * 0.003;
        for(let i=0; i<3; i++) {
          const o1 = p1Orbs[i];
          o1.visible = i < p1Charge;
          if (o1.visible) {
            const ang = t + (i / 3) * Math.PI * 2;
            o1.position.set(Math.cos(ang) * 1.2, 2.2 + Math.sin(t * 2 + i) * 0.15, 3.8 + Math.sin(ang) * 1.2);
          }

          const o2 = p2Orbs[i];
          o2.visible = i < p2Charge;
          if (o2.visible) {
            const ang = t + (i / 3) * Math.PI * 2;
            o2.position.set(Math.cos(ang) * 1.2, 2.2 + Math.sin(t * 2 + i) * 0.15, -3.8 + Math.sin(ang) * 1.2);
          }
        }

        // プロジェクタイル進行
        for(let i=activeBullets.length-1; i>=0; i--) {
          const b = activeBullets[i];
          const elapsed = now - b.startTime;
          const prog = Math.min(1, elapsed / b.duration);

          b.mesh.position.z = b.startZ + (b.targetZ - b.startZ) * prog;
          b.mesh.position.y = 0.75 + Math.sin(prog * Math.PI) * 0.5;

          if (prog >= 1) {
            scene.remove(b.mesh);
            activeBullets.splice(i, 1);
            onBulletHitTarget(b.fromP1);
          }
        }

        renderer.render(scene, camera);
      }

      animate();
      updateUI();

      // リサイズ対応
      function onResize() {
        const w = canvasContainer.clientWidth;
        const h = canvasContainer.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
      window.addEventListener('resize', onResize);

      // アンマウント時のお掃除
      this._cleanup = () => {
        isDestroyed = true;
        if (animFrameId) cancelAnimationFrame(animFrameId);
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('resize', onResize);
        activeBullets.forEach(b => scene.remove(b.mesh));
        renderer.dispose();
      };
    },

    unmount() {
      if (this._cleanup) this._cleanup();
    }
  });
})();
