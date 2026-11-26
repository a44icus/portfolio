/* ============================================================================
   Le sac, les pièces d'or, les missions et les boutiques.
   - Le sac : pièces d'or et fruits (gardés dans ce navigateur).
   - Les fruits : certaines caisses en lâchent un quand on les percute.
   - Les pièces : le coffre de la grotte de la cascade, et les missions.
   - Les missions : une bulle blanche, à côté de la voiture, dit quoi faire
     (tondre l'herbe, trouver des fruits, ouvrir le coffre…) ; finie, elle
     rapporte des pièces et la suivante arrive.
   - Le food truck vend des glaces (et rachète les fruits) ; la cabane en bois
     vend des accessoires pour la Jeep.
   ============================================================================ */
import * as THREE from 'three';
import { makeKit } from './eggkit.js';
import { getPlace, fwdOfCap } from './placement.js';

const LS = 'planete-sac';
export const FRUITS = { pomme: '🍎', poire: '🍐', orange: '🍊', fraise: '🍓', banane: '🍌', cerise: '🍒' };
const FRUIT_COL = { pomme: '#e8333a', poire: '#b8d443', orange: '#ff9a1f', fraise: '#ff3d5a', banane: '#ffd84a', cerise: '#c2122e' };

/** Les missions, dans l'ordre ; ensuite, elles reviennent, plus longues. */
const MISSIONS = [
  { type: 'tonte', goal: 2000, gain: 10, text: n => `Tonds ${n} brins d’herbe en roulant dessus` },
  { type: 'fruit', goal: 3, gain: 10, text: n => `Percute les caisses : trouve ${n} fruits` },
  { type: 'coffre', goal: 1, gain: 15, text: () => 'Trouve le coffre caché derrière la cascade' },
  { type: 'glace', goal: 1, gain: 8, text: () => 'Offre-toi une glace au food truck' },
  { type: 'zone', goal: 3, gain: 15, text: n => `Visite ${n} zones du portfolio` },
  { type: 'saut', goal: 10, gain: 10, text: n => `Fais ${n} sauts (Espace)` },
  { type: 'gemme', goal: 5, gain: 20, text: n => `Descends dans la mine : ramasse ${n} gemmes` },
  { type: 'accessoire', goal: 1, gain: 10, text: () => 'Achète un accessoire à la boutique en bois' },
  { type: 'tonte', goal: 6000, gain: 25, text: n => `Grande tonte : ${n} brins d’herbe` },
  { type: 'fruit', goal: 8, gain: 20, text: n => `Remplis ton panier : ${n} fruits` },
];
const REPEAT = [['tonte', 4000, 15], ['fruit', 5, 12], ['saut', 15, 10], ['gemme', 8, 20]];
function missionAt(i) {
  if (i < MISSIONS.length) return MISSIONS[i];
  const k = i - MISSIONS.length, [type, goal, gain] = REPEAT[k % REPEAT.length], lap = 1 + Math.floor(k / REPEAT.length) * 0.5;
  const base = MISSIONS.find(m => m.type === type);
  return { type, goal: Math.round(goal * lap), gain: Math.round(gain * lap), text: base.text };
}

/** Les accessoires de la boutique. */
const ACCESSORIES = [
  { id: 'canard', name: 'Canard sur le capot', icon: '🦆', price: 12 },
  { id: 'antenne', name: 'Antenne à pompon', icon: '📡', price: 15 },
  { id: 'fanion', name: 'Drapeau pirate', icon: '🏴‍☠️', price: 20 },
  { id: 'gyro', name: 'Gyrophare', icon: '🚨', price: 25 },
  { id: 'aileron', name: 'Aileron de course', icon: '🏁', price: 30 },
  { id: 'buffle', name: 'Pare-buffle', icon: '🛡️', price: 35 },
  { id: 'phares', name: 'Rampe de phares', icon: '💡', price: 40 },
];

