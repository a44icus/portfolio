// Labo : un mini skate park et une planche qu'on pilote au « flick » (figures dessinées au stick droit ou à la souris).
// Le parc est une fonction de hauteur (le sol, une mini rampe, une funbox, un kicker, un ledge, un rail plat, des banks tout autour).
// La planche roule sur cette surface avec une vitesse le long de son axe ; elle décolle quand le sol se dérobe (coping, bord de module).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { stylizeTree, makePost } from './look.js';
import { leafCluster } from './world.js';

const V3 = THREE.Vector3, UP = new V3(0, 1, 0), D2R = Math.PI / 180, TAU = Math.PI * 2;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sgn = x => (x < 0 ? -1 : 1);
const damp = (k, dt) => 1 - Math.exp(-k * dt);

// ---------- réglages
const T = {
  g: 20,          // gravité (un peu forte : sauts vifs)
  push: 5.5, pushMax: 8.5, pump: 4.5, vmax: 14, brake: 8, roll: 0.25, drag: 0.003,
  turn: 2.7,      // virage au sol (rad/s)
  spin: 7.2,      // rotation en l'air (rad/s)
  pop: 6.3, popGrind: 5.4,
};

// ---------- le parc : hauteur du sol en (x, z)
const MR = { z0: 10, z1: 18, flat: 4, R: 2.8, A: 78 * D2R, deck: 2 };        // mini rampe (deux quarters face à face, axe x)
MR.span = MR.R * Math.sin(MR.A); MR.H = MR.R * (1 - Math.cos(MR.A));
const CX = MR.flat + MR.span;                                                  // x du coping
function hMini(x, z) {
  if (z < MR.z0 || z > MR.z1) return 0;
  const d = Math.abs(x) - MR.flat;
  if (d <= 0) return 0;
  if (d < MR.span) return MR.R - Math.sqrt(MR.R * MR.R - d * d);
  if (d < MR.span + MR.deck) return MR.H;
  return 0;
}
const FB = { x: 2, z0: -3, a: 3.5, top: 6, h: 0.65 };                          // funbox (montée, plateau, descente vers -z)
FB.L = FB.a * 2 + FB.top;
function hFun(x, z) {
  if (Math.abs(x) > FB.x) return 0;
  const u = FB.z0 - z;
  if (u <= 0 || u >= FB.L) return 0;
  if (u < FB.a) return FB.h * u / FB.a;
  if (u < FB.a + FB.top) return FB.h;
  return FB.h * (FB.L - u) / FB.a;
}
const LD = { x0: -8.6, x1: -7.4, z0: -14, z1: -2, h: 0.5 };                     // ledge
const KK = { x0: -15.5, x1: -12.5, z0: -6, len: 2.5, R: 4.5 };                 // kicker (lance vers -z)
KK.top = KK.R - Math.sqrt(KK.R * KK.R - KK.len * KK.len);
function hKick(x, z) {
  if (x < KK.x0 || x > KK.x1) return 0;
  const u = KK.z0 - z;
  if (u <= 0 || u > KK.len) return 0;
  return KK.R - Math.sqrt(KK.R * KK.R - u * u);
}
const BK = { a0: 24, slope: Math.tan(35 * D2R), h: 2, a2: 30, wall: 3.2 };     // banks tout autour
BK.a1 = BK.a0 + BK.h / BK.slope;
function bank(a) {
  a = Math.abs(a);
  if (a < BK.a0) return 0;
  if (a < BK.a1) return (a - BK.a0) * BK.slope;
  if (a < BK.a2) return BK.h;
  return BK.wall;
}
function H(x, z) {
  let h = Math.max(bank(x), bank(z), hMini(x, z), hFun(x, z), hKick(x, z));
  if (x >= LD.x0 && x <= LD.x1 && z >= LD.z0 && z <= LD.z1) h = Math.max(h, LD.h);
  return h;
}
// normale : différences finies ; sur une cassure (coping, bord de module) on garde le côté d'où l'on vient,
// sinon (immobile, réception) le côté le plus doux
function pick(fw, bw, v) {
  if (Math.abs(fw - bw) <= 2) return (fw + bw) / 2;
  if (v > 0.01) return bw;
  if (v < -0.01) return fw;
  return Math.abs(fw) < Math.abs(bw) ? fw : bw;
}
function normalAt(x, z, out, vx = 0, vz = 0) {
  const e = 0.012, h0 = H(x, z);
  const gx = pick((H(x + e, z) - h0) / e, (h0 - H(x - e, z)) / e, vx);
  const gz = pick((H(x, z + e) - h0) / e, (h0 - H(x, z - e)) / e, vz);
  return out.set(-gx, 1, -gz).normalize();
}
// cap horizontal (yaw) -> direction de la planche sur la surface, en conservant l'angle par rapport à la pente
const _u = new V3();
function unroll(yaw, n, out) {
  const hx = Math.sin(yaw), hz = Math.cos(yaw), gl = Math.hypot(n.x, n.z);
  if (gl < 1e-4) return out.set(hx, 0, hz);
  const uhx = -n.x / gl, uhz = -n.z / gl;            // vers le haut de la pente, à plat
  const wx = uhz, wz = -uhx;                          // en travers de la pente
  const d = uhx * n.x + uhz * n.z;
  _u.set(uhx - d * n.x, -d * n.y, uhz - d * n.z).normalize();   // vers le haut de la pente, sur la surface
  const a = hx * uhx + hz * uhz, b = hx * wx + hz * wz;
  return out.set(a * _u.x + b * wx, a * _u.y, a * _u.z + b * wz);
}
const yawOf = (x, z) => Math.atan2(x, z);
const wrapA = a => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
function slopeYaw(v, n) {   // le cap dont la direction sur la pente (unroll) suit v
  const gl = Math.hypot(n.x, n.z);
  if (gl < 1e-4) return yawOf(v.x, v.z);
  const uhx = -n.x / gl, uhz = -n.z / gl, wx = uhz, wz = -uhx, d = uhx * n.x + uhz * n.z;
  _u.set(uhx - d * n.x, -d * n.y, uhz - d * n.z).normalize();
  const a = v.dot(_u), b = v.x * wx + v.z * wz;
  return yawOf(a * uhx + b * wx, a * uhz + b * wz);
}

// ---------- rails et bords où l'on glisse
const RAILS = [];
function rail(ax, ay, az, bx, by, bz, kind) {
  const a = new V3(ax, ay, az), d = new V3(bx, by, bz).sub(a), len = d.length();
  RAILS.push({ a, d: d.divideScalar(len), len, kind });
}
rail(CX, MR.H, MR.z0, CX, MR.H, MR.z1, 'coping'); rail(-CX, MR.H, MR.z0, -CX, MR.H, MR.z1, 'coping');
for (const s of [-1, 1]) rail(s * FB.x, FB.h, FB.z0 - FB.a, s * FB.x, FB.h, FB.z0 - FB.a - FB.top, 'ledge');
rail(LD.x0, LD.h, LD.z1, LD.x0, LD.h, LD.z0, 'ledge'); rail(LD.x1, LD.h, LD.z1, LD.x1, LD.h, LD.z0, 'ledge');
const FR = { x: 10, y: 0.42, z0: -4, z1: -14 };
rail(FR.x, FR.y, FR.z0, FR.x, FR.y, FR.z1, 'rail');

// ---------- rendu : la direction artistique de la planète (couchant pêche, ombres violettes, flou de maquette)
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
const PR = Math.min(devicePixelRatio, 1.6);
renderer.setPixelRatio(PR);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#150b28');
scene.fog = new THREE.Fog('#f6b892', 55, 150);
const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 400);
// les lumières de la surface de la planète
scene.add(new THREE.HemisphereLight('#ffc89a', '#6a3f8a', 1.0));
scene.add(new THREE.AmbientLight('#ffe2cc', 0.16));
const sun = new THREE.DirectionalLight('#ffcf94', 2.8);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 70 });
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;
scene.add(sun, sun.target);
const rim = new THREE.DirectionalLight('#b48cff', 0.45); rim.position.set(-40, -10, -30); scene.add(rim);
const SUN_OFF = new V3(6, 18, 10);   // soleil assez haut, de trois quarts : les deux courbes de la rampe restent éclairées
{ // ciel en dégradé (zénith saumon, horizon crème), comme à la surface de la planète
  const u = { uZen: { value: new THREE.Color('#ee9b7b') }, uHor: { value: new THREE.Color('#ffe0b8') } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: u,
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 uZen; uniform vec3 uHor; varying vec3 vD; void main(){ gl_FragColor = vec4(mix(uHor, uZen, smoothstep(-0.05, 0.55, vD.y)), 1.0);\n#include <colorspace_fragment>\n}',
  }));
  sky.renderOrder = -10; scene.add(sky);
}

