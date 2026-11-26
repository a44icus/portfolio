/* ============================================================================
   Le cœur de la planète : ce qu'on trouve au fond de la mine, sur le noyau.
   - Le noyau d'énergie, sur une île cerclée de lave : on y dépose les gemmes
     ramassées (E). Il s'allume peu à peu et bat au rythme de la musique ; toutes
     déposées, un geyser de lumière jaillit (jusqu'à la surface, visible de
     l'espace) et la porte de cristal de la salle secrète s'ouvre.
   - Le pont de bois au-dessus de la lave, cassé au milieu : on le franchit en turbo.
   - Un lac souterrain phosphorescent (on glisse dessus en laissant un sillage
     lumineux), ses poissons aveugles, les lucioles qui s'écartent, les
     chauves-souris qui s'envolent quand on klaxonne (K).
   - Les cristaux qui chantent : chacun joue une note ; une mélodie secrète.
   - Les strates du parcours : des dalles de roche, un fossile et une étape
     du parcours sur chacune.
   - Une course chronométrée : huit portes tout autour du noyau (record gardé).
   - Un tourbillon relie la grotte de la cascade et le cœur (E pour plonger).
   ============================================================================ */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeHud, makeToast } from './eggkit.js';
import { makeWake } from './look.js';

/** Le texte de la salle secrète (à personnaliser). */
export const SECRET = {
  titre: 'La salle secrète',
  lignes: ['Tu as rallumé le cœur de la planète.', 'Merci d’avoir exploré jusqu’ici !', '', 'Une idée, un projet, une question ?', 'Écris-moi depuis la zone Contact.'],
};
const LS = 'planete-coeur', LS_RACE = 'planete-course-coeur';
const RR = 19.2;   // rayon moyen du sol du noyau (conversion unités ↔ angle)
const NOTES = [72, 74, 76, 77, 79, 81, 83], NOTE_NAMES = ['Do', 'Ré', 'Mi', 'Fa', 'Sol', 'La', 'Si'], MELODY = [0, 2, 4, 2, 0];

const Y = new THREE.Vector3(0, 1, 0);
const tangentOf = d => { const t = Y.clone().projectOnPlane(d); if (t.lengthSq() < 1e-6) t.set(1, 0, 0).projectOnPlane(d); return t.normalize(); };
const angU = (a, b) => Math.acos(Math.min(1, Math.max(-1, a.dot(b)))) * RR;   // distance au sol (unités) entre deux directions

/** Repère local autour d'un point du noyau : a = vers l'avant (f), s = vers la droite (r). */
function frame(c, f0, ground) {
  const up = c.clone().normalize(), f = (f0 ? f0.clone() : tangentOf(up)).projectOnPlane(up).normalize(), r = new THREE.Vector3().crossVectors(up, f);
  const ax = new THREE.Vector3(), v = new THREE.Vector3(), M = new THREE.Matrix4();
  const F = {
    c: up, f, r,
    dir(a, s) { v.copy(f).multiplyScalar(a).addScaledVector(r, s); const L = v.length(); if (L < 1e-6) return up.clone(); ax.crossVectors(up, v).normalize(); return up.clone().applyAxisAngle(ax, L / RR); },
    local(d) { const cd = Math.min(1, up.dot(d)), ang = Math.acos(cd) * RR; v.copy(d).addScaledVector(up, -cd); const L = v.length(); if (L < 1e-6) return { a: 0, s: 0, rho: 0 }; v.divideScalar(L); return { a: ang * v.dot(f), s: ang * v.dot(r), rho: ang }; },
    /** pose obj au sol en (a, s), +lift, tourné de yaw (radians) ; fwd : direction d'avant imposée (monde) */
    pose(obj, a, s, lift = 0, yaw = 0, fwd = null) {
      const d = F.dir(a, s), ff = (fwd ? fwd.clone() : f.clone()).projectOnPlane(d).normalize().applyAxisAngle(d, yaw), rr = new THREE.Vector3().crossVectors(d, ff);
      obj.quaternion.setFromRotationMatrix(M.makeBasis(rr, d, ff)); obj.position.copy(d).multiplyScalar(ground(d) + lift); return d;
    },
  };
  return F;
}

/** Une texture de panneau : fond, titre, lignes. */
function signTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
function wrap(g, text, x, y, maxW, lh) { const words = String(text || '').split(/\s+/); let line = '', yy = y; for (const w of words) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { g.fillText(line, x, yy); line = w; yy += lh; } else line = t; } if (line) g.fillText(line, x, yy); return yy; }

const NOISE = /* glsl */ `
  float hh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float nn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hh(i), hh(i + vec2(1, 0)), f.x), mix(hh(i + vec2(0, 1)), hh(i + vec2(1, 1)), f.x), f.y); }
  float fb(vec2 p){ return nn(p) * 0.55 + nn(p * 2.1 + 3.7) * 0.3 + nn(p * 4.3 - 1.3) * 0.15; }`;

/* ---------- matériaux à shader ---------- */
const T = { uTime: { value: 0 } };   // horloge commune
function orbMat() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: T.uTime, uK: { value: 0 }, uBeat: { value: 0 } },
    vertexShader: 'varying vec3 vN; varying vec3 vP; varying vec3 vW; void main(){ vN = normalize(normalMatrix * normal); vP = position; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: NOISE + `
      uniform float uTime, uK, uBeat; varying vec3 vN; varying vec3 vP; varying vec3 vW;
      void main(){
        float sw = fb(vec2(atan(vP.z, vP.x) * 2.0 + uTime * 0.6, vP.y * 3.0 - uTime * 0.4) + fb(vP.xy * 2.0 + uTime * 0.2));
        vec3 dim = vec3(0.12, 0.06, 0.22), mid = vec3(0.55, 0.2, 1.0), hot = vec3(0.4, 0.95, 1.0);
        vec3 col = mix(dim, mix(mid, hot, sw), clamp(uK * 1.3, 0.0, 1.0));
        float rim = pow(1.0 - abs(dot(normalize(vN), vec3(0.0, 0.0, 1.0))), 2.0);
        col += vec3(1.0, 0.85, 1.0) * rim * (0.2 + uK);
        col *= 0.35 + uK * (1.6 + 0.9 * uBeat) + 0.25 * sw;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}
