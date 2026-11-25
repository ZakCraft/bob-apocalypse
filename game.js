'use strict';
/* ===================== BOB APOCALYPSE ===================== */
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
function angDiff(a, b) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }
function turnToward(a, b, rate) { return a + clamp(angDiff(a, b), -rate, rate); }

/* ---------- renderer / scene ---------- */
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
{ // sunset sky gradient
  const c = document.createElement('canvas'); c.width = 8; c.height = 256;
  const x = c.getContext('2d'), gr = x.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#2a1228'); gr.addColorStop(0.45, '#8a3a3a'); gr.addColorStop(0.8, '#e0703a'); gr.addColorStop(1, '#f0a050');
  x.fillStyle = gr; x.fillRect(0, 0, 8, 256);
  scene.background = new THREE.CanvasTexture(c);
}
function noiseTex(base, spread, repeat) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'); x.fillStyle = base; x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 1800; i++) {
    const v = Math.floor(Math.random() * spread * 2 - spread);
    x.fillStyle = v > 0 ? 'rgba(255,255,255,' + (v / 255) + ')' : 'rgba(0,0,0,' + (-v / 255) + ')';
    x.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat);
  t.anisotropy = 4; return t;
}
scene.fog = new THREE.Fog(0xc4572f, 35, 115);
const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 300);

scene.add(new THREE.HemisphereLight(0xffc9a0, 0x3a2418, 0.95));
const sun = new THREE.DirectionalLight(0xffa060, 1.1);
sun.position.set(-30, 45, 25);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -50, right: 50, top: 50, bottom: -50, near: 1, far: 150 });
sun.shadow.camera.updateProjectionMatrix();
scene.add(sun);

const redSun = new THREE.Mesh(new THREE.SphereGeometry(16, 24, 16), new THREE.MeshBasicMaterial({ color: 0xff3a10, fog: false }));
redSun.position.set(-70, 38, -130);
scene.add(redSun);

/* ---------- world ---------- */
const BOUND = 38;
const obstacles = [];
const addBox = (x, z, hw, hd) => obstacles.push({ x, z, hw, hd });
function pushOut(p, r) {
  for (const o of obstacles) {
    const dx = p.x - o.x, dz = p.z - o.z;
    const px = o.hw + r - Math.abs(dx), pz = o.hd + r - Math.abs(dz);
    if (px > 0 && pz > 0) {
      if (px < pz) p.x += (dx < 0 ? -1 : 1) * px; else p.z += (dz < 0 ? -1 : 1) * pz;
    }
  }
  p.x = clamp(p.x, -BOUND, BOUND);
  p.z = clamp(p.z, -BOUND, BOUND);
}
const std = (c, extra) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.9 }, extra || {}));
function mesh(geo, mat, x, y, z, parent, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow; m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}

// ground + roads
const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), new THREE.MeshStandardMaterial({ map: noiseTex('#4a5a2c', 60, 50), roughness: 1 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const roadMat = new THREE.MeshStandardMaterial({ map: noiseTex('#2b2b2e', 40, 12), roughness: 0.95 });
for (const [w, d] of [[100, 9], [9, 100]]) {
  const r = new THREE.Mesh(new THREE.PlaneGeometry(w, d), roadMat);
  r.rotation.x = -Math.PI / 2; r.position.y = 0.02; r.receiveShadow = true; scene.add(r);
}
const dashMat = new THREE.MeshBasicMaterial({ color: 0xe8c840 });
for (let i = -46; i <= 46; i += 6) {
  if (Math.abs(i) < 6) continue;
  for (const [w, d, x, z] of [[2.5, 0.25, i, 0], [0.25, 2.5, 0, i]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), dashMat);
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.04, z); scene.add(m);
  }
}
// plaza in the middle
const plaza = new THREE.Mesh(new THREE.CircleGeometry(9, 40), std(0x6a6a70));
plaza.rotation.x = -Math.PI / 2; plaza.position.y = 0.05; plaza.receiveShadow = true; scene.add(plaza);

// buildings
function building(x, z, w, d, h, c, rc) {
  const g = new THREE.Group();
  mesh(new THREE.BoxGeometry(w, h, d), std(c), 0, h / 2, 0, g);
  { // gable roof
    const rh = Math.min(w, d) * 0.4, hw = w / 2 + 0.5;
    const sh = new THREE.Shape(); sh.moveTo(-hw, 0); sh.lineTo(hw, 0); sh.lineTo(0, rh); sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, { depth: d + 1, bevelEnabled: false }); geo.translate(0, 0, -(d + 1) / 2);
    mesh(geo, std(rc), 0, h, 0, g);
    mesh(new THREE.CylinderGeometry(0.45, 0.5, 2, 12), std(0x6a4a42), w * 0.25, h + rh * 0.6 + 0.6, d * 0.2, g);
  }
  for (const s of [1, -1]) {
    const cols = Math.max(1, Math.floor(w / 3.2));
    for (let i = 0; i < cols; i++) {
      for (let row = 0; row < Math.floor(h / 3.2); row++) {
        const lit = Math.random() < 0.35;
        const wx = (i - (cols - 1) / 2) * 3.2;
        mesh(new THREE.BoxGeometry(1.2, 1.4, 0.15), new THREE.MeshBasicMaterial({ color: lit ? 0xffcc66 : 0x1c1c22 }), wx, 2.6 + row * 3, s * (d / 2 + 0.05), g, false);
      }
    }
  }
  mesh(new THREE.BoxGeometry(1.5, 2.3, 0.2), std(0x4a2d1a), 0, 1.15, d / 2 + 0.08, g, false);
  g.position.set(x, 0, z);
  scene.add(g);
  addBox(x, z, w / 2, d / 2);
}
[
  [-18, -18, 10, 9, 7, 0xc9a27e, 0x7a2e22], [16, -20, 12, 8, 9, 0x8fa3b5, 0x40454f],
  [-20, 19, 9, 10, 6, 0xd6c28a, 0x5b3a29], [19, 18, 11, 9, 8, 0xb98a8a, 0x3b3b3b],
  [-32, -31, 8, 8, 6, 0x9bb08a, 0x4a3a2a], [32, -9, 7, 9, 6, 0xc7b299, 0x6b2c2c],
  [-33, 12, 7, 9, 7, 0xa5a5c8, 0x383848], [0, -33, 10, 6, 8, 0xd49a6a, 0x5a3020],
  [6, 33, 9, 6, 7, 0xb8c6a0, 0x3d4a35], [33, 32, 6, 6, 6, 0xd8c0a0, 0x70402a],
].forEach(b => building(...b));

// trees
function tree(x, z) {
  const g = new THREE.Group();
  const dead = Math.random() < 0.5;
  mesh(new THREE.CylinderGeometry(0.25, 0.4, 3, 12), std(0x4a3320), 0, 1.5, 0, g);
  if (!dead) {
    for (const [cx, cy, cz, r, col] of [[0, 4.2, 0, 1.7, 0x2f5a28], [0.9, 3.7, 0.3, 1.2, 0x3a6a30], [-0.8, 3.8, -0.4, 1.3, 0x2a5224], [0.1, 5.4, 0, 1.2, 0x3a6a30]])
      mesh(new THREE.SphereGeometry(r, 14, 10), std(col), cx, cy, cz, g);
  } else {
    mesh(new THREE.CylinderGeometry(0.08, 0.15, 2, 8), std(0x3a2a1a), 0.7, 3.3, 0, g).rotation.z = -0.7;
    mesh(new THREE.CylinderGeometry(0.08, 0.15, 1.8, 8), std(0x3a2a1a), -0.6, 3.2, 0, g).rotation.z = 0.8;
  }
  g.position.set(x, 0, z); scene.add(g);
  addBox(x, z, 0.5, 0.5);
}
for (let n = 0, placed = 0; placed < 22 && n < 400; n++) {
  const x = rand(-BOUND + 2, BOUND - 2), z = rand(-BOUND + 2, BOUND - 2);
  if (Math.abs(x) < 7 || Math.abs(z) < 7 || Math.hypot(x, z) < 13) continue;
  if (obstacles.some(o => Math.abs(x - o.x) < o.hw + 3 && Math.abs(z - o.z) < o.hd + 3)) continue;
  tree(x, z); placed++;
}

// wrecked cars (burning)
const fires = [];
function car(x, z, c, rotated) {
  const g = new THREE.Group();
  mesh(new THREE.SphereGeometry(1, 20, 14), std(c, { roughness: 0.35, metalness: 0.4 }), 0, 0.85, 0, g).scale.set(2.2, 0.55, 1);
  mesh(new THREE.SphereGeometry(1, 20, 14), std(0x222a33, { roughness: 0.2, metalness: 0.5 }), -0.2, 1.45, 0, g).scale.set(1.2, 0.5, 0.88);
  for (const sx of [-1.4, 1.4]) for (const sz of [-1, 1]) {
    const w = mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.35, 12), std(0x111111), sx, 0.45, sz, g);
    w.rotation.x = Math.PI / 2;
  }
  const f = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.8, 6), new THREE.MeshBasicMaterial({ color: 0xff7a1a }));
  f.position.set(1.0, 2.0, 0); g.add(f); fires.push(f);
  g.position.set(x, 0, z);
  if (rotated) g.rotation.y = Math.PI / 2;
  scene.add(g);
  rotated ? addBox(x, z, 1.1, 2.2) : addBox(x, z, 2.2, 1.1);
}
car(11, -11, 0xb22222, false); car(-13, 9, 0x2a5aa0, true); car(14, 12, 0x888888, false); car(-10, -13, 0xd8b020, true);

