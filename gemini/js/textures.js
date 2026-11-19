(function (global) {
  'use strict';

  const VespaGame = (global.VespaGame = global.VespaGame || {});

  function makeAsphaltTexture() {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 512;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#31333b';
    ctx.fillRect(0, 0, 512, 512);

    // Fine aggregate grain
    for (let i = 0; i < 16000; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const v = 38 + Math.floor(Math.random() * 34);
      ctx.fillStyle = `rgb(${v},${v},${v + 4})`;
      ctx.fillRect(x, y, 2, 2);
    }

    // Subtle tire wear tracks
    ctx.fillStyle = 'rgba(18,18,22,0.22)';
    ctx.fillRect(105, 0, 62, 512);
    ctx.fillRect(345, 0, 62, 512);

    // Crisp white edge lines
    ctx.fillStyle = 'rgba(245, 240, 228, 0.92)';
    ctx.fillRect(22, 0, 11, 512);
    ctx.fillRect(479, 0, 11, 512);

    // Dashed centerline
    ctx.fillStyle = 'rgba(255, 242, 210, 0.9)';
    for (let y = 16; y < 512; y += 128) {
      ctx.fillRect(251, y, 10, 66);
    }

    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    return tex;
  }

  function makeGrassTexture() {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 512;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#4c6a38';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 14000; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const g = 88 + Math.floor(Math.random() * 44);
      const r = 58 + Math.floor(Math.random() * 38);
      const b = 36 + Math.floor(Math.random() * 24);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, y, 3, 3);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(36, 36);
    return tex;
  }

  function makeStoneTexture() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#8b8378';
    ctx.fillRect(0, 0, 256, 256);
    for (let row = 0; row < 8; row++) {
      const y = row * 32;
      const offset = (row % 2) * 32;
      for (let col = -1; col < 5; col++) {
        const x = col * 64 + offset;
        const v = 120 + Math.floor(Math.random() * 42);
        ctx.fillStyle = `rgb(${v + 8},${v + 2},${v - 6})`;
        ctx.fillRect(x + 2, y + 2, 60, 28);
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  function makeTimberTexture() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#734b2e';
    ctx.fillRect(0, 0, 256, 256);
    for (let row = 0; row < 12; row++) {
      const y = row * (256 / 12);
      const shade = 95 + Math.floor(Math.random() * 32);
      ctx.fillStyle = `rgb(${shade + 22}, ${Math.floor(shade * 0.72)}, ${Math.floor(shade * 0.44)})`;
      ctx.fillRect(0, y + 1, 256, 256 / 12 - 2);
      ctx.fillStyle = 'rgba(38, 22, 12, 0.35)';
      ctx.fillRect(0, y, 256, 2);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  function makeKmMarkerTexture(kmLabel) {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 220;
    const ctx = c.getContext('2d');

    // Classic European white stone body
    ctx.fillStyle = '#f2ede2';
    ctx.fillRect(0, 0, 128, 220);

    // Subtle stone speckles
    for (let i = 0; i < 450; i++) {
      const v = 210 + Math.floor(Math.random() * 30);
      ctx.fillStyle = `rgb(${v},${v - 4},${v - 10})`;
      ctx.fillRect(Math.random() * 128, Math.random() * 220, 2, 2);
    }

    // Alpine crimson top cap
    ctx.fillStyle = '#c43636';
    ctx.fillRect(0, 0, 128, 56);

    // Subtle border
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 3;
    ctx.strokeRect(4, 4, 120, 212);

    // Route code on red cap
    ctx.fillStyle = '#fff8ee';
    ctx.font = 'bold 20px Segoe UI, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SP 42', 64, 36);

    // KM number
    ctx.fillStyle = '#1f232c';
    ctx.font = '900 42px Segoe UI, Arial, sans-serif';
    ctx.fillText(kmLabel, 64, 128);

    ctx.fillStyle = '#6a5f54';
    ctx.font = 'bold 20px Segoe UI, Arial, sans-serif';
    ctx.fillText('KM', 64, 162);

    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    return tex;
  }

  function makePassSignTexture() {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 160;
    const ctx = c.getContext('2d');

    ctx.fillStyle = '#2d4a36';
    ctx.fillRect(0, 0, 512, 160);
    ctx.strokeStyle = '#f2e6cf';
    ctx.lineWidth = 8;
    ctx.strokeRect(10, 10, 492, 140);

    ctx.fillStyle = '#fff5e0';
    ctx.font = '900 42px Segoe UI, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PASSO DEL SALUTO', 256, 74);

    ctx.fillStyle = '#ffd166';
    ctx.font = '700 26px Segoe UI, Arial, sans-serif';
    ctx.fillText('ALT. 1842 m  •  BENVENUTI', 256, 120);

    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    return tex;
  }

  function makeSoftParticleTexture() {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    grad.addColorStop(0.45, 'rgba(255, 255, 255, 0.45)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  VespaGame.Textures = {
    makeAsphaltTexture,
    makeGrassTexture,
    makeStoneTexture,
    makeTimberTexture,
    makeKmMarkerTexture,
    makePassSignTexture,
    makeSoftParticleTexture
  };
})(window);