// textures peintes (canvas) : grain fin, joints, plaques de bois
function canvasTex(w, h, draw, rep = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8; t.repeat.set(rep, rep); return t;
}
const rnd = (() => { let s = 12345; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
function speckle(g, w, h, base, n, amp, size = 1.4) {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    const k = (rnd() - 0.5) * amp;
    g.fillStyle = k > 0 ? 'rgba(255,255,255,' + k + ')' : 'rgba(60,30,60,' + -k + ')';
    g.fillRect(rnd() * w, rnd() * h, size * (0.5 + rnd()), size * (0.5 + rnd()));
  }
}
// béton du parc : grain, taches douces, joints de dilatation tous les 3 m (la texture couvre 3 m)
const concTex = canvasTex(512, 512, (g, w, h) => {
  speckle(g, w, h, '#d8b394', 9000, 0.2);
  for (let i = 0; i < 26; i++) {
    const r = 20 + rnd() * 70, gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
    gr.addColorStop(0, 'rgba(150,90,90,.07)'); gr.addColorStop(1, 'rgba(150,90,90,0)');
    g.save(); g.translate(rnd() * w, rnd() * h); g.fillStyle = gr; g.fillRect(-r, -r, 2 * r, 2 * r); g.restore();
  }
  g.fillStyle = 'rgba(110,60,80,.35)'; g.fillRect(0, 0, w, 3); g.fillRect(0, 0, 3, h);
}, 1 / 3);
// sable autour du parc (le sol orangé de la planète)
const sandTex = canvasTex(256, 256, (g, w, h) => speckle(g, w, h, '#f5a356', 5000, 0.22, 1.6), 1 / 2);
// contreplaqué des rampes : plaques de 1,22 m, fil du bois, vis
const woodTex = canvasTex(512, 512, (g, w, h) => {
  speckle(g, w, h, '#dca46c', 6000, 0.12);
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = 'rgba(140,80,40,' + (0.05 + rnd() * 0.06) + ')'; g.lineWidth = 1 + rnd() * 2; g.beginPath();
    const y = rnd() * h; g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + rnd() * 10 - 5, w * 0.6, y + rnd() * 10 - 5, w, y); g.stroke();
  }
  g.fillStyle = 'rgba(90,45,40,.45)'; g.fillRect(0, 0, w, 2); g.fillRect(0, 0, 2, h);
  g.fillStyle = 'rgba(70,40,50,.55)';
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) { g.beginPath(); g.arc(8 + i * (w - 16) / 5, 8 + j * (h - 16) / 5, 2.2, 0, TAU); g.fill(); }
}, 1 / 1.22);
const M = {
  sand: new THREE.MeshStandardMaterial({ map: sandTex, roughness: 1 }),
  conc: new THREE.MeshStandardMaterial({ map: concTex, roughness: 0.92 }),
  conc2: new THREE.MeshStandardMaterial({ map: concTex, color: '#f0b9b0', roughness: 0.9 }),     // modules : béton rosé
  concSide: new THREE.MeshStandardMaterial({ map: concTex, color: '#d49a98', roughness: 0.95 }),
  wood: new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.75 }),
  violet: new THREE.MeshStandardMaterial({ color: '#7a4fd0', roughness: 0.6 }),
  magenta: new THREE.MeshStandardMaterial({ color: '#e5488f', roughness: 0.6 }),
  jaune: new THREE.MeshStandardMaterial({ color: '#ffc93a', roughness: 0.55 }),
  tuile: new THREE.MeshStandardMaterial({ color: '#ec8a3c', roughness: 0.85 }),
  metal: new THREE.MeshStandardMaterial({ color: '#ece6f4', roughness: 0.25, metalness: 0.35 }),
  railPaint: new THREE.MeshStandardMaterial({ color: '#d8ff3a', roughness: 0.4, metalness: 0.1 }),
};
const park = new THREE.Group(); scene.add(park);
function shade(m) { m.castShadow = m.receiveShadow = true; return m; }

{ // le sol : une dalle de béton (le parc), du sable autour
  const g = new THREE.PlaneGeometry(240, 240).rotateX(-Math.PI / 2);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 240, uv.getY(i) * 240);
  const m = new THREE.Mesh(g, M.sand); m.position.y = -0.01; m.receiveShadow = true; park.add(m);
  const s = new THREE.PlaneGeometry(61, 61).rotateX(-Math.PI / 2);
  const u2 = s.attributes.uv; for (let i = 0; i < u2.count; i++) u2.setXY(i, u2.getX(i) * 61 - 30.5, u2.getY(i) * 61 - 30.5);
  const c = new THREE.Mesh(s, M.conc); c.receiveShadow = true; park.add(c);
}
// profil (u, y) extrudé sur `depth` ; rotY tourne l'axe u. UV : en mètres.
function prism(pts, depth, mats, x, z, rotY) {
  const sh = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], p[1])));
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 1, steps: 1 });
  const m = shade(new THREE.Mesh(g, mats)); m.position.set(x, 0, z); m.rotation.y = rotY; park.add(m); return m;
}
function tube(r, len, mat, x, y, z, axis = 'z') {
  const g = new THREE.CylinderGeometry(r, r, len, 16);
  if (axis === 'z') g.rotateX(Math.PI / 2); else if (axis === 'x') g.rotateZ(Math.PI / 2);
  const m = shade(new THREE.Mesh(g, mat)); m.position.set(x, y, z); park.add(m); return m;
}
{ // mini rampe : contreplaqué, flancs violets, coping en acier, garde-corps jaune sur les plateformes
  for (const s of [1, -1]) {
    const pts = [[0, 0]];
    for (let i = 0; i <= 32; i++) { const d = MR.span * i / 32; pts.push([s * d, MR.R - Math.sqrt(MR.R * MR.R - d * d)]); }
    pts.push([s * (MR.span + MR.deck), MR.H], [s * (MR.span + MR.deck), 0]);
    prism(pts, MR.z1 - MR.z0, [M.violet, M.wood], s * MR.flat, MR.z0, 0);
    tube(0.03, MR.z1 - MR.z0, M.metal, s * CX, MR.H, (MR.z0 + MR.z1) / 2);
    const xr = s * (CX + MR.deck - 0.08);
    for (let k = 0; k <= 4; k++) tube(0.022, 0.9, M.jaune, xr, MR.H + 0.45, MR.z0 + 0.1 + (MR.z1 - MR.z0 - 0.2) * k / 4, 'y');
    tube(0.026, MR.z1 - MR.z0 - 0.2, M.jaune, xr, MR.H + 0.9, (MR.z0 + MR.z1) / 2);
  }
  const flat = new THREE.Mesh(new THREE.PlaneGeometry(MR.flat * 2, MR.z1 - MR.z0).rotateX(-Math.PI / 2), M.wood);
  flat.position.set(0, 0.004, (MR.z0 + MR.z1) / 2); flat.receiveShadow = true; park.add(flat);
}
{ // funbox : béton rosé, flancs magenta, cornières en acier
  prism([[0, 0], [FB.a, FB.h], [FB.a + FB.top, FB.h], [FB.L, 0]], FB.x * 2, [M.magenta, M.conc2], -FB.x, FB.z0, Math.PI / 2);
  for (const s of [-1, 1]) {
    const e = shade(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, FB.top), M.metal));
    e.position.set(s * (FB.x - 0.02), FB.h - 0.022, FB.z0 - FB.a - FB.top / 2); park.add(e);
  }
}
{ // kicker en bois, flancs jaunes, petite barre au bout
  const pts = [[0, 0]];
  for (let i = 1; i <= 20; i++) { const u = KK.len * i / 20; pts.push([u, KK.R - Math.sqrt(KK.R * KK.R - u * u)]); }
  pts.push([KK.len, 0]);
  prism(pts, KK.x1 - KK.x0, [M.jaune, M.wood], KK.x0, KK.z0, Math.PI / 2);
  tube(0.02, KK.x1 - KK.x0, M.metal, (KK.x0 + KK.x1) / 2, KK.top, KK.z0 - KK.len, 'x');
}
{ // ledge : béton, arêtes en cornière
  prism([[0, 0], [0, LD.h], [LD.x1 - LD.x0, LD.h], [LD.x1 - LD.x0, 0]], LD.z1 - LD.z0, [M.concSide, M.conc2], LD.x0, LD.z0, 0);
  for (const x of [LD.x0, LD.x1]) {
    const e = shade(new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, LD.z1 - LD.z0), M.metal));
    e.position.set(x + (x === LD.x0 ? 0.018 : -0.018), LD.h - 0.02, (LD.z0 + LD.z1) / 2); park.add(e);
  }
}
{ // rail plat peint, pieds et platines
  tube(0.03, FR.z0 - FR.z1, M.railPaint, FR.x, FR.y, (FR.z0 + FR.z1) / 2);
  for (const z of [FR.z0 + 0.3, (FR.z0 + FR.z1) / 2, FR.z1 - 0.3]) {
    tube(0.024, FR.y, M.railPaint, FR.x, FR.y / 2, z, 'y');
    const f = shade(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.02, 0.12), M.metal)); f.position.set(FR.x, 0.01, z); park.add(f);
  }
}
{ // banks tout autour ; muret coiffé de tuiles orangées
  const W = BK.a2 + 0.4, pts = [[0, 0], [BK.a1 - BK.a0, BK.h], [BK.a2 - BK.a0, BK.h], [BK.a2 - BK.a0, BK.wall], [W - BK.a0, BK.wall], [W - BK.a0, 0]];
  prism(pts, W * 2, [M.concSide, M.conc2], BK.a0, -W, 0);
  prism(pts, W * 2, [M.concSide, M.conc2], -BK.a0, W, Math.PI);
  prism(pts, W * 2, [M.concSide, M.conc2], W, BK.a0, -Math.PI / 2);
  prism(pts, W * 2, [M.concSide, M.conc2], -W, -BK.a0, Math.PI / 2);
  for (const [x, z, w, d] of [[0, BK.a2 + 0.2, 2 * W + 0.2, 0.62], [0, -BK.a2 - 0.2, 2 * W + 0.2, 0.62], [BK.a2 + 0.2, 0, 0.62, 2 * W + 0.2], [-BK.a2 - 0.2, 0, 0.62, 2 * W + 0.2]]) {
    const c = shade(new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, d), M.tuile)); c.position.set(x, BK.wall + 0.04, z); park.add(c);
  }
}

