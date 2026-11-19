import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { Water } from 'three/addons/objects/Water.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* =====================================================================
   UTILITIES
   ===================================================================== */
const $ = id => document.getElementById(id);
const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rand = mulberry32(20261119);
const R = (a, b) => a + (b - a) * rand();
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const C = h => new THREE.Color(h);

window.addEventListener('error', e => { const m = $('loadMsg'); if (m) m.textContent = 'Error: ' + e.message; });
window.addEventListener('unhandledrejection', e => { const m = $('loadMsg'); if (m) m.textContent = 'Error: ' + (e.reason && e.reason.message || e.reason); });

// ---- gradient noise ----
const perm = new Uint8Array(512);
{ const p = [...Array(256).keys()]; for (let i = 255; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } for (let i = 0; i < 512; i++) perm[i] = p[i & 255]; }
const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
function grad(h, x, y) { switch (h & 7) { case 0: return x + y; case 1: return -x + y; case 2: return x - y; case 3: return -x - y; case 4: return x; case 5: return -x; case 6: return y; default: return -y; } }
function noise2(x, y) {
  const fx = Math.floor(x), fy = Math.floor(y); const X = fx & 255, Y = fy & 255; x -= fx; y -= fy;
  const u = fade(x), v = fade(y); const a = perm[X] + Y, b = perm[X + 1] + Y;
  return lerp(lerp(grad(perm[a], x, y), grad(perm[b], x - 1, y), u), lerp(grad(perm[a + 1], x, y - 1), grad(perm[b + 1], x - 1, y - 1), u), v);
}
function fbm(x, y, o = 5) { let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < o; i++) { s += a * noise2(x * f, y * f); n += a; a *= 0.5; f *= 2.03; } return s / n; }
function ridged(x, y, o = 5) { let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < o; i++) { let v = 1 - Math.abs(noise2(x * f, y * f)); v *= v; s += a * v; n += a; a *= 0.5; f *= 2.1; } return s / n; }

await new Promise(r => setTimeout(r, 80));   // let the loader paint (a timer, so a background tab still loads)

/* =====================================================================
   RENDERER / SCENE
   ===================================================================== */
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
const basePR = () => Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(2.3e6 / (innerWidth * innerHeight)));
let prScale = 1; const PR = basePR();
renderer.setPixelRatio(PR);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.65;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
const MAXANI = renderer.capabilities.getMaxAnisotropy();

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xd8c3a5, 0.0008);
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.15, 9000);
camera.layers.enable(1);                       // layer 1 = things the lake does not need to reflect
const noRefl = o => { o.traverse(c => c.layers.set(1)); return o; };

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = MAXANI; return t;
}

/* =====================================================================
   ROAD  — a star-shaped loop around the lake, resampled every metre
   ===================================================================== */
const roadR = th => 235 + 55 * Math.sin(3 * th + 0.3) + 28 * Math.sin(5 * th + 1.3) + 10 * Math.sin(8 * th + 0.4);
const roadYf = th => 9 + 4.5 * Math.sin(2 * th + 0.5) + 2.5 * Math.sin(5 * th + 2.0);
const HW = 4.2;                       // half road width

const RAW = 12000;
const rx = new Float64Array(RAW + 1), rz = new Float64Array(RAW + 1), ry = new Float64Array(RAW + 1), racc = new Float64Array(RAW + 1);
for (let i = 0; i <= RAW; i++) {
  const th = i / RAW * TAU, r = roadR(th);
  rx[i] = r * Math.cos(th); rz[i] = r * Math.sin(th); ry[i] = roadYf(th);
  if (i > 0) racc[i] = racc[i - 1] + Math.hypot(rx[i] - rx[i - 1], rz[i] - rz[i - 1]);
}
const L = racc[RAW];
const NS = Math.round(L), DS = L / NS;
const X = new Float32Array(NS), Y = new Float32Array(NS), Z = new Float32Array(NS);
const TX = new Float32Array(NS), TZ = new Float32Array(NS), K = new Float32Array(NS), SL = new Float32Array(NS);
{
  let k = 0;
  for (let j = 0; j < NS; j++) {
    const t = j * DS; while (k < RAW - 1 && racc[k + 1] < t) k++;
    const f = (t - racc[k]) / (racc[k + 1] - racc[k]);
    X[j] = lerp(rx[k], rx[k + 1], f); Y[j] = lerp(ry[k], ry[k + 1], f); Z[j] = lerp(rz[k], rz[k + 1], f);
  }
  const yaw = new Float32Array(NS), kr = new Float32Array(NS);
  for (let j = 0; j < NS; j++) {
    const a = (j - 1 + NS) % NS, b = (j + 1) % NS;
    const tx = X[b] - X[a], tz = Z[b] - Z[a], n = Math.hypot(tx, tz);
    TX[j] = tx / n; TZ[j] = tz / n; yaw[j] = Math.atan2(TX[j], TZ[j]); SL[j] = (Y[b] - Y[a]) / (2 * DS);
  }
  for (let j = 0; j < NS; j++) {
    const a = (j - 1 + NS) % NS, b = (j + 1) % NS;
    let d = yaw[b] - yaw[a]; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
    kr[j] = d / (2 * DS);
  }
  for (let j = 0; j < NS; j++) { let s = 0; for (let w = -8; w <= 8; w++) s += kr[(j + w + NS) % NS]; K[j] = s / 17; }
}
const wrapS = s => { s %= L; return s < 0 ? s + L : s; };
const wrapD = d => { d %= L; if (d > L / 2) d -= L; if (d < -L / 2) d += L; return d; };
/** position on the road at arc-length s, shifted `lat` metres to the right of travel */
function roadAt(s, lat, o) {
  const q = wrapS(s) / DS; const i = Math.floor(q) % NS, f = q - Math.floor(q), j = (i + 1) % NS;
  let tx = lerp(TX[i], TX[j], f), tz = lerp(TZ[i], TZ[j], f); const n = Math.hypot(tx, tz); tx /= n; tz /= n;
  o.tx = tx; o.tz = tz;
  o.x = lerp(X[i], X[j], f) - tz * lat; o.z = lerp(Z[i], Z[j], f) + tx * lat; o.y = lerp(Y[i], Y[j], f);
  o.k = lerp(K[i], K[j], f); o.sl = lerp(SL[i], SL[j], f); o.yaw = Math.atan2(tx, tz);
  return o;
}
// which side is the lake on? (+1 = right of travel)
const innerSign = ((-TZ[0]) * (-X[0]) + TX[0] * (-Z[0])) > 0 ? 1 : -1;

// spatial hash of road samples
const CELL = 40, grid = new Map();
const gkey = (ix, iz) => (ix + 500) * 1000 + (iz + 500);
for (let j = 0; j < NS; j += 2) { const k = gkey(Math.floor(X[j] / CELL), Math.floor(Z[j] / CELL)); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(j); }
const _rn = { d: 0, j: 0 };
function roadNear(x, z) {
  const ix = Math.floor(x / CELL), iz = Math.floor(z / CELL); let best = 1e12, bj = -1;
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    const a = grid.get(gkey(ix + dx, iz + dz)); if (!a) continue;
    for (let n = 0; n < a.length; n++) { const j = a[n]; const ex = X[j] - x, ez = Z[j] - z, d2 = ex * ex + ez * ez; if (d2 < best) { best = d2; bj = j; } }
  }
  if (bj < 0) return null; _rn.d = Math.sqrt(best); _rn.j = bj; return _rn;
}

/* =====================================================================
   TERRAIN
   ===================================================================== */
const forestN = (x, z) => fbm(x * 0.006 + 50, z * 0.006 - 20, 3);
// the valley opens towards the setting sun, so the last light reaches the lake
const SUN_AZ = 248, SUNX = Math.sin(SUN_AZ * Math.PI / 180), SUNZ = Math.cos(SUN_AZ * Math.PI / 180);
const sunGap = (x, z) => smooth(60, 420, x * SUNX + z * SUNZ) * (1 - smooth(380, 760, Math.abs(x * SUNZ - z * SUNX)));
function terrainH(x, z) {
  const rn = roadNear(x, z); const th = Math.atan2(z, x), R0 = Math.hypot(x, z), rr = roadR(th); const inside = R0 < rr;
  let d, h;
  if (rn) { d = rn.d; h = Y[rn.j]; } else { d = Math.max(40, Math.abs(R0 - rr) * 0.75); h = roadYf(th); }
  const n1 = fbm(x * 0.004 + 11, z * 0.004 - 7, 4);
  if (inside) {
    const t = smooth(6.5, 62, d);
    return lerp(h - 0.3, -6 + n1 * 3, Math.pow(t, 1.25)) + t * (1 - t) * n1 * 7;
  }
  const t = smooth(6.5, 75, d);
  const hills = (fbm(x * 0.007, z * 0.007, 5) * 0.5 + 0.5) * 34;
  const m = smooth(85, 540, d);
  const mount = (ridged(x * 0.0034 + 3, z * 0.0034 + 9, 6) * 340 * m + m * 55) * (1 - 0.94 * sunGap(x, z));
  return h - 0.3 + t * hills + mount + t * fbm(x * 0.05, z * 0.05, 3) * 1.6;
}
const TS = 2600, TN = 400, TSEG = TS / TN, TW = TN + 1;
const HT = new Float32Array(TW * TW);
const terrainGeo = new THREE.PlaneGeometry(TS, TS, TN, TN); terrainGeo.rotateX(-Math.PI / 2);
{
  const p = terrainGeo.attributes.position;
  for (let i = 0; i < p.count; i++) { const h = terrainH(p.getX(i), p.getZ(i)); p.setY(i, h); HT[i] = h; }
  terrainGeo.computeVertexNormals();
  const nrm = terrainGeo.attributes.normal, col = new Float32Array(p.count * 3);
  const cA = C('#55812f'), cB = C('#9aa844'), cDry = C('#a8935a'), cRock = C('#7b736b'), cSnow = C('#f3f5f9'), cSand = C('#b6a480'), cBed = C('#3f4a40'), cFor = C('#2f4a26'), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), h = p.getY(i), ny = nrm.getY(i);
    const n1 = fbm(x * 0.011, z * 0.011, 3), n2 = noise2(x * 0.05, z * 0.05);
    c.copy(cA).lerp(cB, smooth(-0.35, 0.45, n1));
    c.lerp(cDry, smooth(30, 150, h + n2 * 20) * 0.75);
    c.lerp(cFor, smooth(-0.02, 0.22, forestN(x, z)) * 0.55);
    const slope = 1 - ny;
    c.lerp(cRock, smooth(0.24, 0.42, slope));
    c.lerp(cRock, smooth(170, 235, h) * 0.75);
    c.lerp(cSnow, smooth(232, 268, h + n2 * 26) * (1 - smooth(0.5, 0.72, slope)));
    if (h < 1.8) { c.lerp(cSand, 1 - smooth(0.5, 1.8, h)); c.lerp(cBed, smooth(0, -3, h)); }
    const j = 0.94 + n2 * 0.08; col[i * 3] = c.r * j; col[i * 3 + 1] = c.g * j; col[i * 3 + 2] = c.b * j;
  }
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}
function heightAt(x, z) {
  const fx = (x + TS / 2) / TSEG, fz = (z + TS / 2) / TSEG; const ix = Math.floor(fx), iz = Math.floor(fz);
  if (ix < 0 || iz < 0 || ix >= TN || iz >= TN) return -50;
  const tx = fx - ix, tz = fz - iz; const a = HT[iz * TW + ix], b = HT[iz * TW + ix + 1], c2 = HT[(iz + 1) * TW + ix], d = HT[(iz + 1) * TW + ix + 1];
  return lerp(lerp(a, b, tx), lerp(c2, d, tx), tz);
}
const slopeAt = (x, z) => Math.max(Math.abs(heightAt(x + 2, z) - heightAt(x - 2, z)), Math.abs(heightAt(x, z + 2) - heightAt(x, z - 2))) / 4;

const detailTex = canvasTex(256, 256, (g, w, h) => {
  const id = g.createImageData(w, h), d = id.data;
  for (let i = 0; i < d.length; i += 4) { const v = 205 + Math.random() * 50; d[i] = v; d[i + 1] = v; d[i + 2] = v - 6; d[i + 3] = 255; }
  g.putImageData(id, 0, 0);
  for (let i = 0; i < 120; i++) { g.fillStyle = `rgba(${Math.random() < .5 ? '40,50,20' : '255,250,220'},${0.06 + Math.random() * 0.08})`; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 3 + Math.random() * 12, 0, TAU); g.fill(); }
});
detailTex.wrapS = detailTex.wrapT = THREE.RepeatWrapping; detailTex.repeat.set(320, 320);
const terrain = new THREE.Mesh(terrainGeo, new THREE.MeshStandardMaterial({ vertexColors: true, map: detailTex, roughness: 0.96, metalness: 0, envMapIntensity: 0.55 }));
terrain.receiveShadow = true; scene.add(terrain);
{ // distant plain: fades into the haze so the world never shows an edge
  const far = new THREE.Mesh(new THREE.PlaneGeometry(16000, 16000), new THREE.MeshStandardMaterial({ color: 0x5f7a3a, roughness: 1 }));
  far.rotation.x = -Math.PI / 2; far.position.y = -1.5; scene.add(far);
}

/* =====================================================================
   ROAD MESHES
   ===================================================================== */
