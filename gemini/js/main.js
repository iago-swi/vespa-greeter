(function (global) {
  'use strict';

  const VespaGame = (global.VespaGame = global.VespaGame || {});

  if (typeof THREE === 'undefined') {
    const errEl = document.getElementById('fallback-error');
    if (errEl) errEl.style.display = 'flex';
    return;
  }

  const cfg = VespaGame.CONFIG;
  const savedPrefs = VespaGame.Storage.getPrefs();
  const sound = new VespaGame.SoundEngine();

  // ---------------------------------------------------------
  // 1. RENDERER, SCENE & CAMERA
  // ---------------------------------------------------------
  const container = document.getElementById('canvas-container');
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
  renderer.setSize(global.innerWidth, global.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, global.innerWidth / global.innerHeight, 0.15, 2200);

  // ---------------------------------------------------------
  // 2. ROAD, WORLD & PLAYER VESPA
  // ---------------------------------------------------------
  const road = VespaGame.Road.createRoad(scene);
  const world = VespaGame.World.createWorld(scene, renderer, road, savedPrefs.atmosphereId);
  const player = VespaGame.Vehicles.createPlayerVespa(savedPrefs.colorId);
  scene.add(player.group);

  // ---------------------------------------------------------
  // 3. GAME STATE
  // ---------------------------------------------------------
  const state = {
    mode: 'menu', // 'menu' | 'tour' | 'endless' | 'finished'
    lastPlayedMode: 'tour',
    colorId: savedPrefs.colorId,
    atmosphereId: savedPrefs.atmosphereId,
    t: 0.0,
    prevT: 0.0,
    speed: cfg.CRUISE_SPEED,
    targetSpeed: cfg.CRUISE_SPEED,
    laneNudge: 0,
    leanAngle: 0,
    lap: 1,
    totalLaps: cfg.TOTAL_TOUR_LAPS,
    score: 0,
    streak: 0,
    bestStreak: 0,
    hits: 0,
    wrongs: 0,
    misses: 0,
    saluteTimer: 0,
    saluteCooldown: 0,
    hornTimer: 0,
    cameraMode: 'chase', // 'chase' | 'fpv'
    headlightPower: 0,
    time: 0
  };

  // ---------------------------------------------------------
  // 4. TRAFFIC SPAWNER
  // ---------------------------------------------------------
  const traffic = [];

  function buildTraffic() {
    traffic.forEach(v => scene.remove(v.mesh.group));
    traffic.length = 0;

    for (let i = 0; i < cfg.TRAFFIC_COUNT; i++) {
      const t = (0.06 + (i / cfg.TRAFFIC_COUNT) * 0.92) % 1;
      const r = Math.random();
      let kind;
      let willSalute = false;
      let mesh;
      let speed;

      if (r < 0.54) {
        kind = 'motorbike';
        const styles = ['cruiser', 'sport', 'touring'];
        const style = styles[Math.floor(Math.random() * styles.length)];
        willSalute = Math.random() < 0.62;
        mesh = VespaGame.Vehicles.createMotorbike(style, willSalute);
        speed = 13.5 + Math.random() * 5.5;
      } else if (r < 0.78) {
        kind = 'car';
        mesh = VespaGame.Vehicles.createCar();
        speed = 12.0 + Math.random() * 4.5;
      } else if (r < 0.90) {
        kind = 'truck';
        mesh = VespaGame.Vehicles.createTruck();
        speed = 9.5 + Math.random() * 2.5;
      } else {
        kind = 'cyclist';
        mesh = VespaGame.Vehicles.createCyclist();
        speed = 5.5 + Math.random() * 2.0;
      }

      scene.add(mesh.group);
      traffic.push({
        kind,
        willSalute,
        mesh,
        t,
        speed,
        saluteProgress: 0,
        resolved: false,
        whooshed: false,
        laneOffset: kind === 'cyclist' ? -(road.width * 0.5 - 1.1) : -road.laneOffset
      });
    }

    const atmo = world.getAtmosphere();
    VespaGame.Vehicles.applyTrafficHeadlights(traffic, atmo.headlightsOn);
  }

  // ---------------------------------------------------------
  // 5. HUD & CONTROLS WIRING
  // ---------------------------------------------------------
  function applyColor(colorId) {
    const preset = player.setColor(colorId);
    state.colorId = preset.id;
    VespaGame.Storage.savePrefs({ colorId: preset.id });
    hud.setSelectedColorUI(preset.id);
  }

  function applyAtmosphere(atmoId) {
    const preset = world.setAtmosphere(atmoId);
    state.atmosphereId = preset.id;
    VespaGame.Storage.savePrefs({ atmosphereId: preset.id });
    VespaGame.Vehicles.setSharedHeadlightEmissive(preset.vehicleHeadlightEmissive);
    VespaGame.Vehicles.applyTrafficHeadlights(traffic, preset.headlightsOn);
    hud.setSelectedAtmosphereUI(preset.id);
  }

  function cycleAtmosphere() {
    const list = VespaGame.ATMOSPHERES;
    const idx = list.findIndex(a => a.id === state.atmosphereId);
    const next = list[(idx + 1) % list.length];
    applyAtmosphere(next.id);
    hud.showToast(`${next.icon} ${next.name}`, 'miss');
  }

  function startGame(mode) {
    sound.init();
    state.mode = mode;
    state.lastPlayedMode = mode;
    state.t = 0.0;
    state.prevT = 0.0;
    state.speed = cfg.CRUISE_SPEED;
    state.targetSpeed = cfg.CRUISE_SPEED;
    state.laneNudge = 0;
    state.lap = 1;
    state.score = 0;
    state.streak = 0;
    state.bestStreak = 0;
    state.hits = 0;
    state.wrongs = 0;
    state.misses = 0;
    state.saluteTimer = 0;
    state.saluteCooldown = 0;
    state.hornTimer = 0;

    buildTraffic();
    hud.showGameplayHUD(mode);
    hud.updateHUD(state);
  }

  function finishSession(mode) {
    const finishedMode = mode || state.lastPlayedMode || 'tour';
    state.mode = 'finished';

    const recordResult = VespaGame.Storage.recordScore(finishedMode, {
      score: state.score,
      bestStreak: state.bestStreak,
      hits: state.hits,
      wrongs: state.wrongs,
      laps: state.lap,
      colorId: state.colorId,
      atmosphereId: state.atmosphereId
    });

    hud.showFinishScreen(finishedMode, state, recordResult);
  }

  function returnToMenu() {
    state.mode = 'menu';
    hud.showStartScreen();
  }

  const hud = VespaGame.HUD.createHUD(road, {
    onStart: startGame,
    onSelectColor: applyColor,
    onSelectAtmosphere: applyAtmosphere,
    onFinishEndless: () => {
      if (state.mode === 'endless') finishSession('endless');
    },
    onReturnMenu: returnToMenu
  });

  hud.buildGarageUI(state.colorId);
  hud.buildAtmosphereUI(state.atmosphereId);
  buildTraffic();
  applyAtmosphere(state.atmosphereId);
  hud.showStartScreen();

  // ---------------------------------------------------------
  // 6. CORE SPACE BAR SALUTE MECHANIC & HORN
  // ---------------------------------------------------------
  function performSalute() {
    if (state.mode !== 'tour' && state.mode !== 'endless') return;
    if (state.saluteCooldown > 0) return;

    state.saluteTimer = 0.72;
    state.saluteCooldown = 0.42;

    let bestSalutingBiker = null;
    let bestSalutingDist = Infinity;
    let closestNonSaluter = null;
    let closestNonSaluterDist = Infinity;

    for (let i = 0; i < traffic.length; i++) {
      const v = traffic[i];
      const d = road.forwardDistMeters(state.t, v.t);
      if (d > -3.5 && d < 62) {
        if (v.kind === 'motorbike' && v.willSalute && !v.resolved) {
          if (d < bestSalutingDist) {
            bestSalutingDist = d;
            bestSalutingBiker = v;
          }
        } else if (!v.resolved && d < closestNonSaluterDist) {
          closestNonSaluterDist = d;
          closestNonSaluter = v;
        }
      }
    }

    if (bestSalutingBiker) {
      bestSalutingBiker.resolved = true;
      state.streak++;
      if (state.streak > state.bestStreak) state.bestStreak = state.streak;
      state.hits++;

      const perfect = bestSalutingDist >= 8 && bestSalutingDist <= 34;
      const mult = Math.min(3, 1 + Math.floor((state.streak - 1) / 3) * 0.5);
      const pts = Math.round((perfect ? 150 : 100) * mult);
      state.score += pts;

      sound.playGood(perfect);
      hud.triggerFlash('rgba(107, 227, 184, 0.30)');
      hud.showToast(perfect ? `Bellissimo! +${pts}` : `Ciao! +${pts}`, perfect ? 'perfect' : 'good');
    } else {
      if (closestNonSaluter && closestNonSaluterDist < 55) {
        closestNonSaluter.resolved = true;
      }
      state.score -= 50;
      state.streak = 0;
      state.wrongs++;

      sound.playBad();
      hud.triggerFlash('rgba(230, 57, 70, 0.36)');

      let msg = 'No Salute! −50';
      if (closestNonSaluter) {
        if (closestNonSaluter.kind === 'motorbike') msg = "Didn't Salute! −50";
        else if (closestNonSaluter.kind === 'car') msg = "That's a Car! −50";
        else if (closestNonSaluter.kind === 'truck') msg = "That's a Truck! −50";
        else if (closestNonSaluter.kind === 'cyclist') msg = "That's a Cyclist! −50";
      }
      hud.showToast(msg, 'bad');
    }
    hud.updateHUD(state);
  }

  function triggerHorn() {
    if (sound.playHorn()) {
      state.hornTimer = 0.28;
    }
  }

  // ---------------------------------------------------------
  // 7. INPUT HANDLING
  // ---------------------------------------------------------
  const keys = {};
  global.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'Space') {
      if (state.mode === 'tour' || state.mode === 'endless') {
        e.preventDefault();
        performSalute();
      }
    } else if (e.code === 'KeyC') {
      state.cameraMode = state.cameraMode === 'chase' ? 'fpv' : 'chase';
      hud.showToast(state.cameraMode === 'fpv' ? 'Handlebars View' : 'Chase Camera', 'miss');
    } else if (e.code === 'KeyH') {
      triggerHorn();
    } else if (e.code === 'KeyT') {
      cycleAtmosphere();
    } else if (e.code === 'KeyM') {
      const m = sound.toggleMute();
      hud.showToast(m ? 'Sound Muted' : 'Sound On', 'miss');
    } else if (e.code === 'Escape') {
      if (state.mode === 'endless') {
        finishSession('endless');
      } else if (state.mode === 'tour') {
        returnToMenu();
      }
    }
  });

  global.addEventListener('keyup', e => {
    keys[e.code] = false;
  });

  // ---------------------------------------------------------
  // 8. MAIN ANIMATION LOOP
  // ---------------------------------------------------------
  const clock = new THREE.Clock();
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  const turnVec = new THREE.Vector3();

  function animate() {
    global.requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    state.time += dt;

    const playing = state.mode === 'tour' || state.mode === 'endless';
    let throttleInput = 0;

    if (playing) {
      if (keys['KeyW'] || keys['ArrowUp']) {
        state.targetSpeed = Math.min(cfg.MAX_SPEED, state.targetSpeed + dt * 9.5);
        throttleInput = 1;
      }
      if (keys['KeyS'] || keys['ArrowDown']) {
        state.targetSpeed = Math.max(cfg.MIN_SPEED, state.targetSpeed - dt * 10.5);
        throttleInput = -1;
      }
      if (keys['KeyA'] || keys['ArrowLeft']) {
        state.laneNudge = Math.max(-0.85, state.laneNudge - dt * 2.2);
      } else if (keys['KeyD'] || keys['ArrowRight']) {
        state.laneNudge = Math.min(0.85, state.laneNudge + dt * 2.2);
      } else {
        state.laneNudge *= Math.pow(0.08, dt);
      }
    } else {
      state.targetSpeed = cfg.MENU_SPEED;
      state.laneNudge = 0;
    }

    state.speed += (state.targetSpeed - state.speed) * Math.min(1, dt * 4.5);

    state.prevT = state.t;
    state.t = (state.t + (state.speed * dt) / road.length) % 1;

    // Lap completion check
    if (playing && state.t < state.prevT) {
      if (state.mode === 'tour' && state.lap >= state.totalLaps) {
        finishSession('tour');
      } else {
        state.lap++;
        hud.showToast(`Lap ${state.lap}!`, 'good');
        hud.updateHUD(state);
      }
    }

    // Player frame & cornering lean
    const f = road.getFrame(state.t);
    const fAhead = road.getFrame(state.t + 0.008);
    const turnCross = turnVec.crossVectors(f.tangent, fAhead.tangent).y;
    const targetLean = THREE.MathUtils.clamp(-turnCross * 9.5, -0.34, 0.34);
    state.leanAngle += (targetLean - state.leanAngle) * Math.min(1, dt * 6);

    const playerPos = f.pos.clone().addScaledVector(f.right, road.laneOffset + state.laneNudge);
    road.placeOnRoad(player.group, playerPos, f.tangent, f.normal, state.leanAngle);

    // Spin wheels & flutter scarf
    const wheelSpin = (state.speed * dt) / 0.31;
    player.frontWheel.rotation.x += wheelSpin;
    player.rearWheel.rotation.x += wheelSpin;
    player.scarfPivot.rotation.y = Math.sin(state.time * 13) * 0.16;
    player.scarfPivot.rotation.x = Math.cos(state.time * 17) * 0.09 + 0.08;

    // Salute arm animation
    if (state.saluteCooldown > 0) state.saluteCooldown = Math.max(0, state.saluteCooldown - dt);
    if (state.saluteTimer > 0) state.saluteTimer = Math.max(0, state.saluteTimer - dt);
    const salPhase = state.saluteTimer > 0 ? Math.sin((state.saluteTimer / 0.72) * Math.PI) : 0;
    player.leftArmPivot.rotation.z = -salPhase * 1.15;
    player.leftArmPivot.rotation.x = -salPhase * 0.45;

    // Horn visual pulse ring
    if (state.hornTimer > 0) {
      state.hornTimer = Math.max(0, state.hornTimer - dt);
      const p = 1 - state.hornTimer / 0.28;
      player.hornRing.scale.setScalar(1 + p * 2.4);
      player.hornRingMat.opacity = (1 - p) * 0.85;
    } else {
      player.hornRingMat.opacity = 0;
    }

    // Smooth Vespa headlight intensity (auto-on in Twilight OR inside the stone tunnel)
    const inTunnel = road.isInTunnel(state.t, 0.004);
    const targetHeadlight = (world.getAtmosphere().headlightsOn || inTunnel) ? 1.0 : 0.0;
    state.headlightPower += (targetHeadlight - state.headlightPower) * Math.min(1, dt * 6.0);
    player.setHeadlightPower(state.headlightPower);

    // Update oncoming traffic
    for (let i = 0; i < traffic.length; i++) {
      const v = traffic[i];
      v.t = ((v.t - (v.speed * dt) / road.length) % 1 + 1) % 1;
      const tf = road.getFrame(v.t);
      const tfAhead = road.getFrame(v.t - 0.008);
      const oncomingForward = tf.tangent.clone().negate();
      const vTurn = turnVec.crossVectors(oncomingForward, tfAhead.tangent.clone().negate()).y;
      const vLean = (v.kind === 'motorbike' || v.kind === 'cyclist')
        ? THREE.MathUtils.clamp(-vTurn * 8.5, -0.32, 0.32)
        : 0;

      const vPos = tf.pos.clone().addScaledVector(tf.right, v.laneOffset);
      road.placeOnRoad(v.mesh.group, vPos, oncomingForward, tf.normal, vLean);

      const spin = (v.speed * dt) / 0.36;
      for (let w = 0; w < v.mesh.wheels.length; w++) {
        v.mesh.wheels[w].rotation.x += spin;
      }
      if (v.kind === 'cyclist') {
        const ped = state.time * 8.5;
        v.mesh.leftLeg.rotation.x = Math.sin(ped) * 0.65;
        v.mesh.rightLeg.rotation.x = -Math.sin(ped) * 0.65;
      }

      const d = road.forwardDistMeters(state.t, v.t);

      // Reset once far behind player
      if (d < -45 || d > 220) {
        v.resolved = false;
        v.whooshed = false;
      }

      // Passing Doppler whoosh
      if (playing && !v.whooshed && d < 3.5 && d > -8) {
        v.whooshed = true;
        sound.playWhoosh();
      }

      // Missed salute check
      if (playing && v.kind === 'motorbike' && v.willSalute && !v.resolved && d < -4.5 && d > -24) {
        v.resolved = true;
        if (state.streak > 0) {
          state.streak = 0;
          state.misses++;
          hud.showToast('Missed Salute!', 'miss');
          hud.updateHUD(state);
        } else {
          state.misses++;
        }
      }

      // Animate oncoming motorbike salute arm & glint
      if (v.kind === 'motorbike' && v.willSalute) {
        const shouldWave = d < 78 && d > -5;
        const targetP = shouldWave ? 1 : 0;
        v.saluteProgress += (targetP - v.saluteProgress) * Math.min(1, dt * 8.5);
        const waveWiggle = Math.sin(state.time * 12) * 0.14 * v.saluteProgress;
        v.mesh.leftArmPivot.rotation.z = -(v.saluteProgress * 1.28 + waveWiggle);
        v.mesh.leftArmPivot.rotation.x = -v.saluteProgress * 0.42;
        if (v.mesh.glint) {
          v.mesh.glint.material.opacity = v.saluteProgress * (0.48 + 0.35 * Math.sin(state.time * 10));
          v.mesh.glint.scale.setScalar(0.85 + 0.25 * Math.sin(state.time * 10));
        }
      }
    }

    // Camera positioning
    if (state.mode === 'menu') {
      // Showcase 3/4 front view framing the Vespa cleanly on the right side of the viewport
      const sway = Math.sin(state.time * 0.35) * 0.45;
      camPos.copy(playerPos)
        .addScaledVector(f.tangent, 3.65)
        .addScaledVector(f.right, -1.95 + sway)
        .addScaledVector(road.UP, 1.55);
      // Shift look target toward camera's screen-left so the Vespa sits in the open right area
      camLook.copy(playerPos)
        .addScaledVector(f.right, 1.15)
        .addScaledVector(f.tangent, 0.55)
        .addScaledVector(road.UP, 0.95);
    } else if (state.mode === 'finished') {
      const orbitA = state.time * 0.25;
      camPos.copy(playerPos)
        .addScaledVector(f.tangent, -5.6)
        .addScaledVector(f.right, Math.sin(orbitA) * 3.4)
        .addScaledVector(road.UP, 2.55);
      camLook.copy(playerPos).addScaledVector(f.tangent, 12).addScaledVector(road.UP, 1.0);
    } else if (state.cameraMode === 'fpv') {
      camPos.copy(playerPos)
        .addScaledVector(f.tangent, 0.16)
        .addScaledVector(road.UP, 1.54);
      camLook.copy(playerPos)
        .addScaledVector(f.tangent, 18)
        .addScaledVector(road.UP, 1.05);
    } else {
      const desired = playerPos.clone()
        .addScaledVector(f.tangent, -5.4)
        .addScaledVector(f.right, -state.leanAngle * 1.4)
        .addScaledVector(road.UP, 2.45);
      camPos.lerp(desired, Math.min(1, dt * 7.5));
      camLook.copy(playerPos)
        .addScaledVector(f.tangent, 16)
        .addScaledVector(road.UP, 1.15);
    }

    camera.position.copy(camPos);
    camera.lookAt(camLook);

    // Update world (shadows, clouds, road dust, lens flare)
    world.update(dt, playerPos, f.tangent, f.right, state.speed, camera, inTunnel);

    // Update refined 2-stroke engine audio & HUD
    const speedRatio = (state.speed - cfg.MIN_SPEED) / (cfg.MAX_SPEED - cfg.MIN_SPEED);
    sound.updateEngine(speedRatio, playing, dt, throttleInput);

    if (playing) {
      hud.updateLiveSpeed(state);
      hud.drawMinimap(state.t, traffic);
    }

    renderer.render(scene, camera);
  }

  global.addEventListener('resize', () => {
    camera.aspect = global.innerWidth / global.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(global.innerWidth, global.innerHeight);
  });

  // Expose lightweight runtime inspection hooks on VespaGame.app
  VespaGame.app = {
    state,
    traffic,
    road,
    world,
    player,
    sound,
    startGame,
    finishSession,
    performSalute,
    triggerHorn,
    applyColor,
    applyAtmosphere
  };

  animate();
})(window);
