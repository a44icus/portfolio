/* ============================================================================
   La mine : un chevalement de mine se dresse dans la campagne. On gare la
   voiture sur sa plateforme, E : le monte-charge descend dans le puits,
   traverse la croûte… et débouche sous la voûte d'une immense caverne, au
   centre de la planète : un noyau rocheux couvert de cristaux qui brillent,
   où l'on roule comme en surface et où l'on ramasse des gemmes. Un second
   monte-charge, au pied du puits, ramène à la surface.

   Même centre que la planète : la voiture roule sur le noyau (rayon CORE_R)
   avec la même physique ; la voûte (CEIL_R) est une sphère vue de l'intérieur,
   qui cache tout le reste.
   ============================================================================ */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeKit, makeHud, makeToast } from './eggkit.js';
import { getPlace } from './placement.js';

/** Position définitive du chevalement : { dir: [x, y, z], cap: degrés } — null : placement automatique. */

export const CORE_R = 18, CEIL_R = 27.5;
const GEM_COLS = ['#ff4fd8', '#8a5cff', '#33e6ff', '#5dff9b', '#ffd23f', '#ff6b6b'];

/* ---------- bruit 3D (valeur), déterministe : le relief du noyau et de la voûte ---------- */
const hash = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a, b, t) => a + (b - a) * t;
  return l(l(l(hash(xi, yi, zi), hash(xi + 1, yi, zi), u), l(hash(xi, yi + 1, zi), hash(xi + 1, yi + 1, zi), u), v),
    l(l(hash(xi, yi, zi + 1), hash(xi + 1, yi, zi + 1), u), l(hash(xi, yi + 1, zi + 1), hash(xi + 1, yi + 1, zi + 1), u), v), w);
}
const fbm = (x, y, z) => vnoise(x, y, z) * 0.6 + vnoise(x * 2.1 + 5, y * 2.1, z * 2.1 - 3) * 0.3 + vnoise(x * 4.3 - 2, y * 4.3 + 7, z * 4.3) * 0.1;

/** Matériau qui ajoute une lueur propre (attribut aGlow, ou la couleur d'instance) par-dessus l'éclairage. */
function glowing(m, { attr = false, inst = 0 } = {}) {
  m.onBeforeCompile = sh => {
    if (attr) sh.vertexShader = 'attribute vec3 aGlow;\nvarying vec3 vGlow;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;');
    sh.fragmentShader = (attr ? 'varying vec3 vGlow;\n' : '') + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n'
      + (attr ? 'totalEmissiveRadiance += vGlow;\n' : '') + (inst ? `totalEmissiveRadiance += vColor.rgb * ${inst.toFixed(2)};\n` : ''));
  };
  m.customProgramCacheKey = () => 'glow' + (attr ? 'A' : '') + inst;
  return m;
}

/** Un cristal : prisme hexagonal coiffé d'une pointe (base à l'origine, hauteur 1,6, rayon 0,5). */
function crystalGeo() {
  const a = new THREE.CylinderGeometry(0.5, 0.5, 1, 6).translate(0, 0.5, 0), b = new THREE.ConeGeometry(0.5, 0.6, 6).translate(0, 1.3, 0);
  const g = mergeGeometries([a.toNonIndexed(), b.toNonIndexed()]); g.computeVertexNormals(); return g;
}

