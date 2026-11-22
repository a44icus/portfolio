/* ============================================================================
   La Terre de Social World, en miniature : même générateur de relief que le jeu
   (type « océan », graine de la planète 2600.2.0.1000/2), donc mêmes continents,
   collines, chaînes de montagnes, falaises en terrasses, plages et fonds marins.
   Mêmes couleurs de sol, même eau (turquoise sur les hauts-fonds, bleu profond
   au large, écume le long des côtes, reflets du soleil), herbe, fleurs et arbres.
   Les calculs se font en « blocs » comme dans le jeu (rayon 120), puis tout est
   réduit à l'échelle de la scène (rayon de la mer = SEA_R).
   Un pavillon par section, posé sur une esplanade aplanie en pleine terre.
   ============================================================================ */
import * as THREE from 'three';

export const SEA_R = 32;      // rayon de la mer dans la scène
export const PAV_R = 2.6;     // rayon de l'esplanade d'une zone (scène)
const R = 240;                // rayon de la mer en blocs (deux fois la Terre de Social World : mêmes blocs, quatre fois plus de terrain)
const S = SEA_R / R;          // blocs -> unités de la scène
const MAX_H = 34;             // relief maximal (blocs)

/* ---------- style « océan » de Social World (la Terre) ---------- */
const STYLE = {
  sea: 0.55, relief: 0.8, mountains: 0.45, cliffs: 0.35,
  // palette chaude de fin d'après-midi : herbe olive et jaune, terre orange, roche lavande, eau sarcelle
  ground: { low: '#7c8424', high: '#b3a534', dry: '#e3893c', rock: '#a58fd6', shore: '#f4a25a', snow: '#ffe2cf' },
  grassBase: '#5a5418', grassTip: '#d8c23c',
  flowers: ['#ff6aa8', '#ffffff', '#b98cff'],
  leaves: ['#c9b52e', '#b0a52a', '#d6c43a', '#9a9a26', '#ec7a2e', '#e0502e', '#ee6aa4', '#c8bd3c'],
  rockColor: '#b4a2ee', liquidColor: '#139a9c', skyZenith: '#ee9b7b', skyHorizon: '#ffe0b8',
};
const SEA_LEVEL = -0.42 + STYLE.sea * 0.75;

/* ---------- hachage et bruit, identiques au jeu ---------- */
function hashInts(...values) {
  let h = 0x811c9dc5;
  for (const v of values) {
    h ^= v | 0; h = Math.imul(h, 0x01000193); h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  }
  return h >>> 0;
}
function hashString(text) { let h = 0x811c9dc5; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); } return hashInts(h); }

const GRAD = [[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1],[1,1,0],[-1,1,0],[0,-1,1],[0,-1,-1]];
const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
class Noise3 {
  constructor(seed) {
    const p = new Uint8Array(256); for (let i = 0; i < 256; i++) p[i] = i;
    let s = seed >>> 0 || 1;
    for (let i = 255; i > 0; i--) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; const j = s % (i + 1); const t = p[i]; p[i] = p[j]; p[j] = t; }
    this.P = new Uint8Array(512); for (let i = 0; i < 512; i++) this.P[i] = p[i & 255];
  }
  g(h, x, y, z) { const g = GRAD[h & 15]; return g[0] * x + g[1] * y + g[2] * z; }
  noise(x, y, z) {
    const P = this.P, X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
    x -= X; y -= Y; z -= Z;
    const xi = X & 255, yi = Y & 255, zi = Z & 255, u = fade(x), v = fade(y), w = fade(z);
    const a = P[xi] + yi, aa = P[a] + zi, ab = P[a + 1] + zi, b = P[xi + 1] + yi, ba = P[b] + zi, bb = P[b + 1] + zi;
    return lerp(lerp(lerp(this.g(P[aa], x, y, z), this.g(P[ba], x - 1, y, z), u), lerp(this.g(P[ab], x, y - 1, z), this.g(P[bb], x - 1, y - 1, z), u), v),
                lerp(lerp(this.g(P[aa + 1], x, y, z - 1), this.g(P[ba + 1], x - 1, y, z - 1), u), lerp(this.g(P[ab + 1], x, y - 1, z - 1), this.g(P[bb + 1], x - 1, y - 1, z - 1), u), v), w);
  }
  fbm(x, y, z, oct) { let s = 0, a = 1, n = 0; for (let o = 0; o < oct; o++) { s += this.noise(x, y, z) * a; n += a; a *= 0.5; x *= 2.03; y *= 2.03; z *= 2.03; } return s / n; }
}

const GALAXY_SEED = 0x50c1a1;
const noise = new Noise3(hashInts(GALAXY_SEED, hashString('2600.2.0.1000/2'), 0x7e44));

/** Rayon du sol (blocs) dans une direction unitaire : le relief du jeu, à l'identique. */
function rawHeight(x, y, z) {
  const n = noise, s = STYLE;
  const wx = x + 0.2 * n.noise(x * 1.7 + 11.3, y * 1.7, z * 1.7);
  const wy = y + 0.2 * n.noise(x * 1.7, y * 1.7 + 27.1, z * 1.7);
  const wz = z + 0.2 * n.noise(x * 1.7, y * 1.7, z * 1.7 + 41.9);
  const land = n.fbm(wx * 1.2, wy * 1.2, wz * 1.2, 4) - SEA_LEVEL;
  if (land < 0) return R + 0.5 + Math.max(-9.5, land * 30 - land * land * 40);   // plage douce puis fond marin
  const shore = smoothstep(0, 0.07, land);
  const rolling = n.fbm(x * 3.3 + 5.1, y * 3.3, z * 3.3, 3) * 0.5 + 0.5;
  const detail = n.fbm(x * 10 + 2, y * 10, z * 10, 2);
  let h = land * 15 * s.relief + rolling * 7 * s.relief * shore + detail * 0.9 * shore;
  const ridge = 1 - Math.abs(n.noise(x * 2.1 + 3.7, y * 2.1, z * 2.1));            // chaînes de montagnes, loin des côtes
  h += ridge * ridge * ridge * s.mountains * 20 * smoothstep(0.08, 0.32, land);
  const mask = smoothstep(0.05, 0.3, n.noise(x * 1.9 - 7.7, y * 1.9, z * 1.9)) * s.cliffs * shore;   // falaises en terrasses
  if (mask > 0) { const t = h / 5.5, f = t - Math.floor(t); h += ((Math.floor(t) + smoothstep(0.3, 0.7, f)) * 5.5 - h) * mask; }
  return R + 0.5 + Math.min(MAX_H, h);
}