// lamp posts + fence
for (const x of [-12, 12]) for (const z of [-5.5, 5.5]) {
  const g = new THREE.Group();
  mesh(new THREE.CylinderGeometry(0.1, 0.12, 5, 6), std(0x333333), 0, 2.5, 0, g);
  mesh(new THREE.SphereGeometry(0.35, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffe2a0 }), 0, 5.1, 0, g, false);
  g.position.set(x, 0, z); scene.add(g);
}
const fenceMat = std(0x5a4632);
for (const s of [-1, 1]) {
  mesh(new THREE.BoxGeometry(BOUND * 2 + 4, 0.2, 0.2), fenceMat, 0, 1.3, s * (BOUND + 1.5), scene);
  mesh(new THREE.BoxGeometry(BOUND * 2 + 4, 0.2, 0.2), fenceMat, 0, 0.7, s * (BOUND + 1.5), scene);
  mesh(new THREE.BoxGeometry(0.2, 0.2, BOUND * 2 + 4), fenceMat, s * (BOUND + 1.5), 1.3, 0, scene);
  mesh(new THREE.BoxGeometry(0.2, 0.2, BOUND * 2 + 4), fenceMat, s * (BOUND + 1.5), 0.7, 0, scene);
}
for (let i = -BOUND - 1; i <= BOUND + 1; i += 4) for (const s of [-1, 1]) {
  mesh(new THREE.BoxGeometry(0.3, 1.6, 0.3), fenceMat, i, 0.8, s * (BOUND + 1.5), scene);
  mesh(new THREE.BoxGeometry(0.3, 1.6, 0.3), fenceMat, s * (BOUND + 1.5), 0.8, i, scene);
}

// embers
const EMB = 350;
const embGeo = new THREE.BufferGeometry();
const embPos = new Float32Array(EMB * 3);
for (let i = 0; i < EMB; i++) { embPos[i * 3] = rand(-60, 60); embPos[i * 3 + 1] = rand(0, 30); embPos[i * 3 + 2] = rand(-60, 60); }
embGeo.setAttribute('position', new THREE.BufferAttribute(embPos, 3));
const embers = new THREE.Points(embGeo, new THREE.PointsMaterial({ color: 0xffa040, size: 0.25, fog: false }));
scene.add(embers);

/* ---------- fighters ---------- */
function capsuleGeo(r, len, seg = 16) {
  const pts = [], h = len / 2;
  for (let i = 0; i <= 8; i++) { const a = -Math.PI / 2 + i / 8 * Math.PI / 2; pts.push(new THREE.Vector2(Math.max(0.0001, Math.cos(a) * r), -h + Math.sin(a) * r)); }
  for (let i = 0; i <= 8; i++) { const a = i / 8 * Math.PI / 2; pts.push(new THREE.Vector2(Math.max(0.0001, Math.cos(a) * r), h + Math.sin(a) * r)); }
  return new THREE.LatheGeometry(pts, seg);
}
function makeFighter(o) {
  const g = new THREE.Group();
  g.rotation.order = 'YXZ';
  const inner = new THREE.Group(); g.add(inner);
  const sm = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.65, metalness: 0.0 });
  const skin = sm(o.skin), shirt = sm(o.shirt), pants = sm(o.pants);
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 });
  const shoe = sm(0x1a1a1a);
  const sph = (r, m, x, y, z, p, sx = 1, sy = 1, sz = 1) => {
    const me = mesh(new THREE.SphereGeometry(r, 18, 14), m, x, y, z, p || inner);
    me.scale.set(sx, sy, sz); return me;
  };
  const cap = (r, len, m, x, y, z, p, sx = 1, sz = 1) => {
    const me = mesh(capsuleGeo(r, len), m, x, y, z, p || inner); me.scale.set(sx, 1, sz); return me;
  };
  // torso + hips (rounded)
  cap(0.33, 0.32, shirt, 0, 1.3, 0, inner, 1.12, 0.78);
  sph(0.3, pants, 0, 0.92, 0, inner, 1.1, 0.7, 0.8);
  // neck + head
  cap(0.1, 0.1, skin, 0, 1.78, 0);
  const head = sph(0.3, skin, 0, 2.07, 0, inner, 1, 1.06, 1);
  // ears + nose
  sph(0.07, skin, -0.29, 2.06, 0, inner, 0.5, 1, 1); sph(0.07, skin, 0.29, 2.06, 0, inner, 0.5, 1, 1);
  sph(0.055, skin, 0, 2.03, 0.3, inner, 1, 1, 1);
  // eyes
  for (const s of [-1, 1]) {
    sph(0.075, white, s * 0.115, 2.12, 0.25, inner, 1, 1.1, 0.6);
    sph(0.04, dark, s * 0.115, 2.12, 0.3, inner, 1, 1, 0.6);
  }
  if (o.angry) {
    for (const s of [-1, 1]) {
      const b = cap(0.022, 0.12, dark, s * 0.12, 2.22, 0.27); b.rotation.z = Math.PI / 2 + s * 0.45;
    }
    sph(0.1, dark, 0, 1.96, 0.26, inner, 1, 0.3, 0.4);       // grumpy mouth
    sph(0.07, skin, 0, 2.38, 0, inner);                        // lone hair tuft
  } else {
    sph(0.09, dark, 0, 1.97, 0.26, inner, 1, 0.25, 0.4);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.315, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), sm(0x2a1a10));
    hair.position.set(0, 2.1, -0.02); hair.castShadow = true; inner.add(hair);
    const band = mesh(new THREE.TorusGeometry(0.31, 0.04, 8, 24), sm(0xdd2222), 0, 2.2, 0, inner);
    band.rotation.x = Math.PI / 2;
  }
  const leg = x => {
    const p = new THREE.Group(); p.position.set(x, 0.9, 0); inner.add(p);
    cap(0.15, 0.55, pants, 0, -0.45, 0, p);
    sph(0.17, shoe, 0, -0.82, 0.07, p, 1, 0.62, 1.55);
    return p;
  };
  const arm = x => {
    const p = new THREE.Group(); p.position.set(x, 1.62, 0); inner.add(p);
    sph(0.16, shirt, 0, 0, 0, p);
    cap(0.105, 0.5, skin, 0, -0.38, 0, p);
    sph(0.15, skin, 0, -0.82, 0.02, p);
    return p;
  };
  const f = { g, inner, head, legL: leg(-0.2), legR: leg(0.2), armL: arm(-0.5), armR: arm(0.5), mats: [skin, shirt, pants], phase: 0 };
  g.scale.setScalar(o.scale || 1);
  scene.add(g);
  return f;
}
function flash(f, on) { for (const m of f.mats) m.emissive.setHex(on ? 0xff2200 : 0x000000); }

const labelCache = {};
function labelSprite(text, color) {
  if (!labelCache[text]) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const x = c.getContext('2d');
    x.font = 'bold 44px Impact, Arial Black, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 8; x.strokeStyle = '#000'; x.strokeText(text, 128, 34);
    x.fillStyle = color; x.fillText(text, 128, 34);
    labelCache[text] = new THREE.CanvasTexture(c);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelCache[text], depthTest: false, transparent: true }));
  s.scale.set(2.4, 0.6, 1); s.renderOrder = 10;
  return s;
}
function healthBar() {
  const grp = new THREE.Group();
  const bgGeo = new THREE.PlaneGeometry(1.4, 0.16);
  const bg = new THREE.Mesh(bgGeo, new THREE.MeshBasicMaterial({ color: 0x000000, depthTest: false, transparent: true }));
  const fgGeo = new THREE.PlaneGeometry(1.34, 0.1); fgGeo.translate(0.67, 0, 0);
  const fg = new THREE.Mesh(fgGeo, new THREE.MeshBasicMaterial({ color: 0xff3030, depthTest: false, transparent: true }));
  fg.position.set(-0.67, 0, 0.01); bg.renderOrder = 10; fg.renderOrder = 11;
  grp.add(bg, fg); grp.fg = fg;
  return grp;
}

