/* ============================================================================
   Véhicules des clins d'œil : le BMX rouge au panier couvert d'un drap blanc
   (E.T.) et le kart (le monde du tuyau vert). Même repère que la Jeep :
   x à droite, y en haut, z vers l'avant, le sol à y = 0.
   ============================================================================ */
import * as THREE from 'three';

const Y = new THREE.Vector3(0, 1, 0);
const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, ...o });
function tube(parent, a, b, r, m) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), L = A.distanceTo(B);
  const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 8), m);
  t.position.copy(A).add(B).multiplyScalar(0.5); t.quaternion.setFromUnitVectors(Y, B.clone().sub(A).normalize()); parent.add(t); return t;
}
function rbox(w, h, d, m, r = 0.03) {
  const g = new THREE.BoxGeometry(w, h, d, 2, 2, 2), p = g.attributes.position, v = new THREE.Vector3(), hw = w / 2 - r, hh = h / 2 - r, hd = d / 2 - r;
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const c = new THREE.Vector3(Math.max(-hw, Math.min(hw, v.x)), Math.max(-hh, Math.min(hh, v.y)), Math.max(-hd, Math.min(hd, v.z))); v.sub(c).normalize().multiplyScalar(r).add(c); p.setXYZ(i, v.x, v.y, v.z); }
  g.computeVertexNormals(); return new THREE.Mesh(g, m);
}
/** Halo rond (sprite additif). */
export function glowSprite(color, size, opacity = 0.8) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.setScalar(size); return s;
}