// ---------- le décor de la planète : arbres aux feuillages roses, magenta, jaunes ; touffes d'herbe ; lampadaires
const LEAF_COLORS = ['#ff5fa8', '#e2389a', '#ffc93a', '#ff8a3a', '#ff4f6d', '#c86bff', '#9fd23a'];
const leafMats = LEAF_COLORS.map(c => new THREE.MeshStandardMaterial({ color: c, vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }));
const barkM = new THREE.MeshStandardMaterial({ color: '#d4c2ff', emissive: '#6a50a8', emissiveIntensity: 0.25, roughness: 0.9 });
function treeGeo(seed) {
  let s0 = 977 + seed * 7919; const r = () => (s0 = (s0 * 16807) % 2147483647) / 2147483647;
  const H = 4.2 + r() * 1.8, trunk = new THREE.CylinderGeometry(0.06, 0.16, H, 7, 6).translate(0, H / 2, 0);
  const P = trunk.attributes.position;
  for (let i = 0; i < P.count; i++) { const t = P.getY(i) / H; P.setX(i, P.getX(i) + Math.sin(t * 2.4 + seed) * 0.18 * t); P.setZ(i, P.getZ(i) + Math.cos(t * 1.9 + seed) * 0.12 * t); }
  trunk.computeVertexNormals();
  const leaves = [], nc = 3 + Math.floor(r() * 2);
  for (let c = 0; c < nc; c++) {
    const last = c === nc - 1, rad = last ? 1.3 : 1.0 + r() * 0.35;
    const g = leafCluster(80, rad, 1.0, 0.42);
    const y = H * (0.55 + 0.45 * c / (nc - 1)), a = r() * TAU, d = last ? 0 : 0.6 + r() * 0.4;
    g.translate(Math.cos(a) * d, y + rad * 0.25, Math.sin(a) * d);
    g.deleteAttribute('aLod'); leaves.push(g);
  }
  return { trunk, leaves: mergeGeometries(leaves) };
}
const TREES = Array.from({ length: 6 }, (_, i) => treeGeo(i + 1));
const deco = new THREE.Group(); scene.add(deco);
for (let i = 0; i < 46; i++) {
  const a = i / 46 * TAU + rnd() * 0.12, rr = 35 + rnd() * 16, v = TREES[i % TREES.length];
  const t = new THREE.Group(); t.position.set(Math.cos(a) * rr, 0, Math.sin(a) * rr); t.rotation.y = rnd() * TAU; t.scale.setScalar(0.85 + rnd() * 0.5);
  t.add(shade(new THREE.Mesh(v.trunk, barkM)), shade(new THREE.Mesh(v.leaves, leafMats[Math.floor(rnd() * leafMats.length)])));
  deco.add(t);
}
{ // touffes d'herbe (comme sur la planète : petits paquets de feuilles vertes)
  const g = leafCluster(14, 0.28, 0.55, 0.14); g.deleteAttribute('aLod'); g.translate(0, 0.14, 0);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new V3(), at = new V3();
  for (const col of ['#a8cf3a', '#7fb52e']) {
    const im = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: col, vertexColors: true, roughness: 1, side: THREE.DoubleSide }), 700);
    im.receiveShadow = true;
    for (let i = 0; i < im.count; i++) {
      const a = rnd() * TAU, d = 32.5 + Math.pow(rnd(), 1.6) * 40;
      at.set(Math.cos(a) * d, 0, Math.sin(a) * d);
      q.setFromAxisAngle(UP, rnd() * TAU); const k = 0.7 + rnd() * 1.4; sc.set(k, k * (0.8 + rnd() * 0.5), k);
      im.setMatrixAt(i, m4.compose(at, q, sc));
    }
    deco.add(im);
  }
}
{ // lampadaires autour du parc (tige violette, globe chaud qui brille)
  const postM = new THREE.MeshStandardMaterial({ color: '#5a2f6e', roughness: 0.6 });
  const globM = new THREE.MeshStandardMaterial({ color: '#fff1c8', emissive: '#ffcf7a', emissiveIntensity: 1.6 });
  for (const [x, z] of [[-27.5, -27.5], [27.5, -27.5], [-27.5, 27.5], [27.5, 27.5], [0, -27.5], [0, 27.5], [-27.5, 0], [27.5, 0]]) {
    const p = shade(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 3.2, 8), postM)); p.position.set(x, BK.h + 1.6, z); deco.add(p);
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), globM); l.position.set(x, BK.h + 3.3, z); deco.add(l);
  }
}