/* ---------- audio ---------- */
let AC = null;
function sfx(f, d = 0.1, type = 'square', v = 0.07, slide = 0) {
  if (!AC) return;
  const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d);
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
  o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + d);
}
const S = {
  swing: () => sfx(300, 0.1, 'sawtooth', 0.04, -150),
  hit: () => { sfx(160, 0.14, 'square', 0.1, -100); sfx(90, 0.12, 'sawtooth', 0.08, -40); },
  heavy: () => { sfx(110, 0.25, 'square', 0.14, -70); sfx(60, 0.3, 'sawtooth', 0.12, -20); },
  hurt: () => sfx(220, 0.3, 'sawtooth', 0.12, -160),
  block: () => sfx(700, 0.08, 'triangle', 0.08, -300),
  die: () => sfx(260, 0.4, 'square', 0.08, -220),
  pick: () => { sfx(520, 0.1, 'triangle', 0.08); setTimeout(() => sfx(780, 0.14, 'triangle', 0.08), 90); },
  wave: () => { sfx(180, 0.5, 'sawtooth', 0.1, 120); },
};

/* ---------- particles ---------- */
const parts = [];
const partGeo = new THREE.SphereGeometry(0.1, 6, 5);
for (let i = 0; i < 90; i++) {
  const m = new THREE.Mesh(partGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
  m.visible = false; scene.add(m);
  parts.push({ m, v: new THREE.Vector3(), life: 0 });
}
let partIdx = 0;
function burst(pos, color, n, spd) {
  for (let i = 0; i < n; i++) {
    const p = parts[partIdx++ % parts.length];
    p.m.visible = true; p.m.material.color.setHex(color); p.m.position.copy(pos);
    p.v.set(rand(-1, 1), rand(0.3, 1.4), rand(-1, 1)).multiplyScalar(spd);
    p.life = rand(0.35, 0.7);
  }
}

/* ---------- game state ---------- */
const G = { state: 'menu', wave: 0, score: 0, kills: 0, queue: [], spawnT: 0, waveWait: 0, shake: 0, combo: 0, comboT: 0, time: 0, bannerT: 0, menuAng: 0 };
const keys = {};
let yaw = Math.PI * 0.25, pitch = 0.35;
const enemies = [], packs = [];

const player = { fighter: null, weapon: 0, tool: null, toolCd: 0, throwT: 0, buffs: { rage: 0, speed: 0, shield: 0 }, hp: 100, max: 100, vel: new THREE.Vector3(), vy: 0, face: 0, atk: null, alt: 0, inv: 0, block: false, dead: false, flashT: 0, grounded: true };
player.fighter = makeFighter({ skin: 0xf0c090, shirt: 0x2f6fe0, pants: 0x1c2a55, scale: 1 });
const shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(1.5, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffd030, transparent: true, opacity: 0.28, depthWrite: false }));
shieldMesh.position.y = 1.2; shieldMesh.visible = false; player.fighter.g.add(shieldMesh);
const weaponGroup = new THREE.Group();
weaponGroup.position.set(0, 0, 0.03);
player.fighter.armR.add(weaponGroup);

const TYPES = {
  bob:   { name: 'BOB',        hp: 40,  spd: 3.2, dmg: 8,  scale: 1.0, score: 100,  windup: 0.55, col: '#ffffff' },
  fast:  { name: 'SPEEDY BOB', hp: 25,  spd: 5.4, dmg: 5,  scale: 0.9, score: 150,  windup: 0.35, col: '#7affff' },
  flyer: { name: 'FLYING BOB', hp: 35,  spd: 4.5, dmg: 10, scale: 0.95, score: 200, windup: 0.6, col: '#d0b0ff', flying: true },
  big:   { name: 'BIG BOB',    hp: 130, spd: 2.2, dmg: 18, scale: 1.5, score: 300,  windup: 0.85, col: '#ffb060' },
  boss:  { name: 'MEGA BOB',   hp: 480, spd: 2.9, dmg: 26, scale: 2.3, score: 2000, windup: 0.8,  col: '#ff4040' },
};
const SHIRTS = [0xd8321a, 0xe8b020, 0x3aa84a, 0x9a4ad0, 0xe87a1a, 0x20b0b0, 0xd0d0d0];

function addWings(f) {
  f.wings = [];
  const mat = new THREE.MeshStandardMaterial({ color: 0xe8e0ff, roughness: 0.5, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
  for (const s of [-1, 1]) {
    const piv = new THREE.Group(); piv.position.set(s * 0.2, 1.6, -0.28); f.inner.add(piv);
    const w = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8), mat);
    w.scale.set(1.1, 0.06, 0.55); w.position.set(s * 1.05, 0.25, -0.1); piv.add(w);
    f.wings.push(piv);
  }
}
// Flying Bob: circles overhead, telegraphs, then dive-bombs in a straight line (sidestep it!)
function flyerAI(e, dt, dx, dz, dist, nx, nz, pp, o) {
  const pos = e.f.g.position;
  e.st += dt;
  if (!['hover', 'dive', 'climb'].includes(e.state)) { e.state = 'hover'; e.st = 0; e.dur = rand(1.0, 2.0); }
  if (e.state === 'hover') {
    e.face = turnToward(e.face, Math.atan2(nx, nz), 8 * dt);
    if (!e.dur) e.dur = rand(1.2, 2.6);
    const a = Math.atan2(pos.z - pp.z, pos.x - pp.x) + e.strafe * 1.1 * dt;
    const tx = pp.x + Math.cos(a) * 6, tz = pp.z + Math.sin(a) * 6;
    const mx = tx - pos.x, mz = tz - pos.z, md = Math.hypot(mx, mz) || 1, sp = Math.min(e.t.spd, md * 3);
    pos.x += mx / md * sp * dt; pos.z += mz / md * sp * dt;
    pos.y += (2.2 + Math.sin(G.time * 3 + e.strafe) * 0.3 - pos.y) * Math.min(1, 4 * dt);
    if (e.st > e.dur - 0.45) o.windup = Math.min(1, (e.st - (e.dur - 0.45)) / 0.45);
    if (e.st >= e.dur) { e.state = 'dive'; e.st = 0; e.hitDone = false; e.dvx = nx; e.dvz = nz; sfx(700, 0.3, 'sawtooth', 0.07, -400); }
  } else if (e.state === 'dive') {
    e.face = Math.atan2(e.dvx, e.dvz);
    o.strike = 0.6;
    pos.x += e.dvx * 13 * dt; pos.z += e.dvz * 13 * dt;
    pos.y += (0.3 - pos.y) * Math.min(1, 7 * dt);
    if (!e.hitDone && dist < 1.7 && pp.y < 1.6 && pos.y < 1.8) { e.hitDone = true; hurtPlayer(e.t.dmg, pos); }
    if (e.st > 0.85) { e.state = 'climb'; e.st = 0; }
  } else {
    o.windup = 0.3;
    pos.y = Math.min(2.4, pos.y + 5 * dt);
    pos.x += e.dvx * 3 * dt; pos.z += e.dvz * 3 * dt;
    if (e.st > 0.7) { e.state = 'hover'; e.st = 0; e.dur = rand(1.5, 2.8); }
  }
  pos.x = clamp(pos.x, -BOUND, BOUND); pos.z = clamp(pos.z, -BOUND, BOUND);
}

function spawnEnemy(typeKey) {
  const t = TYPES[typeKey];
  const f = makeFighter({ skin: typeKey === 'boss' ? 0xc07050 : 0xe8b888, shirt: t.flying ? 0x7a3ad0 : typeKey === 'boss' ? 0x601010 : SHIRTS[Math.floor(Math.random() * SHIRTS.length)], pants: 0x3a3a48, scale: t.scale, angry: true });
  const a = rand(0, Math.PI * 2), r = rand(28, 36);
  f.g.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
  if (t.flying) addWings(f);
  const radius = 0.5 * t.scale;
  pushOut(f.g.position, radius);
  if (t.flying) f.g.position.y = 2.2;
  const bar = healthBar(), label = labelSprite(t.name, t.col);
  scene.add(bar); scene.add(label);
  const e = { t, f, hp: t.hp, max: t.hp, vel: new THREE.Vector3(), stun: 0, state: t.flying ? 'hover' : 'chase', st: 0, dur: 0, face: 0, radius, reach: 1.3 + 0.55 * t.scale, bar, label, dead: false, deadT: 0, hitDone: false, strafe: Math.random() < 0.5 ? 1 : -1, flashT: 0 };
  e.face = Math.atan2(-f.g.position.x, -f.g.position.z);
  enemies.push(e);
  burst(f.g.position.clone().setY(1), 0xffaa40, 10, 3);
}
/* ---------- powerups ---------- */
const POWER = {
  heal:   { color: 0x40ff60, tag: 'HEAL',   text: '+40 HEALTH',          w: 30 },
  rage:   { color: 0xff3030, tag: 'RAGE',   text: 'RAGE! DOUBLE DAMAGE', w: 20, dur: 10 },
  speed:  { color: 0x30c0ff, tag: 'TURBO',  text: 'TURBO! SUPER SPEED',  w: 20, dur: 10 },
  shield: { color: 0xffd030, tag: 'SHIELD', text: 'SHIELD! INVINCIBLE',  w: 15, dur: 7 },
  nuke:   { color: 0xff8020, tag: 'BOOM',   text: 'SHOCKWAVE!',          w: 10 },
  upgrade:{ color: 0xffdd33, tag: 'UPGRADE', w: 0, get text() { return player.weapon >= WEAPONS.length - 1 ? 'MAX WEAPON! +50 HEALTH' : 'NEW WEAPON: ' + WEAPONS[player.weapon].name; } },
};
const shocks = [];