/* ---------- BMX : cadre rouge et blanc, jantes dorées, caisse à lait grise sur porte-bagages, drap blanc, enfant en sweat rouge ---------- */
let crateT = null;
function crateTex() {   // plastique gris ajouré : losanges et fentes, poignée découpée en haut
  if (crateT) return crateT;
  const c = document.createElement('canvas'); c.width = 256; c.height = 160; const x = c.getContext('2d');
  x.fillStyle = '#a6a8ac'; x.fillRect(0, 0, 256, 160);
  x.fillStyle = '#5e6064';
  for (let r = 0; r < 4; r++) for (let k = 0; k < 9; k++) { const cx = 18 + k * 27.5 + (r % 2) * 13.7, cy = 52 + r * 25; x.beginPath(); x.moveTo(cx, cy - 9); x.lineTo(cx + 9, cy); x.lineTo(cx, cy + 9); x.lineTo(cx - 9, cy); x.closePath(); x.fill(); }
  x.beginPath(); x.roundRect(78, 14, 100, 20, 10); x.fill();   // poignée
  x.fillStyle = '#c4c6ca'; x.fillRect(0, 0, 256, 6); x.fillRect(0, 154, 256, 6); x.fillRect(0, 0, 6, 160); x.fillRect(250, 0, 6, 160);
  crateT = new THREE.CanvasTexture(c); crateT.colorSpace = THREE.SRGBColorSpace; return crateT;
}
export function makeBMX({ rider = true } = {}) {
  const bike = new THREE.Group(), lean = new THREE.Group(); bike.add(lean);
  const red = mat('#d61e2a', { roughness: 0.25, metalness: 0.2 }), white = mat('#f2f2f0', { roughness: 0.25, metalness: 0.1 }), black = mat('#141418', { roughness: 0.8 });
  const chrome = mat('#cfd2d8', { roughness: 0.18, metalness: 0.9 }), gold = mat('#c9a26a', { roughness: 0.3, metalness: 0.6 }), brown = mat('#5a3426', { roughness: 0.55 });
  const WR = 0.24, ZF = 0.42, ZR = -0.4;
  function wheel() {
    const w = new THREE.Group();
    w.add(new THREE.Mesh(new THREE.TorusGeometry(WR - 0.032, 0.034, 10, 32).rotateY(Math.PI / 2), black));
    w.add(new THREE.Mesh(new THREE.TorusGeometry(WR - 0.07, 0.015, 6, 32).rotateY(Math.PI / 2), gold));
    w.add(new THREE.Mesh(new THREE.CylinderGeometry(WR - 0.06, WR - 0.06, 0.03, 32, 1, true).rotateZ(Math.PI / 2), gold));
    for (let i = 0; i < 18; i++) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, WR - 0.07, 4).translate(0, (WR - 0.07) / 2, 0), chrome); s.rotation.x = i / 18 * Math.PI * 2; s.position.x = (i % 2 ? 1 : -1) * 0.012; s.rotation.z = (i % 2 ? -1 : 1) * 0.04; w.add(s); }
    w.add(new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.08, 12).rotateZ(Math.PI / 2), chrome));
    return w;
  }
  const wR = wheel(); wR.position.set(0, WR, ZR); lean.add(wR);
  const fork = new THREE.Group(); fork.position.set(0, WR, ZF); lean.add(fork);   // fourche + roue avant + guidon + caisse : tournent ensemble
  fork.rotation.x = -0.32;
  const wF = wheel(); fork.add(wF);
  for (const x of [-0.045, 0.045]) tube(fork, [x, 0, 0], [x * 0.6, 0.5, 0], 0.016, white);
  tube(fork, [0, 0.48, 0], [0, 0.62, 0], 0.024, white);                       // douille de direction
  tube(fork, [0, 0.62, 0], [0, 0.7, -0.03], 0.014, black);                     // potence
  tube(fork, [-0.24, 0.72, -0.05], [0.24, 0.72, -0.05], 0.013, black);         // cintre
  for (const x of [-0.24, 0.24]) { const g = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.11, 10).rotateZ(Math.PI / 2), black); g.position.set(x * 1.08, 0.72, -0.05); fork.add(g); }
  // porte-bagages blanc et caisse à lait grise
  const basket = new THREE.Group(); basket.position.set(0, 0.6, 0.2); fork.add(basket);
  const CW = 0.42, CH = 0.26, CD = 0.34;
  for (const x of [-0.11, 0.11]) { tube(fork, [x * 0.5, 0.02, 0.02], [x, 0.6 - CH / 2, 0.2], 0.01, white); tube(fork, [x, 0.6 - CH / 2, 0.06], [x, 0.6 - CH / 2, 0.34], 0.009, white); }
  { const cm = mat('#ffffff', { map: crateTex(), roughness: 0.6 }), plain = mat('#9fa1a5', { roughness: 0.6 });
    const bot = rbox(CW, 0.02, CD, plain, 0.006); bot.position.y = -CH / 2; basket.add(bot);
    for (const sz of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(CW, CH, 0.016), [plain, plain, plain, plain, cm, cm]); p.position.z = sz * CD / 2; basket.add(p); }
    for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.016, CH, CD), [cm, cm, plain, plain, plain, plain]); p.position.x = sx * CW / 2; basket.add(p); }
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const post = rbox(0.035, CH + 0.01, 0.035, plain, 0.008); post.position.set(x * CW / 2, 0, z * CD / 2); basket.add(post); }
    const lip = new THREE.Mesh(new THREE.BoxGeometry(CW + 0.03, 0.025, CD + 0.03), plain); lip.position.y = CH / 2; basket.add(lip);
    const lipIn = new THREE.Mesh(new THREE.BoxGeometry(CW - 0.01, 0.03, CD - 0.01), mat('#6e7074', { roughness: 0.7 })); lipIn.position.y = CH / 2 + 0.002; basket.add(lipIn); lipIn.visible = false;
    // le drap : haut, posé dans la caisse, qui retombe sur ses bords ; une ouverture sombre devant, deux grands yeux qui brillent
    const pts = [[0.26, CH / 2 - 0.06], [0.25, CH / 2 + 0.01], [0.22, CH / 2 + 0.08], [0.19, CH / 2 + 0.18], [0.17, CH / 2 + 0.28]].map(([r, y]) => new THREE.Vector2(r, y));
    for (let i = 1; i <= 10; i++) { const a = i / 10 * Math.PI / 2; pts.push(new THREE.Vector2(Math.max(0.001, 0.17 * Math.cos(a)), CH / 2 + 0.28 + 0.17 * Math.sin(a) * 1.05)); }
    const sheetG = new THREE.LatheGeometry(pts, 32); sheetG.scale(1, 1, 0.86);
    const sp = sheetG.attributes.position;
    for (let i = 0; i < sp.count; i++) { const x = sp.getX(i), z = sp.getZ(i), y = sp.getY(i), a = Math.atan2(z, x), low = THREE.MathUtils.smoothstep(CH / 2 + 0.3, CH / 2 - 0.05, y), f = 1 + 0.06 * low * Math.sin(a * 9) + 0.03 * low * Math.sin(a * 4 + 1); sp.setX(i, x * f); sp.setZ(i, z * f + 0.03 * (y - CH / 2)); }
    sheetG.computeVertexNormals();
    const sheet = new THREE.Mesh(sheetG, mat('#efece6', { roughness: 0.95, side: THREE.DoubleSide })); basket.add(sheet);
    const hy = CH / 2 + 0.31;
    const open = new THREE.Mesh(new THREE.SphereGeometry(0.1, 18, 12), mat('#141018', { roughness: 0.9 })); open.scale.set(1.15, 0.95, 0.35); open.position.set(0, hy, 0.14); basket.add(open);
    for (const sx of [-1, 1]) {
      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 2.1, 2.6) })); iris.scale.set(1.2, 1, 0.6); iris.position.set(sx * 0.045, hy + 0.01, 0.168); basket.add(iris);
      const eg = glowSprite('#bfe8ff', 0.16, 0.7); eg.position.set(sx * 0.045, hy + 0.01, 0.18); basket.add(eg);
    }
  }
  // une lueur rouge sous le drap : le cœur qui bat
  const heart = glowSprite('#ff3040', 0.36, 0); heart.position.set(0, 0.72, 0.2); fork.add(heart);
  // phare rond sous la caisse
  const lampM = mat('#fff6d8', { emissive: '#fff2c0', emissiveIntensity: 2 }); lampM.userData.glow = 2;
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 14).rotateX(Math.PI / 2), lampM); lamp.position.set(0, 0.42, 0.38); fork.add(lamp);
  // cadre : tube supérieur et douille blancs, tube oblique et haubans rouges
  const BB = [0, 0.27, -0.02], ST = [0, 0.64, -0.15], HT = [0, 0.64, 0.3], HL = [0, 0.46, 0.36];
  tube(lean, ST, HT, 0.021, white); tube(lean, BB, HL, 0.024, red); tube(lean, BB, ST, 0.022, red);
  for (const x of [-0.04, 0.04]) { tube(lean, [x, WR, ZR], [x * 0.5, BB[1], BB[2]], 0.012, white); tube(lean, [x, WR, ZR], [x * 0.5, ST[1] - 0.03, ST[2]], 0.012, red); }
  tube(lean, ST, [0, 0.76, -0.18], 0.013, chrome);
  { const seat = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 10), brown); seat.scale.set(0.9, 0.38, 1.7); seat.position.set(0, 0.79, -0.2); lean.add(seat); }
  // pédalier et chaîne
  const crank = new THREE.Group(); crank.position.set(0, BB[1], BB[2]); lean.add(crank);
  crank.add(new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.012, 22).rotateZ(Math.PI / 2).translate(0.05, 0, 0), chrome));
  for (const y of [0.075, -0.075]) tube(lean, [0.05, BB[1] + y, BB[2]], [0.05, WR + y * 0.4, ZR], 0.005, black);
  const pedals = [];
  for (const sx of [-1, 1]) { const arm = new THREE.Group(); arm.rotation.x = sx > 0 ? 0 : Math.PI; crank.add(arm); tube(arm, [sx * 0.07, 0, 0], [sx * 0.07, -0.15, 0], 0.01, chrome); const p = rbox(0.08, 0.018, 0.05, black, 0.006); p.position.set(sx * 0.11, -0.15, 0); arm.add(p); pedals.push(p); }
  // le pilote : sweat rouge à capuche relevée, jean bleu, baskets blanches
  let kid = null;
  if (rider) {
    kid = new THREE.Group(); lean.add(kid);
    const hood = mat('#d01c24', { roughness: 0.6 }), jean = mat('#4a6ea8', { roughness: 0.85 }), skin = mat('#f0c8a6', { roughness: 0.7 }), hair = mat('#4a2c1a', { roughness: 0.9 }), shoe = mat('#f4f4f4', { roughness: 0.5 });
    const torso = rbox(0.3, 0.34, 0.21, hood, 0.09); torso.position.set(0, 1.0, -0.1); torso.rotation.x = 0.25; kid.add(torso);
    const pocket = rbox(0.2, 0.08, 0.02, mat('#b8161e', { roughness: 0.6 }), 0.02); pocket.position.set(0, 0.9, -0.0); pocket.rotation.x = 0.25; kid.add(pocket);
    const hd = new THREE.Mesh(new THREE.SphereGeometry(0.095, 18, 14), skin); hd.position.set(0, 1.27, 0.035); kid.add(hd);
    const fringe = new THREE.Mesh(new THREE.SphereGeometry(0.098, 18, 10, -1.3, 2.6, 0.35, 0.6), hair); fringe.position.copy(hd.position); kid.add(fringe);
    // capuche : une coque ouverte sur le visage
    const hoodG = new THREE.SphereGeometry(0.135, 20, 16, Math.PI * 0.36, Math.PI * 1.28, 0, Math.PI * 0.8); hoodG.rotateY(Math.PI / 2);
    const hoodM = new THREE.Mesh(hoodG, mat('#d01c24', { roughness: 0.6, side: THREE.DoubleSide })); hoodM.position.set(0, 1.28, -0.02); hoodM.rotation.x = -0.15; kid.add(hoodM);
    const hem = new THREE.Mesh(new THREE.TorusGeometry(0.112, 0.02, 8, 24), hood); hem.scale.set(0.95, 1.1, 1); hem.position.set(0, 1.27, 0.085); kid.add(hem);   // bord de la capuche autour du visage
    for (const sx of [-1, 1]) {   // bras vers le guidon
      tube(kid, [sx * 0.15, 1.1, -0.06], [sx * 0.2, 0.96, 0.12], 0.045, hood);
      tube(kid, [sx * 0.2, 0.96, 0.12], [sx * 0.25, 0.88, 0.32], 0.04, hood);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.036, 10, 8), skin); hand.position.set(sx * 0.255, 0.875, 0.34); kid.add(hand);
    }
    const hips = rbox(0.24, 0.12, 0.18, jean, 0.05); hips.position.set(0, 0.85, -0.2); kid.add(hips);
    kid.userData.legs = [-1, 1].map(sx => { const thigh = tube(kid, [sx * 0.08, 0.84, -0.18], [sx * 0.1, 0.62, 0.02], 0.045, jean), shin = tube(kid, [sx * 0.1, 0.62, 0.02], [sx * 0.11, 0.3, -0.02], 0.04, jean); const sh = rbox(0.08, 0.06, 0.15, shoe, 0.025); kid.add(sh); return { thigh, shin, sh, sx }; });
  }
  bike.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const tmpA = new THREE.Vector3(), tmpK = new THREE.Vector3(), tmpF = new THREE.Vector3();
  /** Animation : roues, pédales, jambes du pilote, guidon, inclinaison dans les virages, petit vol au-dessus de l'eau. */
  let hov = 0, lean0 = 0;
  function anim({ spin = 0, steer = 0, speed = 0, t = 0, dt = 0.016, wet = false, heart: hk = 0 }) {
    wR.rotation.x = wF.rotation.x = spin * 0.8; crank.rotation.x = spin * 0.45;
    fork.rotation.y = -steer * 0.5;
    lean0 += (-steer * Math.min(1, Math.abs(speed) / 4) * 0.32 - lean0) * (1 - Math.exp(-dt * 6)); lean.rotation.z = lean0;
    hov += ((wet ? 1 : 0) - hov) * (1 - Math.exp(-dt * 4)); lean.position.y = hov * (0.4 + 0.06 * Math.sin(t * 2.4));
    heart.material.opacity = hk * (0.55 + 0.45 * Math.sin(t * (3 + 6 * hk)) ** 2);
    if (kid) for (const L of kid.userData.legs) {   // le pied suit la pédale (genou calculé grossièrement)
      L.sh.parent.updateMatrixWorld(); const p = pedals[L.sx > 0 ? 1 : 0]; p.getWorldPosition(tmpA); kid.worldToLocal(tmpA);
      const hip = tmpK.set(L.sx * 0.08, 0.84, -0.18), knee = tmpF.copy(hip).lerp(tmpA, 0.5).add(new THREE.Vector3(0, 0.12, 0.12));
      const set = (m, a, b) => { m.position.copy(a).add(b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(Y, b.clone().sub(a).normalize()); m.scale.y = a.distanceTo(b) / m.geometry.parameters.height; };
      set(L.thigh, hip, knee); set(L.shin, knee, tmpA); L.sh.position.copy(tmpA).add(new THREE.Vector3(0, 0.025, 0.025));
    }
  }
  anim({});
  bike.userData = { anim, heart, headlamp: lamp, fork, kid, basket };   // (pas « lamp » : l'ambiance prendrait le vélo pour un lampadaire)
  return bike;
}