export function makeMine({ planet, sections, R, quality, avoid = [] }) {
  const low = quality === 'low';
  const K = makeKit({ planet, sections, R, seed: 33107 });
  const tangent = K.tangent;

  /* =================== en surface : le chevalement =================== */
  let dir, fwd;
  const man = getPlace('mine');
  if (man) { dir = man.dir; fwd = man.fwd; }
  else {
    const clearOfPaths = (d, r) => { const t1 = tangent(d), t2 = new THREE.Vector3().crossVectors(d, t1); for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; for (const f of [0.5, 1]) if (planet.pathDir(d.clone().addScaledVector(t1, Math.cos(a) * r * f / R).addScaledVector(t2, Math.sin(a) * r * f / R).normalize()) > 0) return false; } return true; };
    const ok = d => K.dry(d, 0.01) && K.farFromZones(d, 0.4) && avoid.every(a => a.dot(d) < Math.cos(12 / R)) && K.flat(d, 0.08, 1.6) && K.flat(d, 0.25, 3.5) && clearOfPaths(d, 4.5);
    const near = d => { let m = 9; for (const s of sections) m = Math.min(m, K.angDist(s.dir, d)); return m; };
    dir = K.findSpot(ok, { tries: 6000, score: d => -Math.abs(near(d) - 15) - 0.4 * K.treesWithin(d, 4.5) }) || K.findSpot(d => K.dry(d, 0.01) && K.flat(d, 0.15, 1.6), { tries: 4000 }) || new THREE.Vector3(1, 0, 0);
    let best = sections[0]; for (const s of sections) if (s.dir.dot(dir) > best.dir.dot(dir)) best = s;
    fwd = best.dir.clone().projectOnPlane(dir); if (fwd.lengthSq() < 1e-6) fwd = tangent(dir); fwd.normalize();
  }
  const topR = planet.heightDir(dir);   // la plateforme, au repos, affleure le sol

  const steel = new THREE.MeshStandardMaterial({ color: '#c0463a', roughness: 0.55, metalness: 0.35 });
  const steelD = new THREE.MeshStandardMaterial({ color: '#3a3550', roughness: 0.6, metalness: 0.4 });
  const plank = new THREE.MeshStandardMaterial({ color: '#8a6a4a', roughness: 0.9 });
  const stone = new THREE.MeshStandardMaterial({ color: '#9b8fb8', roughness: 0.95, flatShading: true });
  const lampM = new THREE.MeshBasicMaterial({ color: '#ffd98a', toneMapped: false });
  // bandes jaunes et noires (bord de la plateforme)
  const hazard = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 8; const g = c.getContext('2d'); g.fillStyle = '#ffcc1a'; g.fillRect(0, 0, 64, 8); g.fillStyle = '#1d1a26'; for (let x = -8; x < 72; x += 16) { g.beginPath(); g.moveTo(x, 8); g.lineTo(x + 8, 0); g.lineTo(x + 16, 0); g.lineTo(x + 8, 8); g.fill(); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.repeat.set(4, 1); return t; })();
  const hazM = new THREE.MeshStandardMaterial({ map: hazard, roughness: 0.7 });

  /** La plateforme du monte-charge (plancher, bords rayés, garde-corps sur trois côtés) : local, y vers le haut, z vers l'entrée. */
  function makeCage() {
    const g = new THREE.Group(), S = 1.25;
    g.add(new THREE.Mesh(new THREE.BoxGeometry(2 * S, 0.12, 2 * S).translate(0, -0.06, 0), plank));
    for (const [x, z, w, d] of [[0, S, 2 * S, 0.1], [0, -S, 2 * S, 0.1], [S, 0, 0.1, 2 * S], [-S, 0, 0.1, 2 * S]]) g.add(new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, d).translate(x, 0.01, z), hazM));
    for (const sx of [-1, 1]) {   // garde-corps à gauche et à droite, barre à l'arrière ; l'avant reste ouvert
      for (const z of [-S, 0, S]) g.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, 0.06).translate(sx * (S - 0.03), 0.45, z * 0.97), steel));
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 2 * S).translate(sx * (S - 0.03), 0.9, 0), steel));
    }
    g.add(new THREE.Mesh(new THREE.BoxGeometry(2 * S, 0.06, 0.06).translate(0, 0.9, -S + 0.03), steel));
    for (const x of [-S + 0.03, S - 0.03]) g.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, 0.06).translate(x, 0.45, -S + 0.03), steel));
    // anneaux d'attache du câble, au-dessus
    g.add(new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.025, 6, 12).translate(0, 1.6, 0), steelD));
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {   // haubans des coins vers l'anneau
      const a = new THREE.Vector3(x * (S - 0.05), 0.9, z * (S - 0.05)), b = new THREE.Vector3(0, 1.55, 0), L = a.distanceTo(b);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, L, 4), steelD); m.position.copy(a).lerp(b, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); g.add(m);
    }
    return g;
  }
  /** Poutre entre deux points (pour les pieds et les entretoises du chevalement). */
  const beam = (a, b, r, mat) => { const L = a.distanceTo(b), m = new THREE.Mesh(new THREE.BoxGeometry(r, L, r), mat); m.position.copy(a).lerp(b, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); return m; };

  const surface = new THREE.Group(); surface.name = 'mine-surface';
  K.placeOn(surface, dir, fwd, 0); surface.position.setLength(topR); surface.updateMatrixWorld(true);
  // margelle en pierre autour du puits
  const coll = [];
  for (let k = 0; k < 4; k++) { const ang = k * Math.PI / 2; for (const s of [-1, 0, 1]) { const g = new THREE.BoxGeometry(0.95, 0.32, 0.38).translate(s * 0.98, 0.1, 1.55).rotateY(ang); coll.push(g); } }
  for (const [x, z] of [[1.55, 1.55], [-1.55, 1.55], [1.55, -1.55], [-1.55, -1.55]]) coll.push(new THREE.BoxGeometry(0.42, 0.36, 0.42).translate(x, 0.12, z));
  const collar = new THREE.Mesh(mergeGeometries(coll), stone); collar.castShadow = collar.receiveShadow = true; surface.add(collar);
  // rampe d'accès à l'avant (la margelle s'interrompt : on y entre en voiture)
  collar.geometry = mergeGeometries(coll.filter((g, i) => !(i >= 0 && i < 3)));   // côté +z (k = 0) ouvert
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.06, 1.0).translate(0, 0.0, 1.75), plank); ramp.receiveShadow = true; surface.add(ramp);
  // le chevalement : quatre pieds inclinés, entretoises, poulie au sommet
  const TOP = 5.2, legs = [];
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) legs.push([new THREE.Vector3(x * 1.75, -0.1, z * 1.75), new THREE.Vector3(x * 0.55, TOP, z * 0.55)]);
  for (const [a, b] of legs) surface.add(beam(a, b, 0.16, steel));
  for (const h of [1.6, 3.2, 4.6]) {
    const k = h / TOP, ps = legs.map(([a, b]) => a.clone().lerp(b, k));
    for (let i = 0; i < 4; i++) { const j = [1, 3, 0, 2][i]; if (i === 0 && h < 2) continue; surface.add(beam(ps[i], ps[j], 0.09, steel)); }   // (pas de barre devant, en bas : on passe)
  }
  surface.add(beam(new THREE.Vector3(-0.7, TOP, 0), new THREE.Vector3(0.7, TOP, 0), 0.22, steelD));
  const pulley = new THREE.Group(); pulley.position.set(0, TOP + 0.55, 0); surface.add(pulley);
  pulley.add(new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.07, 8, 24).rotateY(Math.PI / 2), steelD));
  for (let k = 0; k < 6; k++) pulley.add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.96, 0.04).rotateX(k * Math.PI / 6), steelD));
  for (const s of [-1, 1]) surface.add(beam(new THREE.Vector3(s * 0.25, TOP, 0), new THREE.Vector3(s * 0.25, TOP + 0.6, 0), 0.07, steel));
  for (const [x, z] of [[0.58, 0.58], [-0.58, 0.58]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), lampM); l.position.set(x, TOP - 0.2, z); surface.add(l); }
  // panneau « MINE »
  { const c = document.createElement('canvas'); c.width = 256; c.height = 96; const g = c.getContext('2d');
    g.fillStyle = '#2b2440'; g.fillRect(0, 0, 256, 96); g.strokeStyle = '#ffcc1a'; g.lineWidth = 8; g.strokeRect(6, 6, 244, 84);
    g.fillStyle = '#ffcc1a'; g.font = '900 54px Arial Black, Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('⛏ MINE', 128, 52);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.6), new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 })); sign.position.set(0, 3.6, 0.9); surface.add(sign);
    const back = sign.clone(); back.rotation.y = Math.PI; back.position.z = 0.88; surface.add(back); }
  // le trou du puits : un carré noir qui efface la profondeur (le terrain ne cache plus la cabine qui descend), et les parois du puits
  const holeM = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, depthTest: false, depthWrite: true,
    vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'out highp vec4 fc; void main(){ fc = vec4(0.03, 0.02, 0.05, 1.0); gl_FragDepth = 1.0; }' });
  const hole = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 2.5).rotateX(-Math.PI / 2).translate(0, 0.04, 0), holeM); hole.renderOrder = 5; hole.visible = false; surface.add(hole);
  const shaftM = new THREE.MeshStandardMaterial({ color: '#3a3150', roughness: 1, side: THREE.BackSide });
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(2.5, 7, 2.5, 1, 6, 1).translate(0, -3.5, 0), shaftM); shaft.renderOrder = 6; shaft.visible = false; surface.add(shaft);
  for (let k = 0; k < 4; k++) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), lampM); l.position.set(1.2, -1 - k * 1.6, (k % 2 ? 1 : -1) * 0.6); l.renderOrder = 6; l.visible = false; surface.add(l); shaft.userData.lamps = (shaft.userData.lamps || []).concat(l); }
  const cageTop = makeCage(); surface.add(cageTop);
  const cableM = new THREE.MeshStandardMaterial({ color: '#2a2633', roughness: 0.5, metalness: 0.6 });
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 5).translate(0, 0.5, 0), cableM); surface.add(cable);

  /* =================== sous terre : le noyau et sa caverne =================== */
  const core = new THREE.Group(); core.name = 'mine-core'; core.visible = false;
  // relief du noyau : de larges bosses douces, aplani autour du pied du puits
  const flatK = d => THREE.MathUtils.smoothstep(d.dot(dir), Math.cos(5 / CORE_R), Math.cos(2.6 / CORE_R));
  const BASE = CORE_R + 0.6;
  const coreH = d => {
    const n = fbm(d.x * 2.2 + 11, d.y * 2.2, d.z * 2.2 - 4), m = vnoise(d.x * 5 + 3, d.y * 5, d.z * 5);
    const h = CORE_R + 1.9 * n + 0.35 * m;
    return h + (BASE - h) * flatK(d);
  };
  const ceilH = d => CEIL_R - 1.4 * fbm(d.x * 3 - 7, d.y * 3 + 2, d.z * 3);
  /** sol du noyau sous cette direction (unités de la scène) ; les ajouts (pont, lac…) peuvent le surélever */
  const extraH = [];
  const heightDir = d => { let h = coreH(d); for (const f of extraH) { const e = f(d); if (e > h) h = e; } return h; };
  const botR = coreH(dir);

  { // le sol : facettes violettes, veines lumineuses
    const g = new THREE.IcosahedronGeometry(1, low ? 40 : 60), p = g.attributes.position, v = new THREE.Vector3();
    const col = new Float32Array(p.count * 3), glow = new Float32Array(p.count * 3);
    const c = new THREE.Color(), lo = new THREE.Color('#2c1d4a'), hi = new THREE.Color('#5a3f8c'), vein = [new THREE.Color('#2ee6ff'), new THREE.Color('#ff4fd8'), new THREE.Color('#8a5cff')];
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).normalize(); const h = coreH(v);
      p.setXYZ(i, v.x * h, v.y * h, v.z * h);
      c.copy(lo).lerp(hi, THREE.MathUtils.clamp((h - CORE_R) / 2.2, 0, 1)).multiplyScalar(0.85 + 0.3 * hash(v.x * 50, v.y * 50, v.z * 50));
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      const vn = vnoise(v.x * 9 + 1, v.y * 9 - 2, v.z * 9 + 4), k = Math.max(0, 1 - Math.abs(vn - 0.5) / 0.035) * (1 - flatK(v));   // fines veines de cristal
      const vc = vein[Math.floor(vnoise(v.x * 2, v.y * 2, v.z * 2) * 3) % 3];
      glow[i * 3] = vc.r * k * 1.4; glow[i * 3 + 1] = vc.g * k * 1.4; glow[i * 3 + 2] = vc.b * k * 1.4;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('aGlow', new THREE.BufferAttribute(glow, 3)); g.computeVertexNormals();
    const m = new THREE.Mesh(g, glowing(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }), { attr: true }));
    m.receiveShadow = true; core.add(m);
  }
  { // la voûte : sphère vue de dedans, roche brune et violette, taches lumineuses
    const g = new THREE.IcosahedronGeometry(1, low ? 24 : 36), p = g.attributes.position, v = new THREE.Vector3();
    const col = new Float32Array(p.count * 3), glow = new Float32Array(p.count * 3), c = new THREE.Color(), a = new THREE.Color('#2a1b3a'), b = new THREE.Color('#4b3262');
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).normalize(); const h = ceilH(v); p.setXYZ(i, v.x * h, v.y * h, v.z * h);
      c.copy(a).lerp(b, hash(v.x * 30, v.y * 30, v.z * 30)); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      const sp = vnoise(v.x * 14, v.y * 14, v.z * 14), k = Math.max(0, (sp - 0.78) / 0.22);
      glow[i * 3] = 0.3 * k; glow[i * 3 + 1] = 0.9 * k; glow[i * 3 + 2] = 1.2 * k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('aGlow', new THREE.BufferAttribute(glow, 3)); g.computeVertexNormals();
    core.add(new THREE.Mesh(g, glowing(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true, side: THREE.BackSide }), { attr: true })));
  }

  // tirage déterministe des emplacements (cristaux, stalagmites, gemmes)
  let sd = 77; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  const randDir = v => { do v.set(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1); while (v.lengthSq() > 1 || v.lengthSq() < 0.01); return v.normalize(); };
  const obstacles = [];   // { d, r } : la voiture ne passe pas au travers
  const freeAt = (d, r) => d.dot(dir) < Math.cos((3.2 + r) / CORE_R) && obstacles.every(o => o.d.dot(d) < Math.cos((o.r + r + 0.3) / CORE_R));
  const orient = (m4, pos, upv, tilt, yaw, sx, sy) => {
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), upv);
    q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt * Math.cos(yaw), yaw, tilt * Math.sin(yaw))));
    return m4.compose(pos, q, new THREE.Vector3(sx, sy, sx));
  };
  const cGeo = crystalGeo(), m4 = new THREE.Matrix4(), d = new THREE.Vector3(), t1 = new THREE.Vector3(), t2 = new THREE.Vector3(), pos = new THREE.Vector3();
  const crystals = [], cCols = [];
  // massifs de cristaux au sol (obstacles)
  for (let n = 0, tries = 0; n < (low ? 34 : 52) && tries < 4000; tries++) {
    randDir(d); const rr = 0.55 + rnd() * 0.6; if (!freeAt(d, rr)) continue; n++;
    obstacles.push({ d: d.clone(), r: rr * 0.85 });
    const col = new THREE.Color(GEM_COLS[Math.floor(rnd() * GEM_COLS.length)]);
    t1.copy(tangent(d)); t2.crossVectors(d, t1);
    const cnt = 4 + Math.floor(rnd() * 5);
    for (let k = 0; k < cnt; k++) {
      const a = rnd() * Math.PI * 2, o = k === 0 ? 0 : rr * (0.3 + rnd() * 0.6), dd = d.clone().addScaledVector(t1, Math.cos(a) * o / CORE_R).addScaledVector(t2, Math.sin(a) * o / CORE_R).normalize();
      pos.copy(dd).multiplyScalar(coreH(dd) - 0.15);
      const big = k === 0 ? 1.6 : 1;
      crystals.push(orient(new THREE.Matrix4(), pos, dd, k === 0 ? 0.08 : 0.3 + rnd() * 0.45, a, (0.16 + rnd() * 0.16) * big, (0.7 + rnd() * 1.2) * big));
      cCols.push(col.clone().multiplyScalar(0.85 + rnd() * 0.3));
    }
  }
  // petits cristaux épars (sans obstacle)
  for (let n = 0, tries = 0; n < (low ? 140 : 260) && tries < 6000; tries++) {
    randDir(d); if (d.dot(dir) > Math.cos(3 / CORE_R) || obstacles.some(o => o.d.dot(d) > Math.cos((o.r + 0.2) / CORE_R))) continue; n++;
    pos.copy(d).multiplyScalar(coreH(d) - 0.05);
    crystals.push(orient(new THREE.Matrix4(), pos, d, rnd() * 0.6, rnd() * 6.28, 0.05 + rnd() * 0.06, 0.25 + rnd() * 0.4));
    cCols.push(new THREE.Color(GEM_COLS[Math.floor(rnd() * GEM_COLS.length)]));
  }
  // cristaux suspendus à la voûte, pointe en bas
  for (let n = 0; n < (low ? 60 : 110); n++) {
    randDir(d); pos.copy(d).multiplyScalar(ceilH(d) + 0.3);
    const col = new THREE.Color(GEM_COLS[Math.floor(rnd() * GEM_COLS.length)]), cnt = 2 + Math.floor(rnd() * 4);
    t1.copy(tangent(d)); t2.crossVectors(d, t1);
    for (let k = 0; k < cnt; k++) {
      const a = rnd() * 6.28, o = rnd() * 0.5, dd = d.clone().addScaledVector(t1, Math.cos(a) * o / CEIL_R).addScaledVector(t2, Math.sin(a) * o / CEIL_R).normalize();
      crystals.push(orient(new THREE.Matrix4(), pos.clone().copy(dd).multiplyScalar(ceilH(dd) + 0.25), dd.clone().negate(), rnd() * 0.5, a, 0.18 + rnd() * 0.22, 0.9 + rnd() * 1.6));
      cCols.push(col.clone().multiplyScalar(0.85 + rnd() * 0.3));
    }
  }
  const crystalM = glowing(new THREE.MeshStandardMaterial({ roughness: 0.18, metalness: 0.1 }), { inst: 0.85 });
  const crystalMesh = new THREE.InstancedMesh(cGeo, crystalM, crystals.length);
  crystals.forEach((m, i) => { crystalMesh.setMatrixAt(i, m); crystalMesh.setColorAt(i, cCols[i]); });
  crystalMesh.castShadow = true; crystalMesh.receiveShadow = true; core.add(crystalMesh);
  const clearable = [[crystalMesh, crystals]];   // [maillage, matrices] : ce que clearArea peut retirer

  // stalagmites (obstacles) et stalactites
  { const sGeo = new THREE.ConeGeometry(0.5, 1, 7).translate(0, 0.5, 0), list = [];
    for (let n = 0, tries = 0; n < (low ? 40 : 70) && tries < 4000; tries++) {
      randDir(d); const rr = 0.25 + rnd() * 0.3; if (!freeAt(d, rr)) continue; n++;
      obstacles.push({ d: d.clone(), r: rr });
      list.push(orient(new THREE.Matrix4(), pos.copy(d).multiplyScalar(coreH(d) - 0.2), d, rnd() * 0.15, rnd() * 6, rr * 1.4, 1.2 + rnd() * 2.4));
    }
    for (let n = 0; n < (low ? 120 : 220); n++) { randDir(d); list.push(orient(new THREE.Matrix4(), pos.copy(d).multiplyScalar(ceilH(d) + 0.4), d.clone().negate(), rnd() * 0.2, rnd() * 6, 0.25 + rnd() * 0.45, 1 + rnd() * 3.2)); }
    const sm = new THREE.InstancedMesh(sGeo, new THREE.MeshStandardMaterial({ color: '#5b4677', roughness: 0.95, flatShading: true }), list.length);
    list.forEach((m, i) => sm.setMatrixAt(i, m)); sm.castShadow = sm.receiveShadow = true; core.add(sm); clearable.push([sm, list]); }

  // champignons lumineux, en petites touffes
  { const stem = new THREE.CylinderGeometry(0.04, 0.06, 0.3, 6).translate(0, 0.15, 0), cap = new THREE.SphereGeometry(0.16, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.6, 1).translate(0, 0.3, 0);
    const stems = [], caps = [];
    for (let n = 0, tries = 0; n < (low ? 30 : 55) && tries < 3000; tries++) {
      randDir(d); if (!freeAt(d, 0.3)) continue; n++;
      t1.copy(tangent(d)); t2.crossVectors(d, t1);
      for (let k = 0; k < 3 + Math.floor(rnd() * 4); k++) {
        const a = rnd() * 6.28, o = rnd() * 0.45, dd = d.clone().addScaledVector(t1, Math.cos(a) * o / CORE_R).addScaledVector(t2, Math.sin(a) * o / CORE_R).normalize(), s = 0.6 + rnd() * 1.1;
        const mm = orient(new THREE.Matrix4(), pos.copy(dd).multiplyScalar(coreH(dd) - 0.03), dd, rnd() * 0.3, a, s, s); stems.push(mm); caps.push(mm);
      }
    }
    const sm = new THREE.InstancedMesh(stem, new THREE.MeshStandardMaterial({ color: '#d9d2ff', roughness: 0.8 }), stems.length);
    const cm = new THREE.InstancedMesh(cap, glowing(new THREE.MeshStandardMaterial({ roughness: 0.5 }), { inst: 1.1 }), caps.length);
    stems.forEach((m, i) => sm.setMatrixAt(i, m)); caps.forEach((m, i) => { cm.setMatrixAt(i, m); cm.setColorAt(i, new THREE.Color(i % 3 ? '#33e6ff' : '#7bff8a')); });
    core.add(sm, cm); clearable.push([sm, stems], [cm, caps]); }

  // poussière lumineuse qui flotte dans la caverne
  const MOTES = low ? 300 : 600, motePos = new Float32Array(MOTES * 3), motes = [];
  for (let i = 0; i < MOTES; i++) { randDir(d); motes.push({ d: d.clone(), h: CORE_R + 1 + rnd() * (CEIL_R - CORE_R - 2), w: (rnd() - 0.5) * 0.02, ph: rnd() * 6.28 }); }
  const moteGeo = new THREE.BufferGeometry(); moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const motePts = new THREE.Points(moteGeo, new THREE.PointsMaterial({ color: '#bff6ff', size: 0.1, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  motePts.frustumCulled = false; core.add(motePts);

  // le pied du puits : un pylône de quatre rails qui monte jusqu'à la voûte, une plateforme d'arrivée
  const bottom = new THREE.Group(); core.add(bottom);
  K.placeOn(bottom, dir, fwd, 0); bottom.position.setLength(botR); bottom.updateMatrixWorld(true);
  const towerH = ceilH(dir) - botR + 0.6;
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    bottom.add(beam(new THREE.Vector3(x * 1.4, -0.3, z * 1.4), new THREE.Vector3(x * 1.4, towerH, z * 1.4), 0.14, steel));
    for (let h = 1.5; h < towerH; h += 2.2) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), lampM); l.position.set(x * 1.5, h, z * 1.5); bottom.add(l); }
  }
  for (let h = 2.5; h < towerH; h += 2.5) for (const [a, b] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[-1, 1], [-1, -1]]]) bottom.add(beam(new THREE.Vector3(a[0] * 1.4, h, a[1] * 1.4), new THREE.Vector3(b[0] * 1.4, h, b[1] * 1.4), 0.07, steel));
  // socle de pierre et rampe d'accès
  { const ring = []; for (const [x, z, w, dd] of [[0, -1.7, 3.6, 0.4], [1.7, 0, 0.4, 3.0], [-1.7, 0, 0.4, 3.0]]) ring.push(new THREE.BoxGeometry(w, 0.35, dd).translate(x, 0.05, z));
    const st = new THREE.Mesh(mergeGeometries(ring), stone); st.receiveShadow = st.castShadow = true; bottom.add(st);
    bottom.add(new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.06, 1.0).translate(0, 0, 1.75), plank)); }
  // trou noir dans la voûte, au-dessus du pylône
  { const h = new THREE.Mesh(new THREE.CircleGeometry(1.9, 20), new THREE.MeshBasicMaterial({ color: '#07040c', side: THREE.DoubleSide })); h.position.set(0, towerH - 0.35, 0); h.rotation.x = Math.PI / 2; bottom.add(h); }
  const cageBot = makeCage(); bottom.add(cageBot);
  const cableB = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 5).translate(0, 0.5, 0), cableM); bottom.add(cableB);

  /* ---------- les gemmes à ramasser ---------- */
  const GEMS = 24, gems = [], gemGeo = new THREE.OctahedronGeometry(0.24, 0).scale(1, 1.35, 1);
  const gemMesh = new THREE.InstancedMesh(gemGeo, glowing(new THREE.MeshStandardMaterial({ roughness: 0.12, metalness: 0.2 }), { inst: 1.3 }), GEMS);
  for (let n = 0, tries = 0; n < GEMS && tries < 5000; tries++) {
    randDir(d); if (!freeAt(d, 0.6) || gems.some(g => g.d.dot(d) > Math.cos(3.5 / CORE_R))) continue;
    gems.push({ d: d.clone(), p: d.clone().multiplyScalar(coreH(d) + 0.95), got: false, k: 0, ph: rnd() * 6.28 });
    gemMesh.setColorAt(n, new THREE.Color(GEM_COLS[n % GEM_COLS.length])); n++;
  }
  gemMesh.count = gems.length; gemMesh.frustumCulled = false; core.add(gemMesh);
  const hud = makeHud('gemHud', 'background:rgba(30,16,52,.72); color:#fff; border:1px solid rgba(190,140,255,.45);', '💎 <span class="ct">0 / ' + gems.length + '</span> <small>gemmes</small>');
  const toast = makeToast('color:#fff; -webkit-text-stroke:2px #3b1470; text-shadow:0 4px 0 #3b1470;');
  let found = 0;

  /* ---------- le monte-charge ---------- */
  const lift = { active: false, dir: 0, r: topR, t: 0, dur: 1, from: topR, to: botR, under: false, fade: 0, cb: null };
  /** La voiture est-elle sur la plateforme (au repos) ? */
  const onPad = (car, under) => { const g = under ? bottom : surface; const l = g.worldToLocal(tmp.copy(car)); return Math.abs(l.x) < 1.05 && Math.abs(l.z) < 1.05 && Math.abs(l.y) < 1.2; };
  const tmp = new THREE.Vector3();
  function start(down) {
    lift.active = true; lift.dir = down ? -1 : 1; lift.t = 0;
    lift.from = down ? topR : botR; lift.to = down ? botR : topR; lift.r = lift.from;
    lift.dur = 8.5;
  }
  /** Fait avancer la descente ou la montée ; renvoie 'under' / 'surface' au passage de la croûte, 'done' à l'arrivée. */
  function stepLift(dt) {
    if (!lift.active) return null;
    lift.t += dt; let ev = null;
    const k = Math.min(1, lift.t / lift.dur), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    lift.r = lift.from + (lift.to - lift.from) * e;
    // écran noir pendant la traversée de la croûte (entre le sol et la voûte)
    const inCrust = lift.r < topR - 0.9 && lift.r > CEIL_R - 2.2;
    lift.fade += ((inCrust ? 1 : 0) - lift.fade) * (1 - Math.exp(-dt * 7));
    if (lift.dir < 0 && !lift.under && lift.r < CEIL_R + 0.5 && lift.fade > 0.97) { lift.under = true; ev = 'under'; }
    if (lift.dir > 0 && lift.under && lift.r > topR - 1.4 && lift.fade > 0.97) { lift.under = false; ev = 'surface'; }
    if (k >= 1) { lift.active = false; lift.fade = 0; ev = 'done'; }
    return ev;
  }
  const cagePlace = () => {
    // la cabine du monde visible suit le monte-charge ; l'autre reste à son poste
    const rTopLocal = lift.active ? lift.r - topR : 0, rBotLocal = lift.active ? lift.r - botR : 0;
    cageTop.position.y = lift.active && !lift.under ? rTopLocal : (lift.under ? -20 : 0);
    cageBot.position.y = lift.active && lift.under ? rBotLocal : (lift.under ? 0 : towerH);
    cable.position.y = cageTop.position.y + 1.6; cable.scale.y = Math.max(0.01, TOP + 0.55 - cable.position.y);
    cableB.position.y = cageBot.position.y + 1.6; cableB.scale.y = Math.max(0.01, towerH - cableB.position.y);
    const sinking = lift.active && !lift.under && lift.r < topR - 0.02;
    hole.visible = sinking; shaft.visible = sinking; shaft.userData.lamps.forEach(l => { l.visible = sinking; });
  };

  /* ---------- obstacles du noyau : la voiture est repoussée (comme contre un tronc) ---------- */
  const offV = new THREE.Vector3(), nV = new THREE.Vector3();
  function collide(pdir, pr, rad = 0.42) {
    for (const o of obstacles) {
      if (o.off || o.d.dot(pdir) < Math.cos((o.r + rad + 0.5) / CORE_R)) continue;
      offV.copy(pdir).sub(o.d).multiplyScalar(pr); offV.addScaledVector(pdir, -offV.dot(pdir));
      const dist = offV.length(), min = o.r + rad;
      if (dist >= min || dist < 1e-5) continue;
      nV.copy(offV).divideScalar(dist);
      return { n: nV, depth: min - dist };
    }
    return null;
  }

  /* ---------- animation ---------- */
  const q = new THREE.Quaternion(), sv = new THREE.Vector3(), up = new THREE.Vector3();
  function update(dt, t, car, under) {
    pulley.rotation.x += (lift.active ? lift.dir * 2.2 : 0) * dt;
    cagePlace();
    if (!under && !lift.under) return;
    // gemmes : elles tournent et flottent ; on les ramasse en passant dessus
    for (let i = 0; i < gems.length; i++) {
      const g = gems[i];
      if (!g.got && car && g.p.distanceTo(car) < 1.25) {
        g.got = true; found++; hud.querySelector('.ct').textContent = found + ' / ' + gems.length;
        api.onGem?.(found === gems.length);
        if (found === gems.length) toast('Toutes les gemmes ! 💎', 2600);
      }
      if (g.got) g.k = Math.min(1, g.k + dt * 3);
      const s = g.got ? Math.max(0, 1 - g.k) * (1 + g.k * 1.5) : 1;
      up.copy(g.d);
      q.setFromUnitVectors(sv.set(0, 1, 0), up).multiply(new THREE.Quaternion().setFromAxisAngle(sv.set(0, 1, 0), t * 1.6 + g.ph));
      pos.copy(g.p).addScaledVector(up, 0.15 * Math.sin(t * 2 + g.ph) + g.k * 1.2);
      gemMesh.setMatrixAt(i, m4.compose(pos, q, sv.setScalar(s)));
    }
    gemMesh.instanceMatrix.needsUpdate = true;
    // poussière : lente dérive autour du noyau
    for (let i = 0; i < MOTES; i++) {
      const m = motes[i]; m.d.applyAxisAngle(sv.set(0, 1, 0), m.w * dt).normalize();
      const h = m.h + 0.3 * Math.sin(t * 0.5 + m.ph);
      motePos[i * 3] = m.d.x * h; motePos[i * 3 + 1] = m.d.y * h; motePos[i * 3 + 2] = m.d.z * h;
    }
    moteGeo.attributes.position.needsUpdate = true;
  }
  cagePlace();

  /** Dégage le sol autour de c (rayon r, unités) : cristaux, stalagmites et champignons retirés, obstacles levés (pour les ajouts du cœur). */
  const zeroM = new THREE.Matrix4().makeScale(0, 0, 0), cp = new THREE.Vector3();
  function clearArea(c, r) {
    const cosr = Math.cos(r / CORE_R);
    for (const [mesh, list] of clearable) {
      let hit = false;
      list.forEach((mm, i) => { cp.setFromMatrixPosition(mm); if (cp.length() < CORE_R + 4.5 && cp.normalize().dot(c) > cosr) { mesh.setMatrixAt(i, zeroM); hit = true; } });
      if (hit) mesh.instanceMatrix.needsUpdate = true;
    }
    for (let i = obstacles.length - 1; i >= 0; i--) if (!obstacles[i].keep && obstacles[i].d.dot(c) > cosr) obstacles.splice(i, 1);
  }

  const api = {
    surface, core, dir, fwd, topR, botR, heightDir, collide, lift, start, stepLift, update, onPad, hud,
    /** pour les ajouts du cœur (heart.js) : sol nu, voûte, obstacles, gemmes, surélévations, dégagement */
    coreH, ceilH, obstacles, gems, extraH, clearArea,
    onGem: null,
    get found() { return found; }, get total() { return gems.length; },
    /** rayon d'exclusion du décor en surface (unités) */
    clearR: 3.8,
    /** maillages à styliser (rendu « illustration ») */
    solids: [collar, ramp, cageTop, surface],
  };
  return api;
}
