/* ============================================================================
   Bord de mer : un phare rayé rouge et blanc dont le faisceau tourne (bien
   visible la nuit), et un food truck garé près de la plage, avec son auvent
   rayé, son cornet géant sur le toit, sa guirlande et sa petite table.

   Emplacements : PLACES dans placement.js (outil ?placer) ; sans
   emplacement choisi, on cherche tout seul un coin de côte.
   ============================================================================ */
import * as THREE from 'three';
import { makeKit } from './eggkit.js';
import { getPlace } from './placement.js';

const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, ...o });
const glowMat = (c, o = {}) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false, ...o });

/* ---------- le phare ---------- */
function makeLighthouse() {
  const g = new THREE.Group();
  const white = std('#f4f1ea'), red = std('#e2483d'), stone = std('#8d93a3', { roughness: 0.95 }), dark = std('#2b2f3d', { roughness: 0.4, metalness: 0.4 });
  // socle de rochers
  const rock = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.95, 0.32, 9).translate(0, 0.08, 0), stone); g.add(rock);
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * Math.PI * 2 + 0.3, b = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16 + (i % 3) * 0.05, 0), stone);
    b.position.set(Math.cos(a) * 0.86, 0.05, Math.sin(a) * 0.86); b.rotation.set(i, i * 2, 0); g.add(b);
  }
  // la tour : quatre bandes alternées, légèrement coniques
  const Y0 = 0.24, Y1 = 2.6, R0 = 0.44, R1 = 0.3, NB = 5;
  for (let i = 0; i < NB; i++) {
    const ya = Y0 + (Y1 - Y0) * i / NB, yb = Y0 + (Y1 - Y0) * (i + 1) / NB, ra = R0 + (R1 - R0) * i / NB, rb = R0 + (R1 - R0) * (i + 1) / NB;
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(rb, ra, yb - ya, 24).translate(0, (ya + yb) / 2, 0), i % 2 ? red : white));
  }
  // porte et hublots (côté +z)
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.34, 0.06), std('#2d4a7a')); door.position.set(0, Y0 + 0.17, R0 - 0.02); door.rotation.x = -0.05; g.add(door);
  for (const [y, a] of [[1.15, 0.4], [1.75, -0.9], [2.25, 2.4]]) {
    const r = R0 + (R1 - R0) * (y - Y0) / (Y1 - Y0), w = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.04, 12).rotateX(Math.PI / 2), dark);
    w.position.set(Math.sin(a) * r, y, Math.cos(a) * r); w.lookAt(0, y, 0); g.add(w);
  }
  // galerie et garde-corps
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.38, 0.08, 24).translate(0, Y1 + 0.04, 0), dark));
  const rail = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.012, 6, 32).rotateX(Math.PI / 2).translate(0, Y1 + 0.24, 0), dark); g.add(rail);
  for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2, p = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.2, 4), dark); p.position.set(Math.cos(a) * 0.42, Y1 + 0.14, Math.sin(a) * 0.42); g.add(p); }
  // la lanterne : verre lumineux, montants, toit rouge
  const LY = Y1 + 0.27;
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.34, 16).translate(0, LY, 0), glowMat('#fff1b8')); g.add(glass);
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, p = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.36, 0.025), dark); p.position.set(Math.cos(a) * 0.225, LY, Math.sin(a) * 0.225); g.add(p); }
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.04, 20).translate(0, LY + 0.19, 0), red));
  g.add(new THREE.Mesh(new THREE.ConeGeometry(0.27, 0.3, 20).translate(0, LY + 0.36, 0), red));
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), dark); ball.position.y = LY + 0.53; g.add(ball);
  // faisceau tournant : deux cônes opposés (deux lentilles), rendus comme un volume de lumière dans l'air humide
  const beam = new THREE.Group(); beam.position.y = LY; g.add(beam);
  const BEAM_L = 16;
  const beamMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, toneMapped: false,
    uniforms: { uI: { value: 0 }, uColor: { value: new THREE.Color('#ffe9b0') }, uTime: { value: 0 }, uLen: { value: BEAM_L } },
    vertexShader: `
      uniform float uLen; varying float vAx; varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main() {
        vAx = abs(position.z) / uLen;                              // 0 à la lentille, 1 au bout
        vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
        vN = normalize(mat3(modelMatrix) * normal); vV = cameraPosition - w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `
      uniform float uI; uniform vec3 uColor; uniform float uTime; varying float vAx; varying vec3 vN; varying vec3 vV; varying vec3 vW;
      float h(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      float n3(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z); }
      void main() {
        // épaisseur traversée : maximale au centre du cône vu de face, nulle sur les bords (pas de contour net)
        float facing = abs(dot(normalize(vN), normalize(vV)));
        float core = pow(facing, 2.2);
        // la lumière s'étale et s'affaiblit en s'éloignant, très vive contre la lentille
        float fall = exp(-vAx * 3.0) * smoothstep(0.0, 0.04, vAx) * (1.0 - smoothstep(0.7, 1.0, vAx));
        // un peu de brume qui dérive dans le faisceau
        float mist = 0.75 + 0.5 * n3(vW * 0.9 + vec3(uTime * 0.25, 0.0, uTime * 0.1));
        float a = uI * core * fall * mist;
        gl_FragColor = vec4(uColor * a, 1.0);
      }`,
  });
  for (const s of [1, -1]) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 0.1, BEAM_L, 28, 1, true).translate(0, BEAM_L / 2, 0).rotateX(s * Math.PI / 2), beamMat);
    c.rotation.x = s * 0.035; c.renderOrder = 5; c.frustumCulled = false; beam.add(c);   // à peine incliné vers le bas, comme un vrai feu
  }
  // projecteurs : chaque lentille éclaire aussi ce qu'elle balaie (le sol, les arbres, la voiture), en penchant un peu vers le sol
  const spots = [];
  for (const s of [1, -1]) {
    const sp = new THREE.SpotLight('#ffe2a0', 0, 26, 0.2, 0.75, 1); sp.castShadow = false;
    sp.target.position.set(0, -2.6, s * 9); beam.add(sp, sp.target); spots.push(sp);
  }
  return { group: g, glass, beam, beamMat, spots, lampY: LY, box: { half: 0.75, front: 0.75, rear: 0.75 } };
}

/* ---------- le food truck ---------- */
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function makeFoodTruck() {
  const g = new THREE.Group();
  const body = std('#7fd6c2', { roughness: 0.45 }), cream = std('#fff3dc'), coral = std('#ff6a4d'), dark = std('#23263a', { roughness: 0.5 }),
    tire = std('#1d1e26', { roughness: 0.9 }), chrome = std('#d9dce4', { metalness: 0.8, roughness: 0.25 }), glassM = std('#5e86b8', { roughness: 0.1, metalness: 0.3 });
  const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); g.add(o); return o; };
  // caisse arrière (cuisine), cabine à l'avant (+z)
  box(0.74, 0.7, 1.12, body, 0, 0.6, -0.16);
  box(0.75, 0.1, 1.13, cream, 0, 0.36, -0.16);                // bande crème en bas
  box(0.7, 0.46, 0.42, body, 0, 0.48, 0.6);                   // cabine
  box(0.71, 0.08, 0.43, cream, 0, 0.29, 0.6);
  box(0.62, 0.2, 0.02, glassM, 0, 0.6, 0.815).rotation.x = -0.25;   // pare-brise
  for (const s of [-1, 1]) box(0.02, 0.18, 0.24, glassM, s * 0.355, 0.6, 0.62);   // vitres latérales
  box(0.6, 0.06, 0.04, chrome, 0, 0.3, 0.83);                 // pare-chocs
  for (const s of [-1, 1]) { const l = new THREE.Mesh(new THREE.CircleGeometry(0.05, 12), glowMat('#fff6d0')); l.position.set(s * 0.24, 0.42, 0.822); g.add(l); }
  // roues
  for (const [x, z] of [[-0.36, 0.55], [0.36, 0.55], [-0.36, -0.45], [0.36, -0.45]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.1, 18).rotateZ(Math.PI / 2), tire); w.position.set(x, 0.14, z); g.add(w);
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.11, 12).rotateZ(Math.PI / 2), chrome); h.position.set(x, 0.14, z); g.add(h);
  }
  // guichet côté droit (+x) : ouverture, comptoir, auvent rayé
  box(0.02, 0.3, 0.7, dark, 0.371, 0.68, -0.18);
  box(0.12, 0.03, 0.74, cream, 0.43, 0.52, -0.18);
  const stripes = canvasTex(128, 32, (x, w, h) => { for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#ffffff' : '#ff6a4d'; x.fillRect(i * w / 8, 0, w / 8, h); } });
  const awn = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.3), new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.8, side: THREE.DoubleSide }));
  awn.rotation.set(0, Math.PI / 2, 0); awn.rotateX(-0.95); awn.position.set(0.48, 0.9, -0.18); g.add(awn);
  // guirlande sous l'auvent
  const bulbs = [];
  for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), glowMat(['#ffd36b', '#ff8fb8', '#9fe8ff'][i % 3])); b.position.set(0.58, 0.8 - 0.02 * Math.sin(i / 5 * Math.PI), -0.5 + i * 0.13); g.add(b); bulbs.push(b); }
  // enseigne sur le toit
  const sign = canvasTex(256, 64, (x, w, h) => {
    x.fillStyle = '#fff3dc'; x.fillRect(0, 0, w, h); x.fillStyle = '#ff6a4d'; x.fillRect(0, h - 8, w, 8);
    x.font = '900 40px "Arial Black", Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#23263a'; x.fillText('SNACK', w / 2, h / 2 - 2);
  });
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.18, 0.7), [cream, cream, cream, cream, cream, cream]);
  const face = new THREE.MeshStandardMaterial({ map: sign, roughness: 0.7 });
  board.material[0] = face; board.material[1] = face; board.position.set(0, 1.06, -0.2); g.add(board);
  for (const z of [-0.45, 0.05]) box(0.03, 0.1, 0.03, dark, 0, 0.97, z);
  // cornet de glace géant sur le toit
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.3, 14).rotateX(Math.PI), std('#e3a356', { roughness: 0.8 })); cone.position.set(0, 1.13, -0.62); g.add(cone);
  [['#ffb3c9', 0], ['#fff3dc', 0.1], ['#8b5a3c', 0.19]].forEach(([c, dy]) => { const s = new THREE.Mesh(new THREE.SphereGeometry(0.11 - dy * 0.15, 14, 10), std(c, { roughness: 0.5 })); s.position.set(0, 1.3 + dy, -0.62); g.add(s); });
  const cherry = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), std('#e0283a', { roughness: 0.3 })); cherry.position.set(0, 1.55, -0.62); g.add(cherry);
  // petite table, parasol et tabourets devant le guichet
  const T = new THREE.Group(); T.position.set(1.0, 0, -0.15); g.add(T);
  const tb = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 16).translate(0, 0.42, 0), cream); T.add(tb);
  T.add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.42, 6).translate(0, 0.21, 0), dark));
  T.add(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.95, 6).translate(0, 0.6, 0), dark));
  const umb = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.18, 8, 1, true).translate(0, 1.07, 0), new THREE.MeshStandardMaterial({ color: '#ff6a4d', roughness: 0.8, side: THREE.DoubleSide })); T.add(umb);
  for (const a of [0.9, 2.6, 4.3]) { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.26, 10).translate(0, 0.13, 0), std('#ffd36b')); st.position.set(Math.cos(a) * 0.36, 0, Math.sin(a) * 0.36); T.add(st); }
  return { group: g, bulbs, box: { half: 0.42, front: 0.85, rear: 0.75 } };
}

/* ---------- pose sur la planète, recherche de côte, outil de placement ---------- */
export function makeBeach({ planet, scene, sections, R, quality = 'high' }) {
  const low = quality === 'low';
  const K = makeKit({ planet, sections, R, seed: 90217 });
  const { tangent } = K;

  const lh = makeLighthouse(), ft = makeFoodTruck();
  scene.add(lh.group, ft.group);
  const items = { phare: { ...lh, label: 'Phare', obj: lh.group }, truck: { ...ft, label: 'Food truck', obj: ft.group } };

  // côté de la mer autour d'un point (somme des directions mouillées)
  const seaSide = (d, dist) => {
    const t1 = tangent(d), t2 = new THREE.Vector3().crossVectors(d, t1), v = new THREE.Vector3(); let n = 0;
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, q = d.clone().addScaledVector(t1, Math.cos(a) * dist / R).addScaledVector(t2, Math.sin(a) * dist / R).normalize(); if (planet.isWet(q)) { n++; v.add(q.sub(d)); } }
    return { n, v: v.projectOnPlane(d) };
  };
  const capFrom = (d, fwd) => { const t1 = tangent(d), t2 = new THREE.Vector3().crossVectors(d, t1); return Math.round(Math.atan2(fwd.dot(t2), fwd.dot(t1)) * 180 / Math.PI); };
  const fwdFrom = (d, cap) => { const a = cap * Math.PI / 180, t1 = tangent(d), t2 = new THREE.Vector3().crossVectors(d, t1); return t1.multiplyScalar(Math.cos(a)).addScaledVector(t2, Math.sin(a)); };

  function autoSpots() {
    const out = {};
    const coast = (d, rad) => K.dry(d, 0.3) && K.farFromZones(d, 0.3) && K.flat(d, 0.18, rad) && K.treesWithin(d, rad + 0.3) === 0;
    // phare : au bout d'un cap (beaucoup d'eau autour), pas les pieds dans l'eau
    const p = K.findSpot(d => coast(d, 0.8) && seaSide(d, 1.0).n === 0 && seaSide(d, 2.4).n >= 4, { tries: 4000, score: d => seaSide(d, 2.4).n });
    if (p) out.phare = { dir: p, cap: capFrom(p, seaSide(p, 2.4).v.negate()) };          // la porte regarde la terre
    // food truck : sur le sable, près de l'eau, loin du phare
    const truckOk = strict => d => K.dry(d, 0.3) && K.farFromZones(d, 0.3) && K.flat(d, strict ? 0.18 : 0.3, 0.8) && K.treesWithin(d, strict ? 1.2 : 0.9) === 0
      && (!strict || planet.sandAt(d) > 0.3) && !planet.isWet(d) && seaSide(d, 0.8).n === 0 && seaSide(d, 2.6).n >= 1 && (!p || K.angDist(d, p) > 5);
    const t = K.findSpot(truckOk(true), { tries: 5000, score: d => -Math.abs(seaSide(d, 2.6).n - 4) + planet.sandAt(d) })
           || K.findSpot(truckOk(false), { tries: 5000, score: d => -Math.abs(seaSide(d, 2.6).n - 4) })
           || K.findSpot(d => !planet.isWet(d) && K.farFromZones(d, 0.25) && K.treesWithin(d, 0.8) === 0 && seaSide(d, 3).n >= 1 && (!p || K.angDist(d, p) > 4), { tries: 8000 });
    if (t) { const s = seaSide(t, 2.6).v.normalize(); out.truck = { dir: t, cap: capFrom(t, new THREE.Vector3().crossVectors(t, s)) }; }   // guichet tourné vers la terre, l'eau dans le dos
    return out;
  }

  const state = {};
  { const man = { phare: getPlace('phare'), truck: getPlace('truck') }, auto = (!man.phare || !man.truck) ? autoSpots() : {};
    for (const k of Object.keys(items)) { const src = man[k] || auto[k]; state[k] = src ? { dir: src.dir.clone().normalize(), cap: src.cap || 0 } : null; } }
  const place = k => {
    const s = state[k], it = items[k]; it.obj.visible = !!s; if (!s) return;
    const up = s.dir, f = fwdFrom(up, s.cap), r = new THREE.Vector3().crossVectors(up, f);
    it.obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(r, up, f));
    it.obj.position.copy(up).multiplyScalar(planet.heightDir(up) - 0.02);
  };
  Object.keys(items).forEach(place);

  /* ---------- animation : rotation, intensité selon la nuit, reflet sur la mer ---------- */
  let ang = 0, time = 0; const lampC = new THREE.Color('#fff1b8'), lamp = new THREE.Vector3(), bdir = new THREE.Vector3();
  const WU = planet.waterUniforms;
  if (low) lh.spots.forEach(sp => { sp.visible = false; });
  function update(dt, night = 0) {
    time += dt; ang += dt * 0.45; lh.beam.rotation.y = ang;   // un tour toutes les 14 s environ
    const n = Math.min(1, Math.max(0, night)), nn = n * n * (3 - 2 * n);
    if (!lh.group.visible) { WU.uLhI.value = 0; return; }
    // faisceau : presque invisible en plein jour, net au crépuscule, intense la nuit
    lh.beamMat.uniforms.uI.value = 0.006 + 0.3 * nn; lh.beamMat.uniforms.uTime.value = time;
    lh.spots.forEach(sp => { sp.intensity = 6 * nn; });
    lh.glass.material.color.copy(lampC).multiplyScalar(1 + 1.6 * nn);
    lamp.set(0, lh.lampY, 0); lh.group.localToWorld(lamp);
    bdir.set(0, 0, 1).applyQuaternion(lh.beam.getWorldQuaternion(new THREE.Quaternion()));
    // la mer : le cône balaie les vagues
    WU.uLhPos.value.copy(lamp); WU.uLhDir.value.copy(bdir); WU.uLhI.value = nn;
  }
  return {
    update,
    groups: [lh.group, ft.group],
    solids: [{ obj: lh.group, ...lh.box }, { obj: ft.group, ...ft.box }],
  };
}