/* ---------- kart : châssis en tubes pailletés, gros baquet noir, moteur à ailettes, deux pots, sans pilote ---------- */
/** Tube qui suit une ligne brisée, coins arrondis (rayon de cintrage `bend`). */
function pipeAlong(parent, pts, r, m, bend = 0.05, closed = false) {
  const P = pts.map(p => new THREE.Vector3(...p)); if (closed) P.push(P[0].clone(), P[1].clone());
  const path = new THREE.CurvePath(); let cur = P[0].clone();
  for (let i = 1; i < P.length - 1; i++) {
    const a = P[i - 1], b = P[i], c = P[i + 1], d1 = b.clone().sub(a), d2 = c.clone().sub(b);
    const k = Math.min(bend, d1.length() / 2, d2.length() / 2), p1 = b.clone().addScaledVector(d1.normalize(), -k), p2 = b.clone().addScaledVector(d2.normalize(), k);
    if (cur.distanceTo(p1) > 1e-4) path.add(new THREE.LineCurve3(cur, p1));
    path.add(new THREE.QuadraticBezierCurve3(p1, b.clone(), p2)); cur = p2;
  }
  if (!closed) path.add(new THREE.LineCurve3(cur, P[P.length - 1]));
  const t = new THREE.Mesh(new THREE.TubeGeometry(path, Math.max(16, P.length * 14), r, 10, false), m); parent.add(t); return t;
}
export function makeKart({ paint } = {}) {
  const kart = new THREE.Group();
  const frame = paint || mat('#3b3be8', { roughness: 0.25, metalness: 0.15 });
  const chrome = mat('#dfe2e8', { roughness: 0.15, metalness: 0.95 }), seatM = mat('#141418', { roughness: 0.32 }), white = mat('#f2f2f4', { roughness: 0.4 }), alu = mat('#b8bcc6', { roughness: 0.3, metalness: 0.8 });
  const potM = mat('#7a7ff0', { roughness: 0.15, metalness: 0.4, transparent: true, opacity: 0.85 });
  const R = 0.03, Y0 = 0.16;
  // cadre principal : deux longerons qui se resserrent vers l'avant
  pipeAlong(kart, [[-0.2, Y0, -0.52], [-0.2, Y0, 0.26], [-0.14, Y0, 0.5], [0.14, Y0, 0.5], [0.2, Y0, 0.26], [0.2, Y0, -0.52]], R, frame, 0.07, true);
  // pare-chocs avant à double arceau, reliés par deux montants
  pipeAlong(kart, [[-0.13, 0.12, 0.5], [-0.15, 0.12, 0.66], [0.15, 0.12, 0.66], [0.13, 0.12, 0.5]], R * 0.9, frame, 0.06);
  pipeAlong(kart, [[-0.13, 0.27, 0.52], [-0.15, 0.27, 0.64], [0.15, 0.27, 0.64], [0.13, 0.27, 0.52]], R * 0.9, frame, 0.06);
  for (const x of [-0.15, 0.15]) pipeAlong(kart, [[x, 0.12, 0.655], [x, 0.27, 0.64]], R * 0.85, frame);
  // arceau avant relevé devant le volant
  pipeAlong(kart, [[-0.2, Y0, 0.22], [-0.17, 0.33, 0.4], [0.17, 0.33, 0.4], [0.2, Y0, 0.22]], R * 0.9, frame, 0.07);
  pipeAlong(kart, [[-0.14, Y0, 0.5], [-0.17, 0.33, 0.4]], R * 0.8, frame); pipeAlong(kart, [[0.14, Y0, 0.5], [0.17, 0.33, 0.4]], R * 0.8, frame);
  // protections latérales entre les roues
  for (const sx of [-1, 1]) pipeAlong(kart, [[sx * 0.2, Y0, 0.16], [sx * 0.42, 0.19, 0.1], [sx * 0.42, 0.19, -0.12], [sx * 0.2, Y0, -0.2]], R * 0.9, frame, 0.06);
  // pare-chocs arrière entre les grosses roues, et les supports du siège
  pipeAlong(kart, [[-0.17, Y0, -0.5], [-0.17, 0.22, -0.68], [0.17, 0.22, -0.68], [0.17, Y0, -0.5]], R * 0.9, frame, 0.06);
  for (const sx of [-1, 1]) pipeAlong(kart, [[sx * 0.2, Y0, -0.42], [sx * 0.13, 0.36, -0.36]], R * 0.75, frame);
  // essieux
  { const ax = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.74, 8).rotateZ(Math.PI / 2), chrome); ax.position.set(0, 0.2, -0.38); kart.add(ax); }
  for (const sx of [-1, 1]) { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.2, 8).rotateZ(Math.PI / 2), chrome); st.position.set(sx * 0.28, 0.2, 0.38); kart.add(st); }
  // plancher blanc et pédales en tube
  const floor = rbox(0.36, 0.02, 0.5, white, 0.008); floor.position.set(0, Y0 - 0.005, 0.18); kart.add(floor);
  pipeAlong(kart, [[-0.07, Y0, 0.3], [-0.07, 0.25, 0.43], [0.07, 0.25, 0.43], [0.07, Y0, 0.3]], 0.016, white, 0.04);
  pipeAlong(kart, [[-0.03, 0.25, 0.43], [-0.03, 0.17, 0.36]], 0.012, white);
  // baquet noir : assise, dossier haut et rebords
  const seat = new THREE.Group(); seat.position.set(0, 0.2, -0.16); kart.add(seat);
  { const base = rbox(0.34, 0.07, 0.32, seatM, 0.03); base.position.y = 0.035; seat.add(base);
    const back = rbox(0.36, 0.42, 0.07, seatM, 0.03); back.position.set(0, 0.24, -0.17); back.rotation.x = -0.28; seat.add(back);
    for (const sx of [-1, 1]) { const b = rbox(0.05, 0.13, 0.3, seatM, 0.02); b.position.set(sx * 0.17, 0.09, -0.01); seat.add(b); const w = rbox(0.05, 0.3, 0.09, seatM, 0.02); w.position.set(sx * 0.17, 0.2, -0.15); w.rotation.x = -0.28; seat.add(w); }
    const ped = rbox(0.22, 0.06, 0.2, mat('#2a2a30', { roughness: 0.6 }), 0.02); ped.position.y = -0.03; seat.add(ped); }
  // colonne de direction chromée et volant noir à trois branches
  pipeAlong(kart, [[0, Y0 + 0.02, 0.44], [0, 0.48, 0.17]], 0.014, chrome);
  const wheel = new THREE.Group(); wheel.position.set(0, 0.49, 0.16); kart.add(wheel);
  wheel.lookAt(new THREE.Vector3(0, 0.49 + 0.31, 0.16 - 0.27));   // face au pilote, dans l'axe de la colonne
  { wheel.add(new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.014, 8, 26), seatM));
    for (let i = 0; i < 3; i++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.085, 0.01), seatM); const a = i / 3 * Math.PI * 2 + Math.PI; sp.position.set(Math.sin(a) * 0.042, Math.cos(a) * 0.042, 0); sp.rotation.z = -a; wheel.add(sp); }
    wheel.add(new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.03, 12).rotateX(Math.PI / 2), seatM)); }
  // moteur à ailettes derrière le siège
  const eng = new THREE.Group(); eng.position.set(-0.03, 0.27, -0.5); kart.add(eng);
  { const blk = rbox(0.2, 0.14, 0.15, mat('#7d8290', { roughness: 0.4, metalness: 0.6 }), 0.02); eng.add(blk);
    for (let i = 0; i < 6; i++) { const f = rbox(0.24, 0.012, 0.17, white, 0.004); f.position.y = 0.075 + i * 0.022; eng.add(f); }
    const head = rbox(0.12, 0.03, 0.08, alu, 0.01); head.position.y = 0.21; eng.add(head);
    const cr = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 14).rotateZ(Math.PI / 2), alu); cr.position.set(0.13, -0.02, 0.02); eng.add(cr); }
  // deux pots d'échappement debout aux coins arrière, embouts chromés coudés
  for (const sx of [-1, 1]) {
    const g = new THREE.Group(); g.position.set(sx * 0.17, 0.26, -0.62); kart.add(g);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.025, 16), chrome); g.add(ring);
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 16), potM); can.position.y = 0.07; g.add(can);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.03, 16), chrome); cap.position.y = 0.145; g.add(cap);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.06, 12), chrome); top.position.y = 0.19; g.add(top);
    pipeAlong(g, [[0, 0.21, 0], [0, 0.25, 0], [sx * 0.02, 0.28, -0.04]], 0.02, chrome, 0.03);
    pipeAlong(kart, [[-0.03 + sx * 0.06, 0.24, -0.55], [sx * 0.17, 0.25, -0.6]], 0.014, chrome);
  }
  kart.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  kart.userData = { wheel, paint: [frame], base: frame.color.clone() };
  return kart;
}
/** Jante : jaune à pétales orange (texture partagée). */
let hubT = null;
function hubTex() {
  if (hubT) return hubT;
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  x.fillStyle = '#ffb000'; x.beginPath(); x.arc(64, 64, 64, 0, 7); x.fill();
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; x.fillStyle = i % 2 ? '#ff7a00' : '#ffd21a'; x.beginPath(); x.moveTo(64, 64); x.arc(64, 64, 62, a, a + Math.PI / 3); x.closePath(); x.fill(); }
  x.fillStyle = '#ffe24a'; x.beginPath(); x.arc(64, 64, 26, 0, 7); x.fill(); x.fillStyle = '#ff9a00'; x.beginPath(); x.arc(64, 64, 10, 0, 7); x.fill();
  hubT = new THREE.CanvasTexture(c); hubT.colorSpace = THREE.SRGBColorSpace; return hubT;
}
/** Roue de kart (pneu rond, jante jaune et orange), à accrocher au moyeu de la Jeep. side : -1 à gauche, 1 à droite. */
export function kartWheel(rear, side = 1) {
  const g = new THREE.Group(), r = rear ? 0.2 : 0.165, w = rear ? 0.19 : 0.14;
  const pts = []; pts.push(new THREE.Vector2(r * 0.55, -w / 2));
  for (let i = 0; i <= 16; i++) { const a = -Math.PI / 2 + i / 16 * Math.PI; pts.push(new THREE.Vector2(r - 0.045 + Math.cos(a) * 0.045, Math.sin(a) * (w / 2))); }
  pts.push(new THREE.Vector2(r * 0.55, w / 2));
  const tire = new THREE.Mesh(new THREE.LatheGeometry(pts, 28).rotateZ(Math.PI / 2), mat('#121216', { roughness: 0.75, side: THREE.DoubleSide })); g.add(tire);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.58, r * 0.58, w * 0.92, 24).rotateZ(Math.PI / 2), mat('#ff9a00', { roughness: 0.35 })); g.add(hub);
  const face = new THREE.Mesh(new THREE.CircleGeometry(r * 0.56, 28), mat('#ffffff', { map: hubTex(), roughness: 0.35, emissive: '#ff8a00', emissiveIntensity: 0.4 }));
  face.rotation.y = side * Math.PI / 2; face.position.x = side * (w * 0.47); g.add(face);
  const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, w * 0.98, 10).rotateZ(Math.PI / 2), mat('#dfe2e8', { metalness: 0.9, roughness: 0.2 })); g.add(nut);
  g.position.y = r - 0.2;   // le moyeu de la Jeep est à 0,2 du sol
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
