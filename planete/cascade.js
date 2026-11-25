/* ============================================================================
   La cascade : un gros rocher creux, une chute d'eau tombe devant son entrée
   dans un petit bassin. On la traverse en voiture : derrière l'eau, une grotte,
   et au fond un coffre au trésor qui s'ouvre (E) dans une gerbe de pièces.

   Emplacement : POS ci-dessous (direction sur la planète + cap en degrés) ;
   s'il est vide, on cherche un coin dégagé, plat et sec, à l'écart des zones.
   ============================================================================ */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeKit } from './eggkit.js';
import { fadeNearCamera } from './world.js';

/** Position définitive : { dir: [x, y, z], cap: degrés } — null : placement automatique. */
const POS = null;

const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, ...o });

/** Rocher bosselé à facettes : les sommets confondus bougent ensemble (pas de fentes entre les facettes). */
function rockGeo(seed, sx = 1, sy = 1, sz = 1) {
  const g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = 1 + 0.16 * Math.sin(v.x * 5.1 + seed) * Math.cos(v.y * 4.3 - seed * 0.7) + 0.1 * Math.sin(v.z * 6.7 + seed * 1.9);
    p.setXYZ(i, v.x * k * sx, v.y * k * sy, v.z * k * sz);
  }
  g.computeVertexNormals();
  return g;
}

/* ---------- le rideau d'eau : stries qui descendent, écume au pied, bords effilochés ---------- */
const NOISE2 = /* glsl */ `
  float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }`;
function fallMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uFade: { value: 1 }, uDeep: { value: new THREE.Color('#1c9fae') }, uFoam: { value: new THREE.Color('#effcff') } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: NOISE2 + /* glsl */ `
      uniform float uTime; uniform float uFade; uniform vec3 uDeep; uniform vec3 uFoam; varying vec2 vUv;
      void main(){
        float y = vUv.y;
        float s1 = n2(vec2(vUv.x * 18.0, y * 3.0 + uTime * 2.6));
        float s2 = n2(vec2(vUv.x * 7.0 + 3.1, y * 1.6 + uTime * 1.7));
        float streak = smoothstep(0.5, 0.92, s1 * 0.65 + s2 * 0.45);
        float foam = smoothstep(0.3, 0.0, y) * (0.6 + 0.4 * n2(vec2(vUv.x * 12.0, uTime * 3.0)));   // bouillon au pied
        float lip = smoothstep(0.9, 1.0, y);                                                       // l'eau blanchit en passant le rebord
        float side = smoothstep(0.0, 0.1, vUv.x) * smoothstep(1.0, 0.9, vUv.x);
        float rag = smoothstep(0.0, 0.25, side - 0.35 * n2(vec2(vUv.x * 9.0, y * 5.0 + uTime * 2.0)) * (1.0 - side));
        vec3 col = mix(uDeep, uFoam, clamp(streak * 0.85 + foam + lip * 0.6, 0.0, 1.0));
        gl_FragColor = vec4(col * 1.05, (0.5 + 0.4 * streak + 0.4 * foam) * rag * uFade);
        #include <colorspace_fragment>
      }`,
  });
}

