(function (global) {
  'use strict';

  const VespaGame = (global.VespaGame = global.VespaGame || {});
  const UP = new THREE.Vector3(0, 1, 0);

  // Reusable scratch math objects for zero-GC vehicle placement
  const basisMat = new THREE.Matrix4();
  const xAxis = new THREE.Vector3();
  const yAxis = new THREE.Vector3();
  const zAxis = new THREE.Vector3();
  const leanQuat = new THREE.Quaternion();
  const baseQuat = new THREE.Quaternion();
  const zUnit = new THREE.Vector3(0, 0, 1);

  function createRoad(scene) {
    const cfg = VespaGame.CONFIG;
    const controlPts = [];

    for (let i = 0; i < cfg.NUM_CONTROL_POINTS; i++) {
      const a = (i / cfg.NUM_CONTROL_POINTS) * Math.PI * 2;
      const r = 185 + 48 * Math.sin(2 * a) + 28 * Math.cos(3 * a + 0.6) + 18 * Math.sin(5 * a - 0.5);
      const y = 18 + 13 * Math.sin(a + 0.4) + 7 * Math.cos(2 * a - 0.3) + 4 * Math.sin(3 * a);
      controlPts.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
    }

    const curve = new THREE.CatmullRomCurve3(controlPts, true, 'catmullrom', 0.5);
    const length = curve.getLength(); // ~1400m
    const roadWidth = cfg.ROAD_WIDTH;

    function getFrame(t) {
      const tt = ((t % 1) + 1) % 1;
      const pos = curve.getPointAt(tt);
      const tangent = curve.getTangentAt(tt).normalize();
      const right = new THREE.Vector3().crossVectors(tangent, UP).normalize();
      const normal = new THREE.Vector3().crossVectors(right, tangent).normalize();
      return { pos, tangent, right, normal };
    }

    function isInTunnel(t, pad) {
      const p = pad || 0;
      const tt = ((t % 1) + 1) % 1;
      return tt > cfg.TUNNEL_START_T - p && tt < cfg.TUNNEL_END_T + p;
    }

    function forwardDistMeters(playerT, otherT) {
      let dt = otherT - playerT;
      if (dt > 0.5) dt -= 1;
      if (dt < -0.5) dt += 1;
      return dt * length;
    }

    function placeOnRoad(obj, pos, forwardDir, upDir, leanRad) {
      zAxis.copy(forwardDir).normalize();
      yAxis.copy(upDir).normalize();
      xAxis.crossVectors(yAxis, zAxis).normalize(); // +X = left
      yAxis.crossVectors(zAxis, xAxis).normalize();
      basisMat.makeBasis(xAxis, yAxis, zAxis);
      baseQuat.setFromRotationMatrix(basisMat);
      if (leanRad) {
        leanQuat.setFromAxisAngle(zUnit, leanRad);
        baseQuat.multiply(leanQuat);
      }
      obj.position.copy(pos);
      obj.quaternion.copy(baseQuat);
    }

    // Build Road Ribbon + Embankment Skirts
    const segments = cfg.ROAD_SEGMENTS;
    const roadPos = [];
    const roadNorm = [];
    const roadUV = [];
    const roadIdx = [];

    const curbPos = [];
    const curbNorm = [];
    const curbUV = [];
    const curbIdx = [];

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const f = getFrame(t);
      const halfW = roadWidth * 0.5;
      const leftEdge = f.pos.clone().addScaledVector(f.right, -halfW);
      const rightEdge = f.pos.clone().addScaledVector(f.right, halfW);

      roadPos.push(leftEdge.x, leftEdge.y + 0.04, leftEdge.z);
      roadPos.push(rightEdge.x, rightEdge.y + 0.04, rightEdge.z);
      roadNorm.push(f.normal.x, f.normal.y, f.normal.z);
      roadNorm.push(f.normal.x, f.normal.y, f.normal.z);

      const vCoord = (i / segments) * (length / 9.0);
      roadUV.push(0, vCoord, 1, vCoord);

      const leftOuter = f.pos.clone().addScaledVector(f.right, -(halfW + 7.5));
      leftOuter.y -= 9.5;
      const rightOuter = f.pos.clone().addScaledVector(f.right, halfW + 7.5);
      rightOuter.y -= 9.5;

      curbPos.push(leftOuter.x, leftOuter.y, leftOuter.z);
      curbPos.push(leftEdge.x, leftEdge.y - 0.02, leftEdge.z);
      curbPos.push(rightEdge.x, rightEdge.y - 0.02, rightEdge.z);
      curbPos.push(rightOuter.x, rightOuter.y, rightOuter.z);
      for (let k = 0; k < 4; k++) curbNorm.push(0, 1, 0);
      curbUV.push(0, vCoord, 1, vCoord, 0, vCoord, 1, vCoord);

      if (i < segments) {
        const a = i * 2;
        const b = a + 1;
        const c = a + 2;
        const d = a + 3;
        // Counter-clockwise winding viewed from above (+UP normal)
        roadIdx.push(a, b, c, b, d, c);

        const ca = i * 4;
        curbIdx.push(ca, ca + 1, ca + 4, ca + 1, ca + 5, ca + 4);
        curbIdx.push(ca + 2, ca + 3, ca + 6, ca + 3, ca + 7, ca + 6);
      }
    }

    const roadGeo = new THREE.BufferGeometry();
    roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(roadPos, 3));
    roadGeo.setAttribute('normal', new THREE.Float32BufferAttribute(roadNorm, 3));
    roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(roadUV, 2));
    roadGeo.setIndex(roadIdx);

    const roadMat = new THREE.MeshStandardMaterial({
      map: VespaGame.Textures.makeAsphaltTexture(),
      roughness: 0.78,
      metalness: 0.06
    });
    const roadMesh = new THREE.Mesh(roadGeo, roadMat);
    roadMesh.receiveShadow = true;
    scene.add(roadMesh);

    const embGeo = new THREE.BufferGeometry();
    embGeo.setAttribute('position', new THREE.Float32BufferAttribute(curbPos, 3));
    embGeo.setAttribute('normal', new THREE.Float32BufferAttribute(curbNorm, 3));
    embGeo.setAttribute('uv', new THREE.Float32BufferAttribute(curbUV, 2));
    embGeo.setIndex(curbIdx);
    embGeo.computeVertexNormals();

    const embMat = new THREE.MeshStandardMaterial({
      color: 0x5c6844,
      roughness: 0.95
    });
    const embMesh = new THREE.Mesh(embGeo, embMat);
    embMesh.receiveShadow = true;
    scene.add(embMesh);

    return {
      curve,
      length,
      width: roadWidth,
      laneOffset: cfg.LANE_OFFSET,
      UP,
      getFrame,
      isInTunnel,
      forwardDistMeters,
      placeOnRoad
    };
  }

  VespaGame.Road = {
    createRoad
  };
})(window);