function ribbon(lat0, lat1, y0, y1, vScale) {
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= NS; j++) {
    const i = j % NS, ax = -TZ[i], az = TX[i];
    pos.push(X[i] + ax * lat0, Y[i] + y0, Z[i] + az * lat0, X[i] + ax * lat1, Y[i] + y1, Z[i] + az * lat1);
    const v = j * DS / vScale; uv.push(0, v, 1, v);
    if (j < NS) { const a = j * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}
const roadTex = canvasTex(512, 1024, (g, w, h) => {
  g.fillStyle = '#4b4b4f'; g.fillRect(0, 0, w, h);
  const id = g.getImageData(0, 0, w, h), d = id.data;
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() * 30 - 15) + (Math.random() < 0.035 ? 30 : 0); d[i] += n; d[i + 1] += n; d[i + 2] += n + 2; }
  g.putImageData(id, 0, 0);
  for (const cx of [0.27, 0.4, 0.6, 0.73]) { const gr = g.createLinearGradient(cx * w - 34, 0, cx * w + 34, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(.5, 'rgba(8,8,10,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(cx * w - 34, 0, 68, h); }
  for (let i = 0; i < 10; i++) { g.fillStyle = `rgba(22,22,26,${0.12 + Math.random() * 0.16})`; g.fillRect(Math.random() * w, Math.random() * h, 30 + Math.random() * 110, 30 + Math.random() * 190); }
  g.fillStyle = 'rgba(236,231,216,0.94)';
  g.fillRect(w * 0.03, 0, w * 0.02, h); g.fillRect(w * 0.95, 0, w * 0.02, h);
  g.fillRect(w * 0.49, 0, w * 0.02, h * 0.25); g.fillRect(w * 0.49, h * 0.5, w * 0.02, h * 0.25);
  for (let i = 0; i < 900; i++) { g.fillStyle = 'rgba(50,50,54,0.5)'; const lx = [0.03, 0.95, 0.49][i % 3] * w + Math.random() * w * 0.02; g.fillRect(lx, Math.random() * h, 2, 2 + Math.random() * 5); }
});
roadTex.wrapT = THREE.RepeatWrapping;
const road = new THREE.Mesh(ribbon(-HW, HW, 0.04, 0.04, 16), new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.78, metalness: 0.0, envMapIntensity: 0.9 }));
road.receiveShadow = true; road.layers.set(1); scene.add(road);

const gravelTex = canvasTex(128, 128, (g, w, h) => { const id = g.createImageData(w, h), d = id.data; for (let i = 0; i < d.length; i += 4) { const v = 110 + Math.random() * 90; d[i] = v; d[i + 1] = v * 0.93; d[i + 2] = v * 0.8; d[i + 3] = 255; } g.putImageData(id, 0, 0); });
gravelTex.wrapS = gravelTex.wrapT = THREE.RepeatWrapping;
const gravelMat = new THREE.MeshStandardMaterial({ map: gravelTex, roughness: 1, envMapIntensity: 0.4 });
for (const g of [ribbon(-HW - 1.7, -HW, -0.26, 0.03, 3), ribbon(HW, HW + 1.7, 0.03, -0.26, 3)]) { const m = new THREE.Mesh(g, gravelMat); m.receiveShadow = true; m.layers.set(1); scene.add(m); }

/* =====================================================================
   SHARED MATERIALS & GEOMETRY HELPERS
   ===================================================================== */
const _mc = new Map();
function mat(hex, rough = 0.7, metal = 0) { const k = hex + '|' + rough + '|' + metal; if (!_mc.has(k)) _mc.set(k, new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: metal })); return _mc.get(k); }
function paint(hex) { const k = 'p' + hex; if (!_mc.has(k)) _mc.set(k, new THREE.MeshPhysicalMaterial({ color: hex, metalness: 0.3, roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.06 })); return _mc.get(k); }
const chromeMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, metalness: 1, roughness: 0.12 });
const rubberMat = mat('#131313', 0.9);
const whiteMat = mat('#efe9dc', 0.6);
const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x0b1419, metalness: 0.4, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02 });
const visorMat = glassMat;
const headMat = new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: 0xfff0c8, emissiveIntensity: 2.2 });
const tailMat = new THREE.MeshStandardMaterial({ color: 0x4a0000, emissive: 0xff1a0c, emissiveIntensity: 0.6 });
const windowMat = new THREE.MeshStandardMaterial({ color: 0x1b2229, roughness: 0.15, metalness: 0.5, emissive: 0xffa94f, emissiveIntensity: 0 });
const amberMat = new THREE.MeshStandardMaterial({ color: 0xff8a1c, emissive: 0xff7a10, emissiveIntensity: 1.2 });

const glowTex = canvasTex(128, 128, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,240,200,0.55)'); gr.addColorStop(0.5, 'rgba(255,220,160,0.14)'); gr.addColorStop(1, 'rgba(255,200,120,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
const glowMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xffe9c0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, fog: false });

const GEO = {
  sphere: new THREE.SphereGeometry(1, 24, 16), sphereLo: new THREE.SphereGeometry(1, 12, 8),
  box: new THREE.BoxGeometry(1, 1, 1), cyl: new THREE.CylinderGeometry(1, 1, 1, 18), cylLo: new THREE.CylinderGeometry(1, 1, 1, 8),
  dome: new THREE.SphereGeometry(1, 20, 12, 0, TAU, 0, Math.PI * 0.56),
};
const _gc = new Map();
const cap = (r, l) => { const k = 'c' + r + '|' + l; if (!_gc.has(k)) _gc.set(k, new THREE.CapsuleGeometry(r, l, 5, 10)); return _gc.get(k); };
const tor = (r, t, a = 10, b = 22) => { const k = 't' + r + '|' + t + '|' + a + '|' + b; if (!_gc.has(k)) _gc.set(k, new THREE.TorusGeometry(r, t, a, b)); return _gc.get(k); };