// ---------- la planche : un vrai skate (plateau galbé en 7 plis, nose et tail relevés, trucks, roues, visserie)
const rig = new THREE.Group(); scene.add(rig);
const boardPivot = new THREE.Group(); boardPivot.position.y = 0.09; rig.add(boardPivot);
function deckGeo() {
  const L = 0.8, W = 0.205, R0 = W / 2, NZ = 80, NX = 14, TH = 0.012;
  const halfW = z => { const e = Math.abs(z) - (L / 2 - R0); return e <= 0 ? W / 2 : Math.sqrt(Math.max(0, R0 * R0 - e * e)); };
  const kick = z => { const k = clamp((Math.abs(z) - 0.235) / (L / 2 - 0.235)); return 0.066 * (0.35 * k * k * (3 - 2 * k) + 0.65 * k * k); };
  const conc = x => 0.0045 * Math.pow(x / (W / 2), 2);     // léger concave en travers
  const pos = [], uv = [], idx = [], groups = [];
  const surf = top => {
    const b = pos.length / 3, s = idx.length;
    for (let i = 0; i <= NZ; i++) {
      const z = -L / 2 + L * i / NZ, hw = halfW(z);
      for (let j = 0; j <= NX; j++) {
        const x = -hw + 2 * hw * j / NX;
        pos.push(x, kick(z) + conc(x) + (top ? TH / 2 : -TH / 2), z); uv.push(x / W + 0.5, z / L + 0.5);
      }
    }
    for (let i = 0; i < NZ; i++) for (let j = 0; j < NX; j++) {
      const a = b + i * (NX + 1) + j, c = a + NX + 1;
      if (top) idx.push(a, c, a + 1, a + 1, c, c + 1); else idx.push(a, a + 1, c, a + 1, c + 1, c);
    }
    groups.push([s, idx.length - s]);
  };
  surf(true); surf(false);
  // la tranche : le tour du plateau
  const ring = [];
  for (let i = 0; i <= NZ; i++) ring.push([i, NX]);
  for (let i = NZ; i >= 0; i--) ring.push([i, 0]);
  const b = pos.length / 3, s = idx.length;
  ring.forEach(([i, j], k) => {
    const z = -L / 2 + L * i / NZ, hw = halfW(z), x = -hw + 2 * hw * j / NX, y = kick(z) + conc(x);
    pos.push(x, y + TH / 2, z, x, y - TH / 2, z); uv.push(k / ring.length * 8, 1, k / ring.length * 8, 0);
  });
  for (let k = 0; k < ring.length - 1; k++) { const a = b + k * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  groups.push([s, idx.length - s]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  groups.forEach(([st, n], m) => g.addGroup(st, n, m));
  g.computeVertexNormals();
  return g;
}
{
  // grip : papier de verre sombre, grain fin
  const gripTex = canvasTex(256, 1024, (g, w, h) => speckle(g, w, h, '#2a2533', 26000, 0.28, 1.1));
  // dessous : graphisme maison (le couchant de la planète, une planète à anneau)
  const graphTex = canvasTex(256, 1024, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#2a1450'); gr.addColorStop(0.35, '#7a4fd0'); gr.addColorStop(0.6, '#ee6b8b'); gr.addColorStop(0.85, '#ffb36b'); gr.addColorStop(1, '#ffe0b8');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) { g.fillStyle = 'rgba(255,255,255,' + (0.3 + rnd() * 0.6) + ')'; g.fillRect(rnd() * w, rnd() * h * 0.4, 2, 2); }
    g.save(); g.translate(w / 2, h * 0.47);
    g.fillStyle = '#ffc93a'; g.beginPath(); g.arc(0, 0, 70, 0, TAU); g.fill();
    g.fillStyle = '#f59a46'; g.beginPath(); g.arc(0, 0, 70, 0.2, Math.PI - 0.2); g.fill();
    g.strokeStyle = '#d8ff3a'; g.lineWidth = 9; g.beginPath(); g.ellipse(0, 0, 112, 26, -0.35, 0, TAU); g.stroke();
    g.restore();
    g.fillStyle = '#fff'; g.font = '800 46px Manrope, Arial, sans-serif'; g.textAlign = 'center';
    g.save(); g.translate(w / 2, h * 0.8); g.rotate(-Math.PI / 2); g.fillText('PLANÈTE', 0, 16); g.restore();
  });
  graphTex.wrapS = graphTex.wrapT = THREE.ClampToEdgeWrapping;
  // tranche : les plis d'érable, dont un teinté violet
  const plyTex = canvasTex(64, 64, (g, w, h) => {
    ['#f1d6a8', '#e9c48c', '#f1d6a8', '#7a4fd0', '#f1d6a8', '#e9c48c', '#f1d6a8'].forEach((col, i) => { g.fillStyle = col; g.fillRect(0, i * h / 7, w, h / 7 + 1); });
  });
  const deck = shade(new THREE.Mesh(deckGeo(), [
    new THREE.MeshStandardMaterial({ map: gripTex, roughness: 1 }),
    new THREE.MeshStandardMaterial({ map: graphTex, roughness: 0.45 }),
    new THREE.MeshStandardMaterial({ map: plyTex, roughness: 0.7 }),
  ]));
  boardPivot.add(deck);
  const alu = new THREE.MeshStandardMaterial({ color: '#d9d4e2', roughness: 0.32, metalness: 0.45 });
  const dark = new THREE.MeshStandardMaterial({ color: '#2a2440', roughness: 0.5, metalness: 0.3 });
  const bushM = new THREE.MeshStandardMaterial({ color: '#e5488f', roughness: 0.7 });
  const wheelM = new THREE.MeshStandardMaterial({ color: '#fff1d6', roughness: 0.55 });
  const coreM = new THREE.MeshStandardMaterial({ color: '#d8ff3a', roughness: 0.5 });
  // roue : profil arrondi, tourné
  const WR = 0.027, WW = 0.032, wp = [new THREE.Vector2(0.008, -WW / 2)];
  for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + Math.PI * i / 10; wp.push(new THREE.Vector2(WR - 0.006 + Math.cos(a) * 0.006, Math.sin(a) * (WW / 2))); }
  wp.push(new THREE.Vector2(0.008, WW / 2));
  const wheelG = new THREE.LatheGeometry(wp, 24).rotateZ(Math.PI / 2);
  const coreG = new THREE.CylinderGeometry(0.011, 0.011, WW + 0.002, 16).rotateZ(Math.PI / 2);
  const deckBot = -0.006;
  for (const s of [1, -1]) {
    const tz = s * 0.205;
    const base = shade(new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.007, 0.085), alu)); base.position.set(0, deckBot - 0.0035, tz); boardPivot.add(base);
    const kp = shade(new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.035, 8), dark)); kp.position.set(0, deckBot - 0.02, tz - s * 0.012); kp.rotation.x = s * 0.6; boardPivot.add(kp);
    for (const dy of [-0.014, -0.03]) { const b = shade(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.011, 12), bushM)); b.position.set(0, deckBot + dy, tz - s * (0.01 - dy * 0.4)); b.rotation.x = s * 0.6; boardPivot.add(b); }
    const neck = shade(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.024), alu)); neck.position.set(0, -0.045, tz + s * 0.004); boardPivot.add(neck);
    const hang = shade(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.13, 12).rotateZ(Math.PI / 2), alu)); hang.position.set(0, -0.06, tz); boardPivot.add(hang);
    const axle = shade(new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.215, 8).rotateZ(Math.PI / 2), dark)); axle.position.set(0, -0.062, tz); boardPivot.add(axle);
    for (const x of [-0.088, 0.088]) {
      const w = shade(new THREE.Mesh(wheelG, wheelM)); w.position.set(x, -0.062, tz); boardPivot.add(w);
      const c = new THREE.Mesh(coreG, coreM); c.position.set(x, -0.062, tz); boardPivot.add(c);
    }
    for (const [bx, bz] of [[-0.018, -0.028], [0.018, -0.028], [-0.018, 0.028], [0.018, 0.028]]) {   // têtes de vis sur le grip
      const v = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.002, 10), dark); v.position.set(bx, 0.0072, tz + bz); boardPivot.add(v);
    }
  }
}
// le rendu « illustration » de la planète sur tous les matériaux (ombres violettes, lumière chaude) et son post-traitement
stylizeTree(scene);
let post = null;
try { post = makePost(renderer, scene, camera, 'high'); post.setTilt(0.7, 0.5); post.setBand(0.2); }
catch (e) { console.warn('post-traitement indisponible', e); post = null; }

// ---------- état
const S = {
  p: new V3(0, 0, 2), yaw: Math.PI, s: 0, n: new V3(0, 1, 0), v: new V3(),
  mode: 'ground', tAir: 0, lip: false, vy0: 1, nTake: new V3(0, 1, 0), spun: 0, grabT: 0,
  trick: null, boardOff: 0, grind: null, bailT: 0, safe: { p: new V3(0, 0, 2), yaw: Math.PI }, safeT: 0,
  squash: 0, lean: 0,
  slide: 0, slideSide: 1, slideT: 0, rev: 0,          // powerslide (angle de la planche en travers) et revert (demi-tour à plat)
  pendT: 0, chain: false,                             // la ligne reste ouverte un instant après la réception (revert, powerslide)
  steez: 30, recent: [], grabVis: 0,                  // le style : propreté des réceptions, grabs, variété des figures
};
const f = new V3(), f2 = new V3(), n2 = new V3(), side = new V3(), vt = new V3(), tmp = new V3();

const TRICKS = {
  ollie:   { fr: 'Ollie', pts: 50 },
  nollie:  { fr: 'Nollie', pts: 80, nose: true },
  kickflip:{ fr: 'Kickflip', pts: 150, flip: 1 },
  heelflip:{ fr: 'Heelflip', pts: 150, flip: -1 },
  bsshove: { fr: 'Pop shove-it', pts: 100, shove: 0.5 },
  fsshove: { fr: 'Pop shove-it FS', pts: 110, shove: -0.5 },
  varialk: { fr: 'Varial kickflip', pts: 250, flip: 1, shove: 0.5 },
  varialh: { fr: 'Varial heelflip', pts: 250, flip: -1, shove: -0.5 },
  tre:     { fr: '360 flip', pts: 400, flip: 1, shove: 1 },
  nkick:   { fr: 'Nollie kickflip', pts: 220, flip: 1, nose: true },
  nheel:   { fr: 'Nollie heelflip', pts: 220, flip: -1, nose: true },
  nshove:  { fr: 'Nollie shove-it', pts: 160, shove: 0.5, nose: true },
};
// durée de la rotation de la planche (un ollie à plat tient 0,6 s en l'air ; on peut se poser dès 85 %)
for (const t of Object.values(TRICKS)) {
  t.flip ||= 0; t.shove ||= 0;
  t.dur = 0.14 + 0.22 * Math.abs(t.flip) + 0.3 * Math.min(0.5, Math.abs(t.shove)) + 0.12 * Math.max(0, Math.abs(t.shove) - 0.5);
}

// ---------- score et combos
const C = { list: [], pts: 0, mult: 0 };
let score = 0, best = 0, comboShowT = 0;
const $combo = document.getElementById('combo'), $names = $combo.querySelector('.names'), $pts = $combo.querySelector('.pts');
function showCombo(cls = '') {
  $combo.className = cls;
  $names.textContent = C.list.slice(-6).join(' + ');
  $pts.textContent = C.mult ? `${Math.round(C.pts)} × ${C.mult}${S.steez >= 1 ? ` · steez +${Math.round(S.steez)} %` : ''}` : '';
  comboShowT = 0;
}
function addCombo(name, pts) { C.list.push(name); C.pts += pts; C.mult++; showCombo(); }
function bankCombo() {
  if (!C.mult) return;
  const tot = Math.round(C.pts * C.mult * (1 + S.steez / 100));
  score += tot; best = Math.max(best, tot);
  document.getElementById('sc').textContent = score; document.getElementById('best').textContent = best;
  $pts.textContent = '+' + tot; $combo.className = 'bank'; comboShowT = 0;
  C.list = []; C.pts = 0; C.mult = 0;
}
function loseCombo() { if (C.mult) { $combo.className = 'lost'; comboShowT = 0; } C.list = []; C.pts = 0; C.mult = 0; }
let toastT = 0; const $toast = document.getElementById('toast');
const $style = $combo.querySelector('.style'), $stz = document.getElementById('stz'), $stzN = document.getElementById('stzn');
let styleT = 0;
function steez(v, word) {
  S.steez = clamp(S.steez + v, 0, 100);
  if (word) { $style.textContent = word; $style.className = 'style show ' + (v > 0 ? 'up' : 'down'); styleT = 1.2; }
}
function toast(t) { $toast.textContent = t; $toast.classList.add('show'); toastT = 1.1; }