export function makeCascade({ planet, sections, R, avoid = [] }) {
  const K = makeKit({ planet, sections, R, seed: 52711 });
  const tangent = K.tangent;
  /* ---------- emplacement ---------- */
  let dir, fwd;
  if (POS) { dir = new THREE.Vector3(...POS.dir).normalize(); fwd = tangent(dir); fwd.applyAxisAngle(dir, POS.cap * Math.PI / 180); }
  else {
    // plat sur tout le rocher et le bassin, sec, sans arbre ni chemin, ni trop loin ni trop près d'une zone
    const clearOfPaths = (d, r) => { const t1 = tangent(d), t2 = new THREE.Vector3().crossVectors(d, t1); for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; for (const f of [0.5, 1]) if (planet.pathDir(d.clone().addScaledVector(t1, Math.cos(a) * r * f / R).addScaledVector(t2, Math.sin(a) * r * f / R).normalize()) > 0) return false; } return true; };
    const wetNear = (d, r) => { const t1 = tangent(d), t2 = new THREE.Vector3().crossVectors(d, t1); for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; if (planet.isWet(d.clone().addScaledVector(t1, Math.cos(a) * r / R).addScaledVector(t2, Math.sin(a) * r / R).normalize())) return true; } return false; };
    const ok = d => K.dry(d, 0.01) && K.farFromZones(d, 0.46) && avoid.every(a => a.dot(d) < Math.cos(9 / R)) && K.flat(d, 0.25, 3) && K.flat(d, 0.6, 6) && !wetNear(d, 5.5) && clearOfPaths(d, 6);
    const near = d => { let m = 9; for (const s of sections) m = Math.min(m, K.angDist(s.dir, d)); return m; };
    dir = K.findSpot(ok, { tries: 6000, score: d => -Math.abs(near(d) - 18) - 0.25 * K.treesWithin(d, 7) }) || K.findSpot(d => K.dry(d, 0.01) && K.flat(d, 0.3, 3), { tries: 4000 }) || new THREE.Vector3(0, 1, 0);
    // l'entrée regarde vers la zone la plus proche (on la voit en arrivant)
    let best = sections[0]; for (const s of sections) if (s.dir.dot(dir) > best.dir.dot(dir)) best = s;
    fwd = best.dir.clone().projectOnPlane(dir); if (fwd.lengthSq() < 1e-6) fwd = tangent(dir); fwd.normalize();
  }

  const group = new THREE.Group(); group.name = 'cascade';
  K.placeOn(group, dir, fwd, -0.05); group.updateMatrixWorld(true);

  /* ---------- le rocher creux : un anneau de blocs ouvert à l'avant, un toit, un linteau au-dessus de l'entrée ---------- */
  const RING = 4.2, GAP = 0.62;   // rayon de l'anneau, demi-angle de l'ouverture (radians)
  const rocks = []; let sd = 3;
  const put = (x, y, z, s, sy = s, rx = 0, ry = 0) => { const g = rockGeo(sd += 1.7, s, sy, s); g.rotateX(rx).rotateY(ry).translate(x, y, z); rocks.push(g); };
  for (let k = 0; k < 15; k++) {
    const a = GAP + 0.05 + k / 14 * (Math.PI * 2 - 2 * GAP - 0.1);
    put(Math.sin(a) * RING, 0.7, Math.cos(a) * RING, 1.45 + 0.25 * Math.sin(k * 2.1), 1.5, k, k * 0.7);
    put(Math.sin(a + 0.1) * (RING - 0.35), 2.15, Math.cos(a + 0.1) * (RING - 0.35), 1.2 + 0.2 * Math.cos(k * 1.3), 1.0, k * 0.4, k);
  }
  // toit (un peu de jour passe entre les blocs)
  for (const [x, z, s] of [[0, -0.6, 2.1], [-1.7, 0.9, 1.6], [1.7, 0.9, 1.6], [-1.2, -2.2, 1.6], [1.4, -2.1, 1.6], [0, 1.9, 1.5]]) put(x, 3.25, z, s, 0.85, 0.3, x);
  // linteau au-dessus de l'entrée : la cascade tombe de là
  for (const [x, s] of [[-1.5, 1.25], [0, 1.35], [1.5, 1.25]]) put(x, 3.35, RING - 0.15, s, 0.9, 0.5, x);
  // éboulis devant, de part et d'autre du bassin
  for (const [x, z, s] of [[-2.9, 5.6, 0.7], [3.0, 5.4, 0.8], [-2.2, 6.6, 0.45], [2.5, 6.5, 0.5], [-3.6, 4.4, 0.6], [3.7, 4.5, 0.55]]) put(x, 0.15, z, s, s * 0.7, x, z);
  const rockMat = fadeNearCamera(std('#a996e2', { roughness: 0.92, flatShading: true }));
  const rockMesh = new THREE.Mesh(mergeGeometries(rocks), rockMat); rockMesh.castShadow = rockMesh.receiveShadow = true;
  group.add(rockMesh);
  // sol de la grotte : de la pierre sombre, un peu de mousse au bord
  const floor = new THREE.Mesh(new THREE.CircleGeometry(3.4, 40).rotateX(-Math.PI / 2).translate(0, 0.07, 0), std('#6f5f9e', { roughness: 1 }));
  floor.receiveShadow = true; group.add(floor);
  // sur le toit : la petite mare qui alimente la cascade
  const topPool = new THREE.Mesh(new THREE.CircleGeometry(1.3, 24).rotateX(-Math.PI / 2).translate(0, 4.02, 2.6), std('#2bb6c0', { roughness: 0.12, metalness: 0.1 }));
  group.add(topPool);

  /* ---------- la cascade, le bassin, la brume ---------- */
  const fallM = fallMaterial();
  const fg = new THREE.PlaneGeometry(3.4, 4.3, 10, 28), fp = fg.attributes.position;
  for (let i = 0; i < fp.count; i++) {
    const y = fp.getY(i) + 2.15, x = fp.getX(i);
    const lip = THREE.MathUtils.smoothstep(y, 3.5, 4.3);   // en haut, l'eau déborde du rebord en s'arrondissant
    fp.setXYZ(i, x * (1 - 0.06 * (1 - y / 4.3)), y, RING + 0.85 + 0.25 * Math.sin(x * 1.7) * 0.2 - 0.9 * lip * lip);
  }
  const fall = new THREE.Mesh(fg, fallM); fall.renderOrder = 2; group.add(fall);
  const fall2 = new THREE.Mesh(fg, fallM); fall2.position.z = 0.12; fall2.scale.set(0.86, 1, 1); fall2.renderOrder = 2; group.add(fall2);   // un second voile, décalé : de l'épaisseur
  const poolM = new THREE.MeshStandardMaterial({ color: '#1aa3ad', roughness: 0.1, metalness: 0.15, transparent: true, opacity: 0.9 });
  const pool = new THREE.Mesh(new THREE.CircleGeometry(2.3, 40).rotateX(-Math.PI / 2).translate(0, 0.1, RING + 1.6), poolM); pool.receiveShadow = true; group.add(pool);
  const foamM = new THREE.MeshBasicMaterial({ color: '#f3fdff', transparent: true, opacity: 0.75, depthWrite: false });
  const foam = new THREE.Mesh(new THREE.RingGeometry(2.05, 2.35, 40).rotateX(-Math.PI / 2).translate(0, 0.12, RING + 1.6), foamM); group.add(foam);
  const boilM = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false });
  const boil = new THREE.Mesh(new THREE.CircleGeometry(1.0, 24).rotateX(-Math.PI / 2), boilM); boil.scale.set(1.8, 1, 0.55); boil.position.set(0, 0.13, RING + 0.95); group.add(boil);
  // brume : des gouttes qui rebondissent au pied de la chute
  const MIST = 90, mistPos = new Float32Array(MIST * 3), mist = [];
  for (let i = 0; i < MIST; i++) mist.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: Math.random() });
  const mistGeo = new THREE.BufferGeometry(); mistGeo.setAttribute('position', new THREE.BufferAttribute(mistPos, 3));
  const mistPts = new THREE.Points(mistGeo, new THREE.PointsMaterial({ color: '#ffffff', size: 0.16, transparent: true, opacity: 0.7, depthWrite: false }));
  mistPts.frustumCulled = false; group.add(mistPts);
  const respawn = m => { m.p.set((Math.random() - 0.5) * 3, 0.15, RING + 0.9 + Math.random() * 0.4); m.v.set((Math.random() - 0.5) * 1.2, 1.2 + Math.random() * 1.6, 0.4 + Math.random() * 1.2); m.life = 0.6 + Math.random() * 0.7; };
  mist.forEach(respawn);

  /* ---------- le coffre, au fond, sur un tas de pièces ---------- */
  const wood = std('#8a4b2a', { roughness: 0.85 }), woodD = std('#5e2f1c', { roughness: 0.9 }), gold = std('#ffc63a', { roughness: 0.28, metalness: 0.85 });
  const chest = new THREE.Group(); chest.position.set(0, 0.07, -1.7); group.add(chest);
  const W = 1.0, D = 0.66, H = 0.5;
  chest.add(new THREE.Mesh(new THREE.BoxGeometry(W, H, D).translate(0, H / 2, 0), wood));
  for (const x of [-0.36, 0.36]) chest.add(new THREE.Mesh(new THREE.BoxGeometry(0.08, H + 0.02, D + 0.02).translate(x, H / 2, 0), gold));
  chest.add(new THREE.Mesh(new THREE.BoxGeometry(W + 0.02, 0.06, D + 0.02).translate(0, 0.05, 0), woodD));
  // l'intérieur qui brille (le bloom fait le reste)
  const glow = new THREE.Mesh(new THREE.BoxGeometry(W - 0.08, 0.04, D - 0.08).translate(0, H - 0.03, 0), new THREE.MeshBasicMaterial({ color: '#ffd76a', toneMapped: false }));
  glow.material.color.multiplyScalar(1); chest.add(glow);
  const pile = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.05, 0.38, 0.65).translate(0, H - 0.04, 0), gold); chest.add(pile);
  // couvercle bombé, charnière à l'arrière
  const lid = new THREE.Group(); lid.position.set(0, H, -D / 2); chest.add(lid);
  lid.add(new THREE.Mesh(new THREE.CylinderGeometry(D / 2, D / 2, W, 16, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateX(Math.PI / 2).translate(0, 0, D / 2), wood));
  for (const x of [-0.36, 0.36]) lid.add(new THREE.Mesh(new THREE.CylinderGeometry(D / 2 + 0.015, D / 2 + 0.015, 0.08, 16, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateX(Math.PI / 2).translate(x, 0, D / 2), gold));
  lid.add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.05).translate(0, 0.02, D + 0.02), gold));   // la serrure
  // pièces éparpillées autour, quelques gemmes
  const coinGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.025, 12);
  const SCAT = 70, scat = new THREE.InstancedMesh(coinGeo, gold, SCAT), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sv = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < SCAT; i++) {
    const a = Math.random() * Math.PI * 2, r = 0.55 + Math.random() * 1.1;
    m4.compose(new THREE.Vector3(Math.cos(a) * r, 0.09 + Math.random() * 0.03, -1.7 + Math.sin(a) * r * 0.8), q.setFromEuler(e.set((Math.random() - 0.5) * 0.4, Math.random() * 6, (Math.random() - 0.5) * 0.4)), sv);
    scat.setMatrixAt(i, m4);
  }
  scat.receiveShadow = true; group.add(scat);
  const gemCols = ['#ff4fd8', '#33e6ff', '#7bff8a', '#a27bff'];
  gemCols.forEach((c, i) => { const g = new THREE.Mesh(new THREE.OctahedronGeometry(0.13), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.8, roughness: 0.2 })); g.position.set(-0.9 + i * 0.6, 0.18, -0.85 - (i % 2) * 0.25); g.rotation.set(i, i * 2, 0); group.add(g); });

  // pièces qui jaillissent à l'ouverture
  const BURST = 46, burst = new THREE.InstancedMesh(coinGeo, gold, BURST), coins = [];
  for (let i = 0; i < BURST; i++) { coins.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), w: new THREE.Vector3(), q: new THREE.Quaternion(), t: -1 }); burst.setMatrixAt(i, m4.makeScale(0, 0, 0)); }
  burst.frustumCulled = false; group.add(burst);
  // étincelles dorées au-dessus du coffre ouvert
  const SPK = 40, spkPos = new Float32Array(SPK * 3), spk = [];
  for (let i = 0; i < SPK; i++) spk.push({ p: new THREE.Vector3(0, -9, 0), v: new THREE.Vector3(), life: 0 });
  const spkGeo = new THREE.BufferGeometry(); spkGeo.setAttribute('position', new THREE.BufferAttribute(spkPos, 3));
  const sparks = new THREE.Points(spkGeo, new THREE.PointsMaterial({ color: '#ffe48a', size: 0.09, transparent: true, depthWrite: false, toneMapped: false }));
  sparks.frustumCulled = false; group.add(sparks);

  let open = 0, want = 0, sparkle = 0;
  const chestWorld = new THREE.Vector3();
  /** L'objet à ouvrir, pour l'invite « E » de l'application. */
  const item = {
    get prompt() { return want ? 'Refermer le coffre' : 'Ouvrir le coffre au trésor'; },
    go() {
      want = want ? 0 : 1;
      if (want) {
        coins.forEach((c, i) => {
          c.p.set((Math.random() - 0.5) * 0.5, 0.5, -1.7 + (Math.random() - 0.5) * 0.3);
          const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 1.8;
          c.v.set(Math.cos(a) * s, 3.2 + Math.random() * 2.6, Math.sin(a) * s * 0.7 + 0.5); c.w.set(Math.random() * 12, Math.random() * 12, Math.random() * 12);
          c.t = i * 0.012;
        });
        sparkle = 3.5;
        item.onOpen?.();
      }
    },
    onOpen: null,
  };

  /* ---------- murs : la voiture n'entre que par l'ouverture (sous la cascade) ---------- */
  const R_IN = 2.75, R_OUT = RING + 1.45, DOOR = 1.05;   // demi-largeur du passage
  const loc = new THREE.Vector3(), push = new THREE.Vector3(), nrm = new THREE.Vector3(), invQ = new THREE.Quaternion();
  /**
   * La voiture (position monde) heurte-t-elle la roche ? Renvoie { push, n } : déplacement à appliquer (monde, tangent) et normale ; sinon null.
   */
  function collide(car, rad = 0.45) {
    loc.copy(car); group.worldToLocal(loc);
    if (loc.y > 3 || loc.y < -2) return null;
    const x = loc.x, z = loc.z, r = Math.hypot(x, z), rIn = R_IN - rad, rOut = R_OUT + rad;
    if (r <= rIn || r >= rOut) return null;
    if (z > 0 && Math.abs(x) < DOOR - rad) return null;   // dans le passage
    // trois façons d'en sortir : vers l'intérieur, vers l'extérieur, sur le côté dans le passage ; la plus courte gagne
    const cand = [];
    cand.push([x / r * (rIn - r), z / r * (rIn - r)]);
    cand.push([x / r * (rOut - r), z / r * (rOut - r)]);
    if (z > 0) cand.push([Math.sign(x) * (DOOR - rad) - x, 0]);
    let b = cand[0]; for (const c of cand) if (c[0] * c[0] + c[1] * c[1] < b[0] * b[0] + b[1] * b[1]) b = c;
    const L = Math.hypot(b[0], b[1]); if (L < 1e-6) return null;
    invQ.copy(group.quaternion);
    push.set(b[0], 0, b[1]).applyQuaternion(invQ);
    nrm.copy(push).normalize();
    return { push, n: nrm };
  }

  /* ---------- animation ---------- */
  const up = new THREE.Vector3(), tmp = new THREE.Vector3();
  const camL = new THREE.Vector3(), carL = new THREE.Vector3();
  function update(dt, t, cam = null, car = null) {
    fallM.uniforms.uTime.value = t;
    // le rideau s'efface quand la caméra le traverse ou que la voiture est dans la grotte (on voit le coffre)
    let fade = 1;
    if (cam) {
      group.worldToLocal(camL.copy(cam));
      const zs = RING + 0.85, inX = THREE.MathUtils.smoothstep(Math.abs(camL.x), 3.2, 2.2);
      fade = Math.min(fade, 1 - 0.85 * inX * THREE.MathUtils.smoothstep(Math.abs(camL.z - zs), 2.6, 0.8));
      if (car) { group.worldToLocal(carL.copy(car)); if (Math.hypot(carL.x, carL.z) < R_IN + 0.3 && camL.z > zs - 0.5) fade = Math.min(fade, 0.18); }
    }
    fallM.uniforms.uFade.value += (fade - fallM.uniforms.uFade.value) * Math.min(1, dt * 8);
    boil.scale.set(1.8 + 0.1 * Math.sin(t * 7), 1, 0.55 + 0.05 * Math.sin(t * 5.3));
    foamM.opacity = 0.6 + 0.15 * Math.sin(t * 2.3);
    for (let i = 0; i < MIST; i++) {
      const m = mist[i]; m.life -= dt; if (m.life <= 0) respawn(m);
      m.v.y -= 4 * dt; m.p.addScaledVector(m.v, dt); if (m.p.y < 0.12) { m.p.y = 0.12; m.v.y *= -0.3; }
      mistPos[i * 3] = m.p.x; mistPos[i * 3 + 1] = m.p.y; mistPos[i * 3 + 2] = m.p.z;
    }
    mistGeo.attributes.position.needsUpdate = true;
    // couvercle
    open += (want - open) * (1 - Math.exp(-dt * (want ? 5 : 7)));
    lid.rotation.x = -open * 1.9;
    glow.material.color.setScalar(1).multiply(tmp.set(1, 0.84, 0.42)).multiplyScalar(0.5 + 2.2 * open);
    // pièces qui volent puis retombent sur le sol de la grotte
    let dirty = false;
    coins.forEach((c, i) => {
      if (c.t < 0) return; dirty = true;
      if (c.t > 0) { c.t -= dt; if (c.t > 0) { burst.setMatrixAt(i, m4.makeScale(0, 0, 0)); return; } c.t = 1e-4; }
      c.v.y -= 9.5 * dt; c.p.addScaledVector(c.v, dt);
      if (c.p.y < 0.09) { c.p.y = 0.09; c.v.y *= -0.35; c.v.x *= 0.6; c.v.z *= 0.6; c.w.multiplyScalar(0.6); }
      const sp = c.w.length(); if (sp > 1e-3) c.q.premultiply(q.setFromAxisAngle(tmp.copy(c.w).divideScalar(sp), sp * dt));
      burst.setMatrixAt(i, m4.compose(c.p, c.q, sv));
    });
    if (dirty) burst.instanceMatrix.needsUpdate = true;
    // étincelles tant que le coffre est ouvert
    sparkle = Math.max(0, sparkle - dt);
    for (let i = 0; i < SPK; i++) {
      const s = spk[i]; s.life -= dt;
      if (s.life <= 0 && (open > 0.6 || sparkle > 0) && Math.random() < 0.5) { s.p.set((Math.random() - 0.5) * 0.8, 0.55, -1.7 + (Math.random() - 0.5) * 0.4); s.v.set((Math.random() - 0.5) * 0.4, 0.6 + Math.random() * 1.2, (Math.random() - 0.5) * 0.4); s.life = 0.6 + Math.random() * 0.8; }
      if (s.life > 0) s.p.addScaledVector(s.v, dt); else s.p.set(0, -9, 0);
      spkPos[i * 3] = s.p.x; spkPos[i * 3 + 1] = s.p.y; spkPos[i * 3 + 2] = s.p.z;
    }
    spkGeo.attributes.position.needsUpdate = true;
    chest.getWorldPosition(chestWorld);
  }
  group.updateMatrixWorld(true); chest.getWorldPosition(chestWorld);

  return {
    group, dir, fwd, item, collide, update,
    /** position du coffre (monde) */
    get chest() { return chestWorld; },
    /** pied de la cascade (monde), pour le son de l'eau */
    fallPos: group.localToWorld(new THREE.Vector3(0, 0.5, RING + 1)),
    /** rayon d'exclusion (unités) : le décor (herbe, fleurs, buissons, rochers) est retiré dessous */
    clearR: 7.5, clearCenter: group.localToWorld(new THREE.Vector3(0, 0, 1)).normalize(),
    /** les maillages de pierre et de bois (pour le rendu « illustration ») */
    solids: [rockMesh, floor, chest, scat, pool, topPool],
  };
}