/* ---------- tools ---------- */
const TOOLS = {
  brick:   { color: 0xd05040, tag: 'BRICKS',   text: 'BRICKS! PRESS F TO THROW',     uses: 10 },
  grenade: { color: 0x60d060, tag: 'GRENADES', text: 'GRENADES! PRESS F TO THROW',   uses: 3 },
  taser:   { color: 0x60c8ff, tag: 'STUN GUN', text: 'STUN GUN! PRESS F TO ZAP',     uses: 5 },
};
const TOOL_KEYS = Object.keys(TOOLS);

/* ---------- melee weapons (start with the bat, upgrade up the list) ---------- */
const WEAPONS = [
  { name: 'BASEBALL BAT', dur: 0.5,  hitAt: 0.2,  dmg: 28, range: 3.4, kb: 15, stun: 0.55 },
  { name: 'KATANA',       dur: 0.38, hitAt: 0.14, dmg: 36, range: 3.9, kb: 10, stun: 0.4,  cone: 0.0 },
  { name: 'BATTLE AXE',   dur: 0.6,  hitAt: 0.26, dmg: 75, range: 3.7, kb: 20, stun: 0.7,  cone: 0.0 },
  { name: 'CHAINSAW',     dur: 0.26, hitAt: 0.1,  dmg: 38, range: 3.2, kb: 7,  stun: 0.3,  cone: 0.0 },
  { name: 'ENERGY SWORD', dur: 0.34, hitAt: 0.12, dmg: 70, range: 4.8, kb: 14, stun: 0.5,  cone: -0.2 },
];
function setWeapon(i) {
  player.weapon = i;
  while (weaponGroup.children.length) weaponGroup.remove(weaponGroup.children[0]);
  const add = (geo, mat, x, y, z, shadow = true) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = shadow; weaponGroup.add(m); return m;
  };
  const steel = new THREE.MeshStandardMaterial({ color: 0xdfe6ee, roughness: 0.2, metalness: 0.9 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd8b040, roughness: 0.3, metalness: 0.8 });
  const dk = new THREE.MeshStandardMaterial({ color: 0x2a2220, roughness: 0.6 });
  if (i === 0) {
    add(capsuleGeo(0.06, 0.9), std(0xb07a3a), 0, -1.22, 0);
  } else if (i === 1) {
    add(new THREE.CylinderGeometry(0.04, 0.04, 0.32, 10), std(0x8a1a1a), 0, -0.9, 0);
    add(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 14), gold, 0, -1.07, 0);
    add(new THREE.BoxGeometry(0.035, 1.15, 0.11), steel, 0, -1.65, 0);
  } else if (i === 2) {
    add(new THREE.CylinderGeometry(0.045, 0.045, 1.3, 10), std(0x8a5a2a), 0, -1.35, 0);
    add(new THREE.BoxGeometry(0.07, 0.5, 0.55), steel, 0, -1.95, 0.22);
    add(new THREE.ConeGeometry(0.07, 0.3, 8), steel, 0, -2.18, 0);
  } else if (i === 3) {
    add(new THREE.BoxGeometry(0.24, 0.42, 0.3), std(0xe87a1a), 0, -1.0, 0.02);
    add(new THREE.BoxGeometry(0.07, 0.85, 0.17), dk, 0, -1.62, 0.02);
    add(new THREE.BoxGeometry(0.08, 0.85, 0.05), steel, 0, -1.62, 0.02);
  } else {
    add(new THREE.CylinderGeometry(0.045, 0.05, 0.34, 10), dk, 0, -0.92, 0);
    add(capsuleGeo(0.045, 1.3), new THREE.MeshBasicMaterial({ color: 0x7ff8ff }), 0, -1.9, 0, false);
    add(capsuleGeo(0.1, 1.3), new THREE.MeshBasicMaterial({ color: 0x30c0ff, transparent: true, opacity: 0.3, depthWrite: false }), 0, -1.9, 0, false);
  }
}
function upgradeWeapon() {
  if (player.weapon < WEAPONS.length - 1) setWeapon(player.weapon + 1);
  else player.hp = Math.min(player.max, player.hp + 50);
}
const projectiles = [];
function pickDrop() { return Math.random() < 0.3 ? TOOL_KEYS[Math.floor(Math.random() * TOOL_KEYS.length)] : pickPower(); }
function aimDir() { // camera forward, snapped to a Bob near the crosshair
  let dx = -Math.sin(yaw), dz = -Math.cos(yaw), best = null, ba = 0.4;
  const pp = player.fighter.g.position;
  for (const e of enemies) {
    if (e.dead) continue;
    const ex = e.f.g.position.x - pp.x, ez = e.f.g.position.z - pp.z, d = Math.hypot(ex, ez);
    if (d < 1 || d > 25) continue;
    const ang = Math.acos(clamp((ex * dx + ez * dz) / d, -1, 1));
    if (ang < ba) { ba = ang; best = [ex / d, ez / d]; }
  }
  return best || [dx, dz];
}
function useTool() {
  const T = player.tool;
  if (!T || T.type === 'bat' || player.dead || player.toolCd > 0 || G.state !== 'play') return;
  const [dx, dz] = aimDir(), pp = player.fighter.g.position;
  player.face = Math.atan2(dx, dz); player.throwT = 0.25; player.toolCd = 0.35;
  if (T.type === 'taser') {
    player.toolCd = 0.7;
    sfx(900, 0.25, 'sawtooth', 0.08, -600);
    for (let i = 1; i <= 6; i++) burst(new THREE.Vector3(pp.x + dx * i * 1.2, 1.4, pp.z + dz * i * 1.2), 0x80d8ff, 2, 2);
    for (const e of enemies) {
      if (e.dead) continue;
      const ex = e.f.g.position.x - pp.x, ez = e.f.g.position.z - pp.z, d = Math.hypot(ex, ez);
      if (d < 8 && (ex * dx + ez * dz) / (d || 1) > 0.55) {
        damageEnemy(e, 8, ex / (d || 1), ez / (d || 1), 0, 0.1);
        if (!e.dead) { e.stun = e.t.scale > 2 ? 1.2 : 3; e.vel.set(0, 0, 0); burst(e.f.g.position.clone().setY(1.5 * e.t.scale), 0x80d8ff, 14, 4); }
      }
    }
  } else {
    const brick = T.type === 'brick';
    const m = brick
      ? new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.2, 0.18), new THREE.MeshStandardMaterial({ color: 0xa04030, roughness: 0.9 }))
      : new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), new THREE.MeshStandardMaterial({ color: 0x3a6a30, roughness: 0.5 }));
    m.castShadow = true; m.position.set(pp.x + dx * 0.8, pp.y + 1.6, pp.z + dz * 0.8); scene.add(m);
    projectiles.push({ m, type: T.type, t: 0, v: new THREE.Vector3(dx * (brick ? 22 : 13), brick ? 3 : 7, dz * (brick ? 22 : 13)) });
    S.swing();
  }
  if (--T.uses <= 0) { player.tool = null; toast('OUT OF ' + TOOLS[T.type].tag, 0xcccccc); }
}
function explode(pos) {
  for (const e of enemies) {
    if (e.dead) continue;
    const dx = e.f.g.position.x - pos.x, dz = e.f.g.position.z - pos.z, d = Math.hypot(dx, dz);
    if (d < 6.5) damageEnemy(e, 45, dx / (d || 1), dz / (d || 1), 14, 0.6);
  }
  burst(pos.clone().setY(1), 0xffa030, 30, 7); burst(pos.clone().setY(1), 0x444444, 12, 4);
  G.shake = Math.max(G.shake, 0.7); S.heavy();
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 40), new THREE.MeshBasicMaterial({ color: 0xffa030, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(pos.x, 0.15, pos.z); scene.add(ring); shocks.push({ m: ring, t: 0, k: 10 });
}
function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i], pos = p.m.position, grenade = p.type === 'grenade';
    p.t += dt; p.v.y -= (grenade ? 24 : 18) * dt;
    pos.addScaledVector(p.v, dt); p.m.rotation.x += dt * 12; p.m.rotation.z += dt * 7;
    let done = false;
    if (pos.y < 0.2) { pos.y = 0.2; if (grenade) { p.v.y = Math.abs(p.v.y) * 0.4; p.v.x *= 0.6; p.v.z *= 0.6; } else done = true; }
    if (Math.abs(pos.x) > BOUND + 1 || Math.abs(pos.z) > BOUND + 1) { if (grenade) { p.v.x = p.v.z = 0; } else done = true; }
    if (!done && obstacles.some(o => Math.abs(pos.x - o.x) < o.hw && Math.abs(pos.z - o.z) < o.hd && pos.y < 9)) { if (grenade) { p.v.x = p.v.z = 0; } else done = true; }
    if (!done) for (const e of enemies) {
      if (e.dead) continue;
      const ep = e.f.g.position;
      if (Math.hypot(ep.x - pos.x, ep.z - pos.z) < e.radius + 0.35 && pos.y < 2.8 * e.t.scale) {
        if (!grenade) { const l = Math.hypot(p.v.x, p.v.z) || 1; damageEnemy(e, 18, p.v.x / l, p.v.z / l, 8, 0.35); }
        done = true; break;
      }
    }
    if (grenade && (p.t > 1.3 || done)) { explode(pos); done = true; }
    else if (done) burst(pos.clone(), 0xc07050, 5, 3);
    if (done) { scene.remove(p.m); projectiles.splice(i, 1); }
  }
}
function pickPower() {
  let r = Math.random() * Object.values(POWER).reduce((s, p) => s + p.w, 0);
  for (const k in POWER) { r -= POWER[k].w; if (r <= 0) return k; }
  return 'heal';
}
function dropPack(pos, type, life = 20) {
  const P = POWER[type] || TOOLS[type];
  const g = new THREE.Group();
  g.add(new THREE.Mesh(TOOLS[type] ? new THREE.BoxGeometry(0.7, 0.7, 0.7) : new THREE.IcosahedronGeometry(0.38, 1), new THREE.MeshBasicMaterial({ color: P.color })));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.06, 8, 24), new THREE.MeshBasicMaterial({ color: P.color, transparent: true, opacity: 0.8 }));
  ring.rotation.x = Math.PI / 2; g.add(ring);
  const tag = labelSprite(P.tag, '#' + P.color.toString(16).padStart(6, '0')); tag.position.y = 1.0; g.add(tag);
  g.userData = { type, life };
  g.position.set(pos.x, 1.0, pos.z); scene.add(g); packs.push(g);
}
function toast(txt, color) {
  const t = $('toast'); t.textContent = txt; t.style.color = '#' + color.toString(16).padStart(6, '0');
  t.style.opacity = 1; G.toastT = 1.6;
}
function shockwave() {
  const pp = player.fighter.g.position;
  for (const e of enemies) {
    if (e.dead) continue;
    const dx = e.f.g.position.x - pp.x, dz = e.f.g.position.z - pp.z, d = Math.hypot(dx, dz);
    if (d < 12) damageEnemy(e, 35, dx / (d || 1), dz / (d || 1), 16, 0.7);
  }
  G.shake = 0.9; S.heavy();
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 40), new THREE.MeshBasicMaterial({ color: 0xff9030, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(pp.x, 0.15, pp.z); scene.add(ring); shocks.push({ m: ring, t: 0 });
}
function collectPower(g) {
  const type = g.userData.type, P = POWER[type] || TOOLS[type];
  scene.remove(g);
  burst(g.position.clone(), P.color, 16, 4);
  S.pick();
  if (type === 'upgrade') upgradeWeapon();
  else if (TOOLS[type]) player.tool = { type, uses: P.uses };
  else if (type === 'heal') player.hp = Math.min(player.max, player.hp + 40);
  else if (type === 'nuke') shockwave();
  else player.buffs[type] = P.dur;
  toast(P.text, P.color);
}

function buildWave(n) {
  const q = [];
  const count = 3 + n * 2;
  for (let i = 0; i < count; i++) {
    const r = Math.random();
    q.push(n >= 3 && r < 0.15 ? 'big' : n >= 2 && r < 0.35 ? 'fast' : r > 0.78 ? 'flyer' : 'bob');
  }
  if (n <= 2) q[0] = 'flyer';   // early waves open with a Flying Bob so you can't miss it
  if (n % 5 === 0) { q.length = Math.floor(q.length / 2); q.unshift('boss'); }
  return q;
}
function showBanner(txt, secs = 2) { const b = $('banner'); b.textContent = txt; b.style.opacity = 1; G.bannerT = secs; }
function startWave() {
  G.wave++;
  G.queue = buildWave(G.wave);
  G.spawnT = 0.5;
  $('wavenum').textContent = 'WAVE ' + G.wave;
  showBanner(G.wave % 5 === 0 ? 'WAVE ' + G.wave + ' - MEGA BOB!' : 'WAVE ' + G.wave);
  S.wave();
  { // a free tool crate somewhere in town each wave
    const cp = { x: rand(-24, 24), z: rand(-24, 24) };
    pushOut(cp, 1.2);
    if (Math.abs(cp.x) < 5 && Math.abs(cp.z) < 5) cp.x = 9;
    dropPack(cp, TOOL_KEYS[Math.floor(Math.random() * TOOL_KEYS.length)], 45);
  }
  if (G.wave % 2 === 0 && player.weapon < WEAPONS.length - 1) { // weapon upgrade on every even wave
    const up = { x: rand(-20, 20), z: rand(-20, 20) };
    pushOut(up, 1.2);
    if (Math.abs(up.x) < 5 && Math.abs(up.z) < 5) up.z = -9;
    dropPack(up, 'upgrade', 70);
  }
}

function resetGame() {
  for (const e of enemies) { scene.remove(e.f.g); scene.remove(e.bar); scene.remove(e.label); }
  enemies.length = 0;
  for (const p of packs) scene.remove(p);
  packs.length = 0;
  Object.assign(G, { wave: 0, score: 0, kills: 0, queue: [], waveWait: 0, pending: false, shake: 0, combo: 0, comboT: 0 });
  Object.assign(player, { hp: 100, atk: null, inv: 0, block: false, dead: false, vy: 0, grounded: true });
  player.buffs.rage = player.buffs.speed = player.buffs.shield = 0; shieldMesh.visible = false;
  player.tool = null; player.toolCd = 0; player.throwT = 0; setWeapon(0);
  for (const p of projectiles) scene.remove(p.m);
  projectiles.length = 0;
  for (const s of shocks) scene.remove(s.m);
  shocks.length = 0;
  player.vel.set(0, 0, 0);
  player.fighter.g.position.set(0, 0, 0);
  player.fighter.g.rotation.x = 0;
  player.face = 0;
  yaw = Math.PI; pitch = 0.35;
  $('over').style.display = 'none';
  $('menu').style.display = 'none';
  $('hud').style.display = 'block';
  G.state = 'play';
}

/* ---------- input ---------- */
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (G.state === 'play') {
    if (e.code === 'KeyJ') startAttack('punch');
    if (e.code === 'KeyK') startAttack('kick');
    if (e.code === 'KeyF') useTool();
    if (e.code === 'Space' && player.grounded && !player.dead) { player.vy = 9.5; player.grounded = false; sfx(400, 0.12, 'triangle', 0.05, 200); }
  }
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('mousemove', e => {
  if (document.pointerLockElement === renderer.domElement) {
    yaw -= e.movementX * 0.0025;
    pitch = clamp(pitch + e.movementY * 0.002, 0.02, 1.0);
  }
});
renderer.domElement.addEventListener('mousedown', e => {
  if (G.state !== 'play') return;
  if (document.pointerLockElement !== renderer.domElement && renderer.domElement.requestPointerLock) {
    try { renderer.domElement.requestPointerLock(); } catch (_) {}
  }
  startAttack(e.button === 2 ? 'kick' : 'punch');
});
addEventListener('contextmenu', e => e.preventDefault());
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
});
function begin() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) {} }
  if (AC && AC.state === 'suspended') AC.resume();
  resetGame();
  try { renderer.domElement.requestPointerLock(); } catch (_) {}
}
$('start').onclick = begin;
$('again').onclick = begin;