function mk(geo, material, parent, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.scale.set(sx, sy, sz);
  m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
const _up = new THREE.Vector3(0, 1, 0);
function tube(a, b, r, material, parent) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), len = d.length();
  const m = new THREE.Mesh(GEO.cylLo, material); m.scale.set(r, len, r); m.position.copy(A).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(_up, d.normalize()); m.castShadow = true; parent.add(m); return m;
}
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
function xf(geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _e.set(rx, ry, rz); _q.setFromEuler(_e); _m4.compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz)); geo.applyMatrix4(_m4); return geo;
}
/** flatten to non-indexed position/normal/color so heterogeneous parts can be merged */
function tint(geo, color, jitter = 0, fn) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  const c = new THREE.Color(color), c2 = new THREE.Color(), p = g.attributes.position, n = p.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 3) {
    const j = 1 + (rand() - 0.5) * jitter;
    for (let k = 0; k < 3; k++) { c2.copy(c); if (fn) fn(c2, p.getX(i + k), p.getY(i + k), p.getZ(i + k)); a[(i + k) * 3] = c2.r * j; a[(i + k) * 3 + 1] = c2.g * j; a[(i + k) * 3 + 2] = c2.b * j; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
}
const windU = { uTime: { value: 0 } };
function addWind(material, amp, hScale) {
  material.onBeforeCompile = sh => {
    sh.uniforms.uTime = windU.uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 wip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
      #else
        vec3 wip = vec3(0.0);
      #endif
      float whg = max(position.y, 0.0) * ${hScale.toFixed(4)};
      float wsw = sin(uTime*1.6 + wip.x*0.07 + wip.z*0.05)*0.6 + sin(uTime*3.3 + wip.x*0.31 + wip.z*0.23)*0.3 + 0.25;
      transformed.x += wsw * ${amp.toFixed(4)} * whg * whg;
      transformed.z += wsw * ${(amp * 0.6).toFixed(4)} * whg * whg;`);
  };
  material.customProgramCacheKey = () => 'wind' + amp + '|' + hScale;
  return material;
}
const _d = new THREE.Object3D();
function instanced(geo, material, list, cast = true, recv = true, refl = true) {
  const im = new THREE.InstancedMesh(geo, material, Math.max(1, list.length)); im.count = list.length;
  list.forEach((p, i) => {
    _d.position.set(p.x, p.y, p.z); _d.rotation.set(p.rx || 0, p.ry || 0, p.rz || 0);
    _d.scale.set(p.sx || p.s || 1, p.sy || p.s || 1, p.sz || p.s || 1); _d.updateMatrix(); im.setMatrixAt(i, _d.matrix);
    if (p.c) im.setColorAt(i, p.c);
  });
  im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
  im.castShadow = cast; im.receiveShadow = recv; im.computeBoundingSphere(); if (!refl) im.layers.set(1); scene.add(im); return im;
}

/* =====================================================================
   ROADSIDE FURNITURE
   ===================================================================== */
{
  // guardrail on the lake side
  const lat = innerSign * (HW + 1.0), pos = [], idx = [];
  for (let j = 0; j <= NS; j++) {
    const i = j % NS, ax = -TZ[i], az = TX[i];
    pos.push(X[i] + ax * lat, Y[i] + 0.5, Z[i] + az * lat, X[i] + ax * lat, Y[i] + 0.82, Z[i] + az * lat);
    if (j < NS) { const a = j * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const rail = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xc4c8cc, metalness: 0.9, roughness: 0.32, side: THREE.DoubleSide }));
  rail.castShadow = true; rail.layers.set(1); scene.add(rail);
  const posts = [], o = {};
  for (let s = 0; s < L; s += 4) { roadAt(s, innerSign * (HW + 1.08), o); posts.push({ x: o.x, y: o.y + 0.3, z: o.z, ry: o.yaw, sx: 0.09, sy: 1.0, sz: 0.13 }); }
  instanced(GEO.box, mat('#9a9ea2', 0.5, 0.8), posts, true, true, false);
  // delineator posts on the hill side
  const del = [], refl = [];
  for (let s = 0; s < L; s += 40) { roadAt(s, -innerSign * (HW + 1.15), o); del.push({ x: o.x, y: o.y + 0.35, z: o.z, ry: o.yaw }); refl.push({ x: o.x, y: o.y + 0.72, z: o.z, ry: o.yaw, sx: 0.07, sy: 0.14, sz: 0.125 }); }
  const dg = mergeGeometries([tint(xf(new THREE.BoxGeometry(0.12, 1.0, 0.12)), '#f1efe8'), tint(xf(new THREE.BoxGeometry(0.125, 0.22, 0.125), 0, 0.37, 0), '#17171a')]);
  instanced(dg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), del, true, true, false);
  instanced(GEO.box, amberMat, refl, false, false, false);
  // warning signs before the tightest bends
  const signTex = canvasTex(256, 256, (c, w, h) => {
    c.clearRect(0, 0, w, h); c.lineJoin = 'round';
    c.beginPath(); c.moveTo(128, 18); c.lineTo(242, 222); c.lineTo(14, 222); c.closePath(); c.fillStyle = '#fff'; c.fill(); c.lineWidth = 22; c.strokeStyle = '#d2281e'; c.stroke();
    c.beginPath(); c.moveTo(112, 196); c.bezierCurveTo(112, 150, 152, 150, 144, 118); c.bezierCurveTo(138, 96, 122, 96, 128, 70); c.lineWidth = 13; c.strokeStyle = '#111'; c.stroke();
  });
  const signMat = new THREE.MeshStandardMaterial({ map: signTex, transparent: true, alphaTest: 0.5, roughness: 0.5, side: THREE.DoubleSide });
  const signGeo = new THREE.PlaneGeometry(1.1, 1.1); let last = -999;
  for (let j = 0; j < NS; j += 5) {
    if (Math.abs(K[j]) > 0.024 && j - last > 170) {
      last = j; roadAt(j * DS - 55, -innerSign * (HW + 1.9), o);
      const grp = new THREE.Group(); grp.position.set(o.x, o.y, o.z); grp.rotation.y = o.yaw + Math.PI;
      mk(GEO.cylLo, mat('#8d9195', 0.4, 0.8), grp, 0, 1.1, 0, 0, 0, 0, 0.035, 2.2, 0.035); mk(signGeo, signMat, grp, 0, 2.25, 0.05); scene.add(noRefl(grp));
    }
  }
}

/* =====================================================================
   SKY / WATER / LIGHT
   ===================================================================== */
const sky = new Sky(); sky.scale.setScalar(4000); scene.add(sky);
const su = sky.material.uniforms; su.mieCoefficient.value = 0.005; su.mieDirectionalG.value = 0.83;

const waterNormals = (() => {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'), id = g.createImageData(S, S);
  const waves = [[1, 2, .5], [3, 1, .32], [2, 5, .22], [7, 3, .13], [5, 9, .09], [11, 6, .06], [13, 17, .035], [23, 11, .02]];
  const hf = (x, y) => { let v = 0; for (const [a, b, amp] of waves) { v += amp * Math.sin(TAU * (a * x + b * y) / S + a * 1.7); v += amp * 0.7 * Math.sin(TAU * (b * x - a * y) / S + b); } return v; };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (hf(x + 1, y) - hf(x - 1, y)) * 5, dy = (hf(x, y + 1) - hf(x, y - 1)) * 5, n = Math.hypot(dx, dy, 1), i = (y * S + x) * 4;
    id.data[i] = (-dx / n * 0.5 + 0.5) * 255; id.data[i + 1] = (-dy / n * 0.5 + 0.5) * 255; id.data[i + 2] = (1 / n * 0.5 + 0.5) * 255; id.data[i + 3] = 255;
  }
  g.putImageData(id, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
})();
const water = new Water(new THREE.PlaneGeometry(1500, 1500), { textureWidth: 512, textureHeight: 512, waterNormals, sunDirection: new THREE.Vector3(0, 1, 0), sunColor: 0xffe0b0, waterColor: 0x12363f, distortionScale: 1.5, fog: true });
water.rotation.x = -Math.PI / 2; water.material.uniforms.size.value = 2.2; scene.add(water);

const sun = new THREE.DirectionalLight(0xffe2bf, 3); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.06;
{ const sc = sun.shadow.camera; sc.left = -75; sc.right = 75; sc.top = 75; sc.bottom = -75; sc.near = 1; sc.far = 700; }
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xb9cdf0, 0x5b4a30, 0.7); scene.add(hemi);
const sunDir = new THREE.Vector3();
const PAL = { sunDay: C('#ffe2bf'), sunDusk: C('#ff7a3a'), skyDay: C('#b9cdf0'), skyDusk: C('#7a6aa0'), gndDay: C('#5b4a30'), gndDusk: C('#33283a'), fogDay: C('#d9c5a8'), fogDusk: C('#94707a'), cloudDay: C('#fff1de'), cloudDusk: C('#ff9478') };

const pmrem = new THREE.PMREMGenerator(renderer), envScene = new THREE.Scene(); let envRT = null;
function updateEnv() { envScene.add(sky); const n = pmrem.fromScene(envScene); scene.add(sky); scene.environment = n.texture; if (envRT) envRT.dispose(); envRT = n; }

// clouds
const cloudTex = canvasTex(512, 256, (g, w, h) => {
  for (let i = 0; i < 26; i++) {
    const x = 90 + Math.random() * (w - 180), y = h * 0.55 + (Math.random() - 0.5) * 60, r = 34 + Math.random() * 62;
    const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
});
const cloudMat = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false, opacity: 0.9 });
const clouds = [];
for (let i = 0; i < 34; i++) { const s = new THREE.Sprite(cloudMat); const a = rand() * TAU, r = R(1700, 3200); s.position.set(Math.cos(a) * r, R(330, 900), Math.sin(a) * r); const sc = R(700, 1500); s.scale.set(sc, sc * 0.42, 1); s.userData.a = a; s.userData.r = r; scene.add(s); clouds.push(s); }

/* =====================================================================
   SCENERY
   ===================================================================== */
const occupied = []; const _o = {};
const isFree = (x, z, r) => occupied.every(q => (q.x - x) ** 2 + (q.z - z) ** 2 > (q.r + r) ** 2);

// ---- chalets ----
{
  const wood = '#6b4226', wall = '#ebe4d4';
  const gable = new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(-4.05, 0), new THREE.Vector2(4.05, 0), new THREE.Vector2(0, 2.3)]), { depth: 7.1, bevelEnabled: false }); gable.translate(0, 5.6, -3.55);
  const parts = [
    tint(xf(new THREE.BoxGeometry(8, 4.5, 7), 0, 0.75, 0), wall, 0.04),
    tint(xf(new THREE.BoxGeometry(8.1, 2.6, 7.1), 0, 4.3, 0), wood, 0.12), tint(gable, wood, 0.12),
    tint(xf(new THREE.BoxGeometry(5.6, 0.28, 8.6), 2.42, 6.62, 0, 0, 0, -0.516), '#453a33', 0.1),
    tint(xf(new THREE.BoxGeometry(5.6, 0.28, 8.6), -2.42, 6.62, 0, 0, 0, 0.516), '#453a33', 0.1),
    tint(xf(new THREE.BoxGeometry(0.7, 1.7, 0.7), 2.2, 7.4, -1.5), wall),
    tint(xf(new THREE.BoxGeometry(8.4, 0.85, 0.9), 0, 3.45, 3.95), '#573419', 0.1),
    tint(xf(new THREE.BoxGeometry(7.9, 0.28, 0.34), 0, 3.98, 4.34), '#d2362c', 0.6),
    tint(xf(new THREE.BoxGeometry(1.2, 2.2, 0.12), 0, 1.1, 3.52), '#4a2c17'),
  ];
  for (const sx of [-1, 1]) for (const [wx, wy] of [[2.3, 4.6], [2.4, 1.7]]) for (const e of [-1, 1]) parts.push(tint(xf(new THREE.BoxGeometry(0.42, 1.25, 0.08), sx * wx + e * 0.8, wy, 3.6), '#2f5d3a'));
  const houseGeo = mergeGeometries(parts);
  const wins = []; const wp = (x, y, z, ry, w = 1.1, h = 1.2) => wins.push(xf(new THREE.PlaneGeometry(w, h), x, y, z, 0, ry, 0));
  for (const sx of [-1, 1]) { wp(sx * 2.3, 4.6, 3.57, 0); wp(sx * 2.4, 1.7, 3.52, 0); for (const sz of [-1.8, 1.6]) { wp(sx * 4.07, 4.5, sz, sx * Math.PI / 2); wp(sx * 4.02, 1.7, sz, sx * Math.PI / 2); } }
  wp(0, 6.3, 3.57, 0, 0.8, 0.8);
  const winGeo = mergeGeometries(wins);
  const list = [];
  for (const frac of [0.07, 0.4, 0.72]) {
    let made = 0, tries = 0;
    while (made < 5 && tries++ < 80) {
      const s = frac * L + R(-80, 80), dist = R(15, 44); roadAt(s, -innerSign * (HW + dist), _o);
      const x = _o.x, z = _o.z; const rn = roadNear(x, z); if (rn && rn.d < HW + 11) continue;
      if (!isFree(x, z, 8) || slopeAt(x, z) > 0.4) continue;
      roadAt(s, 0, _o); const ry = Math.atan2(_o.x - x, _o.z - z) + R(-0.25, 0.25);
      const sc = R(0.85, 1.15); list.push({ x, y: heightAt(x, z) - 0.2, z, ry, s: sc }); occupied.push({ x, z, r: 8 }); made++;
    }
  }
  instanced(houseGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true }), list);
  instanced(winGeo, windowMat, list, false, false);
  // church
  for (let t = 0; t < 60; t++) {
    const s = 0.4 * L + R(-110, 110); roadAt(s, -innerSign * (HW + R(38, 62)), _o); const x = _o.x, z = _o.z; const rn = roadNear(x, z);
    if ((rn && rn.d < 22) || !isFree(x, z, 14) || slopeAt(x, z) > 0.35) continue;
    roadAt(s, 0, _o);
    const roof = new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(-4.3, 0), new THREE.Vector2(4.3, 0), new THREE.Vector2(0, 4)]), { depth: 16.4, bevelEnabled: false }); roof.translate(0, 6, -8.2);
    const cg = mergeGeometries([
      tint(xf(new THREE.BoxGeometry(8, 9, 16), 0, 1.5, 0), '#f1ece0', 0.03), tint(roof, '#4a3c36', 0.08),
      tint(xf(new THREE.BoxGeometry(4.6, 20, 4.6), 0, 7, 9.2), '#f1ece0', 0.03),
      tint(xf(new THREE.ConeGeometry(3.6, 10, 4), 0, 22, 9.2, 0, Math.PI / 4, 0), '#3d3a3c', 0.08),
      tint(xf(new THREE.BoxGeometry(1.4, 2.6, 0.2), 0, 1.3, 11.52), '#4a2c17'),
    ]);
    const ch = new THREE.Mesh(cg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true }));
    ch.position.set(x, heightAt(x, z) - 0.3, z); ch.rotation.y = Math.atan2(_o.x - x, _o.z - z); ch.castShadow = ch.receiveShadow = true; scene.add(ch);
    const cw = []; for (const sx of [-1, 1]) for (const sz of [-5, -1, 3]) cw.push(xf(new THREE.PlaneGeometry(0.9, 3), sx * 4.03, 3.4, sz, 0, sx * Math.PI / 2, 0));
    cw.push(xf(new THREE.CircleGeometry(1.1, 20), 0, 13.5, 11.53));
    const cwm = new THREE.Mesh(mergeGeometries(cw), windowMat); ch.add(cwm);
    occupied.push({ x, z, r: 15 }); break;
  }
}

// ---- trees ----
function pineGeo(cols) {
  return mergeGeometries([
    tint(xf(new THREE.CylinderGeometry(0.14, 0.26, 1.9, 6), 0, 0.95, 0), '#473325', 0.2),
    tint(xf(new THREE.ConeGeometry(1.75, 2.9, 8), 0, 2.75, 0), cols[0], 0.28),
    tint(xf(new THREE.ConeGeometry(1.32, 2.5, 8), 0, 4.3, 0), cols[1], 0.28),
    tint(xf(new THREE.ConeGeometry(0.86, 2.2, 8), 0, 5.75, 0), cols[2], 0.28)]);
}
{
  const pines = [], larches = [], leafy = [], rocks = [];
  const autumn = ['#d99a27', '#c9651f', '#b8402a', '#e0b23a', '#7c8f3a', '#9aa13c'].map(C);
  for (let t = 0; t < 30000 && pines.length + larches.length < 2300; t++) {
    const x = R(-1250, 1250), z = R(-1250, 1250), rn = roadNear(x, z); if (rn && rn.d < HW + 6) continue;
    const h = heightAt(x, z); if (h < 1.4 || h > 225) continue;
    const f = forestN(x, z); if (f < 0.0 && rand() > 0.06) continue;
    if (slopeAt(x, z) > 0.75 || !isFree(x, z, 3)) continue;
    const near = Math.hypot(x, z) < 520;
    if (h < 60 && near && rand() < 0.3 && leafy.length < 420) { const s = R(0.9, 1.7); leafy.push({ x, y: h - 0.2, z, ry: rand() * TAU, sx: s, sy: s * R(0.9, 1.2), sz: s, c: autumn[Math.floor(rand() * autumn.length)] }); }
    else { const s = R(0.9, 1.9) * (near ? 1 : 1.5); (rand() < 0.3 ? larches : pines).push({ x, y: h - 0.2, z, ry: rand() * TAU, sx: s, sy: s * R(0.95, 1.35), sz: s }); }
  }
  const tm = () => addWind(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92, envMapIntensity: 0.6 }), 0.0045, 1);
  const nearRoad = t => { const rn = roadNear(t.x, t.z); return !!rn && rn.d < 38; };
  const split = (geo, m, list) => { instanced(geo, m, list.filter(nearRoad), true); instanced(geo, m, list.filter(t => !nearRoad(t)), false); };
  split(pineGeo(['#1d3a23', '#234629', '#2b5331']), tm(), pines);
  split(pineGeo(['#b9781c', '#d1962a', '#e3b440']), tm(), larches);
  const leafGeo = mergeGeometries([
    tint(xf(new THREE.CylinderGeometry(0.18, 0.3, 2.6, 6), 0, 1.3, 0), '#3b2a1e', 0.2),
    tint(xf(new THREE.IcosahedronGeometry(1.75, 1), 0, 3.7, 0), '#ffffff', 0.3),
    tint(xf(new THREE.IcosahedronGeometry(1.2, 1), 1.0, 3.0, 0.3), '#f0f0f0', 0.3),
    tint(xf(new THREE.IcosahedronGeometry(1.15, 1), -0.8, 3.2, -0.6), '#e6e6e6', 0.3)]);
  split(leafGeo, addWind(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9, envMapIntensity: 0.6 }), 0.006, 1), leafy);
  for (let t = 0; t < 4000 && rocks.length < 380; t++) {
    const x = R(-900, 900), z = R(-900, 900), rn = roadNear(x, z); if (rn && rn.d < HW + 3) continue;
    const h = heightAt(x, z); if (h < 0.3 || !isFree(x, z, 2)) continue; if (slopeAt(x, z) < 0.25 && rand() > 0.15) continue;
    const s = R(0.5, 2.6); rocks.push({ x, y: h - s * 0.2, z, rx: rand() * 3, ry: rand() * 3, sx: s, sy: s * R(0.5, 0.9), sz: s * R(0.7, 1.2) });
  }
  instanced(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x8a837b, flatShading: true, roughness: 0.95 }), rocks, false, true, false);
}

// ---- grass & flowers (chunked along the road so they frustum-cull) ----
{
  const parts = [];
  for (let b = 0; b < 3; b++) {
    const g = new THREE.PlaneGeometry(0.17, 0.8, 1, 3); g.translate(0, 0.4, 0);
    const p = g.attributes.position, col = new Float32Array(p.count * 3), c0 = C('#2c4817'), c1 = C('#c9c869'), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) { const t = p.getY(i) / 0.8; p.setX(i, p.getX(i) * (1 - t * 0.9)); p.setZ(i, t * t * 0.2); c.copy(c0).lerp(c1, t); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.rotateY(b * Math.PI / 3 + 0.3); g.translate((b - 1) * 0.09, 0, (b % 2) * 0.08); parts.push(g);
  }
  const grassGeo = mergeGeometries(parts); { const n = grassGeo.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0); }
  const grassMat = addWind(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.85, envMapIntensity: 0.7 }), 0.3, 1.25);
  const NSEC = 40, secs = Array.from({ length: NSEC }, () => []), flowers = [];
  const gc = [C('#ffffff'), C('#e8f0c0'), C('#fff0b0'), C('#d8e8a8'), C('#f6d890')];
  const fc = [C('#ffffff'), C('#ffd84a'), C('#ff9a3c'), C('#c9a0ff'), C('#ff6d8a'), C('#fff3b0')];
  let n = 0;
  for (let t = 0; t < 200000 && n < 46000; t++) {
    const s = rand() * L, side = rand() < 0.5 ? -1 : 1, off = HW + 1.9 + Math.pow(rand(), 2.2) * 46; roadAt(s, side * off, _o);
    const x = _o.x + R(-1, 1), z = _o.z + R(-1, 1), h = heightAt(x, z); if (h < 0.7) continue;
    const rn = roadNear(x, z); if (rn && rn.d < HW + 1.6) continue; if (!isFree(x, z, -2)) continue;
    const sc = R(0.5, 1.0);
    secs[Math.floor(s / L * NSEC) % NSEC].push({ x, y: h - 0.03, z, ry: rand() * TAU, sx: sc, sy: sc * R(0.7, 1.4), sz: sc, c: gc[Math.floor(rand() * gc.length)] }); n++;
    if (rand() < 0.16) flowers.push({ x: x + R(-.4, .4), y: h + R(0.22, 0.42), z: z + R(-.4, .4), s: R(0.04, 0.08), c: fc[Math.floor(rand() * fc.length)] });
  }
  for (const list of secs) instanced(grassGeo, grassMat, list, false, true, false);
  instanced(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ roughness: 0.6 }), flowers, false, false, false);
}

// ---- cows ----
const cows = [];
{
  const cowGeo = seed => {
    const patch = (c, x, y, z) => { if (noise2(x * 1.7 + seed, z * 1.4 + y * 1.2 + seed * 2.3) > 0.06) c.set('#5e3319'); };
    return mergeGeometries([
      tint(xf(new RoundedBoxGeometry(0.82, 0.82, 1.7, 4, 0.3), 0, 1.06, 0), '#f3efe6', 0, patch),
      tint(xf(new RoundedBoxGeometry(0.4, 0.44, 0.62, 3, 0.15), 0, 0.72, 1.08, 0.75, 0, 0), '#f3efe6', 0, patch),
      tint(xf(new THREE.BoxGeometry(0.3, 0.45, 0.5), 0, 0.98, 0.84, 0.6, 0, 0), '#f3efe6', 0, patch),
      tint(xf(new THREE.BoxGeometry(0.3, 0.2, 0.2), 0, 0.47, 1.3, 0.75, 0, 0), '#e5a79c'),
      ...[[-.25, .6], [.25, .6], [-.25, -.6], [.25, -.6]].map(([x, z]) => tint(xf(new THREE.BoxGeometry(0.16, 0.72, 0.16), x, 0.36, z), '#efe9de')),
      tint(xf(new THREE.BoxGeometry(0.3, 0.2, 0.36), 0, 0.6, -0.42), '#e5a79c'),
      tint(xf(new THREE.ConeGeometry(0.04, 0.2, 5), 0.17, 1.02, 0.95, 0, 0, -0.5), '#e8dcc0'), tint(xf(new THREE.ConeGeometry(0.04, 0.2, 5), -0.17, 1.02, 0.95, 0, 0, 0.5), '#e8dcc0'),
      tint(xf(new THREE.BoxGeometry(0.05, 0.75, 0.05), 0, 0.95, -0.88, 0.15, 0, 0), '#5e3319'),
      tint(xf(new THREE.BoxGeometry(0.14, 0.16, 0.1), 0, 0.62, 0.82), '#d6a534'),
    ]);
  };
  const lists = [[], []];
  for (let t = 0; t < 600 && cows.length < 30; t++) {
    const s = rand() * L; roadAt(s, -innerSign * (HW + R(9, 55)), _o); const x = _o.x, z = _o.z, h = heightAt(x, z);
    const rn = roadNear(x, z); if ((rn && rn.d < HW + 7) || h < 1 || slopeAt(x, z) > 0.3 || !isFree(x, z, 2)) continue;
    const sc = R(0.95, 1.2); lists[cows.length % 2].push({ x, y: h - 0.03, z, ry: rand() * TAU, s: sc }); cows.push({ x, z }); occupied.push({ x, z, r: 2 });
  }
  const cm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  instanced(cowGeo(3.1), cm, lists[0], true, true, false); instanced(cowGeo(17.7), cm, lists[1], true, true, false);
}

// ---- sailboats, birds, particles ----
const boats = [];
for (let i = 0; i < 4; i++) {
  const g = new THREE.Group();
  mk(GEO.sphere, paint(['#f4efe4', '#27496d', '#8c2f25', '#f4efe4'][i]), g, 0, 0.1, 0, 0, 0, 0, 0.9, 0.55, 3.1);
  mk(GEO.cylLo, mat('#c9a878', 0.5), g, 0, 3.6, 0.3, 0, 0, 0, 0.05, 7, 0.05);
  const sail = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(2.9, 0), new THREE.Vector2(0, 6.2)])), new THREE.MeshStandardMaterial({ color: 0xfffaf0, side: THREE.DoubleSide, roughness: 0.8 }));
  sail.rotation.y = Math.PI / 2 + 0.25; sail.position.set(0, 0.8, 0.2); sail.castShadow = true; g.add(sail);
  const jib = sail.clone(); jib.scale.set(0.6, 0.75, 1); jib.rotation.y = -Math.PI / 2 + 0.2; jib.position.set(0, 0.8, 0.4); g.add(jib);
  g.userData = { a: i * 1.7 + 0.4, r: 38 + i * 17, sp: (0.012 + i * 0.003) * (i % 2 ? 1 : -1) }; scene.add(g); boats.push(g);
}
const birds = [];
{
  const wing = new THREE.BufferGeometry(); wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.16, 0, 0, -0.16, 0.75, 0, -0.05], 3)); wing.computeVertexNormals();
  const bm = new THREE.MeshBasicMaterial({ color: 0x1c1a1a, side: THREE.DoubleSide });
  for (let i = 0; i < 16; i++) {
    const g = new THREE.Group(); const l = new THREE.Mesh(wing, bm), r = new THREE.Mesh(wing, bm); r.scale.x = -1; g.add(l, r);
    g.userData = { l, r, ph: rand() * 9, off: new THREE.Vector3(R(-14, 14), R(-4, 4), R(-14, 14)) }; g.scale.setScalar(1.3); scene.add(g); birds.push(g);
  }
}
const dotTex = canvasTex(64, 64, (g, w, h) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
const POLLEN = 320, pollenBase = new Float32Array(POLLEN * 3), pollenGeo = new THREE.BufferGeometry();
for (let i = 0; i < POLLEN * 3; i++) pollenBase[i] = Math.random() * 36;
pollenGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(POLLEN * 3), 3));
const pollen = new THREE.Points(pollenGeo, new THREE.PointsMaterial({ map: dotTex, size: 0.11, color: 0xffe2a8, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
pollen.frustumCulled = false; pollen.layers.set(1); scene.add(pollen);
const fireflyMat = new THREE.PointsMaterial({ map: dotTex, size: 0.42, color: 0xd8ff70, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
{
  const p = []; for (let i = 0; i < 1500; i++) { roadAt(rand() * L, (rand() < .5 ? -1 : 1) * (HW + R(1.5, 30)), _o); const h = heightAt(_o.x, _o.z); if (h < 0.4) continue; p.push(_o.x, h + R(0.4, 2.8), _o.z); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); const f = new THREE.Points(g, fireflyMat); f.frustumCulled = false; f.layers.set(1); scene.add(f);
}

/* =====================================================================
   RIDERS & VEHICLES   (all models face +Z; left side is +X)
   ===================================================================== */
function makeRider(o) {
  const g = new THREE.Group(), torso = new THREE.Group(); torso.rotation.x = o.lean; g.add(torso);
  const J = mat(o.jacket, 0.75), Pn = mat(o.pants, 0.85), Gl = mat(o.gloves || '#1d1a18', 0.6), Sk = mat('#d9a57e', 0.8), Bt = mat('#191513', 0.6);
  mk(cap(0.165, 0.3), J, torso, 0, 0.3, 0, 0, 0, 0, 1.15, 1, 0.85);
  mk(cap(0.075, 0.3), J, torso, 0, 0.52, 0, 0, 0, Math.PI / 2);
  mk(GEO.cylLo, Sk, torso, 0, 0.66, 0, 0, 0, 0, 0.055, 0.1, 0.055);
  const head = new THREE.Group(); head.position.set(0, 0.79, 0.02); head.rotation.x = -o.lean * 0.8; torso.add(head);
  if (o.fullFace) { mk(GEO.sphere, paint(o.helmet), head, 0, 0, 0, 0, 0, 0, 0.15, 0.16, 0.17); mk(GEO.sphere, visorMat, head, 0, 0.012, 0.078, 0, 0, 0, 0.125, 0.07, 0.11); }
  else {
    mk(GEO.sphere, Sk, head, 0, -0.012, 0.012, 0, 0, 0, 0.115, 0.13, 0.12); mk(GEO.dome, paint(o.helmet), head, 0, 0, 0, -0.18, 0, 0, 0.15, 0.15, 0.16);
    if (o.goggles) { mk(tor(0.036, 0.011, 6, 14), mat('#4a2e1a', 0.5), head, 0.05, 0.075, 0.118, -0.35, 0, 0); mk(tor(0.036, 0.011, 6, 14), mat('#4a2e1a', 0.5), head, -0.05, 0.075, 0.118, -0.35, 0, 0); }
  }
  const arms = {}, legs = {}, p = o.pose;
  for (const [key, side] of [['L', 1], ['R', -1]]) {
    const sh = new THREE.Group(); sh.position.set(side * 0.21, 0.52, 0); torso.add(sh);
    mk(cap(0.055, 0.2), J, sh, 0, -0.14, 0);
    const el = new THREE.Group(); el.position.set(0, -0.29, 0); sh.add(el);
    mk(cap(0.048, 0.2), J, el, 0, -0.13, 0); mk(GEO.sphereLo, Gl, el, 0, -0.29, 0, 0, 0, 0, 0.06, 0.075, 0.06);
    sh.rotation.set(p.shx, 0, side * p.shz); el.rotation.x = p.el; arms[key] = { sh, el };
    const hip = new THREE.Group(); hip.position.set(side * 0.1, 0.02, 0); g.add(hip);
    mk(cap(0.075, 0.28), Pn, hip, 0, -0.2, 0);
    const kn = new THREE.Group(); kn.position.set(0, -0.4, 0); hip.add(kn);
    mk(cap(0.062, 0.28), Pn, kn, 0, -0.2, 0); mk(GEO.box, Bt, kn, 0, -0.42, 0.05, 0, 0, 0, 0.1, 0.09, 0.24);
    hip.rotation.set(p.hipx, 0, side * p.hipz); kn.rotation.x = p.kn; legs[key] = { hip, kn };
  }
  return { g, torso, head, arms, legs, pose: p };
}
function poseWave(r, amt, ph) {
  const p = r.pose, sh = r.arms.L.sh, el = r.arms.L.el;
  sh.rotation.x = lerp(p.shx, -0.25, amt); sh.rotation.z = lerp(p.shz, 2.1 + Math.sin(ph) * 0.16, amt);
  el.rotation.x = lerp(p.el, -0.2, amt); el.rotation.z = lerp(0, -0.35 + Math.sin(ph) * 0.55, amt);
}
function makeWheel(r, w, o = {}) {
  const g = new THREE.Group();
  if (o.thin) { mk(tor(r, 0.022, 6, 26), rubberMat, g, 0, 0, 0, 0, Math.PI / 2, 0); for (let i = 0; i < 4; i++) mk(GEO.cylLo, chromeMat, g, 0, 0, 0, i * Math.PI / 4, 0, 0, 0.006, r * 2, 0.006); }
  else {
    mk(tor(r * 0.78, r * 0.22), rubberMat, g, 0, 0, 0, 0, Math.PI / 2, 0);
    if (o.white) for (const sx of [-1, 1]) mk(tor(r * 0.7, r * 0.075, 6, 22), whiteMat, g, sx * r * 0.17, 0, 0, 0, Math.PI / 2, 0);
    mk(GEO.cyl, o.hub || chromeMat, g, 0, 0, 0, 0, 0, Math.PI / 2, r * 0.56, w, r * 0.56);
  }
  return g;
}
function headlight(parent, x, y, z, r) {
  mk(GEO.sphere, headMat, parent, x, y, z, 0, 0, 0, r, r, r * 0.45);
  const s = new THREE.Sprite(glowMat); s.position.set(x, y, z + 0.06); s.scale.setScalar(r * 16); parent.add(s);
}

// ---- the Vespa ----
function makeVespa() {
  const g = new THREE.Group(); g.rotation.order = 'YXZ';
  const P = paint('#93d6c3'), trim = mat('#2a2a2c', 0.6), leather = mat('#5e3a22', 0.55);
  const PDS = P.clone(); PDS.side = THREE.DoubleSide;
  mk(GEO.sphere, P, g, 0, 0.5, -0.45, 0, 0, 0, 0.3, 0.3, 0.62);                         // rear body
  for (const sx of [-1, 1]) mk(GEO.sphere, P, g, sx * 0.2, 0.43, -0.55, 0, 0, 0, 0.17, 0.21, 0.42);  // side cowls
  mk(GEO.box, P, g, 0, 0.4, -0.08, 0, 0, 0, 0.3, 0.2, 0.3);
  mk(GEO.box, trim, g, 0, 0.3, 0.14, 0, 0, 0, 0.36, 0.05, 0.6);                          // floorboard
  for (const sx of [-1, 0, 1]) mk(GEO.box, chromeMat, g, sx * 0.12, 0.33, 0.14, 0, 0, 0, 0.018, 0.012, 0.56);
  mk(new THREE.CylinderGeometry(0.43, 0.35, 0.8, 26, 1, true, -0.78, 1.56), PDS, g, 0, 0.7, 0.07, -0.14, 0, 0);   // legshield
  mk(GEO.sphere, P, g, 0, 0.72, 0.5, 0, 0, 0, 0.07, 0.2, 0.05);                          // horn cover
  mk(GEO.sphere, chromeMat, g, 0, 0.6, 0.545, 0, 0, 0, 0.04, 0.05, 0.015);
  tube([0, 0.5, 0.52], [0, 1.1, 0.4], 0.045, P, g);                                       // steering column
  mk(GEO.sphere, P, g, 0, 1.12, 0.42, 0, 0, 0, 0.14, 0.085, 0.15);                       // headset
  mk(cap(0.026, 0.56), P, g, 0, 1.12, 0.38, 0, 0, Math.PI / 2);
  for (const sx of [-1, 1]) { mk(cap(0.03, 0.09), trim, g, sx * 0.33, 1.12, 0.38, 0, 0, Math.PI / 2); tube([sx * 0.27, 1.13, 0.38], [sx * 0.36, 1.36, 0.36], 0.008, chromeMat, g); mk(GEO.cyl, chromeMat, g, sx * 0.37, 1.39, 0.36, Math.PI / 2, 0, 0, 0.065, 0.02, 0.065); }
  mk(tor(0.078, 0.014, 8, 20), chromeMat, g, 0, 1.12, 0.555); headlight(g, 0, 1.12, 0.545, 0.074);
  mk(GEO.dome, P, g, 0, 0.3, 0.66, 0, 0, 0, 0.13, 0.3, 0.34);                            // front fender
  tube([0.11, 0.25, 0.66], [0.09, 0.52, 0.56], 0.022, chromeMat, g);
  mk(cap(0.13, 0.44), leather, g, 0, 0.8, -0.32, Math.PI / 2, 0, 0, 1.08, 1, 0.55);        // saddle
  mk(GEO.box, chromeMat, g, 0, 0.83, -0.8, 0, 0, 0, 0.3, 0.015, 0.26);                   // rack
  mk(new RoundedBoxGeometry(0.34, 0.2, 0.24, 2, 0.04), mat('#8a5a30', 0.6), g, 0, 0.94, -0.8); // little suitcase
  for (const sx of [-1, 1]) mk(GEO.box, mat('#3a2412', 0.6), g, sx * 0.09, 0.94, -0.8, 0, 0, 0, 0.025, 0.21, 0.25);
  mk(GEO.sphere, tailMat, g, 0, 0.62, -1.06, 0, 0, 0, 0.055, 0.04, 0.03);
  const fw = makeWheel(0.25, 0.1, { white: true }); fw.position.set(0, 0.25, 0.66); g.add(fw);
  const rw = makeWheel(0.25, 0.1, { white: true }); rw.position.set(0, 0.25, -0.55); g.add(rw);
  const rider = makeRider({ jacket: '#b9793b', pants: '#2c3a52', helmet: '#f0e6d0', goggles: true, gloves: '#3a2616', lean: 0.12, pose: { shx: -1.27, shz: 0.13, el: -0.3, hipx: -1.45, hipz: 0.12, kn: 1.4 } });
  rider.g.position.set(0, 0.88, -0.3); g.add(rider.g);
  const scarfGeo = new THREE.PlaneGeometry(0.12, 0.85, 1, 14);
  const scarf = new THREE.Mesh(scarfGeo, new THREE.MeshStandardMaterial({ color: 0xc8322a, side: THREE.DoubleSide, roughness: 0.8 })); scarf.castShadow = true;
  scarf.position.set(0.06, 0.66, -0.1); rider.torso.add(scarf);
  mk(tor(0.075, 0.03, 6, 14), scarf.material, rider.torso, 0, 0.66, 0, Math.PI / 2, 0, 0);
  return { g, rider, wheels: [fw, rw], scarf, scarfBase: scarfGeo.attributes.position.array.slice() };
}

// ---- wave marker sprites ----
const emojiTex = (ch, glow) => canvasTex(160, 160, (g, w, h) => {
  const gr = g.createRadialGradient(80, 80, 10, 80, 80, 80); gr.addColorStop(0, glow); gr.addColorStop(1, 'rgba(255,200,90,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.font = '92px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, 80, 86);
});
const handMat = new THREE.SpriteMaterial({ map: emojiTex('👋', 'rgba(255,196,90,0.5)'), transparent: true, depthWrite: false, fog: false, toneMapped: false, color: new THREE.Color(0.8, 0.8, 0.8) });
const heartMat = new THREE.SpriteMaterial({ map: emojiTex('🤙', 'rgba(140,255,180,0.5)'), transparent: true, depthWrite: false, fog: false, toneMapped: false, color: new THREE.Color(0.8, 0.8, 0.8) });

const MOTO_COLORS = ['#b3261e', '#1b1b1e', '#e46b1f', '#1f4d3a', '#1f4fa0', '#e9e6df', '#e5b81e', '#6d1f2a'];
const JACKETS = ['#1a1a1c', '#3a2415', '#22262b', '#5a1d1a', '#2d3a2a', '#1a1a1c'];
function makeMoto(i) {
  const g = new THREE.Group(); g.rotation.order = 'YXZ';
  const variant = ['naked', 'sport', 'adv'][i % 3], col = MOTO_COLORS[i % MOTO_COLORS.length], P = paint(col), eng = mat('#2b2c2f', 0.45, 0.7), blk = mat('#151516', 0.7);
  const fw = makeWheel(0.33, 0.13, { hub: eng }); fw.position.set(0, 0.33, 0.74); g.add(fw);
  const rw = makeWheel(0.33, 0.17, { hub: eng }); rw.position.set(0, 0.33, -0.72); g.add(rw);
  mk(GEO.box, eng, g, 0, 0.52, 0.02, 0, 0, 0, 0.3, 0.36, 0.5);
  for (const sx of [-1, 1]) mk(GEO.cyl, chromeMat, g, sx * 0.16, 0.5, 0.05, 0, 0, Math.PI / 2, 0.11, 0.05, 0.11);
  mk(GEO.sphere, P, g, 0, 0.98, 0.16, -0.1, 0, 0, 0.2, 0.15, 0.35);
  mk(cap(0.12, 0.42), blk, g, 0, 0.93, -0.34, Math.PI / 2, 0, 0, 1, 1, 0.5);
  mk(GEO.sphere, P, g, 0, 0.95, -0.7, 0.2, 0, 0, 0.13, 0.08, 0.22);
  for (const sx of [-1, 1]) tube([sx * 0.1, 0.33, 0.74], [sx * 0.1, 1.08, 0.5], 0.028, chromeMat, g);
  mk(GEO.dome, P, g, 0, 0.42, 0.74, 0, 0, 0, 0.1, 0.3, 0.38);
  tube([0, 0.75, 0.3], [0, 0.6, -0.62], 0.03, blk, g); tube([0, 0.33, -0.72], [0, 0.85, -0.5], 0.025, blk, g);
  tube([-0.18, 0.36, 0.2], [-0.21, 0.52, -0.82], 0.045, chromeMat, g);
  mk(cap(0.02, 0.62), blk, g, 0, 1.18, 0.44, 0, 0, Math.PI / 2);
  mk(GEO.sphere, tailMat, g, 0, 0.93, -0.92, 0, 0, 0, 0.05, 0.035, 0.03);
  if (variant === 'sport') { mk(GEO.sphere, P, g, 0, 1.0, 0.56, -0.2, 0, 0, 0.25, 0.27, 0.3); mk(GEO.sphere, glassMat, g, 0, 1.2, 0.56, -0.5, 0, 0, 0.17, 0.14, 0.1); headlight(g, 0, 0.98, 0.84, 0.08); }
  else { mk(GEO.sphere, chromeMat, g, 0, 1.06, 0.6, 0, 0, 0, 0.1, 0.1, 0.09); headlight(g, 0, 1.06, 0.66, 0.085); }
  if (variant === 'adv') { for (const sx of [-1, 1]) mk(new RoundedBoxGeometry(0.2, 0.34, 0.42, 2, 0.03), mat('#9a9c9e', 0.4, 0.8), g, sx * 0.3, 0.78, -0.72); mk(GEO.box, glassMat, g, 0, 1.36, 0.6, -0.35, 0, 0, 0.34, 0.36, 0.02); }
  const sport = variant === 'sport';
  const rider = makeRider({ jacket: JACKETS[i % JACKETS.length], pants: '#1c1d20', helmet: MOTO_COLORS[(i * 3 + 2) % MOTO_COLORS.length], fullFace: true, lean: sport ? 0.55 : 0.32, pose: { shx: sport ? -1.5 : -1.36, shz: 0.16, el: -0.25, hipx: -1.15, hipz: 0.14, kn: 1.75 } });
  rider.g.position.set(0, 0.98, -0.3); g.add(rider.g);
  const sprite = new THREE.Sprite(handMat); sprite.position.set(0, 2.55, 0); sprite.visible = false; g.add(sprite);
  return { g, rider, sprite, wheels: [fw, rw], wheelR: 0.33, len: 2.2, speedRange: [16, 22], lat: -1.75, phase: Math.random() * 9 };
}
function makeBicycle(i) {
  const g = new THREE.Group(); g.rotation.order = 'YXZ';
  const fc = ['#d93a2b', '#1e88c9', '#f0c31c', '#22a06b'][i % 4], F = paint(fc), blk = mat('#151516', 0.6);
  const fw = makeWheel(0.34, 0.03, { thin: true }); fw.position.set(0, 0.34, 0.52); g.add(fw);
  const rw = makeWheel(0.34, 0.03, { thin: true }); rw.position.set(0, 0.34, -0.52); g.add(rw);
  const bb = [0, 0.3, -0.04], seat = [0, 0.94, -0.2], ht = [0, 0.94, 0.36], hb = [0, 0.74, 0.4];
  tube(bb, seat, 0.017, F, g); tube(seat, ht, 0.017, F, g); tube(bb, hb, 0.02, F, g); tube(ht, hb, 0.02, F, g);
  tube(bb, [0, 0.34, -0.52], 0.012, F, g); tube(seat, [0, 0.34, -0.52], 0.012, F, g); tube(hb, [0, 0.34, 0.52], 0.014, F, g);
  mk(GEO.box, blk, g, 0, 0.98, -0.22, 0, 0, 0, 0.12, 0.04, 0.24); mk(cap(0.012, 0.4), blk, g, 0, 1.0, 0.42, 0, 0, Math.PI / 2);
  const rider = makeRider({ jacket: ['#f24a2e', '#17b8d8', '#f5d020', '#ff5fa2'][i % 4], pants: '#16171a', helmet: '#f3f3f3', gloves: '#16171a', lean: 0.95, pose: { shx: -1.5, shz: 0.1, el: -0.15, hipx: -0.9, hipz: 0.04, kn: 1.1 } });
  rider.g.position.set(0, 1.02, -0.2); rider.g.scale.setScalar(0.95); g.add(rider.g);
  return { g, rider, wheels: [fw, rw], wheelR: 0.34, len: 1.8, speedRange: [6, 8.5], lat: -3.85, phase: Math.random() * 9 };
}
const carGeo = (() => {
  const W = 1.72, ext = (shape, depth, bevel) => { const e = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.9, bevelSegments: 3, curveSegments: 10 }); e.translate(0, 0, -depth / 2); e.rotateY(-Math.PI / 2); return e; };
  const s = new THREE.Shape(); s.moveTo(-2.05, 0.34); s.lineTo(-1.66, 0.34); s.absarc(-1.28, 0.34, 0.38, Math.PI, 0, true); s.lineTo(0.9, 0.34); s.absarc(1.28, 0.34, 0.38, Math.PI, 0, true); s.lineTo(2.02, 0.34);
  s.quadraticCurveTo(2.12, 0.36, 2.1, 0.6); s.quadraticCurveTo(2.08, 0.8, 1.9, 0.84); s.lineTo(0.7, 0.96); s.lineTo(-1.85, 1.0); s.quadraticCurveTo(-2.08, 0.98, -2.08, 0.75); s.lineTo(-2.05, 0.34);
  const s2 = new THREE.Shape(); s2.moveTo(-1.62, 0.92); s2.lineTo(0.64, 0.9); s2.lineTo(0.02, 1.38); s2.lineTo(-1.38, 1.4); s2.quadraticCurveTo(-1.62, 1.3, -1.72, 0.96); s2.lineTo(-1.62, 0.92);
  const s3 = new THREE.Shape(); s3.moveTo(-1.44, 1.36); s3.lineTo(0.1, 1.34); s3.lineTo(0.05, 1.43); s3.lineTo(-1.38, 1.45); s3.lineTo(-1.44, 1.36);
  return { body: ext(s, W - 0.16, 0.08), glass: ext(s2, W - 0.36, 0.04), roof: ext(s3, W - 0.3, 0.04) };
})();
const CAR_COLORS = ['#c0392b', '#f3efe6', '#2d5f8b', '#1e1e22', '#7fa38a', '#d98e04', '#8c8f93', '#4a2c5a'];
function makeCar(i) {
  const g = new THREE.Group(); g.rotation.order = 'YXZ'; const P = paint(CAR_COLORS[i % CAR_COLORS.length]);
  mk(carGeo.body, P, g); mk(carGeo.glass, glassMat, g); mk(carGeo.roof, P, g);
  mk(GEO.box, mat('#121213', 0.8), g, 0, 0.3, 0, 0, 0, 0, 1.5, 0.16, 3.6);
  mk(GEO.box, chromeMat, g, 0, 0.45, 2.12, 0, 0, 0, 1.6, 0.09, 0.08); mk(GEO.box, chromeMat, g, 0, 0.45, -2.1, 0, 0, 0, 1.6, 0.09, 0.08);
  mk(GEO.box, mat('#101012', 0.5), g, 0, 0.62, 2.1, 0, 0, 0, 0.8, 0.14, 0.06);
  for (const sx of [-1, 1]) { headlight(g, sx * 0.6, 0.66, 2.09, 0.1); mk(GEO.box, tailMat, g, sx * 0.62, 0.78, -2.1, 0, 0, 0, 0.3, 0.1, 0.06); }
  const wheels = []; for (const sx of [-1, 1]) for (const z of [1.28, -1.28]) { const w = makeWheel(0.32, 0.2); w.position.set(sx * 0.78, 0.34, z); g.add(w); wheels.push(w); }
  return { g, wheels, wheelR: 0.32, len: 4.3, speedRange: [14, 19], lat: -2.0 };
}
const lorryTex = canvasTex(512, 256, (g, w, h) => {
  g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, w, h); g.fillStyle = '#1f4a7a'; g.fillRect(0, h - 46, w, 46);
  g.beginPath(); g.moveTo(40, 150); g.lineTo(96, 62); g.lineTo(128, 108); g.lineTo(152, 80); g.lineTo(200, 150); g.closePath(); g.fill();
  g.font = '800 62px Georgia,serif'; g.fillText('Bergfrisch', 214, 128); g.font = '500 22px Arial'; g.fillStyle = '#5b6b7a'; g.fillText('ALPINE DAIRY  ·  SINCE 1921', 218, 164);
});
function makeTruck(i) {
  const g = new THREE.Group(); g.rotation.order = 'YXZ'; const P = paint(['#b3261e', '#1f4a7a'][i % 2]), dark = mat('#1b1b1d', 0.7);
  mk(GEO.box, dark, g, 0, 0.82, -0.3, 0, 0, 0, 2.1, 0.4, 8.6);
  mk(new RoundedBoxGeometry(2.45, 2.5, 2.1, 3, 0.22), P, g, 0, 2.1, 3.0);
  mk(GEO.box, glassMat, g, 0, 2.62, 4.04, 0, 0, 0, 2.15, 0.95, 0.06);
  for (const sx of [-1, 1]) mk(GEO.box, glassMat, g, sx * 1.22, 2.62, 3.3, 0, 0, 0, 0.05, 0.8, 1.0);
  mk(GEO.box, dark, g, 0, 1.3, 4.05, 0, 0, 0, 1.7, 0.6, 0.06); mk(GEO.box, chromeMat, g, 0, 0.82, 4.08, 0, 0, 0, 2.4, 0.3, 0.1);
  mk(new RoundedBoxGeometry(2.56, 2.95, 6.0, 2, 0.06), mat('#f4f1ea', 0.6), g, 0, 2.5, -1.25);
  const sm = new THREE.MeshStandardMaterial({ map: lorryTex, roughness: 0.6 });
  mk(new THREE.PlaneGeometry(5.8, 2.8), sm, g, 1.29, 2.5, -1.25, 0, Math.PI / 2, 0); mk(new THREE.PlaneGeometry(5.8, 2.8), sm, g, -1.29, 2.5, -1.25, 0, -Math.PI / 2, 0);
  for (const sx of [-1, 1]) { headlight(g, sx * 0.9, 1.18, 4.1, 0.13); mk(GEO.box, tailMat, g, sx * 0.9, 1.0, -4.26, 0, 0, 0, 0.3, 0.16, 0.06); mk(GEO.box, amberMat, g, sx * 0.9, 3.42, 4.02, 0, 0, 0, 0.16, 0.07, 0.06); }
  const wheels = []; for (const sx of [-1, 1]) for (const z of [3.0, -1.9, -3.1]) { const w = makeWheel(0.5, 0.3, { hub: mat('#8a8c8e', 0.4, 0.8) }); w.position.set(sx * 1.03, 0.5, z); g.add(w); wheels.push(w); }
  return { g, wheels, wheelR: 0.5, len: 8.8, speedRange: [11.5, 14], lat: -2.05 };
}
function makeBus() {
  const g = new THREE.Group(); g.rotation.order = 'YXZ'; const P = paint('#f2c300');
  mk(new RoundedBoxGeometry(2.5, 3.0, 11.4, 4, 0.32), P, g, 0, 1.95, 0);
  mk(GEO.box, glassMat, g, 0, 2.5, -0.3, 0, 0, 0, 2.53, 0.95, 9.4); mk(GEO.box, glassMat, g, 0, 2.3, 5.68, 0, 0, 0, 2.2, 1.35, 0.08);
  mk(GEO.box, mat('#c62a1e', 0.5), g, 0, 1.4, 0, 0, 0, 0, 2.53, 0.14, 11.2); mk(GEO.box, amberMat, g, 0, 3.2, 5.7, 0, 0, 0, 1.3, 0.2, 0.05);
  mk(GEO.box, mat('#1b1b1d', 0.7), g, 0, 0.55, 0, 0, 0, 0, 2.3, 0.3, 10.6);
  for (const sx of [-1, 1]) { headlight(g, sx * 0.9, 1.0, 5.72, 0.13); mk(GEO.box, tailMat, g, sx * 0.9, 1.1, -5.72, 0, 0, 0, 0.3, 0.2, 0.06); }
  const wheels = []; for (const sx of [-1, 1]) for (const z of [3.7, -3.5]) { const w = makeWheel(0.52, 0.3, { hub: mat('#8a8c8e', 0.4, 0.8) }); w.position.set(sx * 1.05, 0.52, z); g.add(w); wheels.push(w); }
  return { g, wheels, wheelR: 0.52, len: 11.6, speedRange: [11, 13], lat: -2.05 };
}

const vespa = makeVespa(); scene.add(noRefl(vespa.g));
const traffic = [];
function addPool(type, n, build) { for (let i = 0; i < n; i++) { const v = build(i); v.type = type; v.active = false; v.g.visible = false; v.leanS = 0; v.d = 999; scene.add(noRefl(v.g)); traffic.push(v); } }
addPool('moto', 8, makeMoto); addPool('car', 7, makeCar); addPool('truck', 2, makeTruck); addPool('bus', 1, makeBus); addPool('bike', 3, makeBicycle);

/* =====================================================================
   POST-PROCESSING
   ===================================================================== */
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 }));
composer.setPixelRatio(PR); composer.setSize(innerWidth, innerHeight);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.3, 0.6, 1.0); composer.addPass(bloom);
composer.addPass(new OutputPass());
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, res: { value: new THREE.Vector2(innerWidth, innerHeight) }, sunUv: { value: new THREE.Vector2(0.5, 0.5) }, sunVis: { value: 0 }, aspect: { value: innerWidth / innerHeight }, flareCol: { value: new THREE.Color(1, 0.8, 0.55) }, vig: { value: 0.95 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time, sunVis, aspect, vig; uniform vec2 res, sunUv; uniform vec3 flareCol; varying vec2 vUv;
    void main(){
      vec2 uv=vUv, c=uv-0.5; float r=dot(c,c);
      vec2 off=c*r*0.007;
      vec3 col=vec3(texture2D(tDiffuse,uv+off).r, texture2D(tDiffuse,uv).g, texture2D(tDiffuse,uv-off).b);
      // lens flare: glow, anamorphic streak, ghosts
      vec2 d=uv-sunUv; d.x*=aspect; float dl=length(d);
      float fl=exp(-dl*6.5)*0.17 + exp(-abs(d.y)*80.0)*exp(-abs(d.x)*2.4)*0.2;
      vec2 axis=vec2(0.5)-sunUv;
      for(int i=0;i<5;i++){ float f=0.5+float(i)*0.42; vec2 gd=uv-(sunUv+axis*f*1.6); gd.x*=aspect; float rr=0.018+0.016*float(i); fl+=smoothstep(rr,rr*0.55,length(gd))*(0.035+0.008*float(i)); }
      col+=flareCol*fl*sunVis;
      // grade
      col=mix(col,col*vec3(1.045,1.0,0.93),0.55);
      col=(col-0.5)*1.05+0.5;
      float l=dot(col,vec3(0.299,0.587,0.114)); col=mix(vec3(l),col,1.1);
      col*=1.0-r*vig;
      float g=fract(sin(dot(uv*res+fract(time)*61.0,vec2(12.9898,78.233)))*43758.5453); col+=(g-0.5)*0.032;
      gl_FragColor=vec4(col,1.0);
    }`
});
composer.addPass(grade);

/* =====================================================================
   SUN / TIME OF DAY
   ===================================================================== */
let lastEnvElev = 999, sunElev = 9;
function setSun(elev) {
  sunElev = elev;
  sunDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elev), THREE.MathUtils.degToRad(SUN_AZ));
  su.sunPosition.value.copy(sunDir); water.material.uniforms.sunDirection.value.copy(sunDir);
  const k = smooth(11, -1, elev), night = smooth(5, -1.2, elev);
  su.rayleigh.value = lerp(2.0, 4.0, k); su.turbidity.value = lerp(4, 8.5, k); su.mieCoefficient.value = lerp(0.0022, 0.005, k);
  sun.color.lerpColors(PAL.sunDay, PAL.sunDusk, k); sun.intensity = lerp(3.3, 1.1, k) * smooth(-2.2, 1.2, elev);
  hemi.color.lerpColors(PAL.skyDay, PAL.skyDusk, k); hemi.groundColor.lerpColors(PAL.gndDay, PAL.gndDusk, k); hemi.intensity = lerp(0.7, 0.55, k);
  scene.fog.color.lerpColors(PAL.fogDay, PAL.fogDusk, k); scene.fog.density = lerp(0.00075, 0.00105, k);
  renderer.toneMappingExposure = lerp(0.72, 0.92, k);
  headMat.emissiveIntensity = lerp(2.2, 7, night); tailMat.emissiveIntensity = lerp(0.6, 3.2, night); amberMat.emissiveIntensity = lerp(1.0, 3.5, night);
  windowMat.emissiveIntensity = night * 3.4; glowMat.opacity = night * 0.9; glowMat.visible = night > 0.02; fireflyMat.opacity = night;
  cloudMat.color.lerpColors(PAL.cloudDay, PAL.cloudDusk, k);
  water.material.uniforms.sunColor.value.lerpColors(PAL.sunDay, PAL.sunDusk, k);
  grade.uniforms.flareCol.value.lerpColors(PAL.sunDay, PAL.sunDusk, k);
  if (Math.abs(elev - lastEnvElev) > 0.45) { lastEnvElev = elev; updateEnv(); }
}
setSun(9);

