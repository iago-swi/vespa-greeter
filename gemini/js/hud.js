(function (global) {
  'use strict';

  const VespaGame = (global.VespaGame = global.VespaGame || {});

  function createHUD(road, callbacks) {
    const hudEl = document.getElementById('hud');
    const startOverlay = document.getElementById('start-overlay');
    const finishOverlay = document.getElementById('finish-overlay');
    const toastLayer = document.getElementById('toast-layer');
    const flashEl = document.getElementById('salute-flash');

    const scoreEl = document.getElementById('ui-score');
    const streakEl = document.getElementById('ui-streak');
    const lapEl = document.getElementById('ui-lap');
    const bestEl = document.getElementById('ui-best');
    const speedEl = document.getElementById('ui-speed');
    const kmEl = document.getElementById('ui-km');
    const atmoBadgeEl = document.getElementById('ui-atmo-badge');
    const endCruiseBtn = document.getElementById('btn-end-cruise');
    const backMenuBtn = document.getElementById('btn-back-menu');

    const startBadgeEl = document.getElementById('start-badge');
    const colorPickerEl = document.getElementById('garage-colors');
    const atmoPickerEl = document.getElementById('atmosphere-toggle');
    const startLbListEl = document.getElementById('start-lb-list');
    const finishLbListEl = document.getElementById('finish-lb-list');
    const finishBadgeEl = document.getElementById('finish-badge');
    const finishTitleEl = document.getElementById('finish-title');
    const finishRankEl = document.getElementById('finish-rank');
    const finishRecordTag = document.getElementById('finish-record-tag');
    const finishLbTitle = document.getElementById('finish-lb-title');

    let activeStartLbTab = 'tour';
    let playerDotColor = '#7fd8be';

    // ---------------------------------------------------------
    // 1. MINIMAP SETUP
    // ---------------------------------------------------------
    const mmCanvas = document.getElementById('minimap');
    const mmCtx = mmCanvas.getContext('2d');
    const mmPoints = [];
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    for (let i = 0; i < 120; i++) {
      const p = road.curve.getPointAt(i / 120);
      mmPoints.push(p);
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }

    const mmSpan = Math.max(maxX - minX, maxZ - minZ) * 1.18;
    const mmCx = (minX + maxX) * 0.5;
    const mmCz = (minZ + maxZ) * 0.5;

    function toMM(x, z) {
      return [
        74 + ((x - mmCx) / mmSpan) * 130,
        74 + ((z - mmCz) / mmSpan) * 130
      ];
    }

    function drawMinimap(playerT, traffic) {
      mmCtx.clearRect(0, 0, 148, 148);

      // Road loop
      mmCtx.beginPath();
      for (let i = 0; i < mmPoints.length; i++) {
        const [mx, my] = toMM(mmPoints[i].x, mmPoints[i].z);
        if (i === 0) mmCtx.moveTo(mx, my);
        else mmCtx.lineTo(mx, my);
      }
      mmCtx.closePath();
      mmCtx.strokeStyle = 'rgba(255, 224, 178, 0.38)';
      mmCtx.lineWidth = 4;
      mmCtx.stroke();

      // Start/finish tick
      const sp = road.curve.getPointAt(0);
      const [sx, sy] = toMM(sp.x, sp.z);
      mmCtx.beginPath();
      mmCtx.arc(sx, sy, 3.2, 0, Math.PI * 2);
      mmCtx.fillStyle = '#ffffff';
      mmCtx.fill();

      // Traffic dots
      for (let i = 0; i < traffic.length; i++) {
        const v = traffic[i];
        const p = road.curve.getPointAt(((v.t % 1) + 1) % 1);
        const [mx, my] = toMM(p.x, p.z);
        mmCtx.beginPath();
        mmCtx.arc(mx, my, v.kind === 'motorbike' ? 2.6 : 2.0, 0, Math.PI * 2);
        mmCtx.fillStyle = v.kind === 'motorbike' ? '#ffd166' : 'rgba(255,255,255,0.45)';
        mmCtx.fill();
      }

      // Player dot in chosen Vespa paint
      const pp = road.curve.getPointAt(((playerT % 1) + 1) % 1);
      const [px, py] = toMM(pp.x, pp.z);
      mmCtx.beginPath();
      mmCtx.arc(px, py, 4.8, 0, Math.PI * 2);
      mmCtx.fillStyle = playerDotColor;
      mmCtx.fill();
      mmCtx.strokeStyle = '#ffffff';
      mmCtx.lineWidth = 1.7;
      mmCtx.stroke();
    }

    // ---------------------------------------------------------
    // 2. TOASTS & FEEDBACK FLASH
    // ---------------------------------------------------------
    function showToast(text, cls) {
      const el = document.createElement('div');
      el.className = 'toast ' + (cls || 'good');
      el.textContent = text;
      toastLayer.appendChild(el);
      setTimeout(() => el.remove(), 1200);
    }

    function triggerFlash(color) {
      flashEl.style.background = `radial-gradient(circle, transparent 52%, ${color} 100%)`;
      flashEl.style.opacity = '1';
      setTimeout(() => {
        flashEl.style.opacity = '0';
      }, 240);
    }

    // ---------------------------------------------------------
    // 3. GARAGE & ATMOSPHERE CONTROLS
    // ---------------------------------------------------------
    function buildGarageUI(selectedColorId) {
      colorPickerEl.innerHTML = '';
      VespaGame.VESPA_COLORS.forEach(c => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'swatch-btn' + (c.id === selectedColorId ? ' active' : '');
        btn.dataset.colorId = c.id;
        btn.title = c.name;
        btn.innerHTML = `<span class="swatch-dot" style="background:${c.swatch}"></span><span class="swatch-name">${c.name}</span>`;
        btn.addEventListener('click', () => {
          setSelectedColorUI(c.id);
          if (callbacks.onSelectColor) callbacks.onSelectColor(c.id);
        });
        colorPickerEl.appendChild(btn);
      });
      setSelectedColorUI(selectedColorId);
    }

    function setSelectedColorUI(colorId) {
      const preset = VespaGame.getColorPreset(colorId);
      playerDotColor = preset.minimapHex;
      const btns = colorPickerEl.querySelectorAll('.swatch-btn');
      btns.forEach(b => b.classList.toggle('active', b.dataset.colorId === preset.id));
    }

    function buildAtmosphereUI(selectedAtmoId) {
      atmoPickerEl.innerHTML = '';
      VespaGame.ATMOSPHERES.forEach(a => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'atmo-btn' + (a.id === selectedAtmoId ? ' active' : '');
        btn.dataset.atmoId = a.id;
        btn.innerHTML = `<span class="atmo-icon">${a.icon}</span><span>${a.name}</span>`;
        btn.addEventListener('click', () => {
          setSelectedAtmosphereUI(a.id);
          if (callbacks.onSelectAtmosphere) callbacks.onSelectAtmosphere(a.id);
        });
        atmoPickerEl.appendChild(btn);
      });
      setSelectedAtmosphereUI(selectedAtmoId);
    }

    function setSelectedAtmosphereUI(atmoId) {
      const preset = VespaGame.getAtmospherePreset(atmoId);
      if (startBadgeEl) startBadgeEl.textContent = preset.badge;
      if (atmoBadgeEl) atmoBadgeEl.textContent = `${preset.icon} ${preset.name}`;
      const btns = atmoPickerEl.querySelectorAll('.atmo-btn');
      btns.forEach(b => b.classList.toggle('active', b.dataset.atmoId === preset.id));
    }

    // ---------------------------------------------------------
    // 4. LEADERBOARD RENDERING
    // ---------------------------------------------------------
    function renderLeaderboardInto(containerEl, mode, highlightId) {
      const scores = VespaGame.Storage.getModeScores(mode);
      if (!scores.length) {
        containerEl.innerHTML = `<div class="lb-empty">No ${mode === 'endless' ? 'Endless Cruise' : '2-Lap Tour'} scores yet — hit the pass!</div>`;
        return;
      }

      const rows = scores.map((entry, idx) => {
        const colorPreset = VespaGame.getColorPreset(entry.colorId);
        const isCurrent = highlightId && entry.id === highlightId;
        const meta = mode === 'endless'
          ? `Lap ${entry.laps} • ${entry.bestStreak}x`
          : `${entry.hits} ${entry.hits === 1 ? 'salute' : 'salutes'} • ${entry.bestStreak}x`;
        return `
          <div class="lb-row${isCurrent ? ' highlight' : ''}">
            <span class="lb-rank">#${idx + 1}</span>
            <span class="lb-paint" style="background:${colorPreset.swatch}" title="${colorPreset.name}"></span>
            <span class="lb-score">${entry.score}</span>
            <span class="lb-meta">${meta}</span>
            <span class="lb-date">${entry.date}</span>
          </div>
        `;
      });
      containerEl.innerHTML = rows.join('');
    }

    function refreshStartLeaderboard(mode) {
      if (mode) activeStartLbTab = mode;
      const tabs = document.querySelectorAll('.lb-tab');
      tabs.forEach(t => t.classList.toggle('active', t.dataset.mode === activeStartLbTab));
      renderLeaderboardInto(startLbListEl, activeStartLbTab, null);
    }

    document.querySelectorAll('.lb-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        refreshStartLeaderboard(tab.dataset.mode);
      });
    });

    // ---------------------------------------------------------
    // 5. SCREEN STATE & LIVE HUD UPDATES
    // ---------------------------------------------------------
    function showStartScreen() {
      hudEl.style.display = 'none';
      finishOverlay.classList.add('hidden');
      startOverlay.classList.remove('hidden');
      refreshStartLeaderboard(activeStartLbTab);
    }

    function showGameplayHUD(mode) {
      startOverlay.classList.add('hidden');
      finishOverlay.classList.add('hidden');
      hudEl.style.display = 'block';
      if (endCruiseBtn) {
        endCruiseBtn.style.display = mode === 'endless' ? 'inline-flex' : 'none';
      }
      if (backMenuBtn) {
        backMenuBtn.style.display = mode === 'tour' ? 'inline-flex' : 'none';
      }
    }

    function showFinishScreen(mode, state, recordResult) {
      hudEl.style.display = 'none';
      startOverlay.classList.add('hidden');

      document.getElementById('sum-score').textContent = state.score;
      document.getElementById('sum-streak').textContent = state.bestStreak + 'x';
      document.getElementById('sum-hits').textContent = state.hits;
      document.getElementById('sum-wrongs').textContent = state.wrongs;

      if (mode === 'endless') {
        finishBadgeEl.textContent = `Endless Cruise • ${state.lap} ${state.lap === 1 ? 'Lap' : 'Laps'}`;
        finishTitleEl.textContent = 'Bella Giornata!';
        finishLbTitle.textContent = 'Top 5 — Endless Cruise';
      } else {
        finishBadgeEl.textContent = '2-Lap Scenic Tour Complete';
        finishTitleEl.textContent = 'Grazie, Rider!';
        finishLbTitle.textContent = 'Top 5 — 2-Lap Scenic Tour';
      }

      let rankMsg = 'A pleasant cruise through the Alps.';
      if (state.score >= 1600 && state.wrongs === 0) rankMsg = 'Leggenda del Passo! Flawless Alpine etiquette.';
      else if (state.score >= 1000) rankMsg = 'True Gentleman of the Mountain Curves!';
      else if (state.score >= 400) rankMsg = 'Warm Vespa Spirit—keep an eye on those handlebars!';
      finishRankEl.textContent = rankMsg;

      if (recordResult && recordResult.isNewRecord) {
        finishRecordTag.textContent = '★ NEW HIGH SCORE!';
        finishRecordTag.classList.remove('hidden');
      } else if (recordResult && recordResult.rank > 0) {
        finishRecordTag.textContent = `★ RANKED #${recordResult.rank} ON LEADERBOARD`;
        finishRecordTag.classList.remove('hidden');
      } else {
        finishRecordTag.classList.add('hidden');
      }

      renderLeaderboardInto(finishLbListEl, mode, recordResult ? recordResult.entry.id : null);
      finishOverlay.classList.remove('hidden');
    }

    function updateHUD(state) {
      scoreEl.textContent = state.score;
      streakEl.textContent = state.streak + 'x';
      lapEl.textContent = state.mode === 'endless'
        ? `Lap ${state.lap}`
        : `${state.lap} / ${state.totalLaps}`;
      const savedBest = VespaGame.Storage.getBestScore(state.mode === 'endless' ? 'endless' : 'tour');
      bestEl.textContent = Math.max(savedBest, state.score);
      speedEl.textContent = Math.round(state.speed * 3.6);
      if (kmEl) {
        const km = (((state.t % 1) + 1) % 1) * (road.length / 1000);
        kmEl.textContent = `${km.toFixed(1)} km`;
      }
    }

    function updateLiveSpeed(state) {
      speedEl.textContent = Math.round(state.speed * 3.6);
      if (kmEl) {
        const km = (((state.t % 1) + 1) % 1) * (road.length / 1000);
        kmEl.textContent = `${km.toFixed(1)} km`;
      }
    }

    // Wire buttons
    document.getElementById('btn-tour').addEventListener('click', () => callbacks.onStart('tour'));
    document.getElementById('btn-endless').addEventListener('click', () => callbacks.onStart('endless'));
    document.getElementById('btn-replay').addEventListener('click', () => callbacks.onStart('tour'));
    document.getElementById('btn-replay-endless').addEventListener('click', () => callbacks.onStart('endless'));
    document.getElementById('btn-garage').addEventListener('click', () => callbacks.onReturnMenu());
    if (endCruiseBtn) {
      endCruiseBtn.addEventListener('click', () => callbacks.onFinishEndless());
    }
    if (backMenuBtn) {
      backMenuBtn.addEventListener('click', () => callbacks.onReturnMenu());
    }

    return {
      buildGarageUI,
      setSelectedColorUI,
      buildAtmosphereUI,
      setSelectedAtmosphereUI,
      refreshStartLeaderboard,
      showStartScreen,
      showGameplayHUD,
      showFinishScreen,
      updateHUD,
      updateLiveSpeed,
      drawMinimap,
      showToast,
      triggerFlash
    };
  }

  VespaGame.HUD = {
    createHUD
  };
})(window);