/* ---------- palette du sol ---------- */
const COL = Object.fromEntries(Object.entries(STYLE.ground).map(([k, v]) => [k, new THREE.Color(v)]));
const tmpC = new THREE.Color(), tmpC2 = new THREE.Color();
const EARTH = new THREE.Color('#e8913f');
/** Couverture d'herbe : des plaques franches, de la terre nue entre elles. */
const grassPatch = d => noise.fbm(d.x * 14 + 4, d.y * 14, d.z * 14, 3);
const PATH_COL = new THREE.Color('#f39a4c'), PATH_EDGE = new THREE.Color('#d4703a'), RUT = new THREE.Color('#c25f30');
function colorAt(d, h, steep, out, path = 0, rut = 0) {
  const above = h - R;
  const tone = noise.fbm(d.x * 6 + 9, d.y * 6, d.z * 6, 3) * 0.5 + 0.5;
  const dry = smoothstep(0.55, 0.8, noise.noise(d.x * 3 - 4, d.y * 3, d.z * 3) * 0.5 + 0.5);
  out.copy(COL.low).lerp(COL.high, Math.min(1, Math.max(0, above / 22 + (tone - 0.5) * 0.6)));
  out.lerp(COL.dry, dry * 0.6);
  out.lerp(EARTH, (1 - smoothstep(-0.04, 0.06, grassPatch(d))) * 0.82 * smoothstep(1.6, 2.6, above) * (1 - smoothstep(0.85, 1.1, steep)));   // terre nue hors des plaques d'herbe
  out.lerp(COL.shore, 1 - smoothstep(0.8, 2.2, above));                                     // plages
  if (above < 0) out.lerp(tmpC2.copy(COL.shore).multiplyScalar(0.7), Math.min(1, -above / 6)); // fond marin
  out.lerp(COL.rock, smoothstep(0.95, 1.25, steep));                                        // roche des falaises
  out.lerp(COL.snow, smoothstep(0.72, 0.9, (above + tone * 4) / MAX_H) * (1 - smoothstep(0.8, 1.2, steep))); // neige des sommets
  if (path > 0 && above > 0.4) out.lerp(tmpC2.copy(PATH_EDGE).lerp(PATH_COL, smoothstep(0.35, 0.8, path)).multiplyScalar(0.92 + tone * 0.16), smoothstep(0, 0.35, path)); // routes de terre
  if (rut > 0 && above > 0.4) out.lerp(RUT, rut * 0.55);                                  // ornières
  return out;
}