/* =====================================================================
   AUDIO  (all synthesised)
   ===================================================================== */
const Snd = {
  ctx: null, muted: false,
  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = 0.75; this.master.connect(c.destination);
    this.o1 = c.createOscillator(); this.o1.type = 'sawtooth'; this.o2 = c.createOscillator(); this.o2.type = 'square';
    const sh = c.createWaveShaper(); const cv = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; cv[i] = Math.tanh(x * 3); } sh.curve = cv;
    this.ef = c.createBiquadFilter(); this.ef.type = 'lowpass'; this.ef.frequency.value = 600; this.ef.Q.value = 3;
    this.am = c.createGain(); this.am.gain.value = 0.65; this.lfo = c.createOscillator(); this.lfo.type = 'square'; const lg = c.createGain(); lg.gain.value = 0.3; this.lfo.connect(lg); lg.connect(this.am.gain);
    this.eg = c.createGain(); this.eg.gain.value = 0;
    this.o1.connect(sh); this.o2.connect(sh); sh.connect(this.ef); this.ef.connect(this.am); this.am.connect(this.eg); this.eg.connect(this.master);
    const nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1; this.noise = nb;
    this.wind = c.createBufferSource(); this.wind.buffer = nb; this.wind.loop = true; const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.5;
    this.wg = c.createGain(); this.wg.gain.value = 0; this.wind.connect(bp); bp.connect(this.wg); this.wg.connect(this.master);
    this.o1.start(); this.o2.start(); this.lfo.start(); this.wind.start();
  },
  engine(speed, on) {
    if (!this.ctx) return; const t = this.ctx.currentTime, f = 30 + speed * 3.3;
    this.o1.frequency.setTargetAtTime(f, t, 0.08); this.o2.frequency.setTargetAtTime(f * 0.5, t, 0.08); this.lfo.frequency.setTargetAtTime(f * 0.5, t, 0.1);
    this.ef.frequency.setTargetAtTime(420 + speed * 42, t, 0.1); this.eg.gain.setTargetAtTime(on ? 0.05 : 0.018, t, 0.3);
    this.wg.gain.setTargetAtTime(Math.min(0.08, speed * speed * 0.00013), t, 0.2);
  },
  tone(type, f0, f1, dur, vol, when = 0, pan = 0) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime + when, o = c.createOscillator(), g = c.createGain(); o.type = type;
    o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let out = g; if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; }
    o.connect(g); out.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  },
  horn() { for (const w of [0, 0.19]) { this.tone('square', 415, 415, 0.14, 0.07, w); this.tone('square', 523, 523, 0.14, 0.05, w); } },
  reply() { this.tone('square', 311, 311, 0.2, 0.045, 0.34, -0.5); this.tone('square', 392, 392, 0.2, 0.035, 0.34, -0.5); },
  chime() { this.tone('sine', 880, 880, 0.5, 0.09); this.tone('sine', 1318, 1318, 0.6, 0.06, 0.08); },
  fail() { this.tone('sawtooth', 220, 98, 0.38, 0.09); this.tone('square', 110, 62, 0.4, 0.06); },
  honk(big) { const f = big ? 155 : 370; this.tone('sawtooth', f, f, big ? 0.7 : 0.3, 0.07, 0.15, -0.5); this.tone('sawtooth', f * 1.26, f * 1.26, big ? 0.7 : 0.3, 0.05, 0.15, -0.5); },
  miss() { this.tone('triangle', 330, 165, 0.5, 0.1); },
  bell() { for (const [f, v] of [[780, 0.035], [1175, 0.025], [1560, 0.015]]) this.tone('sine', f, f * 0.995, 0.9, v, 0, 0.4 * (Math.random() - .5)); },
  whoosh(type) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime, s = c.createBufferSource(); s.buffer = this.noise;
    const big = type === 'truck' || type === 'bus', f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.8;
    f.frequency.setValueAtTime(big ? 500 : 1300, t); f.frequency.exponentialRampToValueAtTime(big ? 120 : 320, t + 0.7);
    const g = c.createGain(), vol = type === 'bike' ? 0.02 : big ? 0.22 : 0.11; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.07); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    s.connect(f); f.connect(g); if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = -0.7; g.connect(p); p.connect(this.master); } else g.connect(this.master);
    s.start(t, Math.random()); s.stop(t + 0.9);
    if (type === 'moto') this.tone('sawtooth', 190, 95, 0.55, 0.05, 0, -0.6);
  },
  toggle() { this.muted = !this.muted; if (this.master) this.master.gain.value = this.muted ? 0 : 0.75; }
};