/* ---------- touch controls (phones / tablets) ---------- */
const T = { x: 0, y: 0, block: false };   // joystick x/y (y>0 = forward), block held
const IS_TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0 || matchMedia('(pointer:coarse)').matches;
if (IS_TOUCH) {
  document.body.classList.add('touch');
  const cv = renderer.domElement;
  const stick = $('joy'), knob = $('knob');
  let joyId = null, jcx = 0, jcy = 0, lookId = null, lx = 0, ly = 0;
  const R = 55;
  const setStick = (cx, cy) => {
    let dx = cx - jcx, dy = cy - jcy; const d = Math.hypot(dx, dy);
    if (d > R) { dx *= R / d; dy *= R / d; }
    T.x = dx / R; T.y = -dy / R;
    knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
  };
  const endStick = () => { joyId = null; T.x = T.y = 0; knob.style.transform = 'translate(0,0)'; stick.classList.remove('on'); };
  stick.addEventListener('touchstart', e => {
    e.preventDefault();
    if (joyId !== null) return;
    const t = e.changedTouches[0]; joyId = t.identifier;
    const r = stick.getBoundingClientRect();
    // joystick centre sits where the finger first lands (clamped inside the zone)
    jcx = clamp(t.clientX, r.left + R, r.right - R); jcy = clamp(t.clientY, r.top + R, r.bottom - R);
    stick.style.setProperty('--bx', (jcx - r.left) + 'px'); stick.style.setProperty('--by', (jcy - r.top) + 'px');
    stick.classList.add('on'); setStick(t.clientX, t.clientY);
  }, { passive: false });
  stick.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const t of e.changedTouches) if (t.identifier === joyId) setStick(t.clientX, t.clientY);
  }, { passive: false });
  const stickEnd = e => { for (const t of e.changedTouches) if (t.identifier === joyId) endStick(); };
  stick.addEventListener('touchend', stickEnd); stick.addEventListener('touchcancel', stickEnd);

  // drag anywhere on the 3D view to look around
  cv.addEventListener('touchstart', e => {
    if (G.state !== 'play' || lookId !== null) return;
    const t = e.changedTouches[0]; lookId = t.identifier; lx = t.clientX; ly = t.clientY;
  }, { passive: true });
  cv.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const t of e.changedTouches) if (t.identifier === lookId) {
      yaw -= (t.clientX - lx) * 0.006;
      pitch = clamp(pitch + (t.clientY - ly) * 0.004, 0.02, 1.0);
      lx = t.clientX; ly = t.clientY;
    }
  }, { passive: false });
  const lookEnd = e => { for (const t of e.changedTouches) if (t.identifier === lookId) lookId = null; };
  cv.addEventListener('touchend', lookEnd); cv.addEventListener('touchcancel', lookEnd);

  const press = (id, fn, up) => {
    const b = $(id);
    b.addEventListener('touchstart', e => { e.preventDefault(); b.classList.add('down'); if (G.state === 'play') fn(); }, { passive: false });
    const end = e => { e.preventDefault(); b.classList.remove('down'); if (up) up(); };
    b.addEventListener('touchend', end, { passive: false }); b.addEventListener('touchcancel', end, { passive: false });
  };
  press('tAtk', () => startAttack('punch'));
  press('tKick', () => startAttack('kick'));
  press('tTool', () => useTool());
  press('tJump', () => { if (player.grounded && !player.dead) { player.vy = 9.5; player.grounded = false; sfx(400, 0.12, 'triangle', 0.05, 200); } });
  press('tBlock', () => { T.block = true; }, () => { T.block = false; });
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('dblclick', e => e.preventDefault());
  // try fullscreen on first start (ignored where unsupported, e.g. iPhone Safari)
  $('start').addEventListener('click', () => {
    const el = document.documentElement;
    try { (el.requestFullscreen || el.webkitRequestFullscreen || (() => {})).call(el); } catch (_) {}
    try { screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {}); } catch (_) {}
  });
}