const css = `
.sacHud{position:fixed;left:max(16px,env(safe-area-inset-left));top:72px;z-index:24;display:none;gap:8px;align-items:center;padding:7px 12px;border-radius:999px;background:rgba(26,26,64,.82);color:#fff;font:800 14px/1 Manrope,Arial,sans-serif;box-shadow:0 6px 18px rgba(0,0,0,.25);cursor:pointer;border:0}
.sacHud:hover{background:rgba(46,40,100,.9)}.sacHud .gar{font-size:11px;font-weight:800;opacity:.75;margin-left:2px}
.sacHud.on{display:flex}
.pc{display:inline-block;width:.95em;height:.95em;border-radius:50%;background:radial-gradient(circle at 35% 32%,#fff6b8,#ffcf2e 45%,#d68a00);box-shadow:inset 0 0 0 1.5px #b07000;vertical-align:-.14em;font-style:normal}.sacHud .coins{color:#ffd84a}.sacHud .pop{animation:sacPop .5s ease}
@keyframes sacPop{0%{transform:scale(1)}40%{transform:scale(1.35)}100%{transform:scale(1)}}
.missionBub{position:fixed;left:0;top:0;z-index:25;display:none;width:min(240px,62vw);padding:10px 12px 11px;border-radius:16px;background:#fff;color:#1a1a40;font:700 13px/1.25 Manrope,Arial,sans-serif;box-shadow:0 8px 22px rgba(0,0,0,.22);will-change:transform;pointer-events:none}
.missionBub::after{content:'';position:absolute;left:-7px;bottom:12px;border:8px solid transparent;border-right-color:#fff;border-left:0}
.missionBub .ttl{display:flex;justify-content:space-between;font:900 10px/1 Manrope,Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#7a5cff;margin-bottom:5px}
.missionBub .ttl b{color:#c48a00;letter-spacing:0}
.missionBub .row{display:flex;align-items:center;gap:8px;margin-top:7px}.missionBub .bar{flex:1;height:6px;border-radius:6px;background:#ece8ff;overflow:hidden}.missionBub .bar i{display:block;height:100%;background:linear-gradient(90deg,#7a5cff,#ff5fae);border-radius:6px;transition:width .25s}
.missionBub .ct{font-weight:900;color:#7a5cff;font-variant-numeric:tabular-nums;font-size:11px}
.missionBub.done{background:#fff8d6}.missionBub.done .ttl{color:#c48a00}
.stall{position:fixed;left:50%;bottom:calc(max(18px,env(safe-area-inset-bottom)) + 76px);transform:translateX(-50%) translateY(12px);z-index:27;display:none;flex-direction:column;gap:6px;width:min(380px,92vw);max-height:60vh;overflow:auto;padding:12px;border-radius:18px;background:#fffdf8;color:#1a1a40;font:700 14px/1.2 Manrope,Arial,sans-serif;box-shadow:0 14px 40px rgba(0,0,0,.3);opacity:0;transition:opacity .2s,transform .2s}
.stall.on{display:flex}.stall.show{opacity:1;transform:translateX(-50%)}
.stall h3{margin:0 0 2px;font:900 16px/1.1 Manrope,Arial,sans-serif;display:flex;justify-content:space-between;align-items:center}.stall h3 small{font-size:13px;color:#c48a00}
.stall .sub{font-weight:600;font-size:12px;opacity:.7;margin-bottom:4px}
.stall button{display:flex;align-items:center;gap:8px;width:100%;border:0;border-radius:12px;padding:9px 10px;background:#f1edff;color:#1a1a40;font:inherit;text-align:left;cursor:pointer}
.stall button:hover{background:#e4dcff}.stall button[disabled]{opacity:.45;cursor:default}
.stall button .k{flex:none;width:20px;height:20px;border-radius:6px;background:#1a1a40;color:#fff;font-size:11px;display:grid;place-items:center}
.stall button .p{margin-left:auto;white-space:nowrap;color:#c48a00;font-weight:900}
.stall button.on{background:#d9f7e4}.stall .x{position:absolute;right:10px;top:8px;width:26px;height:26px;padding:0;justify-content:center;border-radius:50%;background:#eee}
`;