/* =====================================================================
   GAME STATE
   ===================================================================== */
const RIDE = 180;
const G = { state: 'title', score: 0, combo: 1, bestCombo: 1, rideTime: 0, stats: { ok: 0, bad: 0, miss: 0 }, waveT: 0, waveCD: 0, waveAmt: 0, cam: 0, paused: false };
const player = { s: 30, speed: 11, target: 14, lat: 1.8, leanS: 0 };
const keys = {};
const CAMS = [{ back: 5.4, up: 2.15, side: 0, ahead: 10, lookUp: 1.1 }, { back: 3.4, up: 1.75, side: 0.3, ahead: 14, lookUp: 1.2 }, { back: 17, up: 9, side: 2, ahead: 6, lookUp: 0.8 }];
let clock = 0, spawnT = 1.5, sunVis = 0, bellCD = 0, hintT = 14;

const HUD = { score: $('score'), combo: $('comboN'), ok: $('stOk'), bad: $('stBad'), miss: $('stMiss'), time: $('sunTime'), dot: $('sunDot'), toasts: $('toasts'), flash: $('flash'), wave: $('waveIcon') };
function setScore() { HUD.score.textContent = G.score.toLocaleString('en').replace('-', '−'); HUD.score.classList.toggle('neg', G.score < 0); HUD.score.classList.remove('bump'); void HUD.score.offsetWidth; HUD.score.classList.add('bump'); HUD.combo.textContent = '×' + G.combo; HUD.ok.textContent = G.stats.ok; HUD.bad.textContent = G.stats.bad; HUD.miss.textContent = G.stats.miss; }
function toast(kind, title, pts, sub) {
  HUD.toasts.innerHTML = ''; const el = document.createElement('div'); el.className = 'toast ' + kind;
  el.innerHTML = `<div class="t">${title}</div><div class="p">${pts > 0 ? '+' + pts : '−' + Math.abs(pts)}</div><div class="s">${sub}</div>`; HUD.toasts.appendChild(el); setTimeout(() => el.remove(), 1900);
  HUD.flash.className = ''; void HUD.flash.offsetWidth; HUD.flash.className = kind;
}
const GOOD = ['Ciao!', 'Salut!', 'Grüezi!', 'Hoi!', 'Servus!', 'Respect!'];
const BAD = {
  car: [['That was a car.', 'Drivers do not wave back'], ['Wrong crowd.', 'Four wheels, no wave']],
  truck: [['A lorry? Really?', 'The trucker is unimpressed']], bus: [['That was the bus.', 'Forty passengers saw that']],
  bike: [['Cyclists don’t count.', 'Too busy pedalling']], moto: [['No wave from them.', 'You waved at a stoic']], early: [['Too eager!', 'Wait for their sign']],
};
function penalty(kind, pts) { G.score -= pts; G.combo = 1; G.stats.bad++; const [t, s] = pick(BAD[kind]); toast('bad', t, -pts, s); setScore(); }
function tryWave() {
  if (G.waveCD > 0) return; G.waveCD = 0.5; G.waveT = 1.0;
  HUD.wave.classList.remove('go'); void HUD.wave.offsetWidth; HUD.wave.classList.add('go');
  let near = null, waver = null;
  for (const v of traffic) {
    if (!v.active || v.judged || v.d < -5 || v.d > 95) continue;
    if (v.type === 'moto' && v.waving) { if (!waver || v.d < waver.d) waver = v; }
    if (!near || v.d < near.d) near = v;
  }
  if (waver) {
    const react = clock - v0(waver), quick = Math.round(clamp(60 - react * 45, 0, 60) / 5) * 5, pts = (100 + quick) * G.combo;
    waver.judged = true; waver.happy = 2.2; waver.sprite.material = heartMat;
    G.score += pts; G.stats.ok++; G.combo = Math.min(5, G.combo + 1); G.bestCombo = Math.max(G.bestCombo, G.combo);
    toast('good', pick(GOOD), pts, quick >= 45 ? 'Lightning reflexes' : G.combo > 2 ? `Streak ×${G.combo}` : 'Wave returned'); setScore();
    Snd.horn(); Snd.reply(); Snd.chime(); return;
  }
  if (near) {
    near.judged = true;
    if (near.type === 'moto') { if (near.waves && !near.waving) penalty('early', 40); else penalty('moto', 50); Snd.fail(); }
    else { penalty(near.type, 50); Snd.fail(); Snd.honk(near.type === 'truck' || near.type === 'bus'); }
    return;
  }
  G.score -= 10; G.combo = 1; toast('bad', pick(['Waving at the cows?', 'Nobody there.', 'Hello, trees.']), -10, 'Save it for a rider'); setScore(); Snd.fail();
}
const v0 = v => v.waveStart;
function ignored(v) { G.score -= 30; G.combo = 1; G.stats.miss++; toast('bad', 'Left hanging!', -30, 'A rider waved at you'); setScore(); Snd.miss(); }