/* ---------- pause ---------- */
function pauseGame() {
  if (G.state !== 'play') return;
  G.state = 'paused';
  for (const k in keys) keys[k] = false;
  T.x = T.y = 0; T.block = false;
  $('pause').style.display = 'flex';
  if (document.exitPointerLock && document.pointerLockElement) document.exitPointerLock();
}
function resumeGame() {
  if (G.state !== 'paused') return;
  G.state = 'play';
  $('pause').style.display = 'none';
  last = performance.now();
  try { renderer.domElement.requestPointerLock(); } catch (_) {}
}
function togglePause() { G.state === 'paused' ? resumeGame() : pauseGame(); }
addEventListener('keydown', e => { if ((e.code === 'KeyP' || e.code === 'Escape') && !e.repeat) togglePause(); });
// Esc releases the mouse in the browser, so losing the lock mid-fight pauses too
document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && G.state === 'play') pauseGame(); });
addEventListener('blur', pauseGame);
$('resume').onclick = resumeGame;
$('restart').onclick = () => { $('pause').style.display = 'none'; begin(); };
$('pausebtn').onclick = pauseGame;

/* ---------- combat ---------- */
const ATK = {
  punch: { dur: 0.36, hitAt: 0.12, dmg: 10, range: 2.3, kb: 6, stun: 0.3 },
  kick:  { dur: 0.58, hitAt: 0.22, dmg: 20, range: 2.7, kb: 12, stun: 0.5 },
  bat:   { dur: 0.5, hitAt: 0.2, dmg: 28, range: 3.4, kb: 15, stun: 0.55 },
};
function startAttack(type) {
  if (player.atk || player.dead || G.state !== 'play') return;
  const armed = type === 'punch';   // left click / J swings your weapon, K is an unarmed kick
  const a = armed ? WEAPONS[player.weapon] : ATK[type];
  player.atk = { type, a, armed, t: 0, hit: false, arm: armed ? 1 : (player.alt ^= 1) };
  // soft aim assist toward nearest bob
  const pp = player.fighter.g.position;
  let best = null, bd = 5;
  for (const e of enemies) {
    if (e.dead) continue;
    const d = Math.hypot(e.f.g.position.x - pp.x, e.f.g.position.z - pp.z);
    if (d < bd) { bd = d; best = e; }
  }
  if (best) player.face = Math.atan2(best.f.g.position.x - pp.x, best.f.g.position.z - pp.z);
  player.vel.x += Math.sin(player.face) * 4; player.vel.z += Math.cos(player.face) * 4;
  S.swing();
}
function damageEnemy(e, dmg, dirx, dirz, kb, stunT) {
  e.hp -= dmg;
  e.stun = e.t.scale > 2 ? stunT * 0.3 : stunT / Math.sqrt(e.t.scale);
  e.state = 'chase'; e.hitDone = false;
  e.vel.x = dirx * kb / Math.pow(e.t.scale, 1.2); e.vel.z = dirz * kb / Math.pow(e.t.scale, 1.2);
  e.flashT = 0.12; flash(e.f, true);
  const hp = e.f.g.position.clone(); hp.y = 1.5 * e.t.scale;
  burst(hp, 0xffe060, 8, 4);
  G.combo++; G.comboT = 2.2;
  G.shake = Math.max(G.shake, dmg > 12 ? 0.35 : 0.15);
  dmg > 12 ? S.heavy() : S.hit();
  if (e.hp <= 0) killEnemy(e);
}
function killEnemy(e) {
  e.dead = true; e.deadT = 0;
  G.kills++; G.score += Math.round(e.t.score * (1 + Math.min(G.combo, 20) * 0.05));
  burst(e.f.g.position.clone().setY(1.2 * e.t.scale), 0xff5a2a, 18, 5);
  scene.remove(e.bar); scene.remove(e.label);
  const dp = e.f.g.position;
  if (e.t.name === 'MEGA BOB') { dropPack(dp, 'heal'); dropPack({ x: dp.x + 1.6, z: dp.z }, pickDrop()); dropPack({ x: dp.x - 1.6, z: dp.z }, 'upgrade', 40); }
  else if (Math.random() < 0.22) dropPack(dp, pickDrop());
  S.die();
}
function hurtPlayer(dmg, from) {
  if (player.inv > 0 || player.dead) return;
  const pp = player.fighter.g.position;
  if (player.buffs.shield > 0) { player.inv = 0.15; burst(pp.clone().setY(1.4), 0xffd030, 5, 3); S.block(); return; }
  let dx = pp.x - from.x, dz = pp.z - from.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
  const front = (-dx * Math.sin(player.face) - dz * Math.cos(player.face)) > 0;
  if (player.block && front) {
    dmg *= 0.2; player.inv = 0.2; player.vel.x += dx * 4; player.vel.z += dz * 4;
    burst(pp.clone().setY(1.4), 0x9ad0ff, 6, 3); S.block();
  } else {
    player.inv = 0.45; player.vel.x += dx * 9; player.vel.z += dz * 9;
    player.flashT = 0.15; flash(player.fighter, true);
    G.shake = Math.max(G.shake, 0.5); G.combo = 0; S.hurt();
    burst(pp.clone().setY(1.4), 0xff3030, 10, 4);
  }
  player.hp = Math.max(0, player.hp - dmg);
  if (player.hp <= 0) endGame();
}
function endGame() {
  player.dead = true; G.state = 'over';
  S.die();
  $('final').innerHTML = 'You reached <b>Wave ' + G.wave + '</b><br>Bobs defeated: <b>' + G.kills + '</b> &nbsp;|&nbsp; Score: <b>' + G.score + '</b>';
  setTimeout(() => {
    if (document.exitPointerLock) document.exitPointerLock();
    $('over').style.display = 'flex';
  }, 1400);
}