/* ---------- la cabane de la boutique (devant : +z) ---------- */
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
function makeCabin() {
  const g = new THREE.Group(); g.name = 'boutique';
  const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, ...o });
  const planks = canvasTex(256, 256, (x, w, h) => { x.fillStyle = '#a8693d'; x.fillRect(0, 0, w, h); for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#9a5f36' : '#b37446'; x.fillRect(0, i * 32 + 2, w, 28); x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(0, i * 32, w, 2); } for (let i = 0; i < 60; i++) { x.fillStyle = 'rgba(60,30,10,.18)'; x.fillRect(Math.random() * w, Math.random() * h, 18 + Math.random() * 30, 1); } });
  planks.wrapS = planks.wrapT = THREE.RepeatWrapping;
  const wall = new THREE.MeshStandardMaterial({ map: planks, roughness: 0.9 }), dark = std('#5a3520'), roof = std('#d8483a', { roughness: 0.7 }), cream = std('#fff3dc'), glass = std('#9fd8ff', { roughness: 0.1, metalness: 0.2 });
  const box = (w, h, d, m, x, y, z, p = g) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); p.add(o); return o; };
  box(1.5, 0.08, 1.2, dark, 0, 0.04, 0);                     // plancher
  box(1.4, 0.95, 1.1, wall, 0, 0.55, 0);                     // murs
  for (const [x, z] of [[-0.72, 0.57], [0.72, 0.57], [-0.72, -0.57], [0.72, -0.57]]) box(0.1, 1.0, 0.1, dark, x, 0.55, z);   // poteaux d'angle
  // toit à deux pentes
  for (const s of [-1, 1]) { const r = box(0.9, 0.06, 1.42, roof, s * 0.4, 1.27, 0); r.rotation.z = -s * 0.62; }
  const gable = new THREE.Shape(); gable.moveTo(-0.72, 0); gable.lineTo(0.72, 0); gable.lineTo(0, 0.52); gable.closePath();
  for (const z of [0.55, -0.55]) { const m = new THREE.Mesh(new THREE.ShapeGeometry(gable), wall); m.position.set(0, 1.02, z); if (z < 0) m.rotation.y = Math.PI; g.add(m); }
  box(0.08, 0.08, 1.5, dark, 0, 1.55, 0);                    // faîtage
  // vitrine, comptoir, porte
  box(0.7, 0.36, 0.02, glass, -0.25, 0.68, 0.56);
  box(0.8, 0.05, 0.22, cream, -0.25, 0.48, 0.64);
  box(0.36, 0.72, 0.03, dark, 0.45, 0.44, 0.565);
  { const kn = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), std('#ffd84a', { metalness: 0.6, roughness: 0.3 })); kn.position.set(0.33, 0.45, 0.59); g.add(kn); }
  // auvent rayé au-dessus de la vitrine
  const stripes = canvasTex(128, 32, (x, w, h) => { for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#ffffff' : '#7a5cff'; x.fillRect(i * w / 8, 0, w / 8, h); } });
  const awn = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.32), new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.8, side: THREE.DoubleSide })); awn.position.set(-0.25, 0.95, 0.68); awn.rotation.x = -1.0; g.add(awn);
  // enseigne
  const sign = canvasTex(512, 128, (x, w, h) => { x.fillStyle = '#3a2416'; x.fillRect(0, 0, w, h); x.strokeStyle = '#ffd84a'; x.lineWidth = 8; x.strokeRect(6, 6, w - 12, h - 12); x.fillStyle = '#ffe9b0'; x.font = '900 54px "Arial Black", Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('ACCESSOIRES', w / 2, h / 2 + 2); });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.28), new THREE.MeshStandardMaterial({ map: sign, roughness: 0.7 })); board.position.set(0, 1.2, 0.59); g.add(board);
  // dans la vitrine : une roue et un petit canard
  { const t = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.04, 8, 16), std('#1d1b26')); t.position.set(-0.45, 0.62, 0.5); g.add(t);
    const d = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), std('#ffd84a')); d.position.set(-0.1, 0.58, 0.5); g.add(d); const h = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), std('#ffd84a')); h.position.set(-0.07, 0.66, 0.53); g.add(h); }
  // tonneau et pneus empilés sur le côté
  { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.4, 14).translate(0, 0.2, 0), std('#8a5a3a')); b.position.set(0.95, 0, 0.3); g.add(b);
    for (let i = 0; i < 3; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.07, 8, 18).rotateX(Math.PI / 2), std('#1d1b26', { roughness: 0.95 })); t.position.set(0.95, 0.07 + i * 0.13, -0.25); g.add(t); } }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { group: g, box: { half: 0.95, front: 0.75, rear: 0.62 } };
}