// ---------- son (bruit filtré : roulement, glisse ; petits chocs)
let AC = null, rollG, rollF, grindG;
function audioInit() {
  if (AC) return;
  try { AC = new AudioContext(); } catch { return; }
  const buf = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = () => { const s = AC.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; };
  rollF = AC.createBiquadFilter(); rollF.type = 'lowpass'; rollG = AC.createGain(); rollG.gain.value = 0;
  src().connect(rollF).connect(rollG).connect(AC.destination);
  const gf = AC.createBiquadFilter(); gf.type = 'bandpass'; gf.frequency.value = 2600; gf.Q.value = 3; grindG = AC.createGain(); grindG.gain.value = 0;
  src().connect(gf).connect(grindG).connect(AC.destination);
}
function thump(freq, vol, dur = 0.12) {
  if (!AC) return;
  const o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime;
  o.type = 'triangle'; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(freq * 0.4, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(AC.destination); o.start(t); o.stop(t + dur);
}

// ---------- entrées
const keys = new Set();
let slow = false;
addEventListener('keydown', e => {
  audioInit();
  if (e.repeat) return;
  keys.add(e.code);
  if (e.code === 'Space') { kbCrouch = true; e.preventDefault(); }
  if (e.code === 'KeyR') respawn();
  if (e.code === 'KeyE') doRevert();
  if (e.code === 'KeyT') { slow = !slow; toast(slow ? 'Ralenti' : 'Vitesse normale'); }
  const quick = { Digit1: 'kickflip', Digit2: 'heelflip', Digit3: 'bsshove', Digit4: 'tre' }[e.code];
  if (quick) doTrick(quick, 1);
});
addEventListener('keyup', e => {
  keys.delete(e.code);
  if (e.code === 'Space' && kbCrouch) { kbCrouch = false; doTrick('ollie', 1); }
});
addEventListener('blur', () => { keys.clear(); kbCrouch = false; mouseGrab = false; endDrag(); });
let kbCrouch = false, mouseGrab = false;

// stick virtuel : la souris (clic gauche glissé) ou le stick droit de la manette.
// On note les zones traversées (8 directions) ; la figure se décide au retour au centre, au relâché ou après une courte pause.
const ST = { x: 0, y: 0, seq: [], t0: 0, tLast: 0, centreT: 0, drag: false, trail: [], last: '' };
const ZONE_ANG = i => i * 45;
const bottom = i => i === 5 || i === 6 || i === 7, top = i => i === 1 || i === 2 || i === 3;
function classify(seq) {
  const first = seq[0], last = seq[seq.length - 1];
  let rot = 0;
  for (let i = 1; i < seq.length; i++) { let d = ((seq[i] - seq[i - 1]) % 8 + 8) % 8; if (d > 4) d -= 8; if (Math.abs(d) <= 2) rot += d * 45; }
  if (bottom(first)) {
    if (Math.abs(rot) >= 250 && !bottom(last)) return 'tre';
    if (top(last)) {
      if (Math.abs(rot) >= 120) return rot < 0 ? 'varialk' : 'varialh';
      return last === 2 ? 'ollie' : last === 3 ? 'kickflip' : 'heelflip';
    }
    if (last === 4) return 'bsshove';
    if (last === 0) return 'fsshove';
    return null;
  }
  if (top(first)) {
    if (bottom(last)) return last === 6 ? 'nollie' : last === 5 ? 'nkick' : 'nheel';
    if (last === 4 || last === 0) return 'nshove';
  }
  return null;
}
function stickFeed(x, y, now) {
  ST.x = x; ST.y = y;
  const r = Math.hypot(x, y);
  if (r > 0.62) {
    const z = ((Math.round(Math.atan2(y, x) / (Math.PI / 4)) % 8) + 8) % 8;
    if (ST.seq[ST.seq.length - 1] !== z) { if (!ST.seq.length) ST.t0 = now; ST.seq.push(z); ST.tLast = now; }
    ST.centreT = 0;
  } else if (r < 0.3 && ST.seq.length >= 2) decide();
}
function stickTick(now, dt) {
  if (ST.seq.length >= 2 && now - ST.tLast > 110) decide();
  if (ST.drag && MS.armed && now - MS.tMove > 90 && msChord() >= 45) msDecide(now);
  if (ST.seq.length === 1 && Math.hypot(ST.x, ST.y) < 0.3 && (ST.centreT += dt) > 0.25) ST.seq = [];
}
function decide() {
  const seq = ST.seq; ST.seq = [];
  if (seq.length < 2) return;
  const k = classify(seq);
  ST.last = k ? TRICKS[k].fr : '?';
  if (!k) return;
  const power = clamp(1.2 - (ST.tLast - ST.t0) / 450, 0.85, 1.15);   // flick rapide : pop plus haut
  doTrick(k, power);
}
// La souris : on lit le tracé plutôt qu'une position de stick. On « arme » en tirant vers le bas (ou vers le haut pour
// un nollie), puis le geste qui suit est jugé sur sa direction (la corde) et sa courbure (demi-cercle : varial, ¾ : 360 flip).
const MS = { x: 0, y: 0, pts: [], armed: null, low: 0, tMove: 0, tArm: 0 };
function msReset() { MS.x = MS.y = 0; MS.pts = [[0, 0]]; MS.armed = null; MS.low = 0; }
function msMove(dx, dy, now) {
  MS.x += dx; MS.y -= dy; MS.tMove = now;
  const lp = MS.pts[MS.pts.length - 1];
  if (Math.hypot(MS.x - lp[0], MS.y - lp[1]) >= 7) MS.pts.push([MS.x, MS.y]);
  const n = MS.pts.length - 1;
  if (!MS.armed) {
    if (MS.y < -32) { MS.armed = 'D'; MS.tArm = now; }
    else if (MS.y > 32) { MS.armed = 'U'; MS.tArm = now; }
  }
  // le point d'appui : le plus bas (ollie) ou le plus haut (nollie) tant qu'on continue de tirer
  if (MS.armed === 'D' && MS.pts[n][1] < MS.pts[MS.low][1] - 3) MS.low = n;
  if (MS.armed === 'U' && MS.pts[n][1] > MS.pts[MS.low][1] + 3) MS.low = n;
  ST.x = clamp(MS.x / 80, -1, 1); ST.y = clamp(MS.y / 80, -1, 1);
  if (msChord() > 190) msDecide(now);   // geste déjà long : on n'attend pas
}
function msChord() { const a = MS.pts[MS.low], b = MS.pts[MS.pts.length - 1]; return Math.hypot(b[0] - a[0], b[1] - a[1]); }
function msDecide(now) {
  if (!MS.armed) return;
  const P = MS.pts.slice(MS.low), a = P[0], b = P[P.length - 1];
  const cx = b[0] - a[0], cy = b[1] - a[1], L = Math.hypot(cx, cy);
  if (L < 45) return;
  let turn = 0, prev = null, first = null;
  for (let i = 1; i < P.length; i++) {
    const ang = Math.atan2(P[i][1] - P[i - 1][1], P[i][0] - P[i - 1][0]);
    if (first === null) first = P[i][0] - P[i - 1][0];
    if (prev !== null) { let d = ang - prev; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; turn += d; }
    prev = ang;
  }
  const deg = Math.atan2(cy, cx) / D2R, T0 = Math.abs(turn) / D2R;
  let k = null;
  if (MS.armed === 'D') {
    if (T0 >= 230) k = 'tre';
    else if (T0 >= 110) k = first < 0 ? 'varialk' : 'varialh';
    else if (deg > 68 && deg < 112) k = 'ollie';
    else if (deg >= 112 && deg < 160) k = 'kickflip';
    else if (deg > 20 && deg <= 68) k = 'heelflip';
    else if (deg >= 160 || deg <= -160) k = 'bsshove';
    else if (deg > -20 && deg <= 20) k = 'fsshove';
  } else {
    if (deg < -68 && deg > -112) k = 'nollie';
    else if (deg <= -112 && deg > -160) k = 'nkick';
    else if (deg >= -68 && deg < -20) k = 'nheel';
    else if (Math.abs(deg) >= 160 || Math.abs(deg) <= 20) k = 'nshove';
  }
  ST.last = k ? TRICKS[k].fr : '?';
  ST.trail = MS.pts.slice();
  const dur = Math.max(1, now - MS.tArm);
  msReset();
  if (k) doTrick(k, clamp(0.85 + L / dur * 0.12, 0.85, 1.15));   // flick rapide : pop plus haut
}
function endDrag() {
  if (!ST.drag) return;
  ST.drag = false; msDecide(performance.now()); msReset(); ST.x = ST.y = 0; ST.seq = [];
}
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => {
  audioInit();
  if (e.button === 2) { mouseGrab = true; return; }
  if (e.button !== 0) return;
  canvas.setPointerCapture(e.pointerId);
  ST.drag = true; ST.x = ST.y = 0; ST.seq = []; ST.trail = []; msReset();
});
canvas.addEventListener('pointermove', e => { if (ST.drag) msMove(e.movementX, e.movementY, performance.now()); });
canvas.addEventListener('pointerup', e => { if (e.button === 2) mouseGrab = false; else endDrag(); });
canvas.addEventListener('pointercancel', () => endDrag());