/* ---------- poses ---------- */
function pose(f, dt, speed, o) {
  // o: {punch:{p,arm}, kick:{p}, block, windup (0..1), strike (0..1), flail}
  f.phase += dt * speed * 2.4;
  const sw = Math.sin(f.phase) * 0.9 * Math.min(1, speed / 3);
  f.legL.rotation.x = sw; f.legR.rotation.x = -sw;
  f.armL.rotation.set(-sw * 0.8, 0, 0.08); f.armR.rotation.set(sw * 0.8, 0, -0.08);
  f.inner.position.y = Math.abs(Math.sin(f.phase)) * 0.06 * Math.min(1, speed / 3);
  f.inner.rotation.x = 0; f.inner.rotation.y = 0;
  const ext = p => p < 0.35 ? p / 0.35 : 1 - (p - 0.35) / 0.65;
  if (o.block) {
    f.armL.rotation.set(-1.55, 0.5, 0.2); f.armR.rotation.set(-1.55, -0.5, -0.2);
    f.inner.rotation.x = 0.15;
  }
  if (o.punch) {
    const arm = o.punch.arm ? f.armR : f.armL, e = ext(o.punch.p);
    arm.rotation.set(-1.57 * e - 0.1, 0, 0); f.inner.rotation.y = (o.punch.arm ? -1 : 1) * 0.5 * e * -1;
    f.inner.rotation.x = 0.1 * e;
  }
  if (o.kick) {
    const e = ext(o.kick.p);
    f.legR.rotation.x = -1.6 * e; f.inner.rotation.x = -0.25 * e;
    f.armL.rotation.set(-0.6, 0, 0.5); f.armR.rotation.set(0.5, 0, -0.5);
  }
  if (o.windup) { const w = o.windup; f.armL.rotation.set(-2.9 * w, 0, 0.15); f.armR.rotation.set(-2.9 * w, 0, -0.15); f.inner.rotation.x = -0.3 * w; }
  if (o.strike != null) { const s = o.strike; f.armL.rotation.set(-2.9 + 1.5 * s, 0, 0.1); f.armR.rotation.set(-2.9 + 1.5 * s, 0, -0.1); f.inner.rotation.x = 0.35 * s; }
  if (o.flail) { f.armL.rotation.set(-0.5, 0, 1.2); f.armR.rotation.set(-0.5, 0, -1.2); f.inner.rotation.x = -0.3; }
}

/* ---------- update ---------- */
const tmpV = new THREE.Vector3();
function updatePlayer(dt) {
  const f = player.fighter, pos = f.g.position;
  if (player.dead) {
    pose(f, dt, 0, {});
    f.g.rotation.x = Math.max(-Math.PI / 2, f.g.rotation.x - dt * 4);
    return;
  }
  // camera turn keys
  if (keys.KeyQ || keys.ArrowLeft) yaw += 2.2 * dt;
  if (keys.KeyE || keys.ArrowRight) yaw -= 2.2 * dt;
  if (keys.ArrowUp) pitch = clamp(pitch - 1.2 * dt, 0.02, 1);
  if (keys.ArrowDown) pitch = clamp(pitch + 1.2 * dt, 0.02, 1);

  player.block = !!(keys.ShiftLeft || keys.ShiftRight || keys.KeyL || T.block) && !player.atk;
  const ix = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0) + T.x, iz = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0) + T.y;
  let mx = Math.cos(yaw) * ix - Math.sin(yaw) * iz, mz = -Math.sin(yaw) * ix - Math.cos(yaw) * iz;
  const ml = Math.hypot(mx, mz);
  let speed = (player.block ? 3 : player.atk ? 3.2 : 7.5) * (player.buffs.speed > 0 ? 1.55 : 1);
  if (ml > 0) {
    mx /= ml; mz /= ml;
    const k = 1 - Math.exp(-14 * dt);
    player.vel.x += (mx * speed - player.vel.x) * k; player.vel.z += (mz * speed - player.vel.z) * k;
    if (!player.atk) player.face = turnToward(player.face, Math.atan2(mx, mz), 14 * dt);
  } else {
    const k = 1 - Math.exp(-10 * dt);
    player.vel.x -= player.vel.x * k; player.vel.z -= player.vel.z * k;
  }
  pos.x += player.vel.x * dt; pos.z += player.vel.z * dt;
  // jump
  if (!player.grounded) {
    player.vy -= 26 * dt; pos.y += player.vy * dt;
    if (pos.y <= 0) { pos.y = 0; player.vy = 0; player.grounded = true; }
  }
  pushOut(pos, 0.5);
  if (player.inv > 0) player.inv -= dt;
  for (const k of ['rage', 'speed', 'shield']) if (player.buffs[k] > 0) player.buffs[k] = Math.max(0, player.buffs[k] - dt);
  shieldMesh.visible = player.buffs.shield > 0 && !(player.buffs.shield < 2 && Math.floor(G.time * 8) % 2);
  shieldMesh.scale.setScalar(1 + Math.sin(G.time * 6) * 0.04);
  if (player.flashT > 0) { player.flashT -= dt; if (player.flashT <= 0) flash(f, false); }

  // attacks
  const o = {};
  if (player.atk) {
    const A = player.atk; A.t += dt;
    if (!A.hit && A.t >= A.a.hitAt) {
      A.hit = true;
      const fx = Math.sin(player.face), fz = Math.cos(player.face);
      let any = false;
      for (const e of enemies) {
        if (e.dead) continue;
        const dx = e.f.g.position.x - pos.x, dz = e.f.g.position.z - pos.z, d = Math.hypot(dx, dz);
        if (d < A.a.range + e.radius && (dx * fx + dz * fz) / (d || 1) > (A.a.cone ?? 0.25) && Math.abs(e.f.g.position.y - pos.y) < 2.5) {
          damageEnemy(e, A.a.dmg * (player.buffs.rage > 0 ? 2 : 1), dx / (d || 1), dz / (d || 1), A.a.kb, A.a.stun); any = true; A.landed = true;
        }
      }
    }
    const p = A.t / A.a.dur;
    if (A.type === 'punch') o.punch = { p, arm: A.arm }; else o.kick = { p };
    if (A.t >= A.a.dur) player.atk = null;
  }
  if (player.block) o.block = true;
  if (player.toolCd > 0) player.toolCd -= dt;
  if (player.throwT > 0) { player.throwT -= dt; if (!player.atk) o.punch = { p: 1 - Math.max(0, player.throwT) / 0.25, arm: 1 }; }
  pose(f, dt, Math.hypot(player.vel.x, player.vel.z) * (player.grounded ? 1 : 0), o);
  f.g.rotation.y = player.face;
  if (G.comboT > 0) { G.comboT -= dt; if (G.comboT <= 0) G.combo = 0; }
}

function updateEnemies(dt) {
  const pp = player.fighter.g.position;
  let attackers = 0;
  for (const e of enemies) if (!e.dead && (e.state === 'windup' || e.state === 'strike')) attackers++;
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i], g = e.f.g, pos = g.position;
    if (e.dead) {
      e.deadT += dt;
      pose(e.f, dt, 0, { flail: e.deadT < 0.3 });
      g.rotation.x = Math.max(-Math.PI / 2, g.rotation.x - dt * 5);
      pos.x += e.vel.x * dt; pos.z += e.vel.z * dt; e.vel.multiplyScalar(Math.max(0, 1 - 6 * dt));
      if (pos.y > 0 && e.deadT < 1.2) pos.y = Math.max(0, pos.y - dt * 14);
      else if (e.deadT > 1.2) pos.y -= dt * 1.5;
      if (e.deadT > 2.2) { scene.remove(g); enemies.splice(i, 1); }
      continue;
    }
    const dx = pp.x - pos.x, dz = pp.z - pos.z, dist = Math.hypot(dx, dz) || 0.001;
    const nx = dx / dist, nz = dz / dist;
    let walk = 0; const o = {};
    if (e.flashT > 0) { e.flashT -= dt; if (e.flashT <= 0) flash(e.f, false); }

    if (e.stun > 0) {
      e.stun -= dt; o.flail = true;
      if (e.t.flying) pos.y = Math.max(0.2, pos.y - 6 * dt);   // stunned flyers drop out of the sky
    } else if (!player.dead && e.t.flying) {
      flyerAI(e, dt, dx, dz, dist, nx, nz, pp, o);
    } else if (!player.dead) {
      if (e.state === 'chase') {
        e.face = turnToward(e.face, Math.atan2(nx, nz), 8 * dt);
        if (dist > e.reach) {
          pos.x += nx * e.t.spd * dt; pos.z += nz * e.t.spd * dt; walk = e.t.spd;
        } else if (attackers < 3) {
          e.state = 'windup'; e.st = 0; e.dur = e.t.windup * rand(0.9, 1.4); e.hitDone = false; attackers++;
        } else { // circle while waiting for a turn
          pos.x += -nz * e.strafe * 1.6 * dt; pos.z += nx * e.strafe * 1.6 * dt; walk = 1.6;
        }
      } else if (e.state === 'windup') {
        e.st += dt; e.face = turnToward(e.face, Math.atan2(nx, nz), 5 * dt);
        o.windup = Math.min(1, e.st / e.dur);
        if (e.st >= e.dur) { e.state = 'strike'; e.st = 0; sfx(200, 0.12, 'sawtooth', 0.05, -100); }
      } else if (e.state === 'strike') {
        e.st += dt; o.strike = Math.min(1, e.st / 0.15);
        if (!e.hitDone && e.st >= 0.1) {
          e.hitDone = true;
          const fx = Math.sin(e.face), fz = Math.cos(e.face);
          if (dist < e.reach + 0.7 && (nx * fx + nz * fz) > 0.2 && pp.y < 1.6) hurtPlayer(e.t.dmg, pos);
        }
        if (e.st >= 0.35) { e.state = 'cool'; e.st = 0; e.dur = rand(0.5, 1.1); }
      } else if (e.state === 'cool') {
        e.st += dt; e.face = turnToward(e.face, Math.atan2(nx, nz), 6 * dt);
        if (dist > e.reach * 0.9) { pos.x += nx * e.t.spd * 0.4 * dt; pos.z += nz * e.t.spd * 0.4 * dt; walk = 1.5; }
        if (e.st >= e.dur) e.state = 'chase';
      }
    } else {
      e.face = turnToward(e.face, Math.atan2(nx, nz), 4 * dt); o.windup = 0.0;
    }
    // knockback velocity
    pos.x += e.vel.x * dt; pos.z += e.vel.z * dt; e.vel.multiplyScalar(Math.max(0, 1 - 7 * dt));
    // separation
    for (const e2 of enemies) {
      if (e2 === e || e2.dead) continue;
      const sx = pos.x - e2.f.g.position.x, sz = pos.z - e2.f.g.position.z, sd = Math.hypot(sx, sz), min = e.radius + e2.radius + 0.2;
      if (sd < min && sd > 0.001) { const push = (min - sd) * 0.5; pos.x += sx / sd * push; pos.z += sz / sd * push; }
    }
    // keep out of the player
    if (dist < e.radius + 0.5) { pos.x -= nx * (e.radius + 0.5 - dist); pos.z -= nz * (e.radius + 0.5 - dist); }
    if (!e.t.flying) pushOut(pos, e.radius);
    g.rotation.y = e.face;
    pose(e.f, dt, walk, o);
    if (e.f.wings) {
      const fl = 0.2 + Math.sin(G.time * 20 + e.strafe) * 0.55;
      e.f.wings[0].rotation.z = -fl; e.f.wings[1].rotation.z = fl;
    }
    // labels
    const top = 2.9 * e.t.scale + 0.3 + pos.y;
    e.bar.position.set(pos.x, top, pos.z); e.bar.quaternion.copy(camera.quaternion);
    e.bar.fg.scale.x = Math.max(0.001, e.hp / e.max);
    e.label.position.set(pos.x, top + 0.45, pos.z);
  }
}