function haloMat(color, k = 1) {
  return new THREE.ShaderMaterial({
    uniforms: { uK: { value: 0 }, uC: { value: new THREE.Color(color) } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: `uniform float uK; uniform vec3 uC; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(max(0.0, -dot(vN, vV)), 2.5); gl_FragColor = vec4(uC * f * uK * ${k.toFixed(2)}, 1.0); }`,
  });
}
function beamMat(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: T.uTime, uOn: { value: 0 }, uC: { value: new THREE.Color(color) } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: NOISE + `uniform float uTime, uOn; uniform vec3 uC; varying vec2 vUv;
      void main(){
        float s = nn(vec2(vUv.x * 18.0, vUv.y * 6.0 - uTime * 2.2)) * 0.6 + nn(vec2(vUv.x * 7.0 + 2.0, vUv.y * 2.5 - uTime * 1.3)) * 0.6;
        float a = (0.35 + 0.65 * smoothstep(0.45, 1.0, s)) * smoothstep(0.0, 0.04, vUv.y) * (1.0 - smoothstep(0.75, 1.0, vUv.y) * 0.85);
        gl_FragColor = vec4(mix(uC, vec3(1.0), smoothstep(0.7, 1.1, s)) * a * uOn, 1.0);
      }`,
  });
}
function lavaMat() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: T.uTime },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: NOISE + `uniform float uTime; varying vec2 vUv;
      void main(){
        vec2 p = vec2(vUv.x * 60.0 - uTime * 0.25, vUv.y * 4.0);
        float n = fb(p + vec2(0.0, fb(p * 0.5 + uTime * 0.1) * 2.0));
        float crust = smoothstep(0.62, 0.7, fb(p * 1.7 + 9.0 - uTime * 0.05));
        vec3 deep = vec3(0.35, 0.03, 0.45), hot = vec3(1.0, 0.25, 0.65), white = vec3(1.0, 0.85, 0.95);
        vec3 col = mix(deep, hot, smoothstep(0.3, 0.75, n)); col = mix(col, white, smoothstep(0.78, 0.95, n));
        col = mix(col, vec3(0.12, 0.04, 0.16), crust * 0.85);
        float edge = smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.88, vUv.y);
        col *= 0.55 + 0.9 * edge;
        gl_FragColor = vec4(col * 1.6, 1.0);
      }`,
  });
}
function lakeMat() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: T.uTime, uCar: { value: new THREE.Vector3(0, -999, 0) } }, transparent: true, depthWrite: false,
    vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: NOISE + `uniform float uTime; uniform vec3 uCar; varying vec2 vUv; varying vec3 vW;
      void main(){
        float rho = vUv.y;                                   // 0 au centre, 1 au bord
        vec2 p = vec2(cos(vUv.x * 6.2832), sin(vUv.x * 6.2832)) * rho * 6.0;
        vec3 col = vec3(0.02, 0.16, 0.2);
        float c = fb(p * 0.9 + vec2(uTime * 0.12, -uTime * 0.09));
        float line = 1.0 - smoothstep(0.0, 0.06, abs(fract(c * 5.0 + uTime * 0.15) - 0.5));
        col += vec3(0.2, 0.95, 1.0) * line * 0.45;
        float d = distance(vW, uCar), ring = 1.0 - smoothstep(0.0, 0.08, abs(fract(d * 1.4 - uTime * 1.6) - 0.5));
        col += vec3(0.5, 1.0, 1.0) * ring * (1.0 - smoothstep(0.5, 3.0, d)) * 0.8;
        col += vec3(0.6, 1.0, 1.0) * pow(nn(p * 7.0 + uTime * 0.7), 12.0) * 2.0;   // éclats
        float a = (0.72 + 0.2 * line) * (1.0 - smoothstep(0.86, 1.0, rho));
        gl_FragColor = vec4(col, a);
      }`,
  });
}
function whirlMat() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: T.uTime }, transparent: true, depthWrite: false,
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: NOISE + `uniform float uTime; varying vec2 vP;
      void main(){
        float r = length(vP) / 1.15, a = atan(vP.y, vP.x);
        float sp = fract(a / 6.2832 * 3.0 + r * 1.8 - uTime * 0.9 + nn(vP * 3.0) * 0.15);
        float arm = 1.0 - smoothstep(0.0, 0.18, abs(sp - 0.5));
        vec3 col = mix(vec3(0.05, 0.25, 0.4), vec3(0.3, 0.95, 1.0), arm);
        col = mix(col, vec3(1.0), (1.0 - smoothstep(0.0, 0.25, r)) * 0.9);
        float alpha = (1.0 - smoothstep(0.85, 1.0, r)) * (0.75 + 0.25 * arm);
        gl_FragColor = vec4(col * 1.3, alpha);
      }`,
  });
}