function readPad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of pads) {
    if (!p || !p.connected) continue;
    const dz = v => (Math.abs(v) < 0.18 ? 0 : v);
    return {
      steer: -dz(p.axes[0] || 0), rx: dz(p.axes[2] || 0), ry: -dz(p.axes[3] || 0),
      push: p.buttons[0]?.pressed, brake: p.buttons[1]?.pressed, reset: p.buttons[3]?.pressed,
      grab: (p.buttons[6]?.value || 0) > 0.3 || (p.buttons[7]?.value || 0) > 0.3,
      slideL: p.buttons[4]?.pressed, slideR: p.buttons[5]?.pressed, rev: p.buttons[2]?.pressed,
    };
  }
  return null;
}
let padReset = false, padRev = false;
const input = { steer: 0, push: false, brake: false, grab: false, crouch: false, slide: false, slideDir: 0 };
function readInput(now) {
  const k = c => keys.has(c);
  const pad = readPad();
  input.steer = (k('KeyA') || k('ArrowLeft') ? 1 : 0) - (k('KeyD') || k('ArrowRight') ? 1 : 0) + (pad ? pad.steer : 0);
  input.steer = clamp(input.steer, -1, 1);
  input.push = k('KeyW') || k('ArrowUp') || !!pad?.push;
  input.brake = k('KeyS') || k('ArrowDown') || !!pad?.brake;
  input.grab = mouseGrab || k('KeyF') || !!pad?.grab;
  if (pad && !ST.drag) stickFeed(pad.rx, pad.ry, now);
  if (pad?.reset && !padReset) respawn(); padReset = !!pad?.reset;
  if (pad?.rev && !padRev) doRevert(); padRev = !!pad?.rev;
  input.slide = k('ShiftLeft') || k('ShiftRight') || !!pad?.slideL || !!pad?.slideR;
  input.slideDir = pad?.slideL ? 1 : pad?.slideR ? -1 : 0;
  input.crouch = kbCrouch || (ST.drag && MS.armed === 'D' && msChord() < 45) || (ST.seq.length === 1 && bottom(ST.seq[0]) && Math.hypot(ST.x, ST.y) > 0.6);
}