function startGame() {
  Snd.init();
  Object.assign(G, { state: 'play', score: 0, combo: 1, bestCombo: 1, rideTime: 0, waveT: 0, waveCD: 0, paused: false }); G.stats = { ok: 0, bad: 0, miss: 0 };
  for (const v of traffic) { v.active = false; v.g.visible = false; } spawnT = 1.2; hintT = 14; $('hint').style.opacity = 1;
  player.target = 15; setScore(); HUD.score.classList.remove('bump');
  $('title').classList.add('off'); $('end').classList.add('off'); $('hud').classList.add('on'); $('pause').classList.remove('on');
}
function endGame() {
  G.state = 'end'; $('hud').classList.remove('on');
  const s = G.score, rank = s >= 3200 ? 'Leggenda della Strada' : s >= 1900 ? 'Vespista Vero' : s >= 900 ? 'Sunday Cruiser' : s >= 0 ? 'Learner Plates' : 'The Awkward Waver';
  $('endRank').textContent = rank; $('endScore').textContent = s.toLocaleString('en').replace('-', '−');
  $('eOk').textContent = G.stats.ok; $('eBad').textContent = G.stats.bad; $('eMiss').textContent = G.stats.miss; $('eCombo').textContent = '×' + G.bestCombo;
  $('end').classList.remove('off'); Snd.chime();
}
$('start').addEventListener('click', startGame); $('again').addEventListener('click', startGame);
addEventListener('keydown', e => {
  if (e.code === 'Space') { e.preventDefault(); if (!e.repeat && G.state === 'play' && !G.paused) tryWave(); return; }
  if (e.code === 'Enter' && G.state !== 'play') { e.preventDefault(); startGame(); return; }
  if (e.code.startsWith('Arrow')) e.preventDefault();
  keys[e.code] = true;
  if (e.repeat) return;
  if (e.code === 'KeyC') G.cam = (G.cam + 1) % CAMS.length;
  if (e.code === 'KeyM') Snd.toggle();
  if ((e.code === 'KeyP' || e.code === 'Escape') && G.state === 'play') { G.paused = !G.paused; $('pause').classList.toggle('on', G.paused); if (Snd.ctx) G.paused ? Snd.ctx.suspend() : Snd.ctx.resume(); }
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('resize', () => {
  applyRes(); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  grade.uniforms.res.value.set(innerWidth, innerHeight); grade.uniforms.aspect.value = innerWidth / innerHeight;
});

function applyRes() {
  const pr = basePR() * prScale; renderer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight);
  composer.setPixelRatio(pr); composer.setSize(innerWidth, innerHeight);
}
// adaptive resolution: if the GPU can't hold ~45 fps, render fewer pixels
let perfAcc = 0, perfN = 0;
function perfTick(dt) {
  if (dt > 0.1) return;                       // throttled / background tab: not a real measurement
  perfAcc += dt; perfN++;
  if (perfN >= 90) { const avg = perfAcc / perfN; perfAcc = perfN = 0; if (avg > 0.0235 && prScale > 0.56) { prScale *= 0.85; applyRes(); } }
}

/* =====================================================================
   TRAFFIC
   ===================================================================== */
function spawn() {
  const r = Math.random(), type = r < 0.47 ? 'moto' : r < 0.76 ? 'car' : r < 0.87 ? 'bike' : r < 0.95 ? 'truck' : 'bus';
  const v = traffic.find(t => !t.active && t.type === type) || traffic.find(t => !t.active && t.type === 'car'); if (!v) return false;
  const sp = player.s + 440; for (const o of traffic) if (o.active && Math.abs(wrapD(o.s - sp)) < 34) return false;
  v.active = true; v.g.visible = true; v.s = wrapS(sp); v.base = lerp(v.speedRange[0], v.speedRange[1], Math.random()); v.speed = v.base;
  v.judged = false; v.passed = false; v.waving = false; v.waveAmt = 0; v.happy = 0; v.leanS = 0; v.d = 440;
  v.waves = v.type === 'moto' && Math.random() < 0.68; v.waveAt = lerp(34, 74, Math.random());
  if (v.sprite) { v.sprite.material = handMat; v.sprite.visible = false; }
  return true;
}
const _t = {};
function updateTraffic(dt) {
  spawnT -= dt;
  if (spawnT <= 0) { const prog = G.state === 'play' ? G.rideTime / RIDE : 0.3; spawnT = spawn() ? lerp(2.0, 4.4, Math.random()) * lerp(1.15, 0.8, prog) : 0.5; }
  for (const v of traffic) {
    if (!v.active) continue;
    v.s = wrapS(v.s - v.speed * dt); v.d = wrapD(v.s - player.s);
    if (v.d < -70) { v.active = false; v.g.visible = false; continue; }
    if (v.type !== 'bike') {
      let lead = null; for (const o of traffic) if (o !== v && o.active && o.type !== 'bike' && o.d < v.d && (!lead || o.d > lead.d)) lead = o;
      const want = lead && v.d - lead.d < (v.len + lead.len) * 0.5 + 13 ? Math.min(v.base, lead.speed * 0.98) : v.base; v.speed = damp(v.speed, want, 2.5, dt);
    }
    roadAt(v.s, v.lat, _t);
    const two = v.type === 'moto' || v.type === 'bike';
    v.leanS = damp(v.leanS, two ? clamp(-Math.atan(_t.k * v.speed * v.speed / 9.81), -0.6, 0.6) : 0, 6, dt);
    v.g.position.set(_t.x, _t.y + 0.04, _t.z); v.g.rotation.set(Math.atan(_t.sl), _t.yaw + Math.PI, v.leanS);
    for (const w of v.wheels) w.rotation.x += v.speed * dt / v.wheelR;
    if (v.type === 'moto') {
      if (v.waves && !v.waving && v.d > 0 && v.d < v.waveAt) { v.waving = true; v.waveStart = clock; }
      v.waveAmt = damp(v.waveAmt, v.waving && v.d > -7 ? 1 : 0, 9, dt);
      poseWave(v.rider, v.waveAmt, clock * 11 + v.phase);
      const sp = v.sprite; sp.visible = v.waveAmt > 0.04 && v.d > -3;
      if (sp.visible) { const b = v.waveAmt * (1.75 + Math.sin(clock * 9) * 0.12) * (v.happy > 0 ? 1.25 : 1) * lerp(1, 2.1, smooth(20, 75, v.d)); sp.scale.set(b, b, 1); }
      if (v.happy > 0) { v.happy -= dt; v.rider.head.rotation.x = -v.rider.torso.rotation.x * 0.8 + Math.max(0, Math.sin(v.happy * 9)) * 0.35; }
      if (v.waving && !v.judged && v.d < -4) { v.judged = true; if (G.state === 'play') ignored(v); }
    } else if (v.type === 'bike') {
      const ph = clock * v.speed * 1.1 + v.phase, lg = v.rider.legs;
      lg.L.hip.rotation.x = -0.95 + Math.sin(ph) * 0.42; lg.L.kn.rotation.x = 1.05 + Math.cos(ph) * 0.5;
      lg.R.hip.rotation.x = -0.95 - Math.sin(ph) * 0.42; lg.R.kn.rotation.x = 1.05 - Math.cos(ph) * 0.5;
    }
    if (!v.passed && v.d < 1.5) { v.passed = true; if (G.state === 'play') Snd.whoosh(v.type); }
  }
}

/* =====================================================================
   HUD CANVASES
   ===================================================================== */
const mm = $('minimap').getContext('2d'), MMS = 380, MSC = 158 / 330;
const mpath = new Path2D(); for (let j = 0; j < NS; j += 3) { const x = MMS / 2 + X[j] * MSC, y = MMS / 2 + Z[j] * MSC; j ? mpath.lineTo(x, y) : mpath.moveTo(x, y); } mpath.closePath();
function drawMinimap() {
  mm.clearRect(0, 0, MMS, MMS);
  const lg = mm.createRadialGradient(MMS / 2, MMS / 2, 10, MMS / 2, MMS / 2, 160); lg.addColorStop(0, 'rgba(120,200,220,0.5)'); lg.addColorStop(1, 'rgba(90,160,190,0.18)');
  mm.fillStyle = lg; mm.fill(mpath);
  mm.lineJoin = 'round'; mm.strokeStyle = 'rgba(20,14,10,0.55)'; mm.lineWidth = 12; mm.stroke(mpath); mm.strokeStyle = 'rgba(247,238,220,0.92)'; mm.lineWidth = 6; mm.stroke(mpath);
  for (const v of traffic) {
    if (!v.active) continue; roadAt(v.s, 0, _t); const x = MMS / 2 + _t.x * MSC, y = MMS / 2 + _t.z * MSC;
    mm.beginPath(); mm.arc(x, y, v.type === 'moto' ? 6 : 5, 0, TAU); mm.fillStyle = v.type === 'moto' ? '#f6bd6a' : 'rgba(60,50,46,0.9)'; mm.fill();
  }
  roadAt(player.s, 0, _t); const x = MMS / 2 + _t.x * MSC, y = MMS / 2 + _t.z * MSC;
  mm.save(); mm.translate(x, y); mm.rotate(Math.atan2(_t.tz, _t.tx) + Math.PI / 2); mm.beginPath(); mm.moveTo(0, -13); mm.lineTo(9, 9); mm.lineTo(0, 4); mm.lineTo(-9, 9); mm.closePath();
  mm.fillStyle = '#9ad9c7'; mm.strokeStyle = '#17130f'; mm.lineWidth = 3; mm.stroke(); mm.fill(); mm.restore();
}
const sp = $('speedo').getContext('2d');
function drawSpeedo(kmh) {
  const S = 380, c = S / 2; sp.clearRect(0, 0, S, S);
  let g = sp.createLinearGradient(0, 0, S, S); g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#9aa0a6'); g.addColorStop(1, '#f0f0f0');
  sp.beginPath(); sp.arc(c, c, 180, 0, TAU); sp.fillStyle = g; sp.fill();
  g = sp.createRadialGradient(c, c - 40, 20, c, c, 170); g.addColorStop(0, '#fbf3e0'); g.addColorStop(1, '#e6d8b8');
  sp.beginPath(); sp.arc(c, c, 164, 0, TAU); sp.fillStyle = g; sp.fill();
  sp.strokeStyle = '#2a211a'; sp.fillStyle = '#2a211a'; sp.textAlign = 'center'; sp.textBaseline = 'middle';
  for (let v = 0; v <= 100; v += 5) {
    const a = (-225 + v / 100 * 270) * Math.PI / 180, big = v % 20 === 0, r0 = big ? 128 : 138;
    sp.lineWidth = big ? 5 : 2; sp.beginPath(); sp.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0); sp.lineTo(c + Math.cos(a) * 152, c + Math.sin(a) * 152); sp.stroke();
    if (big) { sp.font = '800 30px Fraunces,Georgia,serif'; sp.fillText(v, c + Math.cos(a) * 102, c + Math.sin(a) * 102); }
  }
  sp.font = '700 17px "DM Sans",sans-serif'; sp.fillStyle = '#7a6a55'; sp.fillText('km/h', c, c + 62);
  sp.font = 'italic 800 46px Fraunces,Georgia,serif'; sp.fillStyle = '#2a211a'; sp.fillText(Math.round(kmh), c, c + 106);
  const a = (-225 + clamp(kmh, 0, 100) / 100 * 270) * Math.PI / 180;
  sp.save(); sp.translate(c, c); sp.rotate(a); sp.shadowColor = 'rgba(0,0,0,0.35)'; sp.shadowBlur = 8; sp.shadowOffsetY = 3;
  sp.beginPath(); sp.moveTo(-26, -5); sp.lineTo(140, -1.5); sp.lineTo(140, 1.5); sp.lineTo(-26, 5); sp.closePath(); sp.fillStyle = '#d2362c'; sp.fill(); sp.restore();
  sp.beginPath(); sp.arc(c, c, 15, 0, TAU); sp.fillStyle = '#2a211a'; sp.fill(); sp.beginPath(); sp.arc(c, c, 6, 0, TAU); sp.fillStyle = '#c9c9c9'; sp.fill();
}

