(function (global) {
  'use strict';

  const VespaGame = (global.VespaGame = global.VespaGame || {});

  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xeef3f7, roughness: 0.16, metalness: 0.92 });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x1c1d22, roughness: 0.88 });
  const whitewallMat = new THREE.MeshStandardMaterial({ color: 0xf6f1e6, roughness: 0.55 });
  const darkMetalMat = new THREE.MeshStandardMaterial({ color: 0x2a2d36, roughness: 0.45, metalness: 0.6 });
  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xfff8dc,
    emissive: 0xffe4a0,
    emissiveIntensity: 1.4
  });
  const taillightMat = new THREE.MeshStandardMaterial({
    color: 0xff2a38,
    emissive: 0xd91826,
    emissiveIntensity: 1.2
  });

  let glowSpriteTex = null;
  function getGlowTexture() {
    if (!glowSpriteTex) {
      glowSpriteTex = VespaGame.Textures.makeSoftParticleTexture();
    }
    return glowSpriteTex;
  }

  function makeWheel(radius, width, whitewall) {
    const g = new THREE.Group();
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 18), tireMat);
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = true;
    g.add(tire);
    if (whitewall) {
      const ww = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.76, radius * 0.76, width + 0.015, 16), whitewallMat);
      ww.rotation.z = Math.PI / 2;
      g.add(ww);
    }
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.48, radius * 0.48, width + 0.03, 12), chromeMat);
    rim.rotation.z = Math.PI / 2;
    g.add(rim);
    return g;
  }

  function makeHeadlightGlow(scale) {
    const mat = new THREE.SpriteMaterial({
      map: getGlowTexture(),
      color: 0xffe9b0,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(scale, scale, 1);
    return sprite;
  }

  function makeHeadlightBeam(length, radius) {
    const geo = new THREE.ConeGeometry(radius, length, 14, 1, true);
    // Point cone tip at headlight and flare forward along +Z
    geo.translate(0, -length * 0.5, 0);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffe7aa,
      transparent: true,
      opacity: 0.0,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    return new THREE.Mesh(geo, mat);
  }

  // --- PLAYER VINTAGE VESPA + RIDER ---
  function createPlayerVespa(initialColorId) {
    const preset = VespaGame.getColorPreset(initialColorId);
    const root = new THREE.Group();

    const paintMat = new THREE.MeshStandardMaterial({
      color: preset.bodyHex,
      roughness: 0.22,
      metalness: 0.28
    });
    const leatherMat = new THREE.MeshStandardMaterial({ color: preset.saddleHex, roughness: 0.72 });
    const helmetMat = new THREE.MeshStandardMaterial({ color: preset.helmetHex, roughness: 0.28, metalness: 0.12 });
    const scarfMat = new THREE.MeshStandardMaterial({ color: preset.scarfHex, roughness: 0.65 });

    // Wheels
    const frontWheel = makeWheel(0.31, 0.16, true);
    frontWheel.position.set(0, 0.31, 0.78);
    root.add(frontWheel);

    const rearWheel = makeWheel(0.31, 0.18, true);
    rearWheel.position.set(0, 0.31, -0.68);
    root.add(rearWheel);

    // Front mudguard
    const fender = new THREE.Mesh(new THREE.SphereGeometry(0.35, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), paintMat);
    fender.scale.set(0.55, 0.9, 1.15);
    fender.position.set(0, 0.42, 0.78);
    root.add(fender);

    // Classic Vespa curved rear cowls (tear-drop body)
    const rearBody = new THREE.Mesh(new THREE.SphereGeometry(0.46, 18, 14), paintMat);
    rearBody.scale.set(0.88, 0.76, 1.48);
    rearBody.position.set(0, 0.58, -0.52);
    rearBody.castShadow = true;
    root.add(rearBody);

    // Floorboard
    const floor = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.09, 0.96), paintMat);
    floor.position.set(0, 0.29, 0.08);
    floor.castShadow = true;
    root.add(floor);

    // Legshield (front apron)
    const shield = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.78, 0.11), paintMat);
    shield.position.set(0, 0.68, 0.56);
    shield.rotation.x = -0.22;
    shield.castShadow = true;
    root.add(shield);

    // Chrome trim horncast
    const horn = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.46, 0.08), chromeMat);
    horn.position.set(0, 0.72, 0.64);
    horn.rotation.x = -0.22;
    root.add(horn);

    // Subtle visual horn pulse ring (animates on H key)
    const hornRingMat = new THREE.MeshBasicMaterial({
      color: 0xffe49c,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.0
    });
    const hornRing = new THREE.Mesh(new THREE.RingGeometry(0.14, 0.22, 18), hornRingMat);
    hornRing.position.set(0, 0.76, 0.72);
    root.add(hornRing);

    // Steering column & handlebars
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.32, 10), paintMat);
    stem.position.set(0, 1.06, 0.48);
    root.add(stem);

    const hbar = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.74, 10), chromeMat);
    hbar.rotation.z = Math.PI / 2;
    hbar.position.set(0, 1.16, 0.45);
    root.add(hbar);

    // Headlight & Speedo cowl
    const cowl = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 12), paintMat);
    cowl.position.set(0, 1.18, 0.52);
    root.add(cowl);

    const hLight = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.06, 16), headlightMat);
    hLight.rotation.x = Math.PI / 2;
    hLight.position.set(0, 1.18, 0.63);
    root.add(hLight);

    // Working Vespa SpotLight + soft volumetric beam for Twilight & Tunnel
    const headSpot = new THREE.SpotLight(0xfff0c4, 0.0, 68, Math.PI * 0.25, 0.68, 1.35);
    headSpot.position.set(0, 1.18, 0.68);
    const headTarget = new THREE.Object3D();
    headTarget.position.set(0, 0.12, 20);
    root.add(headTarget);
    headSpot.target = headTarget;
    root.add(headSpot);

    const headBeam = makeHeadlightBeam(14.5, 2.8);
    headBeam.position.set(0, 1.16, 0.66);
    headBeam.rotation.x = 0.07;
    root.add(headBeam);

    const headGlow = makeHeadlightGlow(1.1);
    headGlow.position.set(0, 1.18, 0.72);
    root.add(headGlow);

    // Chrome mirrors
    for (const s of [-1, 1]) {
      const mStem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 6), chromeMat);
      mStem.position.set(s * 0.30, 1.26, 0.45);
      mStem.rotation.z = -s * 0.22;
      root.add(mStem);
      const mirror = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.025, 14), chromeMat);
      mirror.rotation.x = Math.PI / 2;
      mirror.position.set(s * 0.34, 1.37, 0.45);
      root.add(mirror);
    }

    // Vintage leather saddle
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.14, 0.68), leatherMat);
    seat.position.set(0, 0.88, -0.36);
    seat.castShadow = true;
    root.add(seat);

    // Rear taillight + soft red glow
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.11, 0.08), taillightMat);
    tail.position.set(0, 0.68, -1.16);
    root.add(tail);

    const tailGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: getGlowTexture(),
        color: 0xff3b47,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    tailGlow.scale.set(0.65, 0.65, 1);
    tailGlow.position.set(0, 0.68, -1.24);
    root.add(tailGlow);

    // --- RIDER ---
    const jacketMat = new THREE.MeshStandardMaterial({ color: 0x3a4a5e, roughness: 0.72 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x2c2f38, roughness: 0.82 });
    const gloveMat = new THREE.MeshStandardMaterial({ color: 0x5c341f, roughness: 0.65 });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.56, 0.26), jacketMat);
    torso.position.set(0, 1.24, -0.22);
    torso.rotation.x = 0.16;
    torso.castShadow = true;
    root.add(torso);

    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.075, 0.58, 8), pantsMat);
      leg.position.set(s * 0.17, 0.70, 0.05);
      leg.rotation.x = -0.35;
      root.add(leg);
    }

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.165, 16, 14), helmetMat);
    head.position.set(0, 1.66, -0.15);
    head.castShadow = true;
    root.add(head);

    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.34, 0.33), scarfMat);
    stripe.position.set(0, 1.67, -0.15);
    root.add(stripe);

    const scarfPivot = new THREE.Group();
    scarfPivot.position.set(0.06, 1.48, -0.28);
    const scarfTail = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.04, 0.52), scarfMat);
    scarfTail.position.set(0, 0, -0.26);
    scarfPivot.add(scarfTail);
    root.add(scarfPivot);

    // Right arm on throttle (-X)
    const rightArm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.048, 0.58, 8), jacketMat);
    rightArm.position.set(-0.27, 1.28, 0.08);
    rightArm.rotation.x = 1.28;
    rightArm.rotation.z = 0.14;
    root.add(rightArm);

    // Left arm (pivots up to salute! +X)
    const leftArmPivot = new THREE.Group();
    leftArmPivot.position.set(0.24, 1.44, -0.15);
    const leftUpper = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.048, 0.58, 8), jacketMat);
    leftUpper.position.set(0.03, -0.12, 0.26);
    leftUpper.rotation.x = 1.25;
    leftUpper.rotation.z = -0.12;
    leftArmPivot.add(leftUpper);

    const leftGlove = new THREE.Mesh(new THREE.SphereGeometry(0.068, 10, 8), gloveMat);
    leftGlove.position.set(0.08, -0.20, 0.54);
    leftArmPivot.add(leftGlove);
    root.add(leftArmPivot);

    function setColor(colorId) {
      const next = VespaGame.getColorPreset(colorId);
      paintMat.color.setHex(next.bodyHex);
      leatherMat.color.setHex(next.saddleHex);
      helmetMat.color.setHex(next.helmetHex);
      scarfMat.color.setHex(next.scarfHex);
      return next;
    }

    function setHeadlightPower(power) {
      const p = Math.max(0, Math.min(1, power));
      headSpot.intensity = p * 5.2;
      headBeam.material.opacity = p * 0.13;
      headGlow.material.opacity = 0.12 + p * 0.72;
      tailGlow.material.opacity = 0.18 + p * 0.65;
    }

    return {
      group: root,
      frontWheel,
      rearWheel,
      scarfPivot,
      leftArmPivot,
      hornRing,
      hornRingMat,
      paintMaterial: paintMat,
      setColor,
      setHeadlightPower
    };
  }

  // --- ONCOMING MOTORBIKES (Cruiser, Sport, Touring) ---
  function createMotorbike(style, willSalute) {
    const root = new THREE.Group();
    const colors = {
      cruiser: [0x9e2a2b, 0x22262e, 0x1b4d3e],
      sport: [0xd62828, 0x0077b6, 0xf77f00],
      touring: [0x3d5a80, 0x5c677d, 0x7f4f24]
    };
    const palette = colors[style];
    const bodyCol = palette[Math.floor(Math.random() * palette.length)];
    const bodyMat = new THREE.MeshStandardMaterial({ color: bodyCol, roughness: 0.28, metalness: 0.35 });

    const fw = makeWheel(0.36, 0.15, style === 'cruiser');
    fw.position.set(0, 0.36, 0.88);
    root.add(fw);
    const rw = makeWheel(0.36, 0.19, style === 'cruiser');
    rw.position.set(0, 0.36, -0.82);
    root.add(rw);

    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 1.35), darkMetalMat);
    frame.position.set(0, 0.56, 0.0);
    frame.castShadow = true;
    root.add(frame);

    const tank = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), bodyMat);
    tank.scale.set(0.95, 0.72, 1.5);
    tank.position.set(0, 0.86, 0.25);
    tank.castShadow = true;
    root.add(tank);

    const fork = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.88, 8), chromeMat);
    fork.position.set(0, 0.76, 0.74);
    fork.rotation.x = -0.34;
    root.add(fork);

    const hbar = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.82, 8), chromeMat);
    hbar.rotation.z = Math.PI / 2;
    hbar.position.set(0, 1.12, 0.54);
    root.add(hbar);

    const hl = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), headlightMat);
    hl.position.set(0, 1.02, 0.86);
    root.add(hl);

    const glow = makeHeadlightGlow(1.45);
    glow.position.set(0, 1.02, 0.96);
    root.add(glow);

    const beam = makeHeadlightBeam(11.0, 2.1);
    beam.position.set(0, 1.0, 0.92);
    beam.rotation.x = 0.08;
    root.add(beam);

    if (style === 'touring') {
      const windshield = new THREE.Mesh(
        new THREE.BoxGeometry(0.46, 0.42, 0.04),
        new THREE.MeshStandardMaterial({ color: 0xdcf0ff, transparent: true, opacity: 0.45, roughness: 0.1 })
      );
      windshield.position.set(0, 1.32, 0.70);
      windshield.rotation.x = -0.25;
      root.add(windshield);
    }

    const riderJacket = new THREE.MeshStandardMaterial({
      color: style === 'sport' ? bodyCol : 0x262830,
      roughness: 0.7
    });
    const riderHelmet = new THREE.MeshStandardMaterial({
      color: willSalute ? 0xfff3d6 : 0x333742,
      roughness: 0.25
    });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.58, 0.26), riderJacket);
    torso.position.set(0, 1.24, -0.14);
    torso.rotation.x = style === 'sport' ? 0.44 : 0.16;
    torso.castShadow = true;
    root.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 12), riderHelmet);
    head.position.set(0, style === 'sport' ? 1.58 : 1.68, style === 'sport' ? 0.04 : -0.08);
    head.castShadow = true;
    root.add(head);

    const rArm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.048, 0.62, 8), riderJacket);
    rArm.position.set(-0.28, 1.22, 0.18);
    rArm.rotation.x = 1.22;
    root.add(rArm);

    const leftArmPivot = new THREE.Group();
    leftArmPivot.position.set(0.24, 1.42, -0.06);
    const lArm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.66, 8), riderJacket);
    lArm.position.set(0.04, -0.12, 0.28);
    lArm.rotation.x = 1.22;
    leftArmPivot.add(lArm);

    const gloveMat = new THREE.MeshStandardMaterial({
      color: willSalute ? 0xffe082 : 0x242428,
      emissive: willSalute ? 0xffb300 : 0x000000,
      emissiveIntensity: willSalute ? 0.42 : 0,
      roughness: 0.5
    });
    const glove = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), gloveMat);
    glove.position.set(0.08, -0.18, 0.58);
    leftArmPivot.add(glove);

    let glint = null;
    if (willSalute) {
      glint = new THREE.Mesh(
        new THREE.RingGeometry(0.11, 0.22, 16),
        new THREE.MeshBasicMaterial({ color: 0xfff3b0, side: THREE.DoubleSide, transparent: true, opacity: 0.0 })
      );
      glint.position.set(0.08, -0.18, 0.62);
      leftArmPivot.add(glint);
    }
    root.add(leftArmPivot);

    return {
      group: root,
      wheels: [fw, rw],
      leftArmPivot,
      glint,
      lightGlows: [glow],
      lightBeams: [beam]
    };
  }

  // --- VINTAGE EUROPEAN CAR ---
  function createCar() {
    const root = new THREE.Group();
    const palette = [0xc94c4c, 0x4b749f, 0xd9a74a, 0xded6c8, 0x5c7c66];
    const col = palette[Math.floor(Math.random() * palette.length)];
    const paint = new THREE.MeshStandardMaterial({ color: col, roughness: 0.28, metalness: 0.3 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x263547, roughness: 0.12, metalness: 0.7 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.66, 3.85), paint);
    body.position.set(0, 0.68, 0);
    body.castShadow = true;
    root.add(body);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.58, 1.95), paint);
    cabin.position.set(0, 1.24, -0.18);
    cabin.castShadow = true;
    root.add(cabin);

    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.46, 2.0), glass);
    windshield.position.set(0, 1.24, -0.18);
    root.add(windshield);

    const bumperF = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.14, 0.14), chromeMat);
    bumperF.position.set(0, 0.44, 1.96);
    root.add(bumperF);

    const lightGlows = [];
    const lightBeams = [];
    for (const sx of [-0.62, 0.62]) {
      const hl = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.06, 12), headlightMat);
      hl.rotation.x = Math.PI / 2;
      hl.position.set(sx, 0.74, 1.94);
      root.add(hl);

      const glow = makeHeadlightGlow(1.35);
      glow.position.set(sx, 0.74, 2.04);
      root.add(glow);
      lightGlows.push(glow);

      const beam = makeHeadlightBeam(10.5, 1.8);
      beam.position.set(sx, 0.72, 2.0);
      beam.rotation.x = 0.07;
      root.add(beam);
      lightBeams.push(beam);
    }

    const wheels = [];
    for (const sx of [-0.84, 0.84]) {
      for (const sz of [-1.18, 1.18]) {
        const w = makeWheel(0.34, 0.22, false);
        w.position.set(sx, 0.34, sz);
        root.add(w);
        wheels.push(w);
      }
    }
    return { group: root, wheels, lightGlows, lightBeams };
  }

  // --- CAB-OVER EUROPEAN TRUCK ---
  function createTruck() {
    const root = new THREE.Group();
    const cabColors = [0x2c5e8a, 0xa83838, 0x456b48, 0xc77d2e];
    const cabMat = new THREE.MeshStandardMaterial({
      color: cabColors[Math.floor(Math.random() * cabColors.length)],
      roughness: 0.38,
      metalness: 0.22
    });
    const cargoMat = new THREE.MeshStandardMaterial({ color: 0xeae4d8, roughness: 0.75 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x22303f, roughness: 0.15, metalness: 0.6 });

    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.1, 2.05, 1.85), cabMat);
    cab.position.set(0, 1.52, 2.15);
    cab.castShadow = true;
    root.add(cab);

    const ws = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.78, 0.08), glass);
    ws.position.set(0, 1.88, 3.07);
    root.add(ws);

    const cargo = new THREE.Mesh(new THREE.BoxGeometry(2.26, 2.55, 4.45), cargoMat);
    cargo.position.set(0, 1.82, -1.05);
    cargo.castShadow = true;
    root.add(cargo);

    const lightGlows = [];
    const lightBeams = [];
    for (const sx of [-0.74, 0.74]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.08), headlightMat);
      hl.position.set(sx, 0.88, 3.08);
      root.add(hl);

      const glow = makeHeadlightGlow(1.6);
      glow.position.set(sx, 0.88, 3.18);
      root.add(glow);
      lightGlows.push(glow);

      const beam = makeHeadlightBeam(12.0, 2.1);
      beam.position.set(sx, 0.86, 3.12);
      beam.rotation.x = 0.07;
      root.add(beam);
      lightBeams.push(beam);
    }

    const wheels = [];
    for (const sx of [-1.04, 1.04]) {
      for (const sz of [-2.3, -1.2, 2.1]) {
        const w = makeWheel(0.46, 0.28, false);
        w.position.set(sx, 0.46, sz);
        root.add(w);
        wheels.push(w);
      }
    }
    return { group: root, wheels, lightGlows, lightBeams };
  }

  // --- ROAD CYCLIST ---
  function createCyclist() {
    const root = new THREE.Group();
    const jerseyColors = [0xffbe0b, 0xff006e, 0x3a86ff, 0x06d6a0];
    const jMat = new THREE.MeshStandardMaterial({
      color: jerseyColors[Math.floor(Math.random() * jerseyColors.length)],
      roughness: 0.65
    });

    const fw = makeWheel(0.34, 0.06, false);
    fw.position.set(0, 0.34, 0.56);
    root.add(fw);
    const rw = makeWheel(0.34, 0.06, false);
    rw.position.set(0, 0.34, -0.54);
    root.add(rw);

    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.42, 0.96), jMat);
    frame.position.set(0, 0.62, 0.02);
    root.add(frame);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.48, 0.20), jMat);
    torso.position.set(0, 1.18, -0.05);
    torso.rotation.x = 0.55;
    torso.castShadow = true;
    root.add(torso);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.135, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 })
    );
    head.position.set(0, 1.48, 0.18);
    root.add(head);

    const leftLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.045, 0.52, 6), darkMetalMat);
    leftLeg.position.set(0.11, 0.64, -0.06);
    root.add(leftLeg);

    const rightLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.045, 0.52, 6), darkMetalMat);
    rightLeg.position.set(-0.11, 0.64, -0.06);
    root.add(rightLeg);

    return { group: root, wheels: [fw, rw], leftLeg, rightLeg, lightGlows: [], lightBeams: [] };
  }

  function setSharedHeadlightEmissive(intensity) {
    headlightMat.emissiveIntensity = intensity;
  }

  function applyTrafficHeadlights(trafficList, twilightOn) {
    const glowOp = twilightOn ? 0.78 : 0.0;
    const beamOp = twilightOn ? 0.10 : 0.0;
    for (let i = 0; i < trafficList.length; i++) {
      const m = trafficList[i].mesh;
      if (m.lightGlows) {
        for (let g = 0; g < m.lightGlows.length; g++) {
          m.lightGlows[g].material.opacity = glowOp;
        }
      }
      if (m.lightBeams) {
        for (let b = 0; b < m.lightBeams.length; b++) {
          m.lightBeams[b].material.opacity = beamOp;
        }
      }
    }
  }

  VespaGame.Vehicles = {
    createPlayerVespa,
    createMotorbike,
    createCar,
    createTruck,
    createCyclist,
    setSharedHeadlightEmissive,
    applyTrafficHeadlights
  };
})(window);