// ---------- physique
function doTrick(key, power) {
  if (S.mode !== 'ground' && S.mode !== 'grind') return;
  const t = TRICKS[key];
  if (S.mode === 'ground') {
    unroll(S.yaw, S.n, f);
    S.v.copy(f).multiplyScalar(S.s).addScaledVector(S.n, T.pop * power);
    S.p.addScaledVector(S.n, 0.02);
    enterAir(S.n);
  } else {
    const g = S.grind;
    S.v.copy(g.rail.d).multiplyScalar(g.sa); S.v.y += T.popGrind * power;
    exitGrind(); enterAir(UP);
  }
  S.trick = { ...t, t: 0 };
  addCombo(t.fr, t.pts);
  if (key !== 'ollie') {   // varier les figures : du style ; refaire la même en boucle : moins
    const rep = S.recent.filter(k => k === key).length;
    S.recent.push(key); if (S.recent.length > 6) S.recent.shift();
    if (rep >= 2) steez(-5, 'Répétitif'); else if (!rep) steez(4);
  }
  thump(170, 0.35, 0.08);
}
function enterAir(nTake) {
  if (S.pendT > 0 && !S.chain) bankCombo();
  S.pendT = 0; S.chain = false; S.slideT = 0;
  S.mode = 'air'; S.tAir = 0; S.spun = 0; S.grabT = 0; S.nTake.copy(nTake);
  S.lip = nTake.y < 0.5 && S.v.y > 0.5;
  if (S.lip) {   // au-dessus du coping : on retombe dans la rampe, pas sur la plateforme
    const gl = Math.hypot(nTake.x, nTake.z), uhx = -nTake.x / gl, uhz = -nTake.z / gl;
    const along = S.v.x * uhx + S.v.z * uhz + 0.45;
    S.v.x -= uhx * along; S.v.z -= uhz * along;
    S.vy0 = Math.max(1, S.v.y);
  }
}
function finishTrick() {
  if (!S.trick) return;
  S.boardOff = (S.boardOff + S.trick.shove * TAU) % TAU;
  S.trick = null;
}
function airTricksDone() {   // rotations, grab, air de rampe : comptés à la réception
  const deg = Math.abs(S.spun) / D2R, n = Math.floor((deg + 35) / 180);   // 145° compte pour un 180
  if (n >= 1) addCombo(`${S.spun > 0 ? 'BS' : 'FS'} ${n * 180}`, 120 * n * n);
  if (S.grabT > 0.15) { addCombo('Indy', Math.round(80 + 300 * S.grabT)); steez(Math.min(12, 25 * S.grabT), 'Grab tenu'); }
  if (S.lip && S.tAir > 0.45) addCombo('Air', Math.round(60 + 120 * S.tAir));
  S.spun = 0; S.grabT = 0;
}
function stepGround(h) {
  const n = S.n;
  unroll(S.yaw, n, f);
  // powerslide : la planche se met en travers et frotte ; on garde le cap
  if (input.slide && Math.abs(S.s) > 1.2 && n.y > 0.85) {
    if (Math.abs(S.slide) < 0.15) S.slideSide = input.slideDir || (input.steer ? sgn(input.steer) : S.slideSide);
    S.slide += (S.slideSide * 1.4 - S.slide) * Math.min(1, 10 * h);
    if (Math.abs(S.slide) > 1 && (S.slideT += h) >= 0.2 && S.slideT - h < 0.2) {
      if (S.pendT > 0) S.chain = true;
      addCombo('Powerslide', 80); steez(3);
    }
  } else if (!(input.slide && Math.abs(S.slide) > 0.5)) {
    S.slide += (0 - S.slide) * Math.min(1, (Math.abs(S.s) > 0.3 ? 7 : 2) * h);
    if (Math.abs(S.slide) < 0.6) S.slideT = 0;
  }
  const across = Math.abs(Math.sin(S.slide));
  S.s -= sgn(S.s) * Math.min(Math.abs(S.s), 6.5 * across * h);
  S.yaw += input.steer * T.turn * (1 - 0.85 * across) / (1 + Math.abs(S.s) * 0.06) * h;
  if (Math.abs(S.s) > 0.4) {   // la pente fait tourner la trajectoire vers le bas
    side.crossVectors(n, f);
    S.yaw += clamp(-T.g * side.y / S.s, -3, 3) * h;
  }
  unroll(S.yaw, n, f);
  S.s += -T.g * f.y * h;
  const flat = n.y > 0.93;
  if (input.push) {
    if (flat) {
      const dir = S.s < -0.3 ? -1 : 1;
      if (Math.abs(S.s) < T.pushMax) S.s += dir * T.push * h;
    } else if (S.s * f.y < 0) S.s += sgn(S.s) * T.pump * h;   // pomper en descendant la courbe
  }
  if (input.brake && flat) S.s -= sgn(S.s) * Math.min(Math.abs(S.s), T.brake * h);
  S.s -= sgn(S.s) * Math.min(Math.abs(S.s), (T.roll + T.drag * S.s * S.s) * h);
  S.s = clamp(S.s, -T.vmax, T.vmax);

  const vx = f.x * S.s, vy = f.y * S.s, vz = f.z * S.s;
  const nx = S.p.x + vx * h, nz = S.p.z + vz * h, hg = H(nx, nz);
  if (hg - S.p.y > 0.3 + Math.max(0, vy * h)) return wallGround(nx, nz, vx, vz);
  normalAt(nx, nz, n2, -vx, -vz); unroll(S.yaw, n2, f2);   // la pente juste devant
  const yb = S.p.y + vy * h;
  if (vy - S.s * f2.y > 1.2 || hg < yb - 0.12) {   // le sol se dérobe : on décolle
    S.p.set(nx, yb, nz); S.v.set(vx, vy, vz); enterAir(n);
    return;
  }
  S.p.set(nx, hg, nz); normalAt(nx, nz, S.n, vx, vz);   // la pente sur laquelle on roule (côté d'où l'on vient)
}
function wallGround(nx, nz, vx, vz) {
  const bx = H(nx, S.p.z) - S.p.y > 0.3, bz = H(S.p.x, nz) - S.p.y > 0.3;
  let wx = bx || !bz ? 0 : vx, wz = bz || !bx ? 0 : vz;
  const hit = Math.hypot(vx - wx, vz - wz);
  if (hit > 6.5) return bail('Dans le mur !');
  const L = Math.hypot(wx, wz);
  if (L < 0.4) { S.s = -S.s * 0.25; thump(90, 0.2); return; }
  S.yaw = yawOf(sgn(S.s) * wx, sgn(S.s) * wz); S.s = sgn(S.s) * L * 0.9;
  if (hit > 2) thump(90, 0.15);
}
function stepAir(h) {
  S.tAir += h; S.v.y -= T.g * h;
  const dy = input.steer * T.spin * h; S.yaw += dy; S.spun += dy;
  if (input.grab && S.tAir > 0.1) S.grabT += h;
  if (S.trick && !S.trick.done && (S.trick.t += h) >= S.trick.dur) finishTrick();
  const nx = S.p.x + S.v.x * h, ny = S.p.y + S.v.y * h, nz = S.p.z + S.v.z * h;
  if (tryGrind(nx, ny, nz)) return;
  const hg = H(nx, nz);
  if (ny <= hg) {
    if (hg - S.p.y > 0.3) {   // un mur, pas une réception
      let bx = H(nx, S.p.z) > S.p.y + 0.3, bz = H(S.p.x, nz) > S.p.y + 0.3;
      if (!bx && !bz) bx = bz = true;
      if (bx) S.v.x *= -0.25; if (bz) S.v.z *= -0.25;
      S.p.y = ny;
      const h0 = H(S.p.x, S.p.z);
      if (S.p.y <= h0) { S.p.y = h0; land(); }
      return;
    }
    S.p.set(nx, hg, nz); land(); return;
  }
  S.p.set(nx, ny, nz);
}
function land() {
  const n = normalAt(S.p.x, S.p.z, n2);
  unroll(S.yaw, n, f);
  const vn = S.v.dot(n);
  vt.copy(S.v).addScaledVector(n, -vn);
  const st = vt.dot(f), vtl = vt.length();
  const lat = tmp.copy(vt).addScaledVector(f, -st).length();
  if (S.trick && S.trick.t < S.trick.dur * 0.7) return bail('Figure pas finie');
  if (-vn > 18) return bail('Trop haut !');
  const off = vtl > 1.5 ? lat / vtl : 0;   // sinus de l'écart entre la planche et la trajectoire
  if (off > 0.94) return bail('Mal réceptionné');
  const late = !!S.trick;
  finishTrick();
  // on se recale dans l'axe de la vitesse (en avant ou en fakie, au plus près) ; si l'écart est grand, la planche reste en travers : powerslide de rattrapage
  if (vtl > 0.5) {
    const y0 = S.yaw, sg = sgn(st);
    tmp.copy(vt).multiplyScalar(sg);
    S.yaw = slopeYaw(tmp, n);
    const d = wrapA(y0 - S.yaw);
    qA.setFromAxisAngle(AY, -d); rig.quaternion.multiply(qA);   // la planche ne saute pas : l'écart passe dans l'angle de glisse
    S.slide = wrapA(S.slide + d);
    if (off > 0.55) S.slideSide = sgn(d);
  }
  unroll(S.yaw, n, f);
  S.s = vt.dot(f); S.n.copy(n); S.mode = 'ground';
  S.squash = clamp(-vn / 9, 0.2, 1);
  airTricksDone();
  if (off > 0.55) { S.s *= 0.8; steez(-10, 'Rattrapé en powerslide'); }
  else if (late || off > 0.2 || -vn > 12) steez(-3, 'Limite');
  else if (C.mult) steez(8, 'Propre !');
  if (C.mult) { S.pendT = 0.45; S.chain = false; }
  thump(95, 0.25 + 0.3 * S.squash, 0.14);
}
function tryGrind(nx, ny, nz) {
  if (S.v.y > 1.5) return false;
  for (const r of RAILS) {
    tmp.set(nx - r.a.x, ny - r.a.y, nz - r.a.z);
    const t = tmp.dot(r.d);
    if (t < 0.15 || t > r.len - 0.15) continue;
    const cx = r.a.x + r.d.x * t, cy = r.a.y + r.d.y * t, cz = r.a.z + r.d.z * t;
    const dy = ny - cy, dh = Math.hypot(nx - cx, nz - cz);
    if (dh > 0.38 || dy < -0.25 || dy > 0.3) continue;
    const along = S.v.dot(r.d);
    if (Math.abs(along) < 1.2) continue;
    if (r.kind === 'coping' && Math.abs(nx) < CX - 0.12) continue;
    if (S.trick && S.trick.t < S.trick.dur * 0.7) { bail('Figure pas finie'); return true; }
    finishTrick();
    airTricksDone();
    // 50-50 si la planche est dans l'axe du rail, boardslide si elle est en travers
    const dl = Math.hypot(r.d.x, r.d.z), rx = r.d.x / dl, rz = r.d.z / dl;
    const hx = Math.sin(S.yaw), hz = Math.cos(S.yaw), c = hx * rx + hz * rz, cs = Math.abs(c);
    let type;
    if (cs > 0.88) { type = '50-50'; S.yaw = yawOf(sgn(c) * rx, sgn(c) * rz); }
    else if (cs > 0.5) type = 'Crooked grind';
    else { type = 'Boardslide'; const k = sgn(hx * rz - hz * rx); S.yaw = yawOf(k * rz, -k * rx); }
    S.grind = { rail: r, t, sa: along, type, time: 0 };
    S.mode = 'grind'; S.p.set(cx, cy, cz);
    addCombo(type, 100);
    thump(220, 0.18, 0.06);
    return true;
  }
  return false;
}
function exitGrind() {
  const g = S.grind; if (!g) return;
  if (g.type !== '50-50') { const k = sgn(g.sa); S.yaw = yawOf(k * g.rail.d.x, k * g.rail.d.z); }   // on se remet dans l'axe
  S.grind = null;
}
function stepGrind(h) {
  const g = S.grind, r = g.rail;
  g.time += h;
  g.sa += -T.g * r.d.y * h - sgn(g.sa) * (g.type === 'Boardslide' ? 1.6 : 1.0) * h;
  g.t += g.sa * h;
  C.pts += h * (g.type === '50-50' ? 120 : 160);
  if (g.t < 0 || g.t > r.len) {   // bout du rail
    S.v.copy(r.d).multiplyScalar(g.sa); S.v.y += 0.6; exitGrind(); enterAir(UP); return;
  }
  if (Math.abs(g.sa) < 0.6) {      // plus assez de vitesse : on tombe à côté
    S.v.set(-r.d.z, 1, r.d.x).multiplyScalar(1.2); exitGrind(); enterAir(UP); return;
  }
  S.p.copy(r.a).addScaledVector(r.d, g.t);
}
function bail(msg) {
  if (S.mode === 'ground') { unroll(S.yaw, S.n, f); S.v.copy(f).multiplyScalar(S.s * 0.5); }
  S.mode = 'bail'; S.bailT = 0; S.trick = null; S.grind = null;
  S.pendT = 0; S.chain = false; S.slide = S.rev = 0; S.steez *= 0.5;
  loseCombo(); toast(msg); thump(70, 0.5, 0.3);
}
function stepBail(h) {
  S.bailT += h;
  S.v.y -= T.g * h;
  const k = Math.max(0, 1 - 4 * h); S.v.x *= k; S.v.z *= k;
  const nx = S.p.x + S.v.x * h, nz = S.p.z + S.v.z * h;
  if (H(nx, nz) - S.p.y < 0.3) { S.p.x = nx; S.p.z = nz; }
  S.p.y += S.v.y * h;
  const hg = H(S.p.x, S.p.z); if (S.p.y < hg) { S.p.y = hg; S.v.y = 0; normalAt(S.p.x, S.p.z, S.n); }
  if (S.bailT > 1.6) respawn();
}
// revert : demi-tour à plat qui fait passer de l'avant au fakie (ou l'inverse) ; juste après une réception, il prolonge la ligne
function doRevert() {
  if (S.mode !== 'ground' || Math.abs(S.s) < 1 || Math.abs(S.rev) > 0.3) return;
  const fromSlide = Math.abs(S.slide) > 0.6, dir = fromSlide ? sgn(S.slide) : (input.steer ? sgn(input.steer) : 1);
  S.yaw = wrapA(S.yaw + Math.PI); S.s = -S.s * 0.92;
  qA.setFromAxisAngle(AY, Math.PI); rig.quaternion.multiply(qA);
  S.rev = fromSlide ? wrapA(S.slide - dir * Math.PI) : -dir * Math.PI;   // la planche finit de tourner dans le même sens
  S.slide = 0; S.slideT = 0;
  if (S.pendT > 0) {
    addCombo(fromSlide ? 'Powerslide revert' : 'Revert', fromSlide ? 110 : 60); steez(6);
    S.pendT = 0.9; S.chain = true;
  }
  thump(140, 0.12, 0.1);
}
function updateLine(dt) {
  if (S.mode === 'ground' && S.pendT > 0) {
    if (input.slide && Math.abs(S.slide) > 0.5) S.pendT = Math.max(S.pendT, 0.6);
    else if ((S.pendT -= dt) <= 0) { S.pendT = 0; S.chain = false; bankCombo(); }
  }
  if (S.mode === 'ground' && !C.mult && S.pendT <= 0) S.steez = Math.max(0, S.steez - 0.6 * dt);
  const r = Math.abs(S.rev); if (r > 0) S.rev = sgn(S.rev) * Math.max(0, r - 13 * dt);
  S.grabVis += ((S.mode === 'air' && input.grab && S.tAir > 0.1 ? 1 : 0) - S.grabVis) * damp(12, dt);
  if (S.mode !== 'ground') S.slide += (0 - S.slide) * damp(8, dt);
  $stz.style.width = S.steez.toFixed(1) + '%'; $stzN.textContent = Math.round(S.steez);
  if (styleT > 0 && (styleT -= dt) <= 0) $style.classList.remove('show');
}
function respawn() {
  S.p.copy(S.safe.p); S.yaw = S.safe.yaw; S.s = 0; S.v.set(0, 0, 0); S.n.set(0, 1, 0);
  S.mode = 'ground'; S.trick = null; S.grind = null; S.spun = 0; S.grabT = 0;
  S.pendT = 0; S.chain = false; S.slide = S.rev = 0; S.slideT = 0;
  loseCombo();
}

