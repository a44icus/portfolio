/* ============================================================================
   La cascade : un gros rocher creux, une chute d'eau tombe devant son entrée
   dans un bouillon d'écume. On la traverse en voiture : derrière l'eau, une grotte,
   et au fond un coffre au trésor qui s'ouvre (E) dans une gerbe de pièces.

   Emplacement : PLACES dans placement.js (outil ?placer) ;
   s'il est vide, on cherche un coin dégagé, plat et sec, à l'écart des zones.
   ============================================================================ */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeKit } from './eggkit.js';
import { getPlace } from './placement.js';
import { fadeNearCamera } from './world.js';

/** Position définitive : { dir: [x, y, z], cap: degrés } — null : placement automatique. */

const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, ...o });

/** Pierre nacrée : un gris perle dont les facettes se teintent d'irisations (comme une couche fine de nacre) selon l'angle de vue. */
function nacre(m, glow = 0.18) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      {
        vec3 vv = normalize(vViewPosition);
        float ndv = clamp(dot(normal, vv), 0.0, 1.0), fr = pow(1.0 - ndv, 1.4);
        // la teinte tourne avec l'angle de vue et l'orientation de chaque facette : rose, vert d'eau, lilas, or pâle
        vec3 film = 0.5 + 0.5 * cos(6.2832 * (vec3(0.0, 0.33, 0.67) + ndv * 1.7 + dot(normal, vec3(0.41, 0.63, 0.22)) * 0.9));
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * (0.6 + 0.85 * film), 0.45 + 0.4 * fr);
        totalEmissiveRadiance += film * (0.35 + fr) * ${glow.toFixed(3)};   // un léger reflet propre, même à l'ombre de la grotte
      }`);
  };
  const key = m.customProgramCacheKey.bind(m); m.customProgramCacheKey = () => key() + '|nacre' + glow;
  return m;
}

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

/* ---------- le rideau d'eau : l'eau du lac (mêmes couleurs, liées aux réglages de l'eau) et une écume dessinée
   comme le sillage de l'aéroglisseur : des traits blancs fins et nets, effilés aux bouts, qui se morcellent ---------- */
const NOISE2 = /* glsl */ `
  float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
  // un trait d'écume : distance d au milieu du trait (en unités), « seg » le découpe en morceaux effilés, bord net d'un pixel
  float stroke(float d, float w, float seg, float th) {
    float on = smoothstep(th, th + 0.14, seg), ww = w * on, fw = fwidth(d) * 0.8;
    return on * (1.0 - smoothstep(ww, ww + fw, d));
  }`;
// W : les uniformes de l'eau de la planète (couleurs du lac, soleil, ciel) ; on les partage tels quels
function fallMaterial(W) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uFade: { value: 1 }, uSize: { value: new THREE.Vector2(3.4, 4.3) },
      uShallow: W.uShallow, uTeal: W.uTeal, uDeep: W.uDeep, uSun: W.uSun, uSunColor: W.uSunColor, uSky: W.uSky },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vUv; varying vec3 vW; varying vec3 vN; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: NOISE2 + /* glsl */ `
      uniform float uTime; uniform float uFade; uniform vec2 uSize;
      uniform vec3 uShallow; uniform vec3 uTeal; uniform vec3 uDeep; uniform vec3 uSun; uniform vec3 uSunColor; uniform vec3 uSky;
      varying vec2 vUv; varying vec3 vW; varying vec3 vN;
      void main(){
        vec2 q = vUv * uSize;                       // en unités : x en travers, y du pied (0) au rebord
        float y = vUv.y, x = q.x;
        // bords effilochés (nets, comme le reste)
        float side = min(vUv.x, 1.0 - vUv.x) * uSize.x;
        float ragN = n2(vec2(q.x * 3.0, q.y * 1.4 + uTime * 2.2));
        float sideA = 1.0 - smoothstep(0.0, fwidth(side) * 1.2, 0.12 + 0.35 * ragN - side);
        if (sideA < 0.02) discard;
        // l'eau du lac : turquoise sur les bords du rideau, sarcelle au milieu, un peu de bleu profond dans l'épaisseur
        float mid = 1.0 - abs(vUv.x - 0.5) * 2.0;
        vec3 col = mix(uShallow, uTeal, smoothstep(0.0, 0.6, mid));
        col = mix(col, uDeep, 0.28 * smoothstep(0.35, 1.0, mid) * smoothstep(0.15, 0.6, y));
        // grandes bandes plus sombres qui descendent
        float band = n2(vec2(x * 0.9, q.y * 0.35 + uTime * 1.1));
        col *= 0.88 + 0.16 * band;
        // lumière comme sur le lac : soleil, reflet du ciel en rasant
        vec3 Nn = normalize(vN), V = normalize(cameraPosition - vW);
        if (dot(Nn, V) < 0.0) Nn = -Nn;
        vec3 up = normalize(vW);
        float sunUp = clamp(dot(up, uSun) * 1.2 + 0.15, 0.0, 1.0);
        col *= 0.4 + 0.6 * sunUp;
        float fres = pow(1.0 - max(dot(Nn, V), 0.0), 3.0);
        col = mix(col, uSky * (0.4 + 0.6 * sunUp), fres * 0.35);
        col += uSunColor * pow(max(dot(reflect(-uSun, Nn), V), 0.0), 60.0) * 0.35 * sunUp;
        // écume en traits fins qui tombent : plusieurs couloirs, chacun ondule et se découpe en morceaux
        float foam = 0.0;
        for (int i = 0; i < 4; i++) {
          float fi = float(i), dens = 2.6 + fi * 1.3;
          float u = x * dens + fi * 0.37 + (n2(vec2(q.y * 0.8 + fi * 3.1, fi)) - 0.5) * 0.5;
          float lane = floor(u), d = abs(fract(u) - 0.5) / dens;
          float seg = n2(vec2(lane * 7.13 + fi * 19.0, q.y * (1.1 + fi * 0.2) + uTime * (2.4 + fi * 0.35)));
          float w = 0.012 + 0.01 * (1.0 - fi * 0.2);
          foam = max(foam, stroke(d, w, seg, 0.56 + 0.05 * fi));
        }
        // le rebord : un liseré déchiqueté là où l'eau bascule
        float lipD = abs(q.y - (uSize.y - 0.32 - 0.12 * n2(vec2(x * 2.5, uTime * 0.6))));
        foam = max(foam, stroke(lipD, 0.035, n2(vec2(x * 1.7, uTime * 0.3)), 0.3));
        col = mix(col, vec3(1.0, 0.98, 0.95), clamp(foam, 0.0, 1.0));
        float alpha = (0.86 + 0.1 * fres + 0.14 * foam) * sideA * uFade;
        gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

/* ---------- le bouillon au pied : des anneaux d'écume qui s'éloignent, en traits fins et morcelés (comme l'écume du lac) ---------- */
function boilMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uFade: { value: 1 } },
    transparent: true, depthWrite: false,
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: NOISE2 + /* glsl */ `
      uniform float uTime; uniform float uFade; varying vec2 vP;
      void main(){
        float r = length(vP), a = atan(vP.y, vP.x);
        float foam = 0.0;
        for (int i = 0; i < 3; i++) {
          float fi = float(i);
          float ph = fract(r * 1.6 - uTime * 0.45 + fi * 0.33 + n2(vec2(a * 2.0, fi)) * 0.15);
          float seg = n2(vec2(a * (3.0 + fi) + fi * 5.0, r * 2.0 - uTime * 0.3));
          foam = max(foam, stroke(abs(ph - 0.5) / 1.6, 0.025 * (1.0 - r * 0.6), seg, 0.3 + 0.45 * r));
        }
        foam = max(foam, (1.0 - smoothstep(0.18, 0.18 + fwidth(r), r)) * 0.9);   // le cœur, tout blanc
        foam *= 1.0 - smoothstep(0.75, 1.0, r);
        if (foam < 0.02) discard;
        gl_FragColor = vec4(vec3(1.0, 0.98, 0.95), foam * uFade);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

export function makeCascade({ planet, sections, R, avoid = [] }) {
  const K = makeKit({ planet, sections, R, seed: 52711 });
  const tangent = K.tangent;
  /* ---------- emplacement ---------- */
  let dir, fwd;
  const man = getPlace('cascade');
  if (man) { dir = man.dir; fwd = man.fwd; }
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
  const rockMat = fadeNearCamera(nacre(std('#b7b4c0', { roughness: 0.42, metalness: 0.12, flatShading: true })));
  const rockMesh = new THREE.Mesh(mergeGeometries(rocks), rockMat); rockMesh.castShadow = rockMesh.receiveShadow = true;
  group.add(rockMesh);
  // sol de la grotte : la même pierre nacrée, plus sombre
  const floor = new THREE.Mesh(new THREE.CircleGeometry(3.4, 40).rotateX(-Math.PI / 2).translate(0, 0.07, 0), nacre(std('#7e7b88', { roughness: 0.55, metalness: 0.08 }), 0.1));
  floor.receiveShadow = true; group.add(floor);

  /* ---------- la cascade, son bouillon, la brume ---------- */
  const fallM = fallMaterial(planet.waterUniforms);
  const fg = new THREE.PlaneGeometry(3.4, 4.3, 10, 28), fp = fg.attributes.position;
  for (let i = 0; i < fp.count; i++) {
    const y = fp.getY(i) + 2.15, x = fp.getX(i);
    const lip = THREE.MathUtils.smoothstep(y, 3.5, 4.3);   // en haut, l'eau déborde du rebord en s'arrondissant
    fp.setXYZ(i, x * (1 - 0.06 * (1 - y / 4.3)), y, RING + 0.85 + 0.25 * Math.sin(x * 1.7) * 0.2 - 0.9 * lip * lip);
  }
  const fall = new THREE.Mesh(fg, fallM); fall.renderOrder = 2; group.add(fall);
  const fall2 = new THREE.Mesh(fg, fallM); fall2.position.z = 0.12; fall2.scale.set(0.86, 1, 1); fall2.renderOrder = 2; group.add(fall2);   // un second voile, décalé : de l'épaisseur
  // (plus de bassin rond au pied : l'eau tombe directement dans son bouillon)
  const boilM = boilMaterial();
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
  // le trésor (coffre, pièces, gemmes, gerbe, étincelles) : un groupe à part, que l'outil ?placer peut déplacer (clé « coffre »)
  const treasure = new THREE.Group(); treasure.name = 'coffre'; treasure.position.set(0, 0.07, -1.7); group.add(treasure);
  const chest = new THREE.Group(); treasure.add(chest);
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
    m4.compose(new THREE.Vector3(Math.cos(a) * r, 0.02 + Math.random() * 0.03, Math.sin(a) * r * 0.8), q.setFromEuler(e.set((Math.random() - 0.5) * 0.4, Math.random() * 6, (Math.random() - 0.5) * 0.4)), sv);
    scat.setMatrixAt(i, m4);
  }
  scat.receiveShadow = true; treasure.add(scat);
  const gemCols = ['#ff4fd8', '#33e6ff', '#7bff8a', '#a27bff'];
  gemCols.forEach((c, i) => { const g = new THREE.Mesh(new THREE.OctahedronGeometry(0.13), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.8, roughness: 0.2 })); g.position.set(-0.9 + i * 0.6, 0.11, 0.85 - (i % 2) * 0.25); g.rotation.set(i, i * 2, 0); treasure.add(g); });

  // pièces qui jaillissent à l'ouverture
  const BURST = 46, burst = new THREE.InstancedMesh(coinGeo, gold, BURST), coins = [];
  for (let i = 0; i < BURST; i++) { coins.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), w: new THREE.Vector3(), q: new THREE.Quaternion(), t: -1 }); burst.setMatrixAt(i, m4.makeScale(0, 0, 0)); }
  burst.frustumCulled = false; treasure.add(burst);
  // étincelles dorées au-dessus du coffre ouvert
  const SPK = 40, spkPos = new Float32Array(SPK * 3), spk = [];
  for (let i = 0; i < SPK; i++) spk.push({ p: new THREE.Vector3(0, -9, 0), v: new THREE.Vector3(), life: 0 });
  const spkGeo = new THREE.BufferGeometry(); spkGeo.setAttribute('position', new THREE.BufferAttribute(spkPos, 3));
  const sparks = new THREE.Points(spkGeo, new THREE.PointsMaterial({ color: '#ffe48a', size: 0.09, transparent: true, depthWrite: false, toneMapped: false }));
  sparks.frustumCulled = false; treasure.add(sparks);

  let open = 0, want = 0, sparkle = 0;
  const chestWorld = new THREE.Vector3();
  /** L'objet à ouvrir, pour l'invite « E » de l'application. */
  const item = {
    get prompt() { return want ? 'Refermer le coffre' : 'Ouvrir le coffre au trésor'; },
    go() {
      want = want ? 0 : 1;
      if (want) {
        coins.forEach((c, i) => {
          c.p.set((Math.random() - 0.5) * 0.5, 0.43, (Math.random() - 0.5) * 0.3);
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

  /** 0 dehors → 1 dans la grotte (position monde), en douceur autour de l'entrée : la caméra s'y rapproche de la voiture. */
  const inL = new THREE.Vector3();
  function inside(p) {
    inL.copy(p); group.worldToLocal(inL);
    if (inL.y > 4.5 || inL.y < -3) return 0;
    return 1 - THREE.MathUtils.smoothstep(Math.hypot(inL.x, inL.z), R_IN - 0.4, R_OUT - 0.2);
  }

  /* ---------- animation ---------- */
  const up = new THREE.Vector3(), tmp = new THREE.Vector3();
  const camL = new THREE.Vector3(), carL = new THREE.Vector3();
  function update(dt, t, cam = null, car = null) {
    fallM.uniforms.uTime.value = t; boilM.uniforms.uTime.value = t;
    // le rideau s'efface quand la caméra le traverse ou que la voiture est dans la grotte (on voit le coffre)
    let fade = 1;
    if (cam) {
      group.worldToLocal(camL.copy(cam));
      const zs = RING + 0.85, inX = THREE.MathUtils.smoothstep(Math.abs(camL.x), 3.2, 2.2);
      fade = Math.min(fade, 1 - 0.85 * inX * THREE.MathUtils.smoothstep(Math.abs(camL.z - zs), 2.6, 0.8));
      if (car) { group.worldToLocal(carL.copy(car)); if (Math.hypot(carL.x, carL.z) < R_IN + 0.3 && camL.z > zs - 0.5) fade = Math.min(fade, 0.18); }
    }
    fallM.uniforms.uFade.value += (fade - fallM.uniforms.uFade.value) * Math.min(1, dt * 8); boilM.uniforms.uFade.value = fallM.uniforms.uFade.value;
    boil.scale.set(1.8 + 0.1 * Math.sin(t * 7), 1, 0.55 + 0.05 * Math.sin(t * 5.3));
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
      if (c.p.y < 0.02) { c.p.y = 0.02; c.v.y *= -0.35; c.v.x *= 0.6; c.v.z *= 0.6; c.w.multiplyScalar(0.6); }
      const sp = c.w.length(); if (sp > 1e-3) c.q.premultiply(q.setFromAxisAngle(tmp.copy(c.w).divideScalar(sp), sp * dt));
      burst.setMatrixAt(i, m4.compose(c.p, c.q, sv));
    });
    if (dirty) burst.instanceMatrix.needsUpdate = true;
    // étincelles tant que le coffre est ouvert
    sparkle = Math.max(0, sparkle - dt);
    for (let i = 0; i < SPK; i++) {
      const s = spk[i]; s.life -= dt;
      if (s.life <= 0 && (open > 0.6 || sparkle > 0) && Math.random() < 0.5) { s.p.set((Math.random() - 0.5) * 0.8, 0.48, (Math.random() - 0.5) * 0.4); s.v.set((Math.random() - 0.5) * 0.4, 0.6 + Math.random() * 1.2, (Math.random() - 0.5) * 0.4); s.life = 0.6 + Math.random() * 0.8; }
      if (s.life > 0) s.p.addScaledVector(s.v, dt); else s.p.set(0, -9, 0);
      spkPos[i * 3] = s.p.x; spkPos[i * 3 + 1] = s.p.y; spkPos[i * 3 + 2] = s.p.z;
    }
    spkGeo.attributes.position.needsUpdate = true;
    chest.getWorldPosition(chestWorld);
  }
  group.updateMatrixWorld(true); chest.getWorldPosition(chestWorld);

  return {
    group, dir, fwd, item, collide, update, inside,
    /** le trésor (coffre et pièces) : l'application le détache de la grotte pour pouvoir le placer à la main */
    treasure,
    /** position du coffre (monde) */
    get chest() { return chestWorld; },
    /** pied de la cascade (monde), pour le son de l'eau */
    fallPos: group.localToWorld(new THREE.Vector3(0, 0.5, RING + 1)),
    /** rayon d'exclusion (unités) : le décor (herbe, fleurs, buissons, rochers) est retiré dessous */
    clearR: 7.5, clearCenter: group.localToWorld(new THREE.Vector3(0, 0, 1)).normalize(),
    /** les maillages de pierre et de bois (pour le rendu « illustration ») */
    solids: [rockMesh, floor, chest, scat],
  };
}