/* ---------- sphère cubique ---------- */
const FACES = [
  [[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
  [[0, 1, 0], [1, 0, 0], [0, 0, -1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
  [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
];
function faceDir(f, s, t, out) {
  const [n, a, b] = FACES[f], u = Math.tan(s * Math.PI / 4), v = Math.tan(t * Math.PI / 4);
  return out.set(n[0] + u * a[0] + v * b[0], n[1] + u * a[1] + v * b[1], n[2] + u * a[2] + v * b[2]).normalize();
}

/* ---------- eau du jeu : profondeur, hauts-fonds, écume, reflets ---------- */
const WAVES_GLSL = `
  float swWaves(vec3 p, float t) {
    float h = 0.0;
    h += sin(dot(p, vec3(0.83, 0.21, 0.52)) * 1.7 + t * 1.3) * 0.5;
    h += sin(dot(p, vec3(-0.35, 0.71, 0.60)) * 2.9 + t * 1.9) * 0.3;
    h += sin(dot(p, vec3(0.50, -0.60, 0.62)) * 5.3 + t * 2.7) * 0.15;
    h += sin(dot(p, vec3(-0.70, -0.20, 0.68)) * 9.1 + t * 3.4) * 0.08;
    h += sin(dot(p, vec3(0.20, 0.90, -0.40)) * 15.7 + t * 4.6) * 0.04;
    return h;
  }
  float swCaustic(vec3 p, float t) {
    vec3 q = p * 1.15;
    float v = sin(q.x + t) + sin(q.y * 1.3 - t * 1.1) + sin(q.z * 1.1 + t * 0.7) + sin((q.x + q.y + q.z) * 0.7 + t * 1.3);
    float a = pow(1.0 - abs(sin(v * 1.6)), 6.0);
    vec3 r = p * 2.3 + vec3(t * 0.3);
    float w = sin(r.x - t * 0.8) + sin(r.y * 1.2 + t * 0.9) + sin(r.z * 0.9 - t * 0.6);
    float b = pow(1.0 - abs(sin(w * 1.9)), 8.0);
    return a * 0.7 + b * 0.5;
  }`;
function waterMaterial(uniforms) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms,
    vertexShader: `
      attribute float aDepth; varying float vDepth; varying vec3 vWorld;
      void main() { vDepth = aDepth; vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `
      uniform float uTime; uniform vec3 uSun; uniform vec3 uSunColor; uniform vec3 uSky; uniform vec3 uShallow; uniform vec3 uDeep; uniform float uScale;
      varying float vDepth; varying vec3 vWorld;
      ${WAVES_GLSL}
      void main() {
        vec3 p = vWorld / uScale;
        vec3 N = normalize(vWorld);
        vec3 T = normalize(cross(N, abs(N.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
        vec3 B = cross(N, T);
        float e = 0.08;
        float h0 = swWaves(p, uTime), hT = swWaves(p + T * e, uTime), hB = swWaves(p + B * e, uTime);
        float calm = smoothstep(0.0, 2.5, vDepth);
        vec3 n = normalize(N - (T * (hT - h0) + B * (hB - h0)) / e * 0.09 * (0.35 + 0.65 * calm));
        vec3 V = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - max(dot(n, V), 0.0), 4.0);
        float d = max(vDepth, 0.0);
        vec3 col = mix(uShallow, uDeep, smoothstep(0.3, 9.0, d));
        float shallowK = 1.0 - smoothstep(0.0, 4.5, d);
        col += vec3(0.85, 1.0, 1.0) * swCaustic(p, uTime) * 0.1 * shallowK;
        float sunUp = clamp(dot(N, uSun) * 1.2 + 0.15, 0.0, 1.0);
        col *= 0.35 + 0.65 * sunUp;
        col = mix(col, uSky * (0.4 + 0.6 * sunUp), fres * 0.35);
        vec3 Rf = reflect(-uSun, n);
        float sp = max(dot(Rf, V), 0.0);
        col += uSunColor * (pow(sp, 160.0) * 1.6 + pow(sp, 1400.0) * 6.0) * sunUp;
        float foamBand = 1.0 - smoothstep(0.0, 0.32, d);
        float foam = foamBand * (0.55 + 0.45 * sin(uTime * 1.6 + h0 * 6.0 + dot(p, vec3(0.7, 0.4, 0.6)) * 3.0));
        col = mix(col, vec3(1.0), clamp(foam, 0.0, 1.0) * 0.6);
        float alpha = mix(0.5, 0.94, smoothstep(0.2, 5.0, d));
        alpha = clamp(alpha + fres * 0.2 + foam * 0.4, 0.0, 1.0);
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

/* ---------- emplacements des pavillons : en pleine terre, bien répartis ---------- */
const Y = new THREE.Vector3(0, 1, 0), quat = new THREE.Quaternion();
const orient = dir => quat.setFromUnitVectors(Y, dir);
function tangents(d) {
  const t1 = new THREE.Vector3(1, 0, 0); if (Math.abs(d.x) > 0.9) t1.set(0, 1, 0);
  t1.addScaledVector(d, -t1.dot(d)).normalize();
  return [t1, new THREE.Vector3().crossVectors(d, t1)];
}
function findSites(count) {
  const ring = (PAV_R + 1.4) / SEA_R, d = new THREE.Vector3(), q = new THREE.Vector3();
  const N = 5000, golden = Math.PI * (3 - Math.sqrt(5)), pts = [];
  for (let i = 0; i < N; i++) {
    const y = 1 - 2 * (i + 0.5) / N, r = Math.sqrt(1 - y * y), p = i * golden;
    d.set(Math.cos(p) * r, y * 0.9, Math.sin(p) * r).normalize();    // pas trop près des pôles
    const h = rawHeight(d.x, d.y, d.z);
    if (h - R < 2) continue;
    const [t1, t2] = tangents(d);
    let lo = Infinity, hi = -Infinity, dry = Infinity;
    for (let k = 0; k < 10; k++) {
      const a = k / 10 * Math.PI * 2;
      for (const rr of [ring * 0.5, ring]) {
        q.copy(d).addScaledVector(t1, Math.cos(a) * rr).addScaledVector(t2, Math.sin(a) * rr).normalize();
        const hq = rawHeight(q.x, q.y, q.z); lo = Math.min(lo, hq); hi = Math.max(hi, hq); dry = Math.min(dry, hq - R);
      }
    }
    if (dry > 1.2) pts.push({ dir: d.clone(), h, rough: hi - lo, above: h - R });
  }
  // du plus exigeant au plus tolérant : esplanade plane, en hauteur raisonnable, et zones bien espacées
  const levels = [{ rough: 6, sep: 0.62 }, { rough: 9, sep: 0.52 }, { rough: 14, sep: 0.42 }, { rough: 99, sep: 0.3 }, { rough: 99, sep: 0 }];
  const sites = [];
  for (const L of levels) {
    const cands = pts.filter(c => c.rough < L.rough && c.above < 18 && !sites.includes(c)).sort((x, y) => x.rough - y.rough);
    while (sites.length < count) {
      let best = null, bd = -1;
      for (const c of cands) {
        if (sites.includes(c)) continue;
        const m = sites.length ? Math.min(...sites.map(s => Math.acos(Math.min(1, c.dir.dot(s.dir))))) : 9;
        if (m < L.sep) continue;
        const score = Math.min(m, 1.2) - c.rough * 0.02;
        if (score > bd) { bd = score; best = c; }
      }
      if (!best) break;
      sites.push(best);
    }
    if (sites.length >= count) break;
  }
  return sites;
}

/**
 * @param {{id:string,color:string,dir:THREE.Vector3}[]} anchors  une section par pavillon ;
 *        leur `dir` est remplacé par l'emplacement choisi sur la terre ferme.
 */
export function buildPlanet(anchors, quality = 'high') {
  const sites = findSites(anchors.length);
  const A0 = (PAV_R + 0.6) / SEA_R, A1 = A0 + 2.2 / SEA_R;      // esplanade plate, puis raccord en douceur
  sites.forEach(s => { s.flat = s.h + 0.6; });
  anchors.forEach((an, k) => { an.dir = sites[k].dir.clone(); });

  /** Esplanades : le sol s'aplanit autour de chaque zone. */
  function plaza(x, y, z, h) {
    for (const s of sites) {
      const c = x * s.dir.x + y * s.dir.y + z * s.dir.z;
      if (c < Math.cos(A1)) continue;
      const w = 1 - smoothstep(A0, A1, Math.acos(Math.min(1, c)));
      h = h * (1 - w) + s.flat * w;
    }
    return h;
  }
  const heightP = (x, y, z) => plaza(x, y, z, rawHeight(x, y, z));

  /* ---------- routes de terre entre les zones, ponts en bois au-dessus de l'eau ---------- */
  const ROAD_W = 0.8 / SEA_R, STEP = 0.25 / SEA_R, MAX_BRIDGE = 16 / SEA_R;
  /** Valeur d'un tableau échantillonné le long d'une route, à l'abscisse angulaire th. */
  function sample(arr, e, th) { const f = Math.max(0, Math.min(e.M, th / e.len * e.M)), i = Math.min(e.M - 1, Math.floor(f)), t = f - i; return arr[i] + (arr[i + 1] - arr[i]) * t; }
  function makeRoad(a, b) {
    const len = Math.acos(Math.min(1, a.dot(b)));
    const u = b.clone().addScaledVector(a, -a.dot(b)).normalize(), n = new THREE.Vector3().crossVectors(a, b).normalize();
    const M = Math.max(8, Math.ceil(len / STEP)), prof = new Float32Array(M + 1), wet = new Float32Array(M + 1), off = new Float32Array(M + 1), land = new Float32Array(M + 1);
    const phase = Math.abs(a.x * 13.1 + b.y * 7.7) % 6.28;
    const e = { a, b, u, n, len, M, prof, wet, off, land };
    const p = new THREE.Vector3();
    for (let i = 0; i <= M; i++) {
      const th = i / M * len;
      off[i] = Math.sin(th * SEA_R / 7 + phase) * 1.1 / SEA_R * Math.sin(Math.PI * i / M);   // la route serpente doucement
      p.copy(a).multiplyScalar(Math.cos(th)).addScaledVector(u, Math.sin(th)).addScaledVector(n, off[i]).normalize();
      const h = heightP(p.x, p.y, p.z);
      wet[i] = h < R + 0.4 ? 1 : 0;
      prof[i] = Math.max(h, R + 1);
    }
    // passages sur l'eau
    const runs = []; let water = 0, maxRun = 0, run = 0;
    for (let i = 0; i <= M; i++) {
      if (wet[i]) { if (!run) runs.push({ i0: i, i1: M }); run++; water++; }
      else if (run) { runs[runs.length - 1].i1 = i - 1; maxRun = Math.max(maxRun, run); run = 0; }
    }
    maxRun = Math.max(maxRun, run);
    e.runs = runs; e.water = water * len / M; e.maxRun = maxRun * len / M;
    // profil lissé : pentes douces, en déblai dans les collines et en remblai dans les creux
    const tmp = new Float32Array(M + 1), Wn = Math.max(2, Math.round(3 / SEA_R / (len / M)));
    for (let pass = 0; pass < 4; pass++) {
      for (let i = 0; i <= M; i++) { let sum = 0, c = 0; for (let k = Math.max(0, i - Wn); k <= Math.min(M, i + Wn); k++) { sum += prof[k]; c++; } tmp[i] = sum / c; }
      tmp[0] = prof[0]; tmp[M] = prof[M];
      prof.set(tmp);
    }
    for (let i = 0; i <= M; i++) { let sum = 0, c = 0; for (let k = Math.max(0, i - 3); k <= Math.min(M, i + 3); k++) { sum += wet[k] ? 0 : 1; c++; } land[i] = wet[i] ? 0 : sum / c; }
    e.point = (th, side = 0) => new THREE.Vector3().copy(a).multiplyScalar(Math.cos(th)).addScaledVector(u, Math.sin(th)).addScaledVector(n, sample(off, e, th) + side / SEA_R).normalize();
    e.groundAt = th => sample(prof, e, th) * S;
    return e;
  }
  // toutes les paires proches ; on garde un réseau qui relie les zones au moindre coût (l'eau coûte plus cher)
  const cands = [];
  for (let i = 0; i < sites.length; i++) for (let j = i + 1; j < sites.length; j++) {
    if (Math.acos(Math.min(1, sites[i].dir.dot(sites[j].dir))) > 1.25) continue;
    const e = makeRoad(sites[i].dir, sites[j].dir); e.i = i; e.j = j;
    if (e.maxRun > MAX_BRIDGE || e.water > e.len * 0.45) continue;
    e.cost = e.len + e.water * 1.5; cands.push(e);
  }
  cands.sort((x, y) => x.cost - y.cost);
  const parent = sites.map((_, k) => k), find = k => (parent[k] === k ? k : (parent[k] = find(parent[k])));
  const edges = [], extra = [];
  for (const e of cands) { const ra = find(e.i), rb = find(e.j); if (ra !== rb) { parent[ra] = rb; edges.push(e); } else extra.push(e); }
  extra.filter(e => e.len * SEA_R < 26).slice(0, 2).forEach(e => edges.push(e));   // quelques boucles

  // ponts : chaque passage sur l'eau, prolongé d'un peu de terre de chaque côté
  const bridges = [];
  const LIFT = (R - 0.3) * S + 1.25;   // assez haut pour que l'aéroglisseur passe dessous
  for (const e of edges) for (const r of e.runs) {
    const t0 = Math.max(0, r.i0 / e.M * e.len - 2.6 / SEA_R), t1 = Math.min(e.len, r.i1 / e.M * e.len + 2.6 / SEA_R);
    const hA = e.groundAt(t0), hB = e.groundAt(t1), L = (t1 - t0) * SEA_R, arch = Math.min(0.3, L * 0.02);
    const deck = th => {
      const s2 = (th - t0) / (t1 - t0), base = hA + (hB - hA) * s2;
      return base + Math.max(0, LIFT - base) * smoothstep(0, 0.34, s2) * smoothstep(1, 0.66, s2) + arch * Math.sin(Math.PI * s2);
    };
    bridges.push({ e, t0, t1, deck, len: L });
  }

  const RT = { e: null, d: 0, th: 0 };
  /** Route la plus proche (distance angulaire au milieu de la chaussée). */
  function roadAt(x, y, z) {
    RT.e = null; RT.d = 1e9;
    for (const e of edges) {
      const dn = x * e.n.x + y * e.n.y + z * e.n.z;
      if (Math.abs(dn) > ROAD_W * 3.2 + 1.2 / SEA_R) continue;
      const th = Math.atan2(x * e.u.x + y * e.u.y + z * e.u.z, x * e.a.x + y * e.a.y + z * e.a.z);
      if (th < 0 || th > e.len) continue;
      const d = Math.abs(dn - sample(e.off, e, th));
      if (d < RT.d) { RT.d = d; RT.e = e; RT.th = th; }
    }
    return RT;
  }
  /** Rayon du sol en blocs : relief, routes (déblais et remblais), puis esplanades. */
  function heightB(x, y, z) {
    let h = rawHeight(x, y, z);
    const r = roadAt(x, y, z);
    if (r.e) {
      const w = (1 - smoothstep(ROAD_W * 1.05, ROAD_W * 2.8, r.d)) * sample(r.e.land, r.e, r.th);
      if (w > 0) h += (sample(r.e.prof, r.e, r.th) - h) * w;
    }
    return plaza(x, y, z, h);
  }
  const heightDir = d => heightB(d.x, d.y, d.z) * S;              // en unités de la scène
  const ROAD = { rut: 0 };
  /** 1 sur la chaussée, 0 en dehors ; ROAD.rut : les deux ornières. */
  function pathAt(x, y, z) {
    ROAD.rut = 0;
    const r = roadAt(x, y, z);
    if (!r.e) return 0;
    const d = r.d + noise.noise(x * 44 + 3, y * 44, z * 44) * ROAD_W * 0.12;
    const k = 1 - smoothstep(ROAD_W * 0.8, ROAD_W * 1.12, d);
    ROAD.rut = k * (1 - smoothstep(0.05, 0.14, Math.abs(d / ROAD_W - 0.42)));
    return k;
  }
  const pathDir = d => pathAt(d.x, d.y, d.z);
  const roadNear = (d, extraU) => { const r = roadAt(d.x, d.y, d.z); return !!r.e && r.d < ROAD_W + extraU / SEA_R; };
  /** Pont sous cette direction : abscisse, écart latéral (unités) et dessus du tablier ; null s'il n'y en a pas à moins de 2 unités. */
  const BI = { b: null, th: 0, lat: 0, top: 0 };
  function bridgeAt(dir) {
    BI.b = null; let best = 2 / SEA_R;
    for (const b of bridges) {
      const e = b.e, dn = dir.dot(e.n);
      if (Math.abs(dn) > best + 0.6 / SEA_R) continue;
      const th = Math.atan2(dir.dot(e.u), dir.dot(e.a));
      if (th < b.t0 || th > b.t1) continue;
      const lat = dn - sample(e.off, e, th);
      if (Math.abs(lat) < best) { best = Math.abs(lat); BI.b = b; BI.th = th; BI.lat = lat * SEA_R; BI.top = b.deck(th) + 0.07; }
    }
    return BI.b ? BI : null;
  }
  /** Dessus du tablier sous cette direction (0 sinon). Avec r : seulement si l'on est déjà à hauteur du tablier (on peut passer dessous). */
  function bridgeR(dir, r) {
    const bi = bridgeAt(dir);
    if (!bi || Math.abs(bi.lat) > 0.8) return 0;
    if (r !== undefined && r < bi.top - 0.45) return 0;
    return bi.top;
  }


  /* ---------- sol et mer, maillés ensemble (la profondeur de l'eau vient du relief) ---------- */
  const n = quality === 'low' ? 160 : 224, side = n + 3, group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  const waterUniforms = {
    uTime: { value: 0 }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color(1, 0.95, 0.85) },
    uSky: { value: new THREE.Color(STYLE.skyHorizon) }, uScale: { value: S },
    uShallow: { value: new THREE.Color(STYLE.liquidColor).lerp(new THREE.Color('#2fbcae'), 0.4) },
    uDeep: { value: new THREE.Color(STYLE.liquidColor).multiplyScalar(0.34).lerp(new THREE.Color('#06324a'), 0.7) },
  };
  const wMat = waterMaterial(waterUniforms), water = new THREE.Group();
  const d = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), nn = new THREE.Vector3(), q = new THREE.Vector3();
  const WR = (R - 0.3) * S;
  const MAP = { w: 768, h: 384 }; MAP.data = new Uint8ClampedArray(MAP.w * MAP.h * 4);
  const mapC = new THREE.Color(), mapShallow = new THREE.Color('#3fc6b4'), mapDeep = new THREE.Color('#0d3f5a');
  function mapSplat(dd, depth, col) {
    if (depth > 0.25) mapC.copy(mapShallow).lerp(mapDeep, Math.min(1, depth / 9)); else mapC.copy(col).convertLinearToSRGB();
    const px = Math.floor((Math.atan2(dd.z, dd.x) / (Math.PI * 2) + 0.5) * MAP.w), py = Math.floor((0.5 - Math.asin(Math.max(-1, Math.min(1, dd.y))) / Math.PI) * MAP.h);
    for (let oy = 0; oy < 2; oy++) for (let ox = 0; ox < 2; ox++) {
      const k = ((Math.min(MAP.h - 1, py + oy)) * MAP.w + ((px + ox) % MAP.w)) * 4;
      MAP.data[k] = mapC.r * 255; MAP.data[k + 1] = mapC.g * 255; MAP.data[k + 2] = mapC.b * 255; MAP.data[k + 3] = 255;
    }
  }
  const rng = (() => { let s = 0x9e3779b9; return () => { s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0; return s / 4294967296; }; })();
  const onPlaza = (dd, extra = 0) => sites.some(s => dd.dot(s.dir) > Math.cos(A0 + extra));
  const grassM = [], flowers = [], GRASS_KEEP = quality === 'low' ? 0.62 : 1;
  const gq = new THREE.Quaternion(), gs = new THREE.Vector3(), gp = new THREE.Vector3(), gm = new THREE.Matrix4(), gy = new THREE.Quaternion(), gyaw = new THREE.Quaternion();
  /** Touffes d'herbe autour d'un sommet du sol (va, vb : vecteurs vers les sommets voisins, sur deux mailles). */
  function grassAt(dd, h, steep, pk, va, vb) {
    const above = h - R;
    if (above < 2 || above > 25 || steep > 0.85 || pk > 0.35) return;
    if (onPlaza(dd, 0.05 / SEA_R) || pk > 0.5) return;
    const patch = grassPatch(dd);
    if (patch < 0.02) return;
    // hauteur : courte au bord des plaques, haute au cœur, avec des variations
    const tall = (0.45 + 1.1 * smoothstep(0.02, 0.4, patch)) * (0.7 + 0.6 * (noise.noise(dd.x * 40, dd.y * 40, dd.z * 40) * 0.5 + 0.5));
    gq.setFromUnitVectors(Y, dd);
    if (rng() > GRASS_KEEP) return;
    for (let k = 0, nt = 1 + (patch > 0.2 ? 1 : 0) + (patch > 0.38 ? 1 : 0); k < nt; k++) {
      gp.copy(dd).multiplyScalar(h * S - 0.02).addScaledVector(va, (rng() - 0.5) * 0.5).addScaledVector(vb, (rng() - 0.5) * 0.5);
      const s = 0.26 + rng() * 0.12 + Math.max(0, patch) * 0.12;
      gm.compose(gp, gy.copy(gq).multiply(gyaw.setFromAxisAngle(Y, rng() * 6.283)), gs.set(s, s * tall * (0.85 + rng() * 0.35), s));
      grassM.push([gm.clone(), new THREE.Color(1, 1, 1).multiplyScalar(0.82 + rng() * 0.32)]);
    }
    if (patch > 0.25 && rng() < 0.22) {
      const fc = new THREE.Color(STYLE.flowers[Math.floor((noise.noise(dd.x * 14, dd.y * 14, dd.z * 14) * 0.5 + 0.5) * STYLE.flowers.length) % STYLE.flowers.length]);
      gm.compose(gp.copy(dd).multiplyScalar(h * S + 0.16 + rng() * 0.08), gq, gs.setScalar(0.04 + rng() * 0.02));
      flowers.push([gm.clone(), fc]);
    }
  }
  for (let f = 0; f < 6; f++) {
    const pos = new Float32Array(side * side * 3), dirs = new Float32Array(side * side * 3), hb = new Float32Array(side * side);
    for (let j = 0; j < side; j++) for (let i = 0; i < side; i++) {
      faceDir(f, -1 + 2 * (i - 1) / n, -1 + 2 * (j - 1) / n, d);
      const h = heightB(d.x, d.y, d.z), k = (j * side + i) * 3;
      hb[j * side + i] = h;
      pos[k] = d.x * h * S; pos[k + 1] = d.y * h * S; pos[k + 2] = d.z * h * S; dirs[k] = d.x; dirs[k + 1] = d.y; dirs[k + 2] = d.z;
    }
    const cnt = (n + 1) * (n + 1);
    const vp = new Float32Array(cnt * 3), vn = new Float32Array(cnt * 3), vc = new Float32Array(cnt * 3);
    const wp = new Float32Array(cnt * 3), wd = new Float32Array(cnt);
    const at = (i, j, out) => { const k = (j * side + i) * 3; return out.set(pos[k], pos[k + 1], pos[k + 2]); };
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
      const gi = i + 1, gj = j + 1, g = gj * side + gi, k = g * 3, v = (j * (n + 1) + i) * 3;
      vp[v] = pos[k]; vp[v + 1] = pos[k + 1]; vp[v + 2] = pos[k + 2];
      at(gi + 1, gj, a).sub(at(gi - 1, gj, q)); at(gi, gj + 1, b).sub(at(gi, gj - 1, q));
      nn.crossVectors(a, b).normalize(); d.set(dirs[k], dirs[k + 1], dirs[k + 2]); if (nn.dot(d) < 0) nn.negate();
      vn[v] = nn.x; vn[v + 1] = nn.y; vn[v + 2] = nn.z;
      const cos = Math.min(1, Math.max(0.05, nn.dot(d))), steep = Math.sqrt(1 - cos * cos) / cos;
      const pk = pathAt(d.x, d.y, d.z);
      colorAt(d, hb[g], steep, tmpC, pk, ROAD.rut);
      grassAt(d, hb[g], steep, pk, a, b);
      vc[v] = tmpC.r; vc[v + 1] = tmpC.g; vc[v + 2] = tmpC.b;
      wp[v] = d.x * WR; wp[v + 1] = d.y * WR; wp[v + 2] = d.z * WR;
      wd[v / 3] = R - hb[g];
      mapSplat(d, R - hb[g], tmpC);
    }
    const index = new Uint32Array(n * n * 6), wIndex = []; let w = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const v00 = j * (n + 1) + i, v10 = v00 + 1, v01 = v00 + n + 1, v11 = v01 + 1;
      index[w++] = v00; index[w++] = v10; index[w++] = v11; index[w++] = v00; index[w++] = v11; index[w++] = v01;
      if (Math.max(wd[v00], wd[v10], wd[v01], wd[v11]) >= -1.5) wIndex.push(v00, v10, v11, v00, v11, v01);   // pas d'eau en pleine terre
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(vp, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(vn, 3)); geo.setAttribute('color', new THREE.BufferAttribute(vc, 3));
    geo.setIndex(new THREE.BufferAttribute(index, 1)); geo.computeBoundingSphere();
    const gmesh = new THREE.Mesh(geo, mat); gmesh.receiveShadow = true; group.add(gmesh);
    for (let v = 0; v < cnt; v++) wd[v] = Math.max(-3, Math.min(30, wd[v]));
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.BufferAttribute(wp, 3)); wg.setAttribute('aDepth', new THREE.BufferAttribute(wd, 1));
    wg.setIndex(wIndex); wg.computeBoundingSphere();
    const wm = new THREE.Mesh(wg, wMat); wm.renderOrder = 2; water.add(wm);
  }
  const groundMesh = group, waterMesh = water;

  /* ---------- végétation et rochers ---------- */
  const slopeAt = dir => {
    const [t1, t2] = tangents(dir), e = 0.002, h0 = heightB(dir.x, dir.y, dir.z);
    q.copy(dir).addScaledVector(t1, e).normalize(); const ha = heightB(q.x, q.y, q.z);
    q.copy(dir).addScaledVector(t2, e).normalize(); const hb2 = heightB(q.x, q.y, q.z);
    return Math.hypot(ha - h0, hb2 - h0) / (e * h0);
  };
  const randDir = out => { do { out.set(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1); } while (out.lengthSq() > 1 || out.lengthSq() < 0.01); return out.normalize(); };
  const m4 = new THREE.Matrix4(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), spin = new THREE.Quaternion(), qq = new THREE.Quaternion();
  const place = (dir, hScene, s, sy = s, yaw = rng() * Math.PI * 2) => {
    orient(dir); qq.copy(quat).multiply(spin.setFromAxisAngle(Y, yaw));
    return m4.compose(ps.copy(dir).multiplyScalar(hScene), qq, sc.set(s, sy, s)).clone();
  };
  const decor = new THREE.Group();
  const leafCol = () => new THREE.Color(STYLE.leaves[Math.floor(rng() * STYLE.leaves.length)]).multiplyScalar(0.9 + rng() * 0.2);
  const inst = (geo, mat, list, { color = true, cast = true } = {}) => {
    const m = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length)); m.count = list.length;
    list.forEach((it, i) => { if (color) { m.setMatrixAt(i, it[0]); m.setColorAt(i, it[1]); } else m.setMatrixAt(i, it); });
    m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.castShadow = cast; m.receiveShadow = true; m.frustumCulled = false;
    decor.add(m); return m;
  };

  // arbres : houppiers en petites feuilles (rendu « peint »), quelques cyprès et pins, en forêts
  const NV = 6, variants = Array.from({ length: NV }, (_, v) => treeVariant(v, quality)), vWood = variants.map(() => []), vLeaf = variants.map(() => []);
  const trunks = [], cypress = [], pines = [], bushes = [], treeDirs = [];
  for (let tries = 0; tries < 60000 && treeDirs.length < (quality === 'low' ? 1100 : 1600); tries++) {
    randDir(d);
    if (noise.fbm(d.x * 7 + 1.3, d.y * 7, d.z * 7 - 2.1, 3) < 0.05) continue;          // forêts
    const h = heightB(d.x, d.y, d.z), above = h - R;
    if (above < 2.5 || above > 26 || onPlaza(d, 0.9 / SEA_R) || roadNear(d, 1.5) || slopeAt(d) > 0.6) continue;
    const s = 0.85 + rng() * 0.55, r = rng(), hs = h * S - 0.03;
    treeDirs.push(d.clone());
    if (r < 0.78) { const k = Math.floor(rng() * NV), m = place(d, hs, s, s * (0.9 + rng() * 0.25)); vWood[k].push(m); vLeaf[k].push([m, leafCol()]); }
    else if (r < 0.9) { trunks.push(place(d, hs, s, s * 1.25)); cypress.push([place(d, hs + 0.72 * s, s, s * 1.3), leafCol().multiplyScalar(0.85)]); }
    else if (r < 0.95) { trunks.push(place(d, hs, s, s * 1.1)); pines.push([place(d, hs + 0.42 * s, s, s * 1.1), new THREE.Color('#6a6a22').multiplyScalar(0.9 + rng() * 0.2)]); }
    else { const k = Math.floor(rng() * NV), m = place(d, hs, s * 1.15, s * 1.25); vWood[k].push(m); vLeaf[k].push([m, leafCol()]); }
  }
  // buissons : lisières des forêts, bords des chemins et des esplanades
  for (let tries = 0; tries < 70000 && bushes.length < (quality === 'low' ? 1700 : 3000); tries++) {
    randDir(d);
    const f = noise.fbm(d.x * 7 + 1.3, d.y * 7, d.z * 7 - 2.1, 3), pk = pathDir(d);
    const edge = (f > -0.12 && f < 0.12) || (pk > 0 && pk < 0.05 && rng() < 0.5) || (onPlaza(d, 1.3 / SEA_R) && !onPlaza(d, 0.25 / SEA_R));
    if (!edge) continue;
    const h = heightB(d.x, d.y, d.z), above = h - R;
    if (above < 1.8 || above > 26 || roadNear(d, 0.6) || onPlaza(d, 0.2 / SEA_R)) continue;
    const s = 0.45 + rng() * 0.5;
    bushes.push([place(d, h * S + 0.12 * s, s, s * (0.7 + rng() * 0.25)), leafCol().multiplyScalar(0.95 + rng() * 0.15)]);
  }
  const barkM = new THREE.MeshStandardMaterial({ color: '#b590e8', roughness: 0.9 });
  inst(new THREE.CylinderGeometry(0.05, 0.075, 0.6, 7).translate(0, 0.3, 0), barkM, trunks, { color: false });
  variants.forEach((v, k) => { inst(v.wood, barkM, vWood[k], { color: false }); inst(v.leaves, LEAF_MAT, vLeaf[k]); });
  inst(leafCluster(60, 0.24, 2.4, 0.15), LEAF_MAT, cypress);
  inst(leafCluster(34, 0.3, 0.75, 0.17), LEAF_MAT, bushes);
  {
    const g1 = new THREE.ConeGeometry(0.3, 0.45, 9).translate(0, 0.1, 0), g2 = new THREE.ConeGeometry(0.23, 0.38, 9).translate(0, 0.38, 0), g3 = new THREE.ConeGeometry(0.15, 0.3, 9).translate(0, 0.62, 0);
    inst(mergeGeos([g1, g2, g3]), new THREE.MeshStandardMaterial({ roughness: 0.85 }), pines);
  }

  const GC = 0.6, gcells = new Map(); let gpos = [], gattr = null;
  const gkey = (x, y, z) => ((Math.floor(x / GC) + 512) * 1024 + (Math.floor(y / GC) + 512)) * 1024 + (Math.floor(z / GC) + 512);
  /** Écrase l'herbe autour des points donnés (positions du monde), à l'instant t. */
  function crushGrass(points, radius, t) {
    if (!gattr) return;
    let lo = Infinity, hi = -1; const r2 = radius * radius, arr = gattr.array;
    for (const p of points) {
      const cx = Math.floor(p.x / GC), cy = Math.floor(p.y / GC), cz = Math.floor(p.z / GC);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
        const cell = gcells.get(((cx + a + 512) * 1024 + (cy + b + 512)) * 1024 + (cz + c + 512)); if (!cell) continue;
        for (const i of cell) {
          const q = gpos[i], dx = q[0] - p.x, dy = q[1] - p.y, dz = q[2] - p.z;
          if (dx * dx + dy * dy + dz * dz > r2) continue;
          if (t - arr[i] < 1 && arr[i] > 0) continue;   // déjà écrasée à l'instant
          arr[i] = t; if (i < lo) lo = i; if (i > hi) hi = i;
        }
      }
    }
    if (hi >= 0) { gattr.clearUpdateRanges(); gattr.addUpdateRange(lo, hi - lo + 1); gattr.needsUpdate = true; }
  }
  // herbe : touffes de quatre brins effilés, du vert sombre au vert tendre, qui ondulent au vent
  {
    const base = new THREE.Color(STYLE.grassBase).multiplyScalar(0.8), tip = new THREE.Color(STYLE.grassTip);
    // touffe épaisse : des brins larges et pointus, disposés en étoile et penchés vers l'extérieur
    const pos = [], col = [], nrm = [], NB = quality === 'low' ? 5 : 7, mid = base.clone().lerp(tip, 0.45);
    for (let k = 0; k < NB; k++) {
      const ang = k / NB * Math.PI * 2 + Math.sin(k * 7.3) * 0.4, rx = Math.cos(ang), rz = Math.sin(ang), r0 = 0.04 + (k % 3) * 0.045;
      const ox = rx * r0, oz = rz * r0, w = 0.1 + (k % 2) * 0.03, lean = 0.14 + (k % 3) * 0.09, hgt = 0.85 + ((k * 5) % 7) * 0.08;
      const px = -rz, pz = rx;   // largeur du brin : perpendiculaire au rayon
      pos.push(ox - px * w, 0, oz - pz * w, ox + px * w, 0, oz + pz * w, ox + rx * lean, hgt, oz + rz * lean);
      const c0 = k % 2 ? base : mid;
      col.push(c0.r, c0.g, c0.b, base.r, base.g, base.b, tip.r, tip.g, tip.b);
      nrm.push(0, 1, 0, 0, 1, 0, 0, 1, 0);   // les brins prennent la lumière comme le sol
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    const gmat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide });
    gmat.onBeforeCompile = sh => {
      sh.uniforms.uTime = waterUniforms.uTime; sh.uniforms.uWind = WIND.uWind; sh.uniforms.uWindDir = WIND.uWindDir;
      sh.vertexShader = 'uniform float uTime;\nuniform float uWind;\nuniform vec3 uWindDir;\nattribute float aCrush;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        float crushAge = uTime - aCrush;
        float flat2 = aCrush > 0.0 ? smoothstep(0.0, 0.1, crushAge) * (1.0 - smoothstep(12.0, 20.0, crushAge)) : 0.0;
        transformed.y *= 1.0 - 0.86 * flat2;
        transformed.xz *= 1.0 + 0.7 * flat2;
        vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        // vent : une direction commune, des rafales qui roulent sur la prairie, et un frémissement propre à chaque touffe
        vec3 upW = normalize(ip), wW = uWindDir - upW * dot(upW, uWindDir);
        vec3 wL = transpose(mat3(instanceMatrix)) * wW; wL = length(wL) > 1e-5 ? normalize(wL) * length(wW) : vec3(0.0);
        float ph = dot(ip, vec3(1.7, 2.3, 1.3));
        float bend = transformed.y * transformed.y * (1.0 - flat2);
        float wave = sin(dot(ip, uWindDir) * 0.55 - uTime * 1.8) * 0.5 + 0.5;
        float gust = 0.3 + 0.9 * wave * wave;
        transformed.xz += wL.xz * bend * uWind * gust;
        transformed.y -= bend * uWind * gust * 0.18;
        transformed.x += sin(uTime * 5.3 + ph) * 0.03 * bend * (0.4 + uWind);
        transformed.z += cos(uTime * 4.1 + ph * 1.3) * 0.025 * bend * (0.4 + uWind);`);
    };
    gmat.customProgramCacheKey = () => 'grass-wind';
    g.setAttribute('aCrush', new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, grassM.length)), 1));
    inst(g, gmat, grassM, { cast: false });
    // grille spatiale des touffes, pour trouver vite celles qui sont sous les roues
    grassM.forEach((it, i) => {
      const e = it[0].elements, key = gkey(e[12], e[13], e[14]);
      let c = gcells.get(key); if (!c) gcells.set(key, c = []); c.push(i);
    });
    gpos = grassM.map(it => [it[0].elements[12], it[0].elements[13], it[0].elements[14]]);
    gattr = g.attributes.aCrush;
  }
  inst(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ roughness: 0.6, emissive: '#222', emissiveIntensity: 0.25 }), flowers, { cast: false });

  // rochers
  const rocks = [];
  for (let tries = 0; tries < 20000 && rocks.length < 600; tries++) {
    randDir(d);
    const h = heightB(d.x, d.y, d.z), above = h - R;
    if (above < 0.6 || onPlaza(d, 0.3 / SEA_R) || roadNear(d, 0.3)) continue;
    if (noise.noise(d.x * 12 - 3, d.y * 12, d.z * 12) < 0.2) continue;
    const s = 0.07 + rng() * 0.17;
    rocks.push([place(d, h * S, s, s * (0.6 + rng() * 0.4)), new THREE.Color(STYLE.rockColor).multiplyScalar(0.85 + rng() * 0.25)]);
  }
  inst(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), rocks);

  {
    const pads = [], blooms = [], padCols = ['#7fae3a', '#5f9a34', '#9ab83a', '#6e9e2e'], bloomCols = ['#ff7ab8', '#ffffff', '#c58cff'];
    const WR2 = (R - 0.3) * S + 0.012;
    for (let tries = 0; tries < 30000 && pads.length < (quality === 'low' ? 90 : 150); tries++) {
      randDir(d);
      const depth = R - heightB(d.x, d.y, d.z);
      if (depth < 0.8 || depth > 4.5 || noise.noise(d.x * 26 + 7, d.y * 26, d.z * 26) < 0.42 || bridgeAt(d)) continue;
      const [t1, t2] = tangents(d);
      for (let k = 0, nk = 2 + Math.floor(rng() * 4); k < nk; k++) {
        q.copy(d).addScaledVector(t1, (rng() - 0.5) * 1.2 / SEA_R).addScaledVector(t2, (rng() - 0.5) * 1.2 / SEA_R).normalize();
        if (R - heightB(q.x, q.y, q.z) < 0.6) continue;
        const sz = 0.7 + rng() * 0.6;
        pads.push([place(q, WR2, sz, 1), new THREE.Color(padCols[Math.floor(rng() * padCols.length)])]);
        if (rng() < 0.3) blooms.push([place(q, WR2 + 0.03, sz * 0.9, sz * 0.7), new THREE.Color(bloomCols[Math.floor(rng() * bloomCols.length)])]);
      }
    }
    const padGeo = new THREE.CircleGeometry(0.17, 16, 0.35, Math.PI * 2 - 0.5).rotateX(-Math.PI / 2);
    inst(padGeo, new THREE.MeshStandardMaterial({ roughness: 0.6, side: THREE.DoubleSide }), pads, { cast: false });
    const petal = new THREE.ConeGeometry(0.05, 0.09, 6, 1, true).translate(0, 0.045, 0);
    inst(petal, new THREE.MeshStandardMaterial({ roughness: 0.5, side: THREE.DoubleSide, emissive: '#552244', emissiveIntensity: 0.3 }), blooms, { cast: false });
  }

  /* ---------- zones : esplanade, repère local (les décors sont posés par props.js) ---------- */
  const pavilions = anchors.map((an, k) => {
    const dir = an.dir.clone(), h = sites[k].flat * S, [t1, t2] = tangents(dir);
    return { id: an.id, color: an.color, dir, t1, t2, h, top: dir.clone().multiplyScalar(h + 2.2) };
  });

  /* ---------- nuages arrondis ---------- */
  const clouds = new THREE.Group();
  const puff = new THREE.IcosahedronGeometry(1, 3), cloudMat = new THREE.MeshStandardMaterial({ color: '#fff1ea', roughness: 1, transparent: true, opacity: 0.92, emissive: '#ffd9c8', emissiveIntensity: 0.18 });
  const puffs = [];
  for (let c = 0; c < 60; c++) {
    d.set(rng() * 2 - 1, (rng() * 2 - 1) * 0.8, rng() * 2 - 1).normalize(); orient(d);
    const t1 = new THREE.Vector3(1, 0, 0).applyQuaternion(quat), t2 = new THREE.Vector3(0, 0, 1).applyQuaternion(quat), alt = SEA_R + MAX_H * S + 1.4 + rng() * 1.2;
    for (let p = 0, np = 4 + Math.floor(rng() * 4); p < np; p++) {
      const s = 0.5 + rng() * 0.5;
      m4.compose(ps.copy(d).multiplyScalar(alt).addScaledVector(t1, (rng() - 0.5) * 2.6).addScaledVector(t2, (rng() - 0.5) * 1.4), quat, sc.set(s * 1.25, s * 0.6, s));
      puffs.push(m4.clone());
    }
  }
  const cloudMesh = new THREE.InstancedMesh(puff, cloudMat, puffs.length); puffs.forEach((m, i) => cloudMesh.setMatrixAt(i, m)); clouds.add(cloudMesh);

  const SWIM = (R - 1.4) * S;
  function groundRadius(dir) { return Math.max(heightDir(dir), SWIM); }   // on marche, ou on nage
  function isWet(dir) { return heightB(dir.x, dir.y, dir.z) < R; }
  function animate() {}

  return { groundMesh, waterMesh, waterUniforms, decor, clouds, pavilions, groundRadius, isWet, heightDir, animate, seaR: SWIM, waterR: WR, maxRelief: MAX_H * S, edges, bridges, bridgeR, bridgeAt, pathDir, onPlaza, crushGrass, map: MAP, treeDirs };
}

/** Vent commun à l'herbe (force et direction), réglé par la météo. */
export const WIND = { uWind: { value: 0.32 }, uWindDir: { value: new THREE.Vector3(0.7, 0.2, 0.68).normalize() } };

/* ---------- feuillage « peint » : des dizaines de petites feuilles découpées ---------- */
const LEAF_TEX = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  g.fillStyle = '#fff';
  for (let i = 0; i < 9; i++) { g.beginPath(); g.ellipse(14 + r() * 36, 14 + r() * 36, 5 + r() * 9, 4 + r() * 7, r() * 3, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
/** Le feuillage s'efface (tramage) quand il passe tout près de la caméra : il ne cache jamais la voiture. */
export const FADE = { uFadeTarget: { value: new THREE.Vector3() }, uFadeOn: { value: 0 } };
export function fadeNearCamera(m) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.vertexShader = 'varying vec3 vFadeW;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vec4 fw = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        fw = instanceMatrix * fw;
      #endif
      vFadeW = (modelMatrix * fw).xyz;`);
    sh.fragmentShader = 'varying vec3 vFadeW;\n' + sh.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
      if (uFadeOn > 0.5) {
        // tout ce qui se trouve entre la caméra et la voiture s'efface en tramage
        vec3 ax = uFadeTarget - cameraPosition; float L = length(ax); ax /= L;
        vec3 rel = vFadeW - cameraPosition; float t = dot(rel, ax);
        float rad = length(rel - ax * t);
        float th = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
        float keep = smoothstep(0.9, 1.9, rad) + smoothstep(L - 1.2, L - 0.4, t);
        if (t > 0.0 && th > keep) discard;
      }`);
    sh.fragmentShader = 'uniform vec3 uFadeTarget;\nuniform float uFadeOn;\n' + sh.fragmentShader;
    sh.uniforms.uFadeTarget = FADE.uFadeTarget; sh.uniforms.uFadeOn = FADE.uFadeOn;
  };
  const key = m.customProgramCacheKey.bind(m); m.customProgramCacheKey = () => key() + '|fade';
  return m;
}
export const LEAF_MAT = fadeNearCamera(new THREE.MeshStandardMaterial({ map: LEAF_TEX, alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.9, vertexColors: true }));
/** Nuage de feuilles dans un ellipsoïde (normales sphériques : le houppier s'éclaire comme un volume). */
export function leafCluster(count, radius, stretch, size) {
  const pos = [], nrm = [], uv = [], col = [], idx = [];
  let s = Math.floor(radius * 1000 + count); const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const c = new THREE.Vector3(), n = new THREE.Vector3(), u = new THREE.Vector3(), v = new THREE.Vector3(), nn = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    n.set(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1); if (n.lengthSq() < 0.01) n.set(0, 1, 0); n.normalize();
    const k = 0.6 + 0.4 * Math.cbrt(r());
    c.copy(n).multiplyScalar(radius * k); c.y *= stretch;
    u.set(r() - 0.5, r() - 0.5, r() - 0.5).cross(n).normalize(); v.crossVectors(n, u);
    const sz = size * (0.75 + r() * 0.5), shade = 0.78 + 0.3 * (n.y * 0.5 + 0.5) + r() * 0.08, b = pos.length / 3;
    nn.copy(n); nn.y /= stretch; nn.normalize();
    for (const [a, bb] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      pos.push(c.x + (u.x * a + v.x * bb) * sz, c.y + (u.y * a + v.y * bb) * sz, c.z + (u.z * a + v.z * bb) * sz);
      nrm.push(nn.x, nn.y, nn.z); uv.push((a + 1) / 2, (bb + 1) / 2); col.push(shade, shade, shade);
    }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
  return g;
}

/** Un modèle d'arbre : tronc élancé un peu penché, deux à quatre branches, un bouquet de feuilles au bout de chacune. */
function treeVariant(seed, quality) {
  let s0 = 977 + seed * 7919; const r = () => (s0 = (s0 * 16807) % 2147483647) / 2147483647;
  const wood = [], leaves = [], Yv = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion();
  const limb = (from, dir, len, r0, r1) => {
    const g = new THREE.CylinderGeometry(r1, r0, len, 6).translate(0, len / 2, 0);
    g.applyQuaternion(q.setFromUnitVectors(Yv, dir)); g.translate(from.x, from.y, from.z); wood.push(g);
    return from.clone().addScaledVector(dir, len);
  };
  const H = 1.15 + r() * 0.45, lean = new THREE.Vector3((r() - 0.5) * 0.16, 1, (r() - 0.5) * 0.16).normalize();
  const tips = [limb(new THREE.Vector3(), lean, H, 0.075, 0.035)];
  const nb = 2 + Math.floor(r() * 3);
  for (let b = 0; b < nb; b++) {
    const a = b / nb * Math.PI * 2 + r() * 0.8, tilt = 0.55 + r() * 0.45, y0 = H * (0.42 + r() * 0.42);
    const dir = new THREE.Vector3(Math.sin(tilt) * Math.cos(a), Math.cos(tilt), Math.sin(tilt) * Math.sin(a));
    tips.push(limb(lean.clone().multiplyScalar(y0), dir, 0.38 + r() * 0.32, 0.036, 0.018));
  }
  const per = quality === 'low' ? 26 : 36;
  tips.forEach((t, i) => {
    const rad = (i === 0 ? 0.36 : 0.27) + r() * 0.1, g = leafCluster(per + (i === 0 ? 10 : 0), rad, 0.8, 0.165);
    g.translate(t.x, t.y + rad * 0.35, t.z); leaves.push(g);
  });
  return { wood: mergeGeos(wood), leaves: mergeLeaves(leaves) };
}
/** Fusionne des grappes de feuilles (positions, normales, uv, couleurs). */
function mergeLeaves(geos) {
  const A = { position: [], normal: [], uv: [], color: [] }, idx = []; let off = 0;
  for (const g of geos) {
    for (const k in A) A[k].push(...g.attributes[k].array);
    for (const i of g.index.array) idx.push(i + off);
    off += g.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(A.position, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(A.normal, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(A.uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(A.color, 3)); g.setIndex(idx);
  return g;
}

/** Fusionne des géométries indexées simples (positions + normales). */
function mergeGeos(geos) {
  const pos = [], nrm = [], idx = []; let off = 0;
  for (const g of geos) {
    const p = g.attributes.position, nn = g.attributes.normal;
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nrm.push(nn.getX(i), nn.getY(i), nn.getZ(i)); }
    const ix = g.index; for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + off);
    off += p.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); g.setIndex(idx);
  return g;
}