// ---------- caméra
let camYaw = Math.PI;
const camT = new V3().copy(S.p), camP = new V3(0, 2, 6);
function lerpAngle(a, b, k) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return a + d * k; }
function updateCamera(dt) {
  if (S.mode === 'ground' && S.n.y > 0.95 && Math.abs(S.s) > 1.2) {
    unroll(S.yaw, S.n, f);
    camYaw = lerpAngle(camYaw, yawOf(sgn(S.s) * f.x, sgn(S.s) * f.z), damp(2.2, dt));
  }
  camT.x += (S.p.x - camT.x) * damp(22, dt); camT.z += (S.p.z - camT.z) * damp(22, dt);
  camT.y += (S.p.y - camT.y) * damp(6, dt);
  const bx = Math.sin(camYaw), bz = Math.cos(camYaw);
  tmp.set(camT.x - bx * 2.1, camT.y + 0.95, camT.z - bz * 2.1);
  camP.lerp(tmp, damp(16, dt));
  camP.y = Math.max(camP.y, H(camP.x, camP.z) + 0.5);
  camera.position.copy(camP);
  camera.lookAt(camT.x + bx * 1.2, camT.y + 0.2, camT.z + bz * 1.2);
}

// ---------- dessin de la planche, du skateur, du stick
const qT = new THREE.Quaternion(), mB = new THREE.Matrix4(), nVis = new V3(), fVis = new V3(), xVis = new V3();
const qA = new THREE.Quaternion(), qB = new THREE.Quaternion(), qC = new THREE.Quaternion();
const AX = new V3(1, 0, 0), AY = new V3(0, 1, 0), AZ = new V3(0, 0, 1);
function updateVisual(dt) {
  if (S.mode === 'air') {
    const k = S.lip ? clamp(1 - Math.abs(S.v.y) / S.vy0) : clamp(S.tAir / 0.3);
    nVis.lerpVectors(S.nTake, UP, k).normalize();
  } else if (S.mode === 'grind') nVis.copy(UP);
  else nVis.copy(S.n);
  unroll(S.yaw, nVis, fVis);
  xVis.crossVectors(nVis, fVis).normalize(); fVis.crossVectors(xVis, nVis);
  mB.makeBasis(xVis, nVis, fVis); qT.setFromRotationMatrix(mB);
  rig.quaternion.slerp(qT, damp(S.mode === 'ground' ? 22 : 14, dt));
  rig.position.copy(S.p);
  if (S.mode === 'grind') rig.position.y -= S.grind.type === '50-50' ? 0.055 : 0.085;

  // la planche : flip (autour de son axe), shove (autour de la normale), pop (le tail claque)
  let flipA = 0, shoveA = S.slide + S.rev, pitch = 0, lift = 0;
  if (S.mode === 'air' && S.trick) {
    const k = clamp(S.trick.t / S.trick.dur), e = 1 - Math.pow(1 - k, 2);
    flipA = S.trick.flip * TAU * e; shoveA += S.trick.shove * TAU * e;
    lift = 0.16 * Math.sin(Math.PI * k);
  }
  if (S.mode === 'air' && S.tAir < 0.28 && S.tAir > 0) pitch = (S.trick?.nose ? 0.42 : -0.42) * Math.sin(Math.PI * S.tAir / 0.28);
  pitch -= 0.3 * S.grabVis; lift += 0.12 * S.grabVis;   // grab : la planche remonte vers la main, nose tiré
  if (S.mode === 'bail') {
    const k = clamp(S.bailT / 0.5);
    boardPivot.position.set(0.5 * k, 0.09 + 0.25 * Math.sin(Math.PI * k), 0.3 * k);
    qA.setFromAxisAngle(AY, S.boardOff + S.bailT * 9); qB.setFromAxisAngle(AZ, S.bailT * 6);
    boardPivot.quaternion.multiplyQuaternions(qA, qB);
  } else {
    boardPivot.position.set(0, 0.09 + lift * 0.5, 0);
    qA.setFromAxisAngle(AY, S.boardOff + shoveA); qB.setFromAxisAngle(AZ, flipA + 0.25 * S.grabVis); qC.setFromAxisAngle(AX, pitch);
    boardPivot.quaternion.multiplyQuaternions(qA, qB).multiply(qC);
  }

  // la planche penche dans les virages
  S.lean += ((S.mode === 'ground' ? input.steer * 0.12 * clamp(Math.abs(S.s) / 5) : 0) - S.lean) * damp(6, dt);
  if (S.mode !== 'bail') { qA.setFromAxisAngle(AZ, -S.lean); boardPivot.quaternion.premultiply(qA); }
}
const stickCv = document.getElementById('stick'), sx = stickCv.getContext('2d');
const ZN = ['→', '↗', '↑', '↖', '←', '↙', '↓', '↘'];
function drawStick() {
  const W = 240, c = W / 2, R0 = 92;
  sx.clearRect(0, 0, W, W);
  sx.fillStyle = 'rgba(20,20,40,.82)'; sx.beginPath(); sx.arc(c, c, 112, 0, TAU); sx.fill();
  sx.strokeStyle = 'rgba(255,255,255,.18)'; sx.lineWidth = 2; sx.beginPath(); sx.arc(c, c, R0, 0, TAU); sx.stroke();
  sx.fillStyle = 'rgba(255,255,255,.4)'; sx.font = '700 18px Manrope, system-ui'; sx.textAlign = 'center'; sx.textBaseline = 'middle';
  for (let i = 0; i < 8; i++) { const a = ZONE_ANG(i) * D2R; sx.fillText(ZN[i], c + Math.cos(a) * 100, c - Math.sin(a) * 100); }
  if (ST.seq.length) {
    sx.strokeStyle = '#ff5fa8'; sx.lineWidth = 6; sx.lineCap = 'round'; sx.beginPath();
    ST.seq.forEach((z, i) => { const a = ZONE_ANG(z) * D2R, x = c + Math.cos(a) * R0 * 0.8, y = c - Math.sin(a) * R0 * 0.8; i ? sx.lineTo(x, y) : sx.moveTo(x, y); });
    sx.lineTo(c + ST.x * R0, c - ST.y * R0); sx.stroke();
  }
  const tr = ST.drag ? MS.pts : ST.trail;   // le tracé de la souris (en cours, ou le dernier geste en pâle)
  if (tr.length > 1) {
    sx.strokeStyle = ST.drag ? '#ff5fa8' : 'rgba(255,95,168,.4)'; sx.lineWidth = 6; sx.lineCap = sx.lineJoin = 'round'; sx.beginPath();
    tr.forEach((p, i) => { const x = c + clamp(p[0] / 80, -1, 1) * R0, y = c - clamp(p[1] / 80, -1, 1) * R0; i ? sx.lineTo(x, y) : sx.moveTo(x, y); });
    sx.stroke();
  }
  sx.fillStyle = ST.drag || Math.hypot(ST.x, ST.y) > 0.1 ? '#e4ff3a' : 'rgba(255,255,255,.45)';
  sx.beginPath(); sx.arc(c + ST.x * R0, c - ST.y * R0, 16, 0, TAU); sx.fill();
  if (ST.last) { sx.fillStyle = '#fff'; sx.font = '800 17px Manrope, system-ui'; sx.fillText(ST.last, c, c + 40); }
}

// ---------- boucle
const $speed = document.getElementById('speed');
document.getElementById('fold').onclick = e => { const h = document.getElementById('help'); h.classList.toggle('small'); e.target.textContent = h.classList.contains('small') ? 'aide' : 'réduire'; };
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  if (post) post.setSize(w, h, PR);
}
addEventListener('resize', resize); resize();
function physics(dt) {
  const N = 4, h = dt / N;
  for (let i = 0; i < N; i++) {
    if (S.mode === 'ground') stepGround(h);
    else if (S.mode === 'air') stepAir(h);
    else if (S.mode === 'grind') stepGrind(h);
    else if (S.mode === 'bail') { stepBail(h); if (S.mode !== 'bail') break; }
  }
}
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (slow) dt *= 0.35;
  readInput(now); stickTick(now, dt);
  physics(dt);
  updateLine(dt);
  // un point de reprise sur du plat, propre
  if (S.mode === 'ground' && S.n.y > 0.995 && S.p.y < 0.01 && (S.safeT += dt) > 0.5) {
    S.safeT = 0; S.safe.p.copy(S.p); S.safe.yaw = S.yaw;
  }
  if (S.mode === 'grind') showCombo();
  if ((comboShowT += dt) > 2.2 && S.mode === 'ground' && !C.mult) $combo.className = '', $names.textContent = '', $pts.textContent = '';
  if (toastT > 0 && (toastT -= dt) <= 0) $toast.classList.remove('show');
  updateVisual(dt); updateCamera(dt);
  sun.position.copy(S.p).add(SUN_OFF); sun.target.position.copy(S.p);
  if (AC) {
    const roll = S.mode === 'ground' ? Math.min(0.22, Math.abs(S.s) / 45) : 0;
    rollG.gain.setTargetAtTime(roll, AC.currentTime, 0.05); rollF.frequency.setTargetAtTime(250 + Math.abs(S.s) * 70, AC.currentTime, 0.05);
    const scrape = S.mode === 'ground' ? 0.12 * Math.abs(Math.sin(S.slide)) * Math.min(1, Math.abs(S.s) / 4) : 0;
    grindG.gain.setTargetAtTime(S.mode === 'grind' ? 0.16 : scrape, AC.currentTime, 0.03);
  }
  $speed.textContent = `${Math.round(Math.abs(S.mode === 'ground' ? S.s : Math.hypot(S.v.x, S.v.z)) * 3.6)} km/h${S.mode === 'ground' && S.s < -0.5 ? ' · fakie' : ''}`;
  drawStick();
  if (post) post.render(); else renderer.render(scene, camera);
}
requestAnimationFrame(frame);