function updateWaves(dt) {
  const alive = enemies.filter(e => !e.dead).length;
  if (G.queue.length) {
    G.spawnT -= dt;
    if (G.spawnT <= 0 && alive < 6 + Math.floor(G.wave / 2)) {
      spawnEnemy(G.queue.shift()); G.spawnT = rand(0.8, 1.6);
    }
  } else if (alive === 0 && !G.pending) {
    G.pending = true;
    if (G.wave > 0) { player.hp = Math.min(player.max, player.hp + 20); showBanner('WAVE CLEARED!  +20 HP', 2); }
    G.waveWait = G.wave === 0 ? 0.5 : 3.5;
  }
  if (G.pending) {
    G.waveWait -= dt;
    if (G.waveWait <= 0) { G.pending = false; startWave(); }
  }
}

function updateMisc(dt) {
  updateProjectiles(dt);
  for (const p of parts) {
    if (!p.m.visible) continue;
    p.life -= dt;
    if (p.life <= 0) { p.m.visible = false; continue; }
    p.v.y -= 12 * dt; p.m.position.addScaledVector(p.v, dt);
    if (p.m.position.y < 0.05) { p.m.position.y = 0.05; p.v.multiplyScalar(0.5); }
  }
  for (let i = packs.length - 1; i >= 0; i--) {
    const g = packs[i];
    g.rotation.y += dt * 2.5; g.position.y = 1 + Math.sin(G.time * 3 + i) * 0.15;
    const pp = player.fighter.g.position;
    g.userData.life -= dt;
    g.visible = g.userData.life > 4 || Math.floor(G.time * 8) % 2 === 0;
    if (g.userData.life <= 0) { scene.remove(g); packs.splice(i, 1); continue; }
    if (!player.dead && Math.hypot(pp.x - g.position.x, pp.z - g.position.z) < 1.5) {
      packs.splice(i, 1); collectPower(g);
    }
  }
  for (let i = shocks.length - 1; i >= 0; i--) {
    const s = shocks[i]; s.t += dt;
    s.m.scale.setScalar(1 + s.t * (s.k || 20)); s.m.material.opacity = Math.max(0, 0.8 * (1 - s.t / 0.6));
    if (s.t > 0.6) { scene.remove(s.m); shocks.splice(i, 1); }
  }
  if (G.toastT > 0) { G.toastT -= dt; if (G.toastT <= 0) $('toast').style.opacity = 0; }
  fires.forEach((f, i) => { f.scale.set(1 + Math.sin(G.time * 12 + i) * 0.15, 1 + Math.sin(G.time * 9 + i * 2) * 0.3, 1); });
  const a = embers.geometry.attributes.position;
  for (let i = 0; i < EMB; i++) {
    a.array[i * 3 + 1] += dt * (1 + (i % 5) * 0.4);
    a.array[i * 3] += Math.sin(G.time + i) * dt * 0.8;
    if (a.array[i * 3 + 1] > 32) a.array[i * 3 + 1] = 0;
  }
  a.needsUpdate = true;
  if (G.bannerT > 0) { G.bannerT -= dt; if (G.bannerT <= 0) $('banner').style.opacity = 0; }
}

function updateHUD() {
  const pct = player.hp / player.max * 100;
  $('hpfill').style.width = pct + '%';
  $('hpfill').style.background = pct > 50 ? 'linear-gradient(#5fe36a,#27a834)' : pct > 25 ? 'linear-gradient(#ffd24a,#d8a010)' : 'linear-gradient(#ff5a4a,#c01a10)';
  $('hp').textContent = Math.ceil(player.hp);
  const T = player.tool;
  $('tool').innerHTML = T ? '<b>' + TOOLS[T.type].tag + '</b> x' + T.uses + ' <i>[F]</i>' : '';
  $('weapon').innerHTML = WEAPONS[player.weapon].name + ' <i>' + '★'.repeat(player.weapon + 1) + '☆'.repeat(WEAPONS.length - 1 - player.weapon) + '</i>';
  const b = player.buffs;
  $('buffs').innerHTML = (b.rage > 0 ? '<span style="color:#ff6060">RAGE ' + Math.ceil(b.rage) + 's</span>' : '') +
    (b.speed > 0 ? '<span style="color:#50d0ff">TURBO ' + Math.ceil(b.speed) + 's</span>' : '') +
    (b.shield > 0 ? '<span style="color:#ffd030">SHIELD ' + Math.ceil(b.shield) + 's</span>' : '');
  $('score').textContent = G.score;
  const left = enemies.filter(e => !e.dead).length + G.queue.length;
  $('left').textContent = left ? left + ' BOBS LEFT' : '';
  const c = $('combo');
  if (G.combo >= 2) { c.textContent = G.combo + ' HIT COMBO!'; c.style.opacity = 1; } else c.style.opacity = 0;
}

function updateCamera(dt) {
  const pp = player.fighter.g.position;
  if (G.state === 'menu') {
    G.menuAng += dt * 0.15;
    camera.position.set(Math.sin(G.menuAng) * 24, 9, Math.cos(G.menuAng) * 24);
    camera.lookAt(0, 3, 0);
    return;
  }
  const dist = 7.5;
  const cp = Math.cos(pitch);
  const tx = pp.x, ty = pp.y + 1.9, tz = pp.z;
  let cx = tx + Math.sin(yaw) * cp * dist, cy = ty + Math.sin(pitch) * dist, cz = tz + Math.cos(yaw) * cp * dist;
  cy = Math.max(cy, 0.6);
  if (G.shake > 0) { G.shake = Math.max(0, G.shake - dt * 1.5); cx += rand(-1, 1) * G.shake * 0.4; cy += rand(-1, 1) * G.shake * 0.4; cz += rand(-1, 1) * G.shake * 0.4; }
  camera.position.set(cx, cy, cz);
  camera.lookAt(tx, ty, tz);
}

/* ---------- main loop ---------- */
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (G.state === 'paused') { renderer.render(scene, camera); return; }
  G.time += dt;
  if (G.state !== 'menu') {
    updatePlayer(dt);
    updateEnemies(dt);
    if (G.state === 'play') updateWaves(dt);
    updateHUD();
  }
  updateMisc(dt);
  updateCamera(dt);
  renderer.render(scene, camera);
}
player.fighter.g.position.set(0, 0, 0);
pose(player.fighter, 0, 0, {});
setWeapon(0);
requestAnimationFrame(loop);