export function makeHeart({ planet, mine, audio, cascade, getParcours }) {
  const A = () => (typeof audio === 'function' ? audio() : audio);
  const core = mine.core, G = d => mine.coreH(d);
  const group = new THREE.Group(); group.name = 'coeur'; core.add(group);
  const surface = new THREE.Group(); surface.name = 'coeur-surface';   // ce qui se voit en surface (geyser, tourbillon)
  let saved = {}; try { saved = JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch (e) { saved = {}; }
  const toast = makeToast('top:36%; color:#fff; font-size:clamp(1.1rem, 3.8vw, 2.2rem); white-space:normal; width:min(88vw, 640px); line-height:1.15; -webkit-text-stroke:1.5px #2a0f50; text-shadow:0 3px 0 #2a0f50;');

  /* ---------- emplacements : loin du monte-charge et les uns des autres ---------- */
  let sd = 9241; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  const randDir = () => { const v = new THREE.Vector3(); do v.set(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1); while (v.lengthSq() > 1 || v.lengthSq() < 0.01); return v.normalize(); };
  const taken = [{ d: mine.dir.clone(), r: 6 }];
  function pick(rad, { score = null, gemsFree = 0, tries = 2500 } = {}) {
    let best = null, bs = -1e9;
    for (let i = 0; i < tries; i++) {
      const d = randDir();
      if (!taken.every(t => angU(t.d, d) > t.r + rad + 1.5)) continue;
      let s = score ? score(d) : 0; if (s === null) continue;
      if (gemsFree) s -= 6 * mine.gems.filter(g => angU(g.d, d) < gemsFree).length;
      if (s > bs) { bs = s; best = d; }
    }
    if (!best) best = randDir();
    taken.push({ d: best, r: rad }); return best;
  }
  /** déplace les gemmes qui tombent dans une zone (île, lave) vers un coin libre */
  function evictGems(c, rad) {
    for (const g of mine.gems) {
      if (angU(g.d, c) > rad) continue;
      for (let k = 0; k < 400; k++) { const d = randDir(); if (taken.every(t => angU(t.d, d) > t.r + 1) && mine.gems.every(o => o === g || angU(o.d, d) > 3)) { g.d.copy(d); g.p.copy(d).multiplyScalar(G(d) + 0.95); break; } }
    }
  }
  const obst = (d, r, extra = {}) => { const o = { d: d.clone(), r, keep: true, ...extra }; mine.obstacles.push(o); return o; };

  const stone = new THREE.MeshStandardMaterial({ color: '#4d3c70', roughness: 0.95, flatShading: true });
  const wood = new THREE.MeshStandardMaterial({ color: '#8a5a3a', roughness: 0.9 });
  const woodD = new THREE.MeshStandardMaterial({ color: '#5c3a26', roughness: 0.9 });
  const crystalGeo = (() => { const a = new THREE.CylinderGeometry(0.5, 0.5, 1, 6).translate(0, 0.5, 0), b = new THREE.ConeGeometry(0.5, 0.6, 6).translate(0, 1.3, 0); const g = mergeGeometries([a.toNonIndexed(), b.toNonIndexed()]); g.computeVertexNormals(); return g; })();

  /* =================== le noyau d'énergie, l'île, la lave, le pont =================== */
  const RX = pick(14, { gemsFree: 14 }); evictGems(RX, 14);
  mine.clearArea(RX, 14);
  const FR = frame(RX, null, G);
  const ISL = 6.6, MOAT = 9.0, PED_A = 1.8;
  const reactor = new THREE.Group(); group.add(reactor); FR.pose(reactor, PED_A, 0, -0.15);
  reactor.add(new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.4, 1.0, 6).translate(0, 0.5, 0), stone));
  const orbM = orbMat(), orb = new THREE.Mesh(new THREE.SphereGeometry(0.95, 40, 24), orbM); orb.position.y = 2.05; reactor.add(orb);
  const haloM = haloMat('#a67bff', 1.4), halo = new THREE.Mesh(new THREE.SphereGeometry(1.7, 32, 16), haloM); halo.position.y = 2.05; reactor.add(halo);
  // six cristaux autour du socle : ils s'allument un à un (un pour quatre gemmes)
  const ringM = [];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.MeshStandardMaterial({ color: '#5b3d8f', emissive: '#c48bff', emissiveIntensity: 0.05, roughness: 0.2, flatShading: true }); ringM.push(m);
    const c = new THREE.Mesh(crystalGeo, m), a = i / 6 * Math.PI * 2; c.position.set(Math.cos(a) * 1.75, 0, Math.sin(a) * 1.75); c.scale.set(0.28, 0.9 + (i % 2) * 0.4, 0.28); c.rotation.set(Math.sin(a) * 0.25, a, -Math.cos(a) * 0.25); reactor.add(c);
  }
  obst(FR.dir(PED_A, 0), 1.45);
  // geyser de lumière, du noyau à la voûte
  const beamH = mine.ceilH(FR.dir(PED_A, 0)) - G(FR.dir(PED_A, 0)) - 2.0;
  const beamM = beamMat('#9ef0ff'), beamM2 = beamMat('#c69bff');
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, beamH, 24, 1, true).translate(0, beamH / 2, 0), beamM); beam.position.y = 2.05; reactor.add(beam);
  const beam2 = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.1, beamH, 24, 1, true).translate(0, beamH / 2, 0), beamM2); beam2.position.y = 2.05; reactor.add(beam2);

  // la lave : un anneau autour de l'île
  { const NA = 120, NR = 6, pos = [], uv = [], idx = [];
    for (let j = 0; j <= NR; j++) for (let i = 0; i <= NA; i++) {
      const rho = ISL + (MOAT - ISL) * j / NR, th = i / NA * Math.PI * 2, d = FR.dir(Math.cos(th) * rho, Math.sin(th) * rho), h = G(d) + 0.05;
      pos.push(d.x * h, d.y * h, d.z * h); uv.push(i / NA * 6, j / NR);
    }
    for (let j = 0; j < NR; j++) for (let i = 0; i < NA; i++) { const a = j * (NA + 1) + i, b = a + 1, c = a + NA + 1, e = c + 1; idx.push(a, c, b, b, c, e); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const lava = new THREE.Mesh(g, lavaMat()); lava.renderOrder = 1; group.add(lava); }

  // le pont : du dehors (a = 10.4) jusqu'à l'île (a = 5.4), cassé entre 6.8 et 9.0 : on le franchit en turbo, la rampe sert de tremplin
  const B = { in0: 4.2, in1: 5.4, gap0: 6.8, gap1: 9.0, out1: 10.4, out0: 11.6, half: 1.05 };   // (trou de 2,2 : la rampe sert de tremplin, il faut le turbo)
  let top = 0; for (let a = B.in0; a <= B.out0; a += 0.25) for (const s of [-1, 0, 1]) top = Math.max(top, G(FR.dir(a, s)));
  top += 0.55;
  const gIn = G(FR.dir(B.in0, 0)), gOut = G(FR.dir(B.out0, 0));
  const deckH = a => {
    if (a < B.in0 || a > B.out0) return null;
    if (a < B.in1) return THREE.MathUtils.lerp(gIn, top, (a - B.in0) / (B.in1 - B.in0));
    if (a <= B.gap0) return top;
    if (a < B.gap1) return null;
    if (a <= B.out1) return top;
    return THREE.MathUtils.lerp(top, gOut, (a - B.out1) / (B.out0 - B.out1));
  };
  const cosNear = Math.cos(14 / RR);
  mine.extraH.push(d => { if (d.dot(FR.c) < cosNear) return -1; const L = FR.local(d); if (Math.abs(L.s) > B.half) return -1; const h = deckH(L.a); return h === null ? -1 : h; });
  { const planks = [], posts = [], m = new THREE.Matrix4(), o = new THREE.Object3D();
    for (let a = B.in0 + 0.12; a < B.out0; a += 0.26) {
      const h = deckH(a); if (h === null) continue;
      const d = FR.dir(a, 0); FR.pose(o, a, 0, h - G(d) - 0.05, (rnd() - 0.5) * 0.04); o.updateMatrix(); planks.push(o.matrix.clone());
    }
    // deux planches cassées qui pendent au bord du trou
    for (const [a, sg] of [[B.gap0 + 0.15, 1], [B.gap1 - 0.15, -1]]) { const d = FR.dir(a, 0.3); FR.pose(o, a, 0.3, top - G(d) - 0.25); o.rotateX(sg * 0.7); o.updateMatrix(); planks.push(o.matrix.clone()); }
    const pm = new THREE.InstancedMesh(new THREE.BoxGeometry(2.2, 0.09, 0.22), wood, planks.length); planks.forEach((mm, i) => pm.setMatrixAt(i, mm)); pm.castShadow = pm.receiveShadow = true; group.add(pm);
    for (let a = B.in0 + 0.4; a < B.out0 - 0.2; a += 0.8) {
      const h = deckH(a); if (h === null) continue;
      for (const s of [-B.half, B.half]) { const d = FR.dir(a, s); FR.pose(o, a, s, h - G(d)); o.scale.set(1, 1, 1); o.updateMatrix(); posts.push(o.matrix.clone()); }
    }
    const postM = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.6, 0.1).translate(0, 0.3, 0), woodD, posts.length); posts.forEach((mm, i) => postM.setMatrixAt(i, mm)); group.add(postM);
    // piliers qui plongent dans la lave
    const pil = [];
    for (const a of [B.gap0 - 0.3, B.gap1 + 0.3]) for (const s of [-0.8, 0.8]) { const d = FR.dir(a, s), L = top - G(d); FR.pose(o, a, s, -0.3); o.scale.set(1, L + 0.3, 1); o.updateMatrix(); pil.push(o.matrix.clone()); }
    const pilM = new THREE.InstancedMesh(new THREE.BoxGeometry(0.18, 1, 0.18).translate(0, 0.5, 0), woodD, pil.length); pil.forEach((mm, i) => pilM.setMatrixAt(i, mm)); group.add(pilM);
    // panneau à l'entrée du pont
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.75), new THREE.MeshStandardMaterial({ roughness: 0.8, map: signTex(256, 128, (g, w, h) => { g.fillStyle = '#3a2416'; g.fillRect(0, 0, w, h); g.strokeStyle = '#ffcc66'; g.lineWidth = 6; g.strokeRect(5, 5, w - 10, h - 10); g.fillStyle = '#ffe2a8'; g.textAlign = 'center'; g.font = '900 34px Arial Black, sans-serif'; g.fillText('PONT CASSÉ', w / 2, 52); g.font = '700 24px Arial, sans-serif'; g.fillText('Élan… turbo (Maj) !', w / 2, 94); }) }));
    FR.pose(sign, B.out0 + 0.8, 1.8, 1.0, Math.PI); group.add(sign);
    const sp = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.0, 0.08).translate(0, 0.5, 0), woodD); FR.pose(sp, B.out0 + 0.8, 1.8, 0); group.add(sp); obst(FR.dir(B.out0 + 0.8, 1.8), 0.2); }

  /* ---------- la salle secrète, sur l'île, derrière le noyau ---------- */
  const ROOM_A = -3.4, ROOM_R = 2.0;
  const roomPillarM = new THREE.MeshStandardMaterial({ color: '#b07cff', emissive: '#7a3cff', emissiveIntensity: 0.6, roughness: 0.15, metalness: 0.1, flatShading: true, transparent: true, opacity: 0.92 });
  for (let i = 0; i < 13; i++) {
    const th = i / 13 * Math.PI * 2; if (Math.abs(Math.atan2(Math.sin(th), Math.cos(th))) < 0.55) continue;   // l'ouverture regarde le noyau (+a)
    const a = ROOM_A + Math.cos(th) * ROOM_R, s = Math.sin(th) * ROOM_R, c = new THREE.Mesh(crystalGeo, roomPillarM);
    FR.pose(c, a, s, -0.1); c.scale.set(0.42, 2.0 + 0.6 * Math.sin(i * 2.3) ** 2, 0.42);
    c.rotateOnAxis(new THREE.Vector3(Math.sin(th), 0, -Math.cos(th)).normalize(), 0.3); group.add(c);   // penchés vers l'intérieur : une voûte de cristal
    obst(FR.dir(a, s), 0.42);
  }
  const doorM = new THREE.MeshStandardMaterial({ color: '#ff8ad8', emissive: '#ff4fd8', emissiveIntensity: 0.7, roughness: 0.1, transparent: true, opacity: 0.85 });
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.7, 2.5, 0.16).translate(0, 1.25, 0), doorM); FR.pose(door, ROOM_A + ROOM_R, 0, -0.05); group.add(door);
  const doorObst = obst(FR.dir(ROOM_A + ROOM_R, 0), 0.85);
  const secret = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.65), new THREE.MeshBasicMaterial({ toneMapped: false, map: signTex(512, 384, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#2a0f50'); gr.addColorStop(1, '#120626'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ff9ae6'; g.lineWidth = 8; g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = '#ffe1f6'; g.textAlign = 'center'; g.font = '900 40px Arial Black, sans-serif'; g.fillText('✦ ' + SECRET.titre + ' ✦', w / 2, 78);
    g.font = '600 26px Arial, sans-serif'; g.fillStyle = '#f4ecff'; SECRET.lignes.forEach((l, i) => g.fillText(l, w / 2, 140 + i * 40));
  }) }));
  FR.pose(secret, ROOM_A - 0.9, 0, 0.35); secret.position.addScaledVector(FR.c, 0); group.add(secret);
  const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.35, 0), new THREE.MeshStandardMaterial({ color: '#ffd23f', emissive: '#ffb800', emissiveIntensity: 1.2, metalness: 0.6, roughness: 0.2 }));
  FR.pose(star, ROOM_A, 0, 1.3); group.add(star);

  /* =================== le lac souterrain =================== */
  const basin = d => {   // profondeur de cuvette : bord (le plus bas) moins fond (le plus bas)
    const F = frame(d, null, G); let rim = 1e9, bot = 1e9;
    for (let i = 0; i < 16; i++) { const th = i / 16 * Math.PI * 2; rim = Math.min(rim, G(F.dir(Math.cos(th) * 5.2, Math.sin(th) * 5.2))); bot = Math.min(bot, G(F.dir(Math.cos(th) * 1.6, Math.sin(th) * 1.6))); }
    bot = Math.min(bot, G(d)); return rim - bot;
  };
  const LX = pick(6.2, { score: d => basin(d) });
  mine.clearArea(LX, 6.4);
  const FL = frame(LX, null, G);
  let rimMin = 1e9; for (let i = 0; i < 32; i++) { const th = i / 32 * Math.PI * 2; rimMin = Math.min(rimMin, G(FL.dir(Math.cos(th) * 5.2, Math.sin(th) * 5.2))); }
  const LV = Math.max(rimMin - 0.06, G(LX) + 0.25);   // le niveau de l'eau
  const lakeU = lakeMat();
  { const NA = 96, NR = 18, pos = [], uv = [], idx = [];
    for (let j = 0; j <= NR; j++) for (let i = 0; i <= NA; i++) { const rho = 5.6 * j / NR, th = i / NA * Math.PI * 2, d = FL.dir(Math.cos(th) * rho, Math.sin(th) * rho); pos.push(d.x * LV, d.y * LV, d.z * LV); uv.push(i / NA, j / NR); }
    for (let j = 0; j < NR; j++) for (let i = 0; i < NA; i++) { const a = j * (NA + 1) + i, b = a + 1, c = a + NA + 1, e = c + 1; idx.push(a, c, b, b, c, e); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    const lake = new THREE.Mesh(g, lakeU); lake.renderOrder = 3; group.add(lake); }
  const cosLake = Math.cos(5.3 / RR);
  mine.extraH.push(d => (d.dot(FL.c) > cosLake ? LV : -1));   // on glisse sur l'eau
  const onLake = d => d.dot(FL.c) > cosLake && G(d) < LV - 0.02;
  // sillage lumineux sur le lac
  const wake = makeWake(220, 5); wake.uniforms.uColor.value.setRGB(0.35, 1.0, 1.0); wake.uniforms.uLight.value = 1.6; group.add(wake.mesh);
  const wakeLast = new THREE.Vector3(); let wakeOn = false;
  // poissons aveugles lumineux
  const fish = [];
  { const fg = mergeGeometries([new THREE.SphereGeometry(0.1, 10, 6).scale(1, 0.7, 2.4), new THREE.ConeGeometry(0.09, 0.16, 4).rotateX(-Math.PI / 2).translate(0, 0, -0.3)].map(g => g.toNonIndexed()));
    const spots = []; for (let k = 0; k < 400 && spots.length < 16; k++) { const a = (rnd() - 0.5) * 8.4, s = (rnd() - 0.5) * 8.4; if (a * a + s * s > 4.6 * 4.6) continue; const d = FL.dir(a, s); if (G(d) < LV - 0.5) spots.push([a, s]); }
    const fm = new THREE.InstancedMesh(fg, new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, opacity: 0.9 }), Math.max(1, spots.length));
    spots.forEach(([a, s], i) => { fish.push({ a, s, rad: 0.4 + rnd() * 0.9, w: (0.5 + rnd() * 0.7) * (rnd() < 0.5 ? -1 : 1), ph: rnd() * 6.28 }); fm.setColorAt(i, new THREE.Color(['#5df2ff', '#ff7ad9', '#b28cff'][i % 3])); });
    fm.count = spots.length; fm.frustumCulled = false; fm.renderOrder = 2; group.add(fm); fish.mesh = fm; }

  /* =================== les cristaux qui chantent =================== */
  const CX = pick(4.5); mine.clearArea(CX, 4.6);
  const FC = frame(CX, null, G);
  const choir = [];
  for (let i = 0; i < 7; i++) {
    const ph = (-80 + i * 160 / 6) * Math.PI / 180, a = -Math.cos(ph) * 2.6, s = Math.sin(ph) * 2.6;
    const col = new THREE.Color().setHSL(i / 7, 0.85, 0.6);
    const m = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.35, roughness: 0.15, flatShading: true });
    const c = new THREE.Mesh(crystalGeo, m); FC.pose(c, a, s, -0.1); c.scale.set(0.5, 1.1 + i * 0.28, 0.5); group.add(c);
    const d = FC.dir(a, s); obst(d, 0.45);
    choir.push({ m, c, p: d.clone().multiplyScalar(G(d) + 0.4), k: 0, cd: 0 });
  }
  { const plaque = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.6), new THREE.MeshStandardMaterial({ roughness: 0.9, map: signTex(320, 120, (g, w, h) => { g.fillStyle = '#2b2240'; g.fillRect(0, 0, w, h); g.strokeStyle = '#c9a6ff'; g.lineWidth = 5; g.strokeRect(4, 4, w - 8, h - 8); g.fillStyle = '#efe4ff'; g.textAlign = 'center'; g.font = '700 22px Arial, sans-serif'; g.fillText('Touche les cristaux…', w / 2, 44); g.font = '900 26px Arial, sans-serif'; g.fillText('♪ ' + MELODY.map(i => NOTE_NAMES[i]).join(' · ') + ' ♪', w / 2, 86); }) }));
    FC.pose(plaque, 0.6, 0, 0.5, Math.PI); group.add(plaque);
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.12).translate(0, 0.25, 0), stone); FC.pose(st, 0.62, 0, 0); group.add(st); obst(FC.dir(0.62, 0), 0.2); }
  const heard = []; let melodyT = 0;
  // étincelles de la mélodie
  const SPK = 90, spkPos = new Float32Array(SPK * 3), spk = []; for (let i = 0; i < SPK; i++) spk.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0 });
  const spkGeo = new THREE.BufferGeometry(); spkGeo.setAttribute('position', new THREE.BufferAttribute(spkPos, 3));
  const sparks = new THREE.Points(spkGeo, new THREE.PointsMaterial({ color: '#fff2b0', size: 0.14, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); sparks.frustumCulled = false; group.add(sparks);
  const burst = (at, n = 40) => { let k = 0; for (const s of spk) { if (s.life > 0) continue; s.p.copy(at); s.v.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize().multiplyScalar(1.5 + rnd() * 3).addScaledVector(at.clone().normalize(), 2.5); s.life = 1 + rnd(); if (++k >= n) break; } };

  /* =================== les strates du parcours =================== */
  const SX = pick(5); mine.clearArea(SX, 5.2);
  const FS = frame(SX, null, G), slabs = [];
  const slabTex = (item, i) => signTex(256, 320, (g, w, h) => {
    const bands = ['#5a3d2b', '#7a5236', '#4c3a5e', '#6b4a7a', '#8a6a4a', '#3f3150'];
    let y = 0; let k = i; while (y < h) { const bh = 18 + ((k * 37) % 30); g.fillStyle = bands[k % bands.length]; g.fillRect(0, y, w, bh); y += bh; k++; }
    g.globalAlpha = 0.18; for (let n = 0; n < 220; n++) { g.fillStyle = n % 2 ? '#000' : '#fff'; g.fillRect((n * 97) % w, (n * 53 + i * 31) % h, 2, 2); } g.globalAlpha = 1;
    // fossile : une ammonite en relief
    const cx = w / 2, cy = 112; g.strokeStyle = '#f3e2c4'; g.lineWidth = 5; g.beginPath(); for (let t = 0; t < 18; t += 0.05) { const r = 5 + t * 3.6; const x = cx + Math.cos(t) * r, yy = cy + Math.sin(t) * r; if (t === 0) g.moveTo(x, yy); else g.lineTo(x, yy); } g.stroke();
    g.lineWidth = 2; for (let t = 1; t < 18; t += 0.7) { const r = 5 + t * 3.6; g.beginPath(); g.moveTo(cx + Math.cos(t) * (r - 6), cy + Math.sin(t) * (r - 6)); g.lineTo(cx + Math.cos(t) * (r + 5), cy + Math.sin(t) * (r + 5)); g.stroke(); }
    g.fillStyle = 'rgba(18,10,28,.72)'; g.fillRect(12, 196, w - 24, 112);
    g.fillStyle = '#ffd88a'; g.textAlign = 'center'; g.font = '800 22px Arial, sans-serif'; g.fillText(item.period || '', w / 2, 226);
    g.fillStyle = '#fff'; g.font = '700 19px Arial, sans-serif'; wrap(g, item.title || '', w / 2, 254, w - 40, 22);
  });
  const slabMats = [];
  for (let i = 0; i < 6; i++) {
    const ph = (-70 + i * 28) * Math.PI / 180, a = -Math.cos(ph) * 3.4, s = Math.sin(ph) * 3.4;
    const face = new THREE.MeshStandardMaterial({ roughness: 0.9 }); slabMats.push(face);
    const sl = new THREE.Mesh(new THREE.BoxGeometry(1.7, 2.1, 0.3).translate(0, 1.05, 0), [stone, stone, stone, stone, face, stone]);
    const d = FS.dir(a, s), toC = FS.c.clone().sub(d).projectOnPlane(d).normalize();
    FS.pose(sl, a, s, -0.1, 0, toC); sl.rotateX(-0.08); group.add(sl); obst(d, 0.85); slabs.push(sl);
  }
  { const intro = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.55), new THREE.MeshStandardMaterial({ roughness: 0.9, map: signTex(360, 110, (g, w, h) => { g.fillStyle = '#2b2240'; g.fillRect(0, 0, w, h); g.strokeStyle = '#ffd88a'; g.lineWidth = 5; g.strokeRect(4, 4, w - 8, h - 8); g.fillStyle = '#ffe9c2'; g.textAlign = 'center'; g.font = '900 28px Arial Black, sans-serif'; g.fillText('STRATES', w / 2, 46); g.font = '600 20px Arial, sans-serif'; g.fillText('les couches de mon parcours', w / 2, 82); }) }));
    FS.pose(intro, 1.2, 0, 0.55, Math.PI); group.add(intro);
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.12).translate(0, 0.27, 0), stone); FS.pose(st, 1.22, 0, 0); group.add(st); obst(FS.dir(1.22, 0), 0.2); }
  let parcoursKey = '';
  function refreshSlabs() {
    let list = []; try { list = (getParcours && getParcours()) || []; } catch (e) { list = []; }
    const key = JSON.stringify(list.map(r => [r.period, r.title]));
    if (key === parcoursKey) return; parcoursKey = key;
    let items = list.slice(0, 6).reverse();   // du plus ancien (à gauche) au plus récent
    if (!items.length) items = [{ period: 'Les débuts', title: 'Premiers dessins' }, { period: 'Études', title: 'Apprendre le métier' }, { period: 'Premiers pas', title: 'Premiers projets' }, { period: 'Croissance', title: 'Des clients, des équipes' }, { period: 'Maturité', title: 'Des projets ambitieux' }, { period: 'Aujourd’hui', title: 'Cette planète' }];
    slabMats.forEach((m, i) => { const it = items[i] || { period: '', title: '' }; if (m.map) m.map.dispose(); m.map = slabTex(it, i); m.needsUpdate = true; });
  }
  refreshSlabs();

  /* =================== le tourbillon (aller-retour avec la cascade) =================== */
  const whirlU = whirlMat();
  const makeWhirl = () => {
    const g = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.15, 48).rotateX(-Math.PI / 2).translate(0, 0.04, 0), whirlU); disc.renderOrder = 3; g.add(disc);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.14, 6, 18).rotateX(Math.PI / 2).translate(0, 0.03, 0), stone); g.add(ring);
    return g;
  };
  const PX = pick(3); mine.clearArea(PX, 3.4);
  const FP = frame(PX, null, G), whirlCore = makeWhirl(); FP.pose(whirlCore, 0, 0, 0); group.add(whirlCore);
  const coreWhirlPos = PX.clone().multiplyScalar(G(PX));
  const surfaceWhirl = makeWhirl(); surfaceWhirl.name = 'tourbillon'; surface.add(surfaceWhirl);
  /** pose le tourbillon de surface : emplacement choisi, sinon dans la grotte de la cascade, sur le côté */
  function placeSurfaceWhirl(pose) {
    if (pose) { pose(surfaceWhirl); return; }
    cascade.group.updateMatrixWorld(true);
    const d = cascade.group.localToWorld(new THREE.Vector3(1.3, 0, 0.4)).normalize(), f = tangentOf(d), r = new THREE.Vector3().crossVectors(d, f);
    surfaceWhirl.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(r, d, f)); surfaceWhirl.position.copy(d).multiplyScalar(planet.heightDir(d) + 0.02);
  }

  /* =================== lucioles et chauves-souris =================== */
  const FF = 150, ffPos = new Float32Array(FF * 3), ffCol = new Float32Array(FF * 3), flies = [];
  for (let i = 0; i < FF; i++) {
    const F = i < 70 ? FL : i < 110 ? FC : FS, rr = i < 70 ? 7 : 5;
    const a = (rnd() - 0.5) * 2 * rr, s = (rnd() - 0.5) * 2 * rr, d = F.dir(a, s), h = Math.max(G(d), i < 70 ? LV : 0) + 0.5 + rnd() * 1.8;
    const home = d.clone().multiplyScalar(h);
    flies.push({ home, p: home.clone(), v: new THREE.Vector3(), ph: rnd() * 6.28, f: 1.5 + rnd() * 2.5 });
  }
  const ffGeo = new THREE.BufferGeometry(); ffGeo.setAttribute('position', new THREE.BufferAttribute(ffPos, 3)); ffGeo.setAttribute('color', new THREE.BufferAttribute(ffCol, 3));
  const ffPts = new THREE.Points(ffGeo, new THREE.PointsMaterial({ size: 0.13, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); ffPts.frustumCulled = false; group.add(ffPts);

  const bats = [], batRoost = LX.clone();
  { const wingG = new THREE.BufferGeometry(); wingG.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.08, 0, 0, -0.1, 0.38, 0.02, -0.02, 0.38, 0.02, -0.02, 0.2, 0, -0.14, 0, 0, -0.1], 3)); wingG.computeVertexNormals();
    const bm = new THREE.MeshStandardMaterial({ color: '#2c1a44', roughness: 0.9, side: THREE.DoubleSide }), eye = new THREE.MeshBasicMaterial({ color: '#ff5fd2', toneMapped: false });
    const FB = frame(LX, null, G);
    for (let i = 0; i < 24; i++) {
      const b = new THREE.Group(), body = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6).scale(1, 0.9, 1.6), bm); b.add(body);
      const L = new THREE.Mesh(wingG, bm), R = new THREE.Mesh(wingG, bm); R.scale.x = -1; b.add(L, R);
      for (const x of [-0.03, 0.03]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 4), eye); e.position.set(x, 0.02, 0.1); b.add(e); }
      const a = (rnd() - 0.5) * 6, s = (rnd() - 0.5) * 6, d = FB.dir(a, s), rest = d.clone().multiplyScalar(mine.ceilH(d) - 0.35);
      b.position.copy(rest); group.add(b);
      bats.push({ g: b, L, R, rest, restDir: d, th: rnd() * 6.28, rad: 2 + rnd() * 4, hgt: 0, w: (0.8 + rnd() * 0.6) * (rnd() < 0.5 ? -1 : 1), ph: rnd() * 6.28, fly: 0 });
    }
  }
  let batT = 0;   // temps de vol restant
  function honk(car) {
    if (!car) return;
    const near = angU(car.clone().normalize(), batRoost) < 16;
    if (near) { if (batT <= 0) A()?.sfx('spin'); batT = 8; }
    // les lucioles s'éparpillent aussi
    for (const f of flies) { const dd = f.p.distanceTo(car); if (dd < 8) f.v.add(f.p.clone().sub(car).normalize().multiplyScalar(6 / Math.max(1, dd))); }
  }

  /* =================== la course : huit portes autour du noyau =================== */
  const g0 = mine.dir.clone().applyAxisAngle(new THREE.Vector3().crossVectors(mine.dir, mine.fwd).normalize(), 8 / RR).normalize();
  let tBest = null, bestScore = -1e9;
  for (let k = 0; k < 48; k++) {
    const t0 = tangentOf(g0).applyAxisAngle(g0, k / 48 * Math.PI * 2);
    let sc = 1e9; for (let i = 1; i < 64; i++) { const th = i / 64 * Math.PI * 2, d = g0.clone().multiplyScalar(Math.cos(th)).addScaledVector(t0, Math.sin(th)); for (const tk of taken.slice(1)) sc = Math.min(sc, angU(d, tk.d) - tk.r); }
    if (sc > bestScore) { bestScore = sc; tBest = t0; }
  }
  const gates = [], GN = 8;
  const gateM = () => new THREE.MeshBasicMaterial({ color: '#7a5cff', toneMapped: false, transparent: true, opacity: 0.85 });
  const flagTex = signTex(256, 64, (g, w, h) => { for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) { g.fillStyle = (x + y) % 2 ? '#111' : '#fff'; g.fillRect(x * 16, y * 16, 16, 16); } g.fillStyle = '#ffe14a'; g.font = '900 34px Arial Black, sans-serif'; g.textAlign = 'center'; g.strokeStyle = '#111'; g.lineWidth = 6; g.strokeText('DÉPART', w / 2, 45); g.fillText('DÉPART', w / 2, 45); });
  for (let i = 0; i < GN; i++) {
    const th = i / GN * Math.PI * 2, d = g0.clone().multiplyScalar(Math.cos(th)).addScaledVector(tBest, Math.sin(th)).normalize();
    const fw = g0.clone().multiplyScalar(-Math.sin(th)).addScaledVector(tBest, Math.cos(th)).projectOnPlane(d).normalize();
    mine.clearArea(d, 2.8);
    const F = frame(d, fw, G), m = gateM(), arch = new THREE.Mesh(new THREE.TorusGeometry(2.0, 0.13, 8, 40, Math.PI), m);
    const holder = new THREE.Group(); holder.add(arch); F.pose(holder, 0, 0, -0.15); group.add(holder);
    if (i === 0) { const fl = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.65), new THREE.MeshBasicMaterial({ map: flagTex, side: THREE.DoubleSide, toneMapped: false })); fl.position.y = 2.3; holder.add(fl); }
    for (const s of [-2.0, 2.0]) obst(F.dir(0, s), 0.22);
    gates.push({ d, p: d.clone().multiplyScalar(G(d) + 0.5), m, F });
  }
  const raceHud = makeHud('raceHud', 'top:122px; background:rgba(20,12,40,.78); color:#fff; border:1px solid rgba(255,225,74,.5);', '');
  let race = { on: false, next: 0, t: 0, idle: 0, shown: 0 }, best = null; try { best = +localStorage.getItem(LS_RACE) || null; } catch (e) { best = null; }
  const fmt = s => s.toFixed(2).replace('.', ',') + ' s';

  /* =================== geyser en surface =================== */
  const sBeamM = beamMat('#9ef0ff'), sBeamM2 = beamMat('#c69bff');
  { const d = RX.clone(), f = tangentOf(d), r = new THREE.Vector3().crossVectors(d, f), g = new THREE.Group();
    g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(r, d, f)); g.position.copy(d).multiplyScalar(planet.heightDir(d) - 0.2);
    const H = 70; g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, H, 24, 1, true).translate(0, H / 2, 0), sBeamM), new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.2, H, 24, 1, true).translate(0, H / 2, 0), sBeamM2));
    g.children.forEach(m => { m.frustumCulled = false; }); surface.add(g); surface.userData.beam = g; }

  /* =================== état : dépôt des gemmes, porte, geyser =================== */
  let deposited = 0, done = !!saved.done, charge = done ? 1 : 0, doorK = done ? 1 : 0, flash = 0, beamOn = done ? 1 : 0;
  const heartSpan = document.createElement('span'); heartSpan.innerHTML = ' · <small>cœur</small> <span class="ht"></span>'; mine.hud.appendChild(heartSpan);
  const setHud = () => { heartSpan.querySelector('.ht').textContent = done ? '❤ allumé' : '❤ ' + deposited + ' / ' + mine.total; };
  setHud();
  function complete() {
    done = true; try { localStorage.setItem(LS, JSON.stringify({ done: 1 })); } catch (e) { /* rien */ }
    setHud(); A()?.sfx('star'); setTimeout(() => A()?.sfx('fly'), 400);
    toast('Le cœur de la planète s’est rallumé ! ✨ La salle secrète est ouverte.', 4200);
    api.onComplete?.();
  }
  const reactorPos = FR.dir(PED_A, 0).multiplyScalar(G(FR.dir(PED_A, 0)) + 0.5);
  const depositItem = {
    get prompt() { const c = mine.found - deposited; return done ? 'Le cœur bat à plein ❤' : c > 0 ? 'Déposer ' + c + (c > 1 ? ' gemmes' : ' gemme') + ' dans le cœur' : 'Le cœur attend des gemmes (' + deposited + ' / ' + mine.total + ')'; },
    go() {
      const c = mine.found - deposited;
      if (done) { flash = 1; A()?.note(NOTES[4], 0.07); return; }
      if (c <= 0) { toast('Ramasse les gemmes dans la caverne 💎', 2000); return; }
      deposited += c; flash = 1; burst(orb.getWorldPosition(new THREE.Vector3()), 50); A()?.sfx('power'); setHud();
      if (deposited >= mine.total) complete(); else toast('Cœur : ' + deposited + ' / ' + mine.total, 1500);
    },
  };
  const warpCore = { get prompt() { return 'Plonger dans le tourbillon (retour à la cascade)'; }, go() { api.onWarp?.(false); } };
  const warpSurf = { get prompt() { return 'Plonger dans le tourbillon vers le cœur de la planète'; }, go() { api.onWarp?.(true); } };

  /** L'invite à proposer (E) près de la voiture, ou null. */
  function near(car, under) {
    if (!car) return null;
    if (under) {
      if (car.distanceTo(reactorPos) < 3.3) return depositItem;
      if (car.distanceTo(coreWhirlPos) < 1.7) return warpCore;
      return null;
    }
    return car.distanceTo(surfaceWhirl.position) < 1.7 ? warpSurf : null;
  }
  /** Où arriver par le tourbillon : { dir, fwd } (côté noyau ou côté cascade). */
  function arrival(toCore) {
    if (toCore) { const d = FP.dir(2.6, 0); return { dir: d, fwd: FP.f.clone().projectOnPlane(d).normalize() }; }
    const up = surfaceWhirl.position.clone().normalize(), out = cascade.group.localToWorld(new THREE.Vector3(0, 0, 9)).normalize().sub(up).projectOnPlane(up).normalize();
    const d = up.clone().applyAxisAngle(new THREE.Vector3().crossVectors(up, out).normalize(), 2.2 / planet.heightDir(up)).normalize();
    return { dir: d, fwd: out.projectOnPlane(d).normalize() };
  }
  /** La voiture touche-t-elle la lave ? Renvoie l'endroit où la reposer ({ dir, fwd }) ou null. */
  function lava(P) {
    if (!P.ground || P.dir.dot(FR.c) < cosNear) return null;
    const L = FR.local(P.dir); if (L.rho < ISL + 0.2 || L.rho > MOAT - 0.2) return null;
    if (P.r > G(P.dir) + 0.3) return null;   // sur le pont
    toast('Aïe, c’est brûlant ! 🔥 Prends ton élan en turbo (Maj)', 2200); A()?.sfx('bump');
    const d = FR.dir(B.out0 + 1.6, 0); return { dir: d, fwd: FR.f.clone().negate().projectOnPlane(d).normalize() };
  }

  /* ---------- animation ---------- */
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), q = new THREE.Quaternion(), m4 = new THREE.Matrix4(), sv = new THREE.Vector3(1, 1, 1), YY = new THREE.Vector3(0, 1, 0);
  function update(dt, t, { car = null, P = null, under = false } = {}) {
    T.uTime.value = t;
    beamOn += ((done ? 1 : 0) - beamOn) * (1 - Math.exp(-dt * 0.8));
    sBeamM.uniforms.uOn.value = beamOn * 0.9; sBeamM2.uniforms.uOn.value = beamOn * 0.45; surface.userData.beam.visible = beamOn > 0.01;
    if (!under) { race.on = false; raceHud.classList.remove('on'); return; }
    refreshSlabs();
    // le noyau : charge, battement, éclair au dépôt
    const lv = A()?.level ? A().level() : 0, beat = Math.max(lv, 0.5 + 0.5 * Math.sin(t * 2.2 * Math.PI) ** 8 * 0.6);
    charge += ((done ? 1 : deposited / Math.max(1, mine.total)) - charge) * (1 - Math.exp(-dt * 1.5));
    flash = Math.max(0, flash - dt * 1.2);
    orbM.uniforms.uK.value = Math.min(1.4, charge + flash * 0.6); orbM.uniforms.uBeat.value = beat;
    haloM.uniforms.uK.value = 0.25 + charge * (0.9 + 0.5 * beat) + flash; orb.scale.setScalar(1 + 0.05 * beat * charge + 0.08 * flash);
    ringM.forEach((m, i) => { const on = charge * 6 > i + 0.2 ? 1 : 0; m.emissiveIntensity += ((0.05 + on * (1.4 + 0.6 * beat)) - m.emissiveIntensity) * Math.min(1, dt * 4); });
    beamM.uniforms.uOn.value = beamOn; beamM2.uniforms.uOn.value = beamOn * 0.5;
    // la porte : elle s'enfonce dans le sol
    if (done && doorK < 1) { doorK = Math.min(1, doorK + dt * 0.5); if (doorK > 0.6 && !doorObst.off) { doorObst.off = true; } }
    if (done) doorObst.off = true;
    door.position.copy(door.userData.base || (door.userData.base = door.position.clone())).addScaledVector(door.userData.base.clone().normalize(), -2.6 * doorK);
    star.rotateOnAxis(YY, dt * 1.5);
    // lac : sillage et ondes autour de la voiture
    lakeU.uniforms.uCar.value.copy(car || tmp.set(0, -999, 0));
    if (car && P && onLake(P.dir) && Math.abs(P.speed) > 0.6) {
      const pt = P.dir.clone().multiplyScalar(LV + 0.012), dd = wakeOn ? pt.distanceTo(wakeLast) : 1e9;
      if (dd > 0.8) wake.cut();
      if (dd > 0.12) { wake.push(pt, P.fwd, 0.6, Math.min(1, Math.abs(P.speed) / 4), t); wakeLast.copy(pt); wakeOn = true; }
    } else if (wakeOn) { wake.cut(); wakeOn = false; }
    wake.uniforms.uTime.value = t;
    // poissons
    fish.forEach((f, i) => {
      const th = f.ph + t * f.w, a = f.a + Math.cos(th) * f.rad, s = f.s + Math.sin(th) * f.rad, d = FL.dir(a, s);
      const d2 = FL.dir(f.a + Math.cos(th + 0.05 * Math.sign(f.w)) * f.rad, f.s + Math.sin(th + 0.05 * Math.sign(f.w)) * f.rad);
      tmp.copy(d).multiplyScalar(LV - 0.2 - 0.05 * Math.sin(t * 2 + i)); tmp2.copy(d2).sub(d).projectOnPlane(d).normalize();
      const r = new THREE.Vector3().crossVectors(d, tmp2); q.setFromRotationMatrix(m4.makeBasis(r, d, tmp2));
      fish.mesh.setMatrixAt(i, m4.compose(tmp, q, sv));
    });
    if (fish.length) fish.mesh.instanceMatrix.needsUpdate = true;
    // cristaux chantants
    for (let i = 0; i < choir.length; i++) {
      const c = choir[i]; c.cd -= dt; c.k = Math.max(0, c.k - dt * 1.2);
      if (car && c.cd <= 0 && car.distanceTo(c.p) < 1.25) {
        c.cd = 0.6; c.k = 1; A()?.note(NOTES[i]); heard.push(i); if (heard.length > MELODY.length) heard.shift();
        if (heard.length === MELODY.length && heard.every((n, j) => n === MELODY[j])) { heard.length = 0; melodyT = 6; toast('♪ Mélodie secrète ! Les cristaux chantent pour toi ✨', 3200); MELODY.concat([4, 6, 4, 0]).forEach((n, j) => setTimeout(() => { A()?.note(NOTES[n] + (j > 4 ? 12 : 0), 0.08); choir[n].k = 1; burst(choir[n].p, 12); }, 300 + j * 220)); }
      }
      const glow = melodyT > 0 ? 0.8 + 0.8 * Math.sin(t * 6 + i) : 0;
      c.m.emissiveIntensity = 0.35 + 2.6 * c.k + glow; c.c.scale.x = c.c.scale.z = 0.5 * (1 + 0.12 * c.k);
    }
    melodyT = Math.max(0, melodyT - dt);
    for (let i = 0; i < SPK; i++) { const s = spk[i]; if (s.life > 0) { s.life -= dt; s.v.addScaledVector(s.p.clone().normalize(), -3 * dt); s.p.addScaledVector(s.v, dt); spkPos.set([s.p.x, s.p.y, s.p.z], i * 3); } else spkPos.set([0, 0, 0], i * 3); }
    spkGeo.attributes.position.needsUpdate = true;
    // lucioles : elles errent autour de chez elles et s'écartent de la voiture
    for (let i = 0; i < FF; i++) {
      const f = flies[i];
      tmp.set(Math.sin(t * 0.7 + f.ph) * 0.8, Math.sin(t * 0.5 + f.ph * 2) * 0.5, Math.cos(t * 0.6 + f.ph) * 0.8).add(f.home);
      f.v.addScaledVector(tmp.sub(f.p), dt * 0.8);
      if (car) { const dd = f.p.distanceTo(car); if (dd < 3) f.v.addScaledVector(tmp2.copy(f.p).sub(car).normalize(), dt * 14 / Math.max(0.5, dd)); }
      f.v.multiplyScalar(Math.exp(-dt * 1.4)); f.p.addScaledVector(f.v, dt);
      const fl = Math.pow(0.5 + 0.5 * Math.sin(t * f.f + f.ph), 3);
      ffPos.set([f.p.x, f.p.y, f.p.z], i * 3); ffCol.set([0.75 * fl + 0.05, 1.0 * fl + 0.05, 0.3 * fl], i * 3);
    }
    ffGeo.attributes.position.needsUpdate = true; ffGeo.attributes.color.needsUpdate = true;
    // chauves-souris : suspendues ; dérangées (klaxon, voiture rapide juste dessous), elles tournoient puis reviennent
    if (car && P && Math.abs(P.speed) > 4 && angU(car.clone().normalize(), batRoost) < 5) { if (batT <= 0) A()?.sfx('spin'); batT = Math.max(batT, 6); }
    batT -= dt;
    for (const b of bats) {
      const want = batT > 0 ? 1 : 0; b.fly += (want - b.fly) * (1 - Math.exp(-dt * (want ? 3 : 0.8)));
      b.th += b.w * dt * (0.6 + b.fly);
      const flyD = batRoost.clone().applyAxisAngle(tangentOf(batRoost), b.rad / RR).applyAxisAngle(batRoost, b.th).normalize();
      const flyP = flyD.multiplyScalar(THREE.MathUtils.lerp(G(flyD) + 3, mine.ceilH(flyD) - 1.5, 0.5 + 0.3 * Math.sin(t * 1.3 + b.ph)));
      b.g.position.lerpVectors(b.rest, flyP, b.fly);
      const up = b.g.position.clone().normalize(), fwd = new THREE.Vector3().crossVectors(batRoost, up).normalize().multiplyScalar(Math.sign(b.w));
      if (fwd.lengthSq() < 0.5) fwd.copy(tangentOf(up));
      const rr = new THREE.Vector3().crossVectors(up, fwd); q.setFromRotationMatrix(m4.makeBasis(rr, up, fwd));
      if (b.fly < 0.5) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI * (1 - b.fly * 2)));   // la tête en bas, au repos
      b.g.quaternion.copy(q);
      const flap = b.fly > 0.2 ? Math.sin(t * 22 + b.ph) * 0.9 : 1.25;
      b.L.rotation.z = flap; b.R.rotation.z = -flap;
    }
    // course
    if (car && P) {
      race.idle += dt;
      const gNext = gates[race.next];
      gates.forEach((g, i) => { const on = race.on ? i === race.next : i === 0; g.m.color.set(on ? '#ffe14a' : '#7a5cff'); g.m.opacity = on ? 1 : 0.55; });
      if (car.distanceTo(gNext.p) < 2.0) {
        if (!race.on && race.next === 0) { race.on = true; race.t = 0; race.next = 1; race.idle = 0; A()?.sfx('flag'); toast('Course ! Passe les 8 portes 🏁', 1400); }
        else if (race.on && race.next === 0) {
          race.on = false; const tt = race.t, rec = !best || tt < best;
          if (rec) { best = tt; try { localStorage.setItem(LS_RACE, String(tt)); } catch (e) { /* rien */ } }
          toast((rec ? 'Record ! ' : 'Arrivée : ') + fmt(tt), 2600); A()?.sfx(rec ? 'star' : 'coin'); race.shown = 4; race.next = 0;
        } else if (race.on) { race.next = (race.next + 1) % GN; race.idle = 0; A()?.sfx('coin'); }
      }
      if (race.on) { race.t += dt; if (race.idle > 60) { race.on = false; race.next = 0; toast('Course abandonnée', 1400); } }
      race.shown = Math.max(0, race.shown - dt);
      const nearStart = car.distanceTo(gates[0].p) < 9;
      raceHud.classList.toggle('on', race.on || nearStart || race.shown > 0);
      raceHud.innerHTML = '🏁 <span class="ct">' + (race.on ? fmt(race.t) + '</span> <small>porte ' + race.next + ' / ' + GN + '</small>' : (best ? fmt(best) : '—') + '</span> <small>' + (best ? 'record' : 'passe sous la porte DÉPART') + '</small>');
    }
  }

  const api = {
    group, surface, surfaceWhirl, placeSurfaceWhirl, update, near, arrival, lava, honk,
    onWarp: null, onComplete: null,
    get done() { return done; },
    /** pour les essais */
    dbg: { RX, LX, CX, SX, PX, gates, reactorPos, FR, B, LV, get deposited() { return deposited; }, set deposited(v) { deposited = v; setHud(); }, complete },
  };
  return api;
}