/* ---------- les accessoires de la Jeep (repère de la caisse : avant +z, haut +y) ---------- */
function makeAccessories() {
  const root = new THREE.Group(); root.name = 'accessoires';
  const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, ...o });
  const black = std('#1d1b26', { roughness: 0.7 }), chrome = std('#dfe3ea', { metalness: 0.8, roughness: 0.25 });
  const parts = {};
  const part = id => { const g = new THREE.Group(); g.visible = false; root.add(g); parts[id] = g; return g; };
  { const g = part('canard'), y = std('#ffd84a', { roughness: 0.4 }), o = std('#ff8a1f');
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10).scale(1, 0.8, 1.2), y); b.position.set(0.16, 0.71, 0.36); g.add(b);
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), y); h.position.set(0.16, 0.79, 0.41); g.add(h);
    const bk = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.05, 8).rotateX(Math.PI / 2), o); bk.position.set(0.16, 0.785, 0.47); g.add(bk);
    for (const x of [-0.02, 0.02]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.009, 6, 4), black); e.position.set(0.16 + x, 0.8, 0.455); g.add(e); } }
  { const g = part('antenne');
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.009, 0.62, 6).translate(0, 0.31, 0), black); r.position.set(0.3, 0.9, -0.5); r.rotation.x = -0.12; g.add(r);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), std('#ff4f86', { roughness: 0.6 })); ball.position.set(0, 0.62, 0); r.add(ball); g.userData.whip = r; }
  { const g = part('fanion');
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.55, 6).translate(0, 0.275, 0), black); pole.position.set(-0.3, 0.9, -0.5); g.add(pole);
    const tex = canvasTex(128, 80, (x, w, h) => { x.fillStyle = '#111'; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.font = '56px serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('☠', w / 2, h / 2 + 4); });
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.16, 6, 1).translate(-0.13, 0, 0), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.9 }));
    fl.position.set(0, 0.47, 0); fl.rotation.y = Math.PI / 2; pole.add(fl); g.userData.flag = fl; }
  { const g = part('gyro');
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.03, 12), black); base.position.set(0, 0.94, -0.29); g.add(base);
    const domeM = new THREE.MeshStandardMaterial({ color: '#ff7a1f', emissive: '#ff6a00', emissiveIntensity: 1.5, roughness: 0.2, transparent: true, opacity: 0.9 });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), domeM); dome.position.set(0, 0.955, -0.29); g.add(dome); g.userData.dome = domeM; }
  { const g = part('aileron'), red = std('#ff3d5a', { roughness: 0.35 });
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.025, 0.16), red); wing.position.set(0, 0.86, -0.66); wing.rotation.x = 0.12; g.add(wing);
    for (const x of [-0.25, 0.25]) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.26, 0.06), black); s.position.set(x, 0.72, -0.62); g.add(s); }
    for (const x of [-0.37, 0.37]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.1, 0.2), red); e.position.set(x, 0.88, -0.66); g.add(e); } }
  { const g = part('buffle');
    const bar = (a, b) => { const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), m = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, A.distanceTo(B), 8), chrome); m.position.copy(A).add(B).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize()); g.add(m); };
    bar([-0.3, 0.3, 0.7], [0.3, 0.3, 0.7]); bar([-0.24, 0.55, 0.68], [0.24, 0.55, 0.68]);
    for (const x of [-0.24, 0.24]) { bar([x, 0.3, 0.7], [x, 0.55, 0.68]); bar([x, 0.55, 0.68], [x * 0.9, 0.6, 0.58]); }
    bar([-0.1, 0.3, 0.71], [-0.1, 0.53, 0.69]); bar([0.1, 0.3, 0.71], [0.1, 0.53, 0.69]); }
  { const g = part('phares'), lm = new THREE.MeshStandardMaterial({ color: '#fff6c8', emissive: '#fff2b0', emissiveIntensity: 2.2 });
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.035, 0.04), black); rail.position.set(0, 0.96, -0.07); g.add(rail);
    for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.08, 0.06), black); c.position.set(-0.225 + i * 0.15, 1.0, -0.06); g.add(c); const l = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.06), lm); l.position.set(-0.225 + i * 0.15, 1.0, -0.028); g.add(l); } }
  root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { root, parts };
}

/* ---------- un fruit en 3D (pour l'animation de la caisse au panier) ---------- */
function fruitMesh(kind) {
  const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: FRUIT_COL[kind], roughness: 0.4 }), leaf = new THREE.MeshStandardMaterial({ color: '#3fae4a', roughness: 0.6 });
  if (kind === 'banane') { const b = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.04, 8, 14, Math.PI * 0.8), m); b.rotation.z = Math.PI * 0.1; g.add(b); }
  else if (kind === 'cerise') { for (const x of [-0.05, 0.05]) { const c = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), m); c.position.set(x, 0, 0); g.add(c); } const s = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.14, 4), leaf); s.position.y = 0.08; g.add(s); }
  else {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 12), m); if (kind === 'poire') s.scale.set(0.9, 1.2, 0.9); if (kind === 'fraise') s.scale.set(0.9, 1.15, 0.9); g.add(s);
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.06, 4), new THREE.MeshStandardMaterial({ color: '#5a3520' })); st.position.y = 0.11; g.add(st);
    const lf = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6).scale(1.6, 0.4, 0.8), leaf); lf.position.set(0.03, 0.12, 0); g.add(lf);
  }
  return g;
}

