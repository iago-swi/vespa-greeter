(function (global) {
  'use strict';

  const VespaGame = (global.VespaGame = global.VespaGame || {});

  function createWorld(scene, renderer, road, initialAtmosphereId) {
    const cfg = VespaGame.CONFIG;
    const tex = VespaGame.Textures;

    // ---------------------------------------------------------
    // 1. SKY DOME, TWILIGHT STARS & LIGHTING
    // ---------------------------------------------------------
    const sunDir = new THREE.Vector3(-0.62, 0.24, -0.75).normalize();

    const skyGeo = new THREE.SphereGeometry(1400, 32, 24);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uSunDir: { value: sunDir.clone() },
        uTopColor: { value: new THREE.Color(0x284378) },
        uMidColor: { value: new THREE.Color(0xc96b6e) },
        uHorColor: { value: new THREE.Color(0xffbe76) },
        uSunColor: { value: new THREE.Color(0xfff5d6) }
      },
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 uSunDir;
        uniform vec3 uTopColor;
        uniform vec3 uMidColor;
        uniform vec3 uHorColor;
        uniform vec3 uSunColor;
        varying vec3 vWorldPos;
        void main() {
          vec3 d = normalize(vWorldPos);
          float h = clamp(d.y, 0.0, 1.0);
          vec3 col = mix(uHorColor, uMidColor, smoothstep(0.0, 0.26, h));
          col = mix(col, uTopColor, smoothstep(0.22, 0.82, h));
          float sunAmt = max(dot(d, uSunDir), 0.0);
          col += uSunColor * pow(sunAmt, 14.0) * 0.42;
          col += vec3(1.0, 0.98, 0.9) * smoothstep(0.9965, 0.9994, sunAmt) * 1.4;
          gl_FragColor = vec4(col, 1.0);
        }
      `
    });
    scene.add(new THREE.Mesh(skyGeo, skyMat));

    // Twilight starfield
    const starCount = 420;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(0.18 + Math.random() * 0.82); // Upper sky hemisphere
      const rad = 1220;
      starPositions[i * 3] = rad * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = rad * Math.cos(phi);
      starPositions[i * 3 + 2] = rad * Math.sin(phi) * Math.sin(theta);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xf4f7ff,
      size: 3.4,
      transparent: true,
      opacity: 0.0,
      fog: false,
      depthWrite: false
    });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    scene.fog = new THREE.FogExp2(0xe8a87c, 0.00162);

    const hemiLight = new THREE.HemisphereLight(0xffd7a8, 0x3b4d3b, 0.78);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xffcb8c, 1.95);
    sunLight.position.copy(sunDir).multiplyScalar(220);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.camera.near = 20;
    sunLight.shadow.camera.far = 560;
    const sCam = 110;
    sunLight.shadow.camera.left = -sCam;
    sunLight.shadow.camera.right = sCam;
    sunLight.shadow.camera.top = sCam;
    sunLight.shadow.camera.bottom = -sCam;
    sunLight.shadow.bias = -0.0005;
    scene.add(sunLight);
    scene.add(sunLight.target);

    // ---------------------------------------------------------
    // 2. ALPINE VALLEY TERRAIN, LAKE, PEAKS & CLOUDS
    // ---------------------------------------------------------
    const terrainGeo = new THREE.PlaneGeometry(1400, 1400, 110, 110);
    terrainGeo.rotateX(-Math.PI / 2);
    const tPos = terrainGeo.attributes.position;
    for (let i = 0; i < tPos.count; i++) {
      const x = tPos.getX(i);
      const z = tPos.getZ(i);
      const dist = Math.hypot(x, z);
      let h = -8 + Math.sin(x * 0.015) * 6 + Math.cos(z * 0.015) * 6;
      if (dist < 115) {
        h = -11 - (1 - dist / 115) * 10;
      } else if (dist > 280) {
        h += Math.pow((dist - 280) / 150, 1.55) * 58;
      } else {
        h = Math.min(h, 4);
      }
      tPos.setY(i, h);
    }
    terrainGeo.computeVertexNormals();
    const terrainMat = new THREE.MeshStandardMaterial({
      map: tex.makeGrassTexture(),
      roughness: 0.92,
      metalness: 0.02
    });
    const terrain = new THREE.Mesh(terrainGeo, terrainMat);
    terrain.receiveShadow = true;
    scene.add(terrain);

    const lakeGeo = new THREE.CircleGeometry(128, 48);
    lakeGeo.rotateX(-Math.PI / 2);
    const lakeMat = new THREE.MeshStandardMaterial({
      color: 0x3b6e8c,
      roughness: 0.14,
      metalness: 0.55,
      emissive: 0x261d24,
      emissiveIntensity: 0.26
    });
    const lake = new THREE.Mesh(lakeGeo, lakeMat);
    lake.position.y = -7.5;
    scene.add(lake);

    // Distant Snow-Capped Alpine Peaks Ring
    const peakGroup = new THREE.Group();
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x5c5b6e, roughness: 0.92, flatShading: true });
    const snowMat = new THREE.MeshStandardMaterial({ color: 0xfff2e8, roughness: 0.65, flatShading: true });
    for (let i = 0; i < 34; i++) {
      const a = (i / 34) * Math.PI * 2 + (Math.random() - 0.5) * 0.1;
      const dist = 480 + Math.random() * 240;
      const h = 150 + Math.random() * 190;
      const rad = 85 + Math.random() * 90;
      const mGroup = new THREE.Group();

      const base = new THREE.Mesh(new THREE.ConeGeometry(rad, h, 7), rockMat);
      base.position.y = h * 0.5 - 15;
      mGroup.add(base);

      const capH = h * 0.36;
      const cap = new THREE.Mesh(new THREE.ConeGeometry(rad * 0.37, capH, 7), snowMat);
      cap.position.y = h - capH * 0.5 - 14.5;
      mGroup.add(cap);

      mGroup.position.set(Math.cos(a) * dist, 0, Math.sin(a) * dist);
      mGroup.rotation.y = Math.random() * Math.PI;
      peakGroup.add(mGroup);
    }
    scene.add(peakGroup);

    // Drifting Clouds
    const clouds = [];
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffe4cc,
      roughness: 0.95,
      transparent: true,
      opacity: 0.84
    });
    for (let i = 0; i < 24; i++) {
      const cg = new THREE.Group();
      const puffs = 3 + Math.floor(Math.random() * 4);
      for (let p = 0; p < puffs; p++) {
        const s = 14 + Math.random() * 18;
        const puff = new THREE.Mesh(new THREE.SphereGeometry(s, 9, 7), cloudMat);
        puff.position.set((p - puffs * 0.5) * 14, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 10);
        puff.scale.set(1.3, 0.55, 0.9);
        cg.add(puff);
      }
      const a = Math.random() * Math.PI * 2;
      const r = 180 + Math.random() * 480;
      cg.position.set(Math.cos(a) * r, 115 + Math.random() * 80, Math.sin(a) * r);
      cg.userData = { speed: 1.2 + Math.random() * 1.8 };
      scene.add(cg);
      clouds.push(cg);
    }

    // ---------------------------------------------------------
    // 3. STONE PARAPETS & WARMLY LIT SCENIC TUNNEL
    // ---------------------------------------------------------
    const stoneTex = tex.makeStoneTexture();
    const stoneMat = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.88 });
    const bollardGeo = new THREE.BoxGeometry(0.46, 0.82, 0.72);
    const bollardCount = 150;
    const bollards = new THREE.InstancedMesh(bollardGeo, stoneMat, bollardCount * 2);
    bollards.castShadow = true;
    bollards.receiveShadow = true;

    const dummy = new THREE.Object3D();
    let bIdx = 0;
    for (let i = 0; i < bollardCount; i++) {
      const t = i / bollardCount;
      if (road.isInTunnel(t, 0.01)) continue;
      const f = road.getFrame(t);
      for (const side of [-1, 1]) {
        const p = f.pos.clone().addScaledVector(f.right, side * (road.width * 0.5 + 0.52));
        dummy.position.set(p.x, p.y + 0.36, p.z);
        dummy.lookAt(p.clone().add(f.tangent));
        dummy.updateMatrix();
        bollards.setMatrixAt(bIdx++, dummy.matrix);
      }
    }
    bollards.count = bIdx;
    scene.add(bollards);

    // Scenic Stone Tunnel with Warm PointLights
    const tunnelArchMat = new THREE.MeshStandardMaterial({
      map: stoneTex,
      color: 0x6f685f,
      roughness: 0.92,
      side: THREE.DoubleSide
    });
    const tunnelGlowMat = new THREE.MeshBasicMaterial({ color: 0xffd27d });
    const tunnelLights = [];
    const TUNNEL_STEPS = 22;

    for (let i = 0; i < TUNNEL_STEPS; i++) {
      const t = cfg.TUNNEL_START_T + (i / TUNNEL_STEPS) * (cfg.TUNNEL_END_T - cfg.TUNNEL_START_T);
      const f = road.getFrame(t);
      const arch = new THREE.Mesh(
        new THREE.CylinderGeometry(6.8, 6.8, 4.3, 18, 1, true, 0, Math.PI),
        tunnelArchMat
      );
      arch.rotation.z = Math.PI / 2;
      arch.rotation.y = Math.PI / 2;
      const wrap = new THREE.Group();
      wrap.add(arch);

      if (i % 4 === 1) {
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.16, 0.42), tunnelGlowMat);
        lamp.position.set(0, 6.28, 0);
        wrap.add(lamp);

        // Warm amber tunnel PointLight casting real light inside the stone vault
        const ptLight = new THREE.PointLight(0xffb454, 1.8, 30, 1.5);
        ptLight.position.set(0, 5.75, 0);
        wrap.add(ptLight);
        tunnelLights.push(ptLight);
      }

      wrap.position.copy(f.pos);
      wrap.lookAt(f.pos.clone().add(f.tangent));
      scene.add(wrap);
    }

    // ---------------------------------------------------------
    // 4. ROADSIDE KILOMETER MARKERS & PASSO DEL SALUTO ARCH
    // ---------------------------------------------------------
    const kmSideMat = new THREE.MeshStandardMaterial({ color: 0xe8e2d5, roughness: 0.85 });
    const kmCapMat = new THREE.MeshStandardMaterial({ color: 0xc43636, roughness: 0.72 });
    const totalKm = road.length / 1000;
    const kmSteps = Math.floor(totalKm * 10); // Every 0.1 km (100m)

    for (let k = 0; k <= kmSteps; k++) {
      const t = (k * 100) / road.length;
      if (t >= 0.985 || road.isInTunnel(t, 0.015)) continue;
      const f = road.getFrame(t);
      const kmText = (k / 10).toFixed(1);
      const frontTex = tex.makeKmMarkerTexture(kmText);
      const faceMat = new THREE.MeshStandardMaterial({ map: frontTex, roughness: 0.75 });

      const markerGroup = new THREE.Group();
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.92, 0.20),
        [kmSideMat, kmSideMat, kmCapMat, kmSideMat, faceMat, faceMat]
      );
      post.position.y = 0.46;
      post.castShadow = true;
      post.receiveShadow = true;
      markerGroup.add(post);

      // Small stone plinth
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.22, 0.30), stoneMat);
      base.position.y = 0.08;
      markerGroup.add(base);

      const pos = f.pos.clone().addScaledVector(f.right, road.width * 0.5 + 1.22);
      markerGroup.position.set(pos.x, pos.y - 0.06, pos.z);
      // Angle face slightly toward approaching rider
      markerGroup.lookAt(pos.clone().add(f.tangent));
      scene.add(markerGroup);
    }

    // Passo del Saluto Summit Signpost at Start/Finish (t = 0.0)
    (function buildPassSummitArch() {
      const f = road.getFrame(0.0);
      const timberMat = new THREE.MeshStandardMaterial({ map: tex.makeTimberTexture(), roughness: 0.85 });
      const signMat = new THREE.MeshStandardMaterial({ map: tex.makePassSignTexture(), roughness: 0.55 });
      const archGroup = new THREE.Group();

      const spanHalf = road.width * 0.5 + 1.35;
      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.24, 5.6, 8), timberMat);
        post.position.set(side * spanHalf, 2.6, 0);
        post.castShadow = true;
        archGroup.add(post);

        const stoneFoot = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.0, 0.75), stoneMat);
        stoneFoot.position.set(side * spanHalf, 0.35, 0);
        archGroup.add(stoneFoot);
      }

      const beam = new THREE.Mesh(new THREE.BoxGeometry(spanHalf * 2 + 1.0, 0.36, 0.36), timberMat);
      beam.position.set(0, 5.2, 0);
      beam.castShadow = true;
      archGroup.add(beam);

      const board = new THREE.Mesh(
        new THREE.BoxGeometry(5.6, 1.45, 0.16),
        [timberMat, timberMat, timberMat, timberMat, signMat, signMat]
      );
      board.position.set(0, 4.95, 0);
      board.castShadow = true;
      archGroup.add(board);

      // Seated wooden weather cap right above the summit sign
      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(6.1, 0.22, 0.62),
        new THREE.MeshStandardMaterial({ color: 0x4d3528, roughness: 0.9 })
      );
      cap.position.set(0, 5.76, 0);
      archGroup.add(cap);

      archGroup.position.copy(f.pos);
      archGroup.lookAt(f.pos.clone().add(f.tangent));
      scene.add(archGroup);
    })();

    // ---------------------------------------------------------
    // 5. WOODEN CHALETS & STONE MOUNTAIN REFUGES
    // ---------------------------------------------------------
    const timberMat = new THREE.MeshStandardMaterial({ map: tex.makeTimberTexture(), roughness: 0.86 });
    const plasterMat = new THREE.MeshStandardMaterial({ color: 0xebe3d3, roughness: 0.88 });
    const roofDarkMat = new THREE.MeshStandardMaterial({ color: 0x3b2c25, roughness: 0.9 });
    const slateRoofMat = new THREE.MeshStandardMaterial({ color: 0x424a56, roughness: 0.86 });
    const shutterRedMat = new THREE.MeshStandardMaterial({ color: 0xa63232, roughness: 0.72 });
    const geraniumMat = new THREE.MeshStandardMaterial({ color: 0xe63946, roughness: 0.7 });
    const windowMat = new THREE.MeshStandardMaterial({
      color: 0xffe4a8,
      emissive: 0xffb347,
      emissiveIntensity: 0.35,
      roughness: 0.3
    });

    function createWoodenChalet() {
      const g = new THREE.Group();

      // Deep stone foundation skirt so building sits firmly on slopes
      const foundation = new THREE.Mesh(new THREE.BoxGeometry(7.2, 5.4, 5.8), stoneMat);
      foundation.position.y = -1.6;
      foundation.receiveShadow = true;
      foundation.castShadow = true;
      g.add(foundation);

      // Timber upper story
      const walls = new THREE.Mesh(new THREE.BoxGeometry(6.8, 3.3, 5.4), timberMat);
      walls.position.y = 2.75;
      walls.castShadow = true;
      walls.receiveShadow = true;
      g.add(walls);

      // Steep Alpine pitched roof (two angled slabs for crisp chalet gable)
      for (const side of [-1, 1]) {
        const slope = new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.24, 4.1), roofDarkMat);
        slope.position.set(0, 5.2, side * 1.65);
        slope.rotation.x = side * 0.56;
        slope.castShadow = true;
        g.add(slope);
      }

      // Gable triangles (front & back timber fill)
      const gableGeo = new THREE.ConeGeometry(2.85, 2.0, 4);
      const gableL = new THREE.Mesh(gableGeo, timberMat);
      gableL.rotation.y = Math.PI / 4;
      gableL.scale.set(0.08, 1.0, 1.32);
      gableL.position.set(-3.36, 5.15, 0);
      g.add(gableL);
      const gableR = gableL.clone();
      gableR.position.x = 3.36;
      g.add(gableR);

      // Wooden wrap balcony + geranium flower boxes on road-facing (+Z) side
      const balconyFloor = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.18, 1.25), timberMat);
      balconyFloor.position.set(0, 1.65, 3.15);
      g.add(balconyFloor);

      const rail = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.65, 0.14), timberMat);
      rail.position.set(0, 2.08, 3.72);
      g.add(rail);

      for (const fx of [-2.0, 0, 2.0]) {
        const flowers = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.28, 0.28), geraniumMat);
        flowers.position.set(fx, 2.48, 3.82);
        g.add(flowers);
      }

      // Warm glowing windows on front and sides
      for (const wx of [-1.85, 0, 1.85]) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.05, 0.12), windowMat);
        win.position.set(wx, 2.95, 2.72);
        g.add(win);
      }
      for (const side of [-1, 1]) {
        const sideWin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.95, 1.05), windowMat);
        sideWin.position.set(side * 3.42, 2.95, 0);
        g.add(sideWin);
      }

      // Stone chimney
      const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.75, 2.4, 0.75), stoneMat);
      chimney.position.set(2.1, 6.2, -1.1);
      chimney.castShadow = true;
      g.add(chimney);

      return g;
    }

    function createStoneRefuge() {
      const g = new THREE.Group();

      // Solid stone plinth into terrain
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(6.6, 5.0, 5.2), stoneMat);
      plinth.position.y = -1.7;
      plinth.receiveShadow = true;
      g.add(plinth);

      // Thick granite refuge walls
      const body = new THREE.Mesh(new THREE.BoxGeometry(6.2, 3.4, 4.8), stoneMat);
      body.position.y = 2.45;
      body.castShadow = true;
      body.receiveShadow = true;
      g.add(body);

      // Upper stucco gable band
      const upperBand = new THREE.Mesh(new THREE.BoxGeometry(6.3, 0.45, 4.9), plasterMat);
      upperBand.position.y = 3.95;
      g.add(upperBand);

      // Pitched slate roof
      for (const side of [-1, 1]) {
        const roof = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.24, 3.55), slateRoofMat);
        roof.position.set(0, 4.95, side * 1.4);
        roof.rotation.x = side * 0.52;
        roof.castShadow = true;
        g.add(roof);
      }

      // Glowing windows with Italian red shutters
      for (const wx of [-1.6, 1.6]) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.88, 1.05, 0.14), windowMat);
        win.position.set(wx, 2.65, 2.42);
        g.add(win);

        for (const sx of [-0.62, 0.62]) {
          const shutter = new THREE.Mesh(new THREE.BoxGeometry(0.32, 1.08, 0.12), shutterRedMat);
          shutter.position.set(wx + sx, 2.65, 2.43);
          g.add(shutter);
        }
      }

      // Cozy refuge wooden door & entrance overhang
      const door = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.85, 0.14), timberMat);
      door.position.set(0, 1.75, 2.42);
      g.add(door);

      const porchRoof = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.14, 1.0), slateRoofMat);
      porchRoof.position.set(0, 2.85, 2.85);
      porchRoof.rotation.x = 0.25;
      g.add(porchRoof);

      const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.68, 2.1, 0.68), stoneMat);
      chimney.position.set(-1.9, 5.8, -0.9);
      g.add(chimney);

      return g;
    }

    const buildingSpots = [
      { t: 0.055, side: 1, dist: 16.5, type: 'chalet' },
      { t: 0.145, side: -1, dist: 19.0, type: 'refuge' },
      { t: 0.235, side: 1, dist: 17.5, type: 'chalet' },
      { t: 0.345, side: -1, dist: 18.0, type: 'refuge' },
      { t: 0.410, side: 1, dist: 17.0, type: 'chalet' },
      { t: 0.545, side: 1, dist: 18.5, type: 'refuge' },
      { t: 0.655, side: -1, dist: 17.5, type: 'chalet' },
      { t: 0.760, side: 1, dist: 19.0, type: 'refuge' },
      { t: 0.865, side: -1, dist: 17.5, type: 'chalet' },
      { t: 0.945, side: 1, dist: 18.0, type: 'refuge' }
    ];

    buildingSpots.forEach(spot => {
      const f = road.getFrame(spot.t);
      const b = spot.type === 'chalet' ? createWoodenChalet() : createStoneRefuge();
      const pos = f.pos.clone().addScaledVector(f.right, spot.side * spot.dist);
      // Drop subtly down embankment slope
      pos.y -= 2.2;
      b.position.copy(pos);
      // Face road
      b.lookAt(f.pos.x, pos.y, f.pos.z);
      scene.add(b);
    });

    // ---------------------------------------------------------
    // 6. INSTANCED ALPINE PINES & WILDFLOWERS
    // ---------------------------------------------------------
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c3d28, roughness: 0.92 });
    const pineMat = new THREE.MeshStandardMaterial({ color: 0x264b2f, roughness: 0.84, flatShading: true });

    const MAX_TREES = 340;
    const trunkInst = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.24, 0.38, 3.0, 6), trunkMat, MAX_TREES);
    const pineLowInst = new THREE.InstancedMesh(new THREE.ConeGeometry(2.4, 5.4, 7), pineMat, MAX_TREES);
    const pineTopInst = new THREE.InstancedMesh(new THREE.ConeGeometry(1.7, 4.6, 7), pineMat, MAX_TREES);
    pineLowInst.castShadow = true;
    pineTopInst.castShadow = true;

    let tIdx = 0;
    for (let i = 0; i < MAX_TREES; i++) {
      const t = Math.random();
      if (road.isInTunnel(t, 0.015)) continue;
      const f = road.getFrame(t);
      const side = Math.random() < 0.5 ? -1 : 1;
      const dist = road.width * 0.5 + 4.8 + Math.random() * 28;
      const p = f.pos.clone().addScaledVector(f.right, side * dist);

      // Avoid clipping directly into any chalet/refuge spot
      let tooClose = false;
      for (let s = 0; s < buildingSpots.length; s++) {
        const sp = buildingSpots[s];
        const dt = Math.min(Math.abs(t - sp.t), 1 - Math.abs(t - sp.t));
        if (dt < 0.016 && sp.side === side && Math.abs(dist - sp.dist) < 7.5) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;

      const drop = Math.max(0, (dist - 7) * 0.22);
      const baseY = p.y - drop - 1.0;
      const sc = 0.75 + Math.random() * 0.95;

      dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
      dummy.scale.set(sc, sc, sc);
      dummy.position.set(p.x, baseY + 1.5 * sc, p.z);
      dummy.updateMatrix();
      trunkInst.setMatrixAt(tIdx, dummy.matrix);

      dummy.position.set(p.x, baseY + 4.2 * sc, p.z);
      dummy.updateMatrix();
      pineLowInst.setMatrixAt(tIdx, dummy.matrix);

      dummy.position.set(p.x, baseY + 7.0 * sc, p.z);
      dummy.updateMatrix();
      pineTopInst.setMatrixAt(tIdx, dummy.matrix);
      tIdx++;
    }
    trunkInst.count = pineLowInst.count = pineTopInst.count = tIdx;
    scene.add(trunkInst, pineLowInst, pineTopInst);

    const flowerColors = [0xffd166, 0xff7b89, 0xfff5e4, 0x9b89ff];
    flowerColors.forEach(hex => {
      const fGeo = new THREE.DodecahedronGeometry(0.22, 0);
      const fMat = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.7 });
      const fInst = new THREE.InstancedMesh(fGeo, fMat, 90);
      let fi = 0;
      for (let k = 0; k < 90; k++) {
        const t = Math.random();
        if (road.isInTunnel(t, 0.015)) continue;
        const f = road.getFrame(t);
        const side = Math.random() < 0.5 ? -1 : 1;
        const p = f.pos.clone().addScaledVector(f.right, side * (road.width * 0.5 + 1.4 + Math.random() * 3.8));
        dummy.position.set(p.x, p.y - 0.15, p.z);
        dummy.scale.setScalar(0.7 + Math.random() * 0.8);
        dummy.rotation.set(0, Math.random() * 6, 0);
        dummy.updateMatrix();
        fInst.setMatrixAt(fi++, dummy.matrix);
      }
      fInst.count = fi;
      scene.add(fInst);
    });

    // ---------------------------------------------------------
    // 7. SUBTLE ROAD-DUST PARTICLE POOL
    // ---------------------------------------------------------
    const DUST_COUNT = 56;
    const dustPositions = new Float32Array(DUST_COUNT * 3);
    const dustVelocities = [];
    const dustAges = new Float32Array(DUST_COUNT);
    const dustLifetimes = new Float32Array(DUST_COUNT);

    for (let i = 0; i < DUST_COUNT; i++) {
      dustPositions[i * 3] = 0;
      dustPositions[i * 3 + 1] = -999;
      dustPositions[i * 3 + 2] = 0;
      dustVelocities.push(new THREE.Vector3());
      dustAges[i] = 99;
      dustLifetimes[i] = 0.65;
    }

    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    const dustMat = new THREE.PointsMaterial({
      map: tex.makeSoftParticleTexture(),
      color: 0xffd7a8,
      size: 0.75,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      blending: THREE.NormalBlending
    });
    const dustPoints = new THREE.Points(dustGeo, dustMat);
    dustPoints.frustumCulled = false;
    scene.add(dustPoints);

    let dustCursor = 0;
    let dustEmitTimer = 0;

    function updateDust(dt, playerPos, forwardDir, rightDir, speed) {
      const speedFactor = Math.max(0, (speed - 8) / 14);
      dustEmitTimer += dt * (16 + speedFactor * 26);

      while (dustEmitTimer >= 1) {
        dustEmitTimer -= 1;
        const idx = dustCursor;
        dustCursor = (dustCursor + 1) % DUST_COUNT;

        // Spawn slightly behind rear tire
        const sx = playerPos.x - forwardDir.x * 0.95 + (Math.random() - 0.5) * 0.28;
        const sy = playerPos.y + 0.14 + Math.random() * 0.08;
        const sz = playerPos.z - forwardDir.z * 0.95 + (Math.random() - 0.5) * 0.28;

        dustPositions[idx * 3] = sx;
        dustPositions[idx * 3 + 1] = sy;
        dustPositions[idx * 3 + 2] = sz;

        const v = dustVelocities[idx];
        v.set(
          -forwardDir.x * (1.2 + speedFactor * 2.2) + rightDir.x * (Math.random() - 0.5) * 0.9,
          0.35 + Math.random() * 0.55,
          -forwardDir.z * (1.2 + speedFactor * 2.2) + rightDir.z * (Math.random() - 0.5) * 0.9
        );
        dustAges[idx] = 0;
        dustLifetimes[idx] = 0.45 + Math.random() * 0.45;
      }

      for (let i = 0; i < DUST_COUNT; i++) {
        if (dustAges[i] < dustLifetimes[i]) {
          dustAges[i] += dt;
          const v = dustVelocities[i];
          dustPositions[i * 3] += v.x * dt;
          dustPositions[i * 3 + 1] += v.y * dt;
          dustPositions[i * 3 + 2] += v.z * dt;
          v.multiplyScalar(Math.pow(0.28, dt));
          if (dustAges[i] >= dustLifetimes[i]) {
            dustPositions[i * 3 + 1] = -999;
          }
        }
      }
      dustGeo.attributes.position.needsUpdate = true;
    }

    // ---------------------------------------------------------
    // 8. SCREEN-SPACE OPTICAL LENS FLARE POLISH
    // ---------------------------------------------------------
    const flareContainer = document.getElementById('lens-flare');
    const flareMain = document.getElementById('flare-main');
    const flareGhosts = [
      { el: document.getElementById('flare-g1'), factor: 0.45 },
      { el: document.getElementById('flare-g2'), factor: -0.28 },
      { el: document.getElementById('flare-g3'), factor: -0.72 }
    ];
    const sunWorldTmp = new THREE.Vector3();
    const camForwardTmp = new THREE.Vector3();

    let activeAtmosphere = VespaGame.getAtmospherePreset(initialAtmosphereId || 'golden');

    function updateLensFlare(camera, inTunnel) {
      if (!flareContainer || !flareMain) return;
      if (inTunnel || activeAtmosphere.flareStrength <= 0.01) {
        flareContainer.style.opacity = '0';
        return;
      }

      camera.getWorldDirection(camForwardTmp);
      const facing = camForwardTmp.dot(sunDir);
      if (facing <= 0.15) {
        flareContainer.style.opacity = '0';
        return;
      }

      sunWorldTmp.copy(camera.position).addScaledVector(sunDir, 900);
      sunWorldTmp.project(camera);

      // Off-screen fade
      const edgeDist = Math.max(Math.abs(sunWorldTmp.x), Math.abs(sunWorldTmp.y));
      if (edgeDist > 1.25 || sunWorldTmp.z > 1.0) {
        flareContainer.style.opacity = '0';
        return;
      }

      const w = global.innerWidth;
      const h = global.innerHeight;
      const sx = (sunWorldTmp.x * 0.5 + 0.5) * w;
      const sy = (-sunWorldTmp.y * 0.5 + 0.5) * h;

      const edgeFade = Math.max(0, Math.min(1, 1 - (edgeDist - 0.72) / 0.53));
      const facingFade = Math.pow(Math.max(0, facing), 2.2);
      const opacity = activeAtmosphere.flareStrength * edgeFade * facingFade * 0.85;

      flareContainer.style.opacity = opacity.toFixed(3);
      flareMain.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -50%)`;

      const cx = w * 0.5;
      const cy = h * 0.5;
      for (let i = 0; i < flareGhosts.length; i++) {
        const g = flareGhosts[i];
        if (!g.el) continue;
        const gx = cx + (sx - cx) * g.factor;
        const gy = cy + (sy - cy) * g.factor;
        g.el.style.transform = `translate3d(${gx.toFixed(1)}px, ${gy.toFixed(1)}px, 0) translate(-50%, -50%)`;
      }
    }

    // ---------------------------------------------------------
    // 9. ATMOSPHERE / TIME-OF-DAY SWITCHER
    // ---------------------------------------------------------
    function setAtmosphere(atmosphereId) {
      const preset = VespaGame.getAtmospherePreset(atmosphereId);
      activeAtmosphere = preset;

      sunDir.set(preset.sunDir[0], preset.sunDir[1], preset.sunDir[2]).normalize();
      skyMat.uniforms.uSunDir.value.copy(sunDir);
      skyMat.uniforms.uTopColor.value.setHex(preset.skyTop);
      skyMat.uniforms.uMidColor.value.setHex(preset.skyMid);
      skyMat.uniforms.uHorColor.value.setHex(preset.skyHorizon);
      skyMat.uniforms.uSunColor.value.setHex(preset.skySun);

      scene.fog.color.setHex(preset.fogColor);
      scene.fog.density = preset.fogDensity;

      hemiLight.color.setHex(preset.hemiSky);
      hemiLight.groundColor.setHex(preset.hemiGround);
      hemiLight.intensity = preset.hemiIntensity;

      sunLight.color.setHex(preset.sunColor);
      sunLight.intensity = preset.sunIntensity;
      renderer.toneMappingExposure = preset.exposure;

      lakeMat.color.setHex(preset.lakeColor);
      lakeMat.emissive.setHex(preset.lakeEmissive);
      lakeMat.emissiveIntensity = preset.lakeEmissiveIntensity;

      cloudMat.color.setHex(preset.cloudColor);
      cloudMat.opacity = preset.cloudOpacity;

      dustMat.color.setHex(preset.dustColor);
      dustMat.opacity = preset.dustOpacity;

      windowMat.emissiveIntensity = preset.windowEmissiveIntensity;
      starMat.opacity = preset.starOpacity;

      for (let i = 0; i < tunnelLights.length; i++) {
        tunnelLights[i].intensity = preset.tunnelLightIntensity;
      }

      if (flareMain) {
        flareMain.style.background = `radial-gradient(circle, rgba(255,252,240,0.95) 0%, ${preset.flareColor} 28%, rgba(255,190,120,0) 70%)`;
      }

      return preset;
    }

    setAtmosphere(initialAtmosphereId || 'golden');

    function update(dt, playerPos, forwardDir, rightDir, speed, camera, inTunnel) {
      // Keep directional sun shadows crisp around the player
      sunLight.position.copy(playerPos).addScaledVector(sunDir, 180);
      sunLight.target.position.copy(playerPos);
      sunLight.target.updateMatrixWorld();

      // Drift clouds gently
      for (let i = 0; i < clouds.length; i++) {
        const c = clouds[i];
        c.position.x += c.userData.speed * dt;
        if (c.position.x > 620) c.position.x = -620;
      }

      // Road dust & lens flare
      updateDust(dt, playerPos, forwardDir, rightDir, speed);
      updateLensFlare(camera, inTunnel);
    }

    return {
      sunDir,
      setAtmosphere,
      getAtmosphere: () => activeAtmosphere,
      update
    };
  }

  VespaGame.World = {
    createWorld
  };
})(window);