/* =====================================================================
   MAIN LOOP
   ===================================================================== */
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), tp = new THREE.Vector3(), tl = new THREE.Vector3(), _a = {}, _b = {}, _p = {};
const _sv = new THREE.Vector3(), _fw = new THREE.Vector3();
let camInit = false, frameN = 0;

function update(dt) {
  clock += dt; windU.uTime.value = clock; frameN++;
  // ---- time of day ----
  if (G.state === 'play') {
    G.rideTime += dt; const p = G.rideTime / RIDE; setSun(lerp(12.5, -1.3, Math.pow(p, 0.92)));
    const rem = Math.max(0, RIDE - G.rideTime); HUD.time.textContent = Math.floor(rem / 60) + ':' + String(Math.floor(rem % 60)).padStart(2, '0'); HUD.dot.style.left = (p * 100) + '%';
    if (G.rideTime >= RIDE) endGame();
    if (hintT > 0) { hintT -= dt; if (hintT <= 0) $('hint').style.opacity = 0; }
  } else if (G.state === 'title' && Math.abs(sunElev - 9) > 0.01) setSun(damp(sunElev, 9, 1.5, dt));
  // ---- player ----
  if (G.state === 'play') { if (keys.ArrowUp || keys.KeyW) player.target += 9 * dt; if (keys.ArrowDown || keys.KeyS) player.target -= 12 * dt; player.target = clamp(player.target, 6, 25); }
  else player.target = G.state === 'end' ? 8 : 11;
  player.speed = damp(player.speed, player.target, 1.6, dt); player.s = wrapS(player.s + player.speed * dt);
  roadAt(player.s, player.lat, _p);
  player.leanS = damp(player.leanS, clamp(Math.atan(_p.k * player.speed * player.speed / 9.81), -0.6, 0.6), 5, dt);
  vespa.g.position.set(_p.x, _p.y + 0.04 + Math.sin(clock * 31) * 0.003, _p.z); vespa.g.rotation.set(-Math.atan(_p.sl), _p.yaw, player.leanS);
  for (const w of vespa.wheels) w.rotation.x += player.speed * dt / 0.25;
  G.waveT = Math.max(0, G.waveT - dt); G.waveCD = Math.max(0, G.waveCD - dt);
  G.waveAmt = damp(G.waveAmt, G.waveT > 0.22 ? 1 : 0, 13, dt); poseWave(vespa.rider, G.waveAmt, clock * 13);
  { // scarf
    const pa = vespa.scarf.geometry.attributes.position, b = vespa.scarfBase, f = 0.5 + player.speed / 25;
    for (let i = 0; i < pa.count; i++) { const t = (0.425 - b[i * 3 + 1]) / 0.85; pa.setXYZ(i, b[i * 3] + Math.sin(clock * 15 - t * 7) * 0.09 * t * f, -t * 0.3 * (1.4 - f) + Math.sin(clock * 12 - t * 6) * 0.06 * t * f, -t * 0.82); }
    pa.needsUpdate = true; if (frameN % 3 === 0) vespa.scarf.geometry.computeVertexNormals();
  }
  updateTraffic(dt);
  // ---- light follows the player ----
  sun.target.position.set(_p.x, _p.y, _p.z); sun.position.copy(sun.target.position).addScaledVector(sunDir.y > 0.03 ? sunDir : _sv.copy(sunDir).setY(0.03).normalize(), 260);
  // ---- camera ----
  let k = 5;
  if (G.state === 'play') { const m = CAMS[G.cam]; roadAt(player.s - m.back, player.lat + m.side, _a); tp.set(_a.x, _a.y + m.up, _a.z); roadAt(player.s + m.ahead, player.lat * 0.5, _b); tl.set(_b.x, _b.y + m.lookUp, _b.z); }
  else { const a = clock * 0.11 + 2.4, r = 7.2; tp.set(_p.x + Math.sin(a) * r, _p.y + 1.7 + Math.sin(a * 0.6) * 0.7, _p.z + Math.cos(a) * r); tl.set(_p.x, _p.y + 0.95, _p.z); k = 3; }
  tp.y = Math.max(tp.y, heightAt(tp.x, tp.z) + 1.0);
  if (!camInit) { camPos.copy(tp); camLook.copy(tl); camInit = true; }
  camPos.lerp(tp, 1 - Math.exp(-k * dt)); camLook.lerp(tl, 1 - Math.exp(-k * 1.5 * dt));
  camera.position.copy(camPos); camera.lookAt(camLook); if (G.state === 'play') camera.rotateZ(player.leanS * 0.22);
  const fov = G.state === 'play' ? 55 + player.speed * 0.55 : 42; if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = damp(camera.fov, fov, 3, dt); camera.updateProjectionMatrix(); }
  // ---- ambient life ----
  water.material.uniforms.time.value += dt * 0.45;
  for (const c of clouds) { c.userData.a += dt * 0.0012; c.position.x = Math.cos(c.userData.a) * c.userData.r; c.position.z = Math.sin(c.userData.a) * c.userData.r; }
  for (const b of boats) { const u = b.userData; u.a += u.sp * dt; b.position.set(Math.cos(u.a) * u.r, 0.25 + Math.sin(clock * 1.1 + u.r) * 0.08, Math.sin(u.a) * u.r); b.rotation.set(Math.sin(clock * 0.9 + u.r) * 0.04, Math.atan2(-Math.sin(u.a), Math.cos(u.a)) + (u.sp > 0 ? 0 : Math.PI), 0.12 + Math.sin(clock * 0.7 + u.r) * 0.05); }
  { const a = clock * 0.09, cx = Math.cos(a) * 120, cz = Math.sin(a) * 120, yaw = Math.atan2(-Math.sin(a), Math.cos(a));
    for (const b of birds) { const u = b.userData, fl = Math.sin(clock * 7 + u.ph) * 0.7; b.position.set(cx + u.off.x, 34 + u.off.y + Math.sin(clock * 0.5 + u.ph) * 2, cz + u.off.z); b.rotation.y = yaw; u.l.rotation.z = fl; u.r.rotation.z = -fl; } }
  { const pa = pollenGeo.attributes.position, cp = camera.position;
    for (let i = 0; i < POLLEN; i++) { const bx = pollenBase[i * 3] + Math.sin(clock * 0.4 + i) * 0.6 + clock * 0.5, by = pollenBase[i * 3 + 1] + Math.sin(clock * 0.6 + i * 1.7) * 0.4, bz = pollenBase[i * 3 + 2] + Math.cos(clock * 0.35 + i) * 0.6;
      pa.setXYZ(i, cp.x + (((bx - cp.x) % 36) + 36) % 36 - 18, cp.y + (((by - cp.y) % 36) + 36) % 36 - 18, cp.z + (((bz - cp.z) % 36) + 36) % 36 - 18); }
    pa.needsUpdate = true; }
  // ---- lens flare ----
  camera.getWorldDirection(_fw); let vis = 0;
  if (_fw.dot(sunDir) > 0.2 && sunElev > -0.6) {
    _sv.copy(camera.position).addScaledVector(sunDir, 1000).project(camera); grade.uniforms.sunUv.value.set(_sv.x * 0.5 + 0.5, _sv.y * 0.5 + 0.5);
    vis = (Math.abs(_sv.x) < 1.25 && Math.abs(_sv.y) < 1.25) ? 1 : 0;
    if (vis) for (let i = 1; i <= 30; i++) { const t = i * i * 1.5; const px = camera.position.x + sunDir.x * t, py = camera.position.y + sunDir.y * t, pz = camera.position.z + sunDir.z * t; if (py < heightAt(px, pz)) { vis = 0; break; } }
    vis *= smooth(-0.6, 2.5, sunElev);
  }
  sunVis = damp(sunVis, vis, 7, dt); grade.uniforms.sunVis.value = sunVis; grade.uniforms.time.value = clock;
  // ---- sound & HUD ----
  Snd.engine(player.speed, G.state === 'play');
  bellCD -= dt; if (bellCD < 0 && G.state === 'play') { const c = cows[frameN % cows.length]; if (c && (c.x - _p.x) ** 2 + (c.z - _p.z) ** 2 < 900) { Snd.bell(); bellCD = 1.6 + Math.random() * 2; } }
  if (G.state === 'play') { drawSpeedo(player.speed * 3.6); if (frameN % 2 === 0) drawMinimap(); }
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const raw = (now - last) / 1000, dt = Math.min(0.05, raw); last = now; perfTick(raw);
  if (!G.paused) update(dt);
  renderer.shadowMap.needsUpdate = true;
  composer.render();
}

// warm up shaders with everything visible, then hide the pool again
for (const v of traffic) v.g.visible = true;
update(0.016); renderer.compile(scene, camera);
for (const v of traffic) v.g.visible = false;
window.__game = { G, player, traffic, tryWave, startGame, endGame, setSun, renderer, scene, camera, composer, L, step: (n, dt = 1 / 60) => { for (let i = 0; i < n; i++) update(dt); } };
requestAnimationFrame(frame);
$('loading').classList.add('off'); $('title').classList.remove('off');