export function makeShop({ planet, sections, R, scene, camera, avatar, truck, audio, toast }) {
  const A = () => (typeof audio === 'function' ? audio() : audio);
  const sfx = k => { const a = A(); if (a && a.started) a.sfx(k); };
  const say = (t, ms) => toast && toast(t, ms);
  { const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); }

  /* ---------- le sac ---------- */
  let S = { pieces: 0, fruits: {}, owned: [], on: [], m: 0, p: 0, zones: [], wait: 0 };   // wait : heure (ms) où la prochaine mission arrive
  try { const s = JSON.parse(localStorage.getItem(LS) || 'null'); if (s && typeof s === 'object') S = { ...S, ...s }; } catch (e) { /* rien */ }
  const save = () => { try { localStorage.setItem(LS, JSON.stringify(S)); } catch (e) { /* rien */ } };
  const nFruits = () => Object.values(S.fruits).reduce((a, b) => a + b, 0);

  const hud = document.createElement('button'); hud.type = 'button'; hud.className = 'sacHud'; hud.title = 'Mon garage : mettre ou retirer les accessoires (touche I)'; document.body.appendChild(hud);
  hud.addEventListener('click', e => { e.stopPropagation(); A()?.start?.(); openStall('garage'); });
  function drawHud(pop) {
    const fr = Object.entries(S.fruits).filter(([, n]) => n > 0).map(([k, n]) => `<span>${FRUITS[k]}${n}</span>`).join('');
    hud.innerHTML = `<span class="coins${pop === 'coins' ? ' pop' : ''}"><i class="pc"></i> ${S.pieces}</span>` + (fr ? `<span${pop === 'fruit' ? ' class="pop"' : ''} style="display:flex;gap:6px">${fr}</span>` : '') + (S.owned.length ? '<span class="gar">🔧 garage</span>' : '');
  }
  drawHud();
  function addCoins(n, why) {
    S.pieces = Math.max(0, S.pieces + n); save(); drawHud('coins');
    if (n > 0) { sfx('coin'); if (why) say(why + '  +' + n + ' pièces d’or', 2200); }
  }

  /* ---------- missions et bulle ---------- */
  const bub = document.createElement('div'); bub.className = 'missionBub'; document.body.appendChild(bub);
  let doneT = 0, lastHtml = '';
  const cur = () => missionAt(S.m);
  const GAP = 5 * 60 * 1000;   // une nouvelle mission toutes les 5 minutes
  const waiting = () => Date.now() < (S.wait || 0);
  let wasWaiting = waiting();
  const FIRST = 60 * 1000;   // la toute première mission arrive une minute après l'atterrissage
  const bp = { x: 0, y: 0, on: false };   // position lissée de la bulle (pas de tremblement avec la suspension)
  function drawBub() {
    const M = cur(), html = doneT > 0
      ? `<div class="ttl"><span>Mission réussie !</span><b>+${missionAt(S.m - 1).gain} <i class="pc"></i></b></div>Bravo ! Voici tes pièces d’or. Prochaine mission dans 5 minutes.`
      : `<div class="ttl"><span>Mission ${S.m + 1}</span><b>+${M.gain} <i class="pc"></i></b></div>${M.text(M.goal)}<div class="row"><div class="bar"><i style="width:${Math.min(100, S.p / M.goal * 100).toFixed(1)}%"></i></div>${M.goal > 1 ? `<span class="ct">${Math.min(S.p, M.goal)} / ${M.goal}</span>` : ''}</div>`;
    if (html !== lastHtml) { bub.innerHTML = html; lastHtml = html; bub.classList.toggle('done', doneT > 0); }
  }
  let saveT = 0;
  /** Quelque chose est arrivé (tonte, fruit, coffre…) : la mission avance. */
  function event(type, n = 1, key = null) {
    if (type === 'zone') { if (!key || S.zones.includes(key)) return; S.zones.push(key); }
    const M = cur(); if (doneT > 0 || waiting() || M.type !== type) { if (type === 'zone') save(); return; }
    S.p += n;
    if (S.p >= M.goal) { S.m++; S.p = 0; doneT = 3.2; S.wait = Date.now() + GAP; wasWaiting = true; save(); addCoins(M.gain); sfx('star'); }
    else if (type === 'tonte') { saveT = 2; } else save();
    drawBub();
  }

  /* ---------- fruits des caisses ---------- */
  const crates = new WeakMap(), flying = [];
  const kinds = Object.keys(FRUITS);
  /** Une caisse a été percutée (b : corps physique, s : force du choc). */
  function crateHit(b, s) {
    if (s < 1.1) return;
    let c = crates.get(b);
    if (!c) { const h = Math.abs(Math.sin(b.home.dir.x * 912.3 + b.home.dir.y * 311.7 + b.home.dir.z * 77.1) * 43758.5) % 1; c = { fruit: h < 0.55, kind: kinds[Math.floor(h * 977) % kinds.length], next: 0 }; crates.set(b, c); }
    const now = performance.now() / 1000;
    if (!c.fruit || now < c.next) return;
    c.next = now + 90;   // la caisse se remplit au bout d'une minute et demie
    const m = fruitMesh(c.kind); m.position.copy(b.mesh.position).addScaledVector(b.dir, 0.4); scene.add(m);
    flying.push({ m, kind: c.kind, t: 0, from: m.position.clone(), up: b.dir.clone() });
    sfx('pick');
  }
  function gotFruit(kind) {
    S.fruits[kind] = (S.fruits[kind] || 0) + 1; save(); drawHud('fruit');
    say('Un fruit ! ' + FRUITS[kind], 1400); event('fruit');
  }

  /* ---------- le coffre de la cascade : une poignée de pièces par visite ---------- */
  let chestLooted = false;
  function chest() {
    event('coffre');
    if (chestLooted) { say('Le coffre est vide… il se remplit à chaque visite', 2000); return; }
    chestLooted = true; setTimeout(() => addCoins(25, 'Le trésor du coffre !'), 500);
  }

  /* ---------- la boutique : une cabane en bois près du food truck ---------- */
  const cab = makeCabin(); scene.add(cab.group);
  const K = makeKit({ planet, sections, R, seed: 5521 });
  let dir = null, cap = 0;
  { const man = getPlace('boutique');
    if (man) { dir = man.dir; cap = man.cap; }
    else {
      const td = truck.position.clone().normalize();
      dir = K.findSpot(d => K.dry(d, 0.15) && K.farFromZones(d, 0.3) && K.flat(d, 0.2, 1.1) && K.treesWithin(d, 1.4) === 0 && K.angDist(d, td) > 3.2, { tries: 6000, score: d => -Math.abs(K.angDist(d, td) - 4.5) })
        || K.findSpot(d => K.dry(d, 0.15) && K.farFromZones(d, 0.3) && K.flat(d, 0.3, 1.0), { tries: 4000 }) || new THREE.Vector3(0, 1, 0);
      // la vitrine regarde le food truck
      const toT = td.clone().projectOnPlane(dir).normalize(), f0 = fwdOfCap(dir, 0), r0 = new THREE.Vector3().crossVectors(dir, f0);
      cap = Math.atan2(toT.dot(r0), toT.dot(f0)) * 180 / Math.PI;
    }
    const f = fwdOfCap(dir, cap), r = new THREE.Vector3().crossVectors(dir, f);
    cab.group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(r, dir, f));
    cab.group.position.copy(dir).multiplyScalar(planet.heightDir(dir) - 0.03);
  }

  /* ---------- les accessoires sur la Jeep ---------- */
  const acc = makeAccessories(); avatar.userData.body.add(acc.root);
  const applyAcc = () => { for (const [id, g] of Object.entries(acc.parts)) g.visible = S.on.includes(id); };
  applyAcc();

  /* ---------- les comptoirs (food truck, boutique) ---------- */
  const stall = document.createElement('div'); stall.className = 'stall'; document.body.appendChild(stall);
  let open = null;   // 'truck' | 'shop'
  let iceT = 0;
  function rowsTruck() {
    const nf = nFruits();
    return {
      title: 'Le glacier 🍦', sub: 'Une glace donne un coup de fouet : la Jeep va plus vite pendant un moment.',
      rows: [
        { icon: '🍦', label: 'Glace vanille', price: '5 <i class="pc"></i>', ok: S.pieces >= 5, go() { addCoins(-5); eat(30, 'Miam ! Glace vanille 🍦 : la Jeep file pendant 30 s'); } },
        { icon: '🍧', label: 'Sorbet aux fruits (2 fruits)', price: '2 <i class="pc"></i>', ok: S.pieces >= 2 && nf >= 2, go() { addCoins(-2); takeFruits(2); eat(50, 'Rafraîchissant ! Sorbet 🍧 : turbo pendant 50 s'); } },
        { icon: '🧺', label: nf ? `Vendre mes ${nf} fruit${nf > 1 ? 's' : ''}` : 'Vendre des fruits (tu n’en as pas)', price: '+3 <i class="pc"></i> / fruit', ok: nf > 0, go() { const n = nFruits(); S.fruits = {}; save(); addCoins(3 * n, 'Le marchand t’achète tes fruits'); } },
      ],
    };
  }
  /** Le garage : partout, on met ou on retire ce qu'on a acheté. */
  function rowsGarage() {
    const own = ACCESSORIES.filter(a => S.owned.includes(a.id));
    const nf = nFruits(), fr = Object.entries(S.fruits).filter(([, n]) => n > 0).map(([k, n]) => FRUITS[k] + ' ' + n).join('  ');
    return {
      title: 'Mon garage 🔧', sub: own.length ? 'Touche un accessoire pour le mettre ou le retirer.' + (nf ? ' Panier : ' + fr : '') : 'Pas encore d’accessoire : la boutique en bois en vend, près du food truck.' + (nf ? ' Panier : ' + fr : ''),
      rows: own.map(a => { const on = S.on.includes(a.id); return { icon: a.icon, label: a.name, price: on ? 'Retirer' : 'Mettre', on, ok: true, go() { toggleAcc(a.id); } }; }),
    };
  }
  function toggleAcc(id) { S.on = S.on.includes(id) ? S.on.filter(x => x !== id) : S.on.concat(id); save(); applyAcc(); sfx('pick'); }
  function rowsShop() {
    return {
      title: 'La boutique d’accessoires 🔧', sub: 'Achète une fois, puis mets ou retire l’accessoire quand tu veux.',
      rows: ACCESSORIES.map(a => {
        const own = S.owned.includes(a.id), on = S.on.includes(a.id);
        return { icon: a.icon, label: a.name, price: own ? (on ? 'Retirer' : 'Mettre') : a.price + ' <i class="pc"></i>', on, ok: own || S.pieces >= a.price, go() {
          if (!own) { addCoins(-a.price); S.owned.push(a.id); S.on.push(a.id); save(); applyAcc(); drawHud(); say(a.icon + ' ' + a.name + ' : installé sur ta Jeep !', 2200); sfx('power'); event('accessoire'); return; }
          toggleAcc(a.id);
        } };
      }),
    };
  }
  function takeFruits(n) { for (const k of kinds) { while (n > 0 && S.fruits[k] > 0) { S.fruits[k]--; n--; } } save(); drawHud(); }
  function eat(s, msg) { iceT = s; say(msg, 2600); sfx('power'); event('glace'); }
  function render() {
    if (!open) return;
    const D = open === 'truck' ? rowsTruck() : open === 'garage' ? rowsGarage() : rowsShop();
    stall.innerHTML = `<button class="x" type="button" aria-label="Fermer">×</button><h3>${D.title}<small><i class="pc"></i> ${S.pieces}</small></h3><div class="sub">${D.sub}</div>`;
    D.rows.forEach((r, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.disabled = !r.ok; if (r.on) b.classList.add('on');
      b.innerHTML = `<span class="k">${i + 1}</span><span>${r.icon}</span><span>${r.label}</span><span class="p">${r.price}</span>`;
      b.addEventListener('click', e => { e.stopPropagation(); A()?.start?.(); if (!r.ok) return; r.go(); render(); });
      stall.appendChild(b);
    });
    stall.querySelector('.x').addEventListener('click', e => { e.stopPropagation(); close(); });
    stall._rows = D.rows;
  }
  function openStall(kind) {
    if (open === kind) { close(); return; }
    open = kind; render(); stall.classList.add('on'); requestAnimationFrame(() => stall.classList.add('show')); sfx('pick');
  }
  function close() { open = null; stall.classList.remove('show'); setTimeout(() => { if (!open) stall.classList.remove('on'); }, 200); }
  addEventListener('keydown', e => {
    if (e.code === 'KeyI' && !e.repeat && hud.classList.contains('on') && !(e.target && /input|textarea/i.test(e.target.tagName))) { openStall('garage'); e.stopImmediatePropagation(); return; }
    if (!open) return;
    if (e.key === 'Escape') { close(); return; }
    const n = +e.key; if (n >= 1 && stall._rows && n <= stall._rows.length) { const r = stall._rows[n - 1]; if (r.ok) { r.go(); render(); } e.stopImmediatePropagation(); }
  }, true);

  const truckItem = { get prompt() { return 'Acheter une glace'; }, go() { openStall('truck'); } };
  const shopItem = { get prompt() { return 'Entrer dans la boutique d’accessoires'; }, go() { openStall('shop'); } };
  const winPt = new THREE.Vector3();
  const truckWindow = () => truck.localToWorld(winPt.set(1.0, 0, -0.18));
  /** L'invite (E) près du guichet du food truck, ou null. */
  function near(car) { return car.distanceTo(truckWindow()) < 1.4 ? truckItem : null; }
  const solid = { obj: cab.group, ...cab.box, prompt: 'Entrer dans la boutique d’accessoires', go: () => openStall('shop') };

  /* ---------- chaque image ---------- */
  const v = new THREE.Vector3(), up = new THREE.Vector3(), tmp = new THREE.Vector3();
  function update(dt, t, { show = true, car = null, ride = 'jeep' } = {}) {
    acc.root.visible = ride === 'jeep';
    if (iceT > 0) iceT = Math.max(0, iceT - dt);
    if (saveT > 0 && (saveT -= dt) <= 0) save();
    if (doneT > 0 && (doneT -= dt) <= 0) drawBub();
    // l'animation des accessoires
    if (acc.parts.gyro.visible) acc.parts.gyro.userData.dome.emissiveIntensity = 0.6 + 2.2 * Math.max(0, Math.sin(t * 9));
    if (acc.parts.fanion.visible) acc.parts.fanion.userData.flag.rotation.y = Math.PI / 2 + Math.sin(t * 7) * 0.25;
    if (acc.parts.antenne.visible) acc.parts.antenne.userData.whip.rotation.z = Math.sin(t * 5) * 0.08;
    // les fruits volent de la caisse à la voiture
    for (let i = flying.length - 1; i >= 0; i--) {
      const f = flying[i]; f.t += dt; const k = Math.min(1, f.t / 0.9);
      if (k < 0.45) { const e = k / 0.45; f.m.position.copy(f.from).addScaledVector(f.up, Math.sin(e * Math.PI / 2) * 0.9); f.m.scale.setScalar(0.4 + e * 1.4); }
      else if (car) { const e = (k - 0.45) / 0.55; tmp.copy(f.from).addScaledVector(f.up, 0.9); f.m.position.lerpVectors(tmp, v.copy(car).addScaledVector(car.clone().normalize(), 0.7), e * e); f.m.scale.setScalar(1.8 * (1 - e) + 0.2); }
      f.m.rotation.y += dt * 6;
      if (k >= 1) { scene.remove(f.m); flying.splice(i, 1); gotFruit(f.kind); }
    }
    hud.classList.toggle('on', show);
    if (open && (!show || !car || (open !== 'garage' && car.distanceTo(open === 'truck' ? truckWindow() : cab.group.position) > 3.2))) close();
    // la mission suivante arrive cinq minutes après la précédente
    if (show && car && !S.first) { S.first = 1; if (S.m === 0 && !S.p) { S.wait = Date.now() + FIRST; wasWaiting = true; } save(); }
    if (wasWaiting && !waiting()) { wasWaiting = false; sfx('pick'); say('Nouvelle mission ! ✉️', 1800); }
    if (!show || !car || (doneT <= 0 && waiting())) { bub.style.display = 'none'; bp.on = false; return; }
    drawBub();
    camera.updateMatrixWorld();   // (la caméra vient de bouger : sans cela, la bulle a une image de retard et tremble)
    up.copy(car).normalize(); v.copy(car).addScaledVector(up, 1.15).project(camera);
    if (v.z > 1 || Math.abs(v.x) > 1.2 || Math.abs(v.y) > 1.2) { bub.style.display = 'none'; bp.on = false; return; }
    bub.style.display = 'block';
    const x = Math.min(innerWidth - bub.offsetWidth - 10, (v.x + 1) / 2 * innerWidth + 70), y = Math.max(bub.offsetHeight + 60, (1 - v.y) / 2 * innerHeight + 40);
    // la bulle suit la voiture en douceur : les petites secousses (suspension, caméra) sont gommées
    if (!bp.on) { bp.x = x; bp.y = y; bp.on = true; } else { const k = 1 - Math.exp(-dt * 22); bp.x += (x - bp.x) * k; bp.y += (y - bp.y) * k; }
    bub.style.transform = `translate3d(${bp.x.toFixed(1)}px, ${(bp.y - bub.offsetHeight).toFixed(1)}px, 0)`;
  }

  return {
    update, event, crateHit, chest, near, solid, cabin: cab.group, dir, close,
    get speedK() { return iceT > 0 ? 1.3 : 1; },
    get open() { return open; },
    /** pour les essais */
    dbg: { get S() { return S; }, addCoins, openStall, truckWindow },
  };
}
