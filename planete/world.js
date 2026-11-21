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

export const SEA_R = 16;      // rayon de la mer dans la scène
export const PAV_R = 1.45;    // rayon du socle des pavillons (scène)
const R = 120;                // rayon de la mer en blocs (Terre de Social World)
const S = SEA_R / R;          // blocs -> unités de la scène
const MAX_H = 34;             // relief maximal (blocs)

/* ---------- style « océan » de Social World (la Terre) ---------- */
const STYLE = {
  sea: 0.55, relief: 0.8, mountains: 0.45, cliffs: 0.35,
  ground: { low: '#3f8a2a', high: '#86c94a', dry: '#a8b85a', rock: '#b4b0ac', shore: '#e6d49a', snow: '#f4f8ff' },
  grassBase: '#2f6e1e', grassTip: '#b6e86a',
  flowers: ['#ff7aa8', '#ffffff', '#ffd23a'],
  leaves: ['#4f9e34', '#3f8a2c', '#6ab83e', '#8fb840'],
  rockColor: '#a3a09c', liquidColor: '#1fb0d8', skyZenith: '#2f8ae8', skyHorizon: '#c4e6ff',
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
function colorAt(d, h, steep, out) {
  const above = h - R;
  const tone = noise.fbm(d.x * 6 + 9, d.y * 6, d.z * 6, 3) * 0.5 + 0.5;
  const dry = smoothstep(0.55, 0.8, noise.noise(d.x * 3 - 4, d.y * 3, d.z * 3) * 0.5 + 0.5);
  out.copy(COL.low).lerp(COL.high, Math.min(1, Math.max(0, above / 22 + (tone - 0.5) * 0.6)));
  out.lerp(COL.dry, dry * 0.6);
  out.lerp(COL.shore, 1 - smoothstep(0.8, 2.2, above));                                     // plages
  if (above < 0) out.lerp(tmpC2.copy(COL.shore).multiplyScalar(0.7), Math.min(1, -above / 6)); // fond marin
  out.lerp(COL.rock, smoothstep(0.95, 1.25, steep));                                        // roche des falaises
  out.lerp(COL.snow, smoothstep(0.72, 0.9, (above + tone * 4) / MAX_H) * (1 - smoothstep(0.8, 1.2, steep))); // neige des sommets
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
  const ring = (PAV_R + 1.4) / SEA_R, cands = [], d = new THREE.Vector3(), q = new THREE.Vector3();
  const N = 6000, golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y = 1 - 2 * (i + 0.5) / N, r = Math.sqrt(1 - y * y), p = i * golden;
    d.set(Math.cos(p) * r, y * 0.9, Math.sin(p) * r).normalize();    // pas trop près des pôles
    const h = rawHeight(d.x, d.y, d.z), above = h - R;
    if (above < 3 || above > 15) continue;
    const [t1, t2] = tangents(d);
    let ok = true, lo = Infinity, hi = -Infinity;
    for (let k = 0; k < 10 && ok; k++) {
      const a = k / 10 * Math.PI * 2;
      for (const rr of [ring * 0.5, ring, ring * 1.8]) {
        q.copy(d).addScaledVector(t1, Math.cos(a) * rr).addScaledVector(t2, Math.sin(a) * rr).normalize();
        const hq = rawHeight(q.x, q.y, q.z);
        if (hq < R + 1.5) { ok = false; break; }
        if (rr <= ring) { lo = Math.min(lo, hq); hi = Math.max(hi, hq); }
      }
    }
    if (ok && hi - lo < 7) cands.push({ dir: d.clone(), h, rough: hi - lo });
  }
  cands.sort((a, b) => a.rough - b.rough);
  const sites = [];
  if (cands.length) sites.push(cands[0]);
  while (sites.length < count && cands.length > sites.length) {
    let best = null, bd = -1;
    for (const c of cands) { const m = Math.min(...sites.map(s => Math.acos(Math.min(1, c.dir.dot(s.dir))))) - c.rough * 0.01; if (m > bd) { bd = m; best = c; } }
    sites.push(best);
  }
  return sites;
}

/**
 * @param {{id:string,color:string,dir:THREE.Vector3}[]} anchors  une section par pavillon ;
 *        leur `dir` est remplacé par l'emplacement choisi sur la terre ferme.
 */
export function buildPlanet(anchors) {
  const sites = findSites(anchors.length);
  const A0 = (PAV_R + 0.6) / SEA_R, A1 = A0 + 2.4 / SEA_R;      // esplanade plate, puis raccord en douceur
  sites.forEach(s => { s.flat = s.h + 0.6; });
  anchors.forEach((an, k) => { an.dir = sites[k].dir.clone(); });

  /** Rayon du sol en blocs, esplanades comprises. */
  function heightB(x, y, z) {
    let h = rawHeight(x, y, z);
    for (const s of sites) {
      const c = x * s.dir.x + y * s.dir.y + z * s.dir.z;
      if (c < Math.cos(A1)) continue;
      const w = 1 - smoothstep(A0, A1, Math.acos(Math.min(1, c)));
      h = h * (1 - w) + s.flat * w;
    }
    return h;
  }
  const heightDir = d => heightB(d.x, d.y, d.z) * S;              // en unités de la scène

  /* ---------- sol et mer, maillés ensemble (la profondeur de l'eau vient du relief) ---------- */
  const n = 128, side = n + 3, group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  const waterUniforms = {
    uTime: { value: 0 }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color(1, 0.95, 0.85) },
    uSky: { value: new THREE.Color(STYLE.skyHorizon) }, uScale: { value: S },
    uShallow: { value: new THREE.Color(STYLE.liquidColor).lerp(new THREE.Color('#5fe6d8'), 0.45) },
    uDeep: { value: new THREE.Color(STYLE.liquidColor).multiplyScalar(0.45).lerp(new THREE.Color('#0a4fa0'), 0.6) },
  };
  const wMat = waterMaterial(waterUniforms), water = new THREE.Group();
  const d = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), nn = new THREE.Vector3(), q = new THREE.Vector3();
  const WR = (R - 0.3) * S;
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
      colorAt(d, hb[g], steep, tmpC);
      vc[v] = tmpC.r; vc[v + 1] = tmpC.g; vc[v + 2] = tmpC.b;
      wp[v] = d.x * WR; wp[v + 1] = d.y * WR; wp[v + 2] = d.z * WR;
      wd[v / 3] = R - hb[g];
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
    group.add(new THREE.Mesh(geo, mat));
    for (let v = 0; v < cnt; v++) wd[v] = Math.max(-3, Math.min(30, wd[v]));
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.BufferAttribute(wp, 3)); wg.setAttribute('aDepth', new THREE.BufferAttribute(wd, 1));
    wg.setIndex(wIndex); wg.computeBoundingSphere();
    const wm = new THREE.Mesh(wg, wMat); wm.renderOrder = 2; water.add(wm);
  }
  const groundMesh = group, waterMesh = water;

  /* ---------- végétation et rochers ---------- */
  const rng = (() => { let s = 0x9e3779b9; return () => { s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0; return s / 4294967296; }; })();
  const onPlaza = (dd, extra = 0) => sites.some(s => dd.dot(s.dir) > Math.cos(A0 + extra));
  const slopeAt = dir => {
    const [t1, t2] = tangents(dir), e = 0.004, h0 = heightB(dir.x, dir.y, dir.z);
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

  // arbres : surtout ronds, quelques cyprès et pins, en forêts
  const trunks = [], rounds = [], cypress = [], pines = [];
  for (let tries = 0; tries < 16000 && trunks.length < 560; tries++) {
    randDir(d);
    if (noise.fbm(d.x * 4 + 1.3, d.y * 4, d.z * 4 - 2.1, 3) < 0.08) continue;          // forêts
    const h = heightB(d.x, d.y, d.z), above = h - R;
    if (above < 2.5 || above > 26 || onPlaza(d, 0.8 / SEA_R) || slopeAt(d) > 0.6) continue;
    const s = 0.7 + rng() * 0.45, r = rng(), hs = h * S - 0.03;
    if (r < 0.7) { trunks.push(place(d, hs, s)); rounds.push([place(d, hs + 0.5 * s, s * (0.9 + rng() * 0.3), s * (0.85 + rng() * 0.3)), leafCol()]); }
    else if (r < 0.9) { trunks.push(place(d, hs, s, s * 1.25)); cypress.push([place(d, hs + 0.62 * s, s, s * 1.3), leafCol().multiplyScalar(0.85)]); }
    else { trunks.push(place(d, hs, s, s * 1.1)); pines.push([place(d, hs + 0.42 * s, s, s * 1.1), new THREE.Color('#2f6a3a').multiplyScalar(0.9 + rng() * 0.2)]); }
  }
  const inst = (geo, mat, list, withColor = true) => {
    const m = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length)); m.count = list.length;
    list.forEach((it, i) => { if (withColor) { m.setMatrixAt(i, it[0]); m.setColorAt(i, it[1]); } else m.setMatrixAt(i, it); });
    m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
    decor.add(m); return m;
  };
  inst(new THREE.CylinderGeometry(0.05, 0.075, 0.55, 7).translate(0, 0.27, 0), new THREE.MeshStandardMaterial({ color: '#6e4a2e', roughness: 0.9 }), trunks, false);
  inst(new THREE.IcosahedronGeometry(0.36, 2), new THREE.MeshStandardMaterial({ roughness: 0.85 }), rounds);
  inst(new THREE.ConeGeometry(0.17, 0.9, 10), new THREE.MeshStandardMaterial({ roughness: 0.85 }), cypress);
  {
    const g1 = new THREE.ConeGeometry(0.3, 0.45, 9).translate(0, 0.1, 0), g2 = new THREE.ConeGeometry(0.23, 0.38, 9).translate(0, 0.38, 0), g3 = new THREE.ConeGeometry(0.15, 0.3, 9).translate(0, 0.62, 0);
    const merged = mergeGeos([g1, g2, g3]);
    inst(merged, new THREE.MeshStandardMaterial({ roughness: 0.85 }), pines);
  }

  // herbe : touffes de trois brins, du vert sombre au vert tendre, en nappes
  const grass = [], flowers = [];
  for (let tries = 0; tries < 70000 && grass.length < 26000; tries++) {
    randDir(d);
    const patch = noise.fbm(d.x * 9 + 4, d.y * 9, d.z * 9, 2);
    if (patch < -0.12) continue;
    const h = heightB(d.x, d.y, d.z), above = h - R;
    if (above < 2.2 || above > 24 || onPlaza(d, 0.15 / SEA_R)) continue;
    const s = 0.13 + rng() * 0.08;
    grass.push([place(d, h * S - 0.01, s, s * (0.8 + rng() * 0.6)), new THREE.Color(1, 1, 1).multiplyScalar(0.85 + rng() * 0.3)]);
    if (patch > 0.25 && rng() < 0.35) {
      const fc = new THREE.Color(STYLE.flowers[Math.floor((noise.noise(d.x * 14, d.y * 14, d.z * 14) * 0.5 + 0.5) * STYLE.flowers.length) % STYLE.flowers.length]);
      flowers.push([place(d, h * S + 0.1 + rng() * 0.05, 0.035 + rng() * 0.015), fc]);
    }
  }
  {
    const blades = [], base = new THREE.Color(STYLE.grassBase), tip = new THREE.Color(STYLE.grassTip);
    const pos = [], col = [];
    for (let k = 0; k < 3; k++) {
      const ang = k / 3 * Math.PI + 0.3, cx = Math.cos(ang), cz = Math.sin(ang), ox = Math.cos(ang + 1.6) * 0.12, oz = Math.sin(ang + 1.6) * 0.12, lean = 0.18;
      pos.push(ox - cx * 0.1, 0, oz - cz * 0.1, ox + cx * 0.1, 0, oz + cz * 0.1, ox + lean * Math.cos(ang + 1.6), 1, oz + lean * Math.sin(ang + 1.6));
      col.push(base.r, base.g, base.b, base.r, base.g, base.b, tip.r, tip.g, tip.b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
    // les brins prennent la lumière comme le sol : normale vers le haut
    const nrm = g.attributes.normal; for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);
    void blades;
    inst(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }), grass);
  }
  inst(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ roughness: 0.6, emissive: '#222', emissiveIntensity: 0.25 }), flowers);

  // rochers
  const rocks = [];
  for (let tries = 0; tries < 6000 && rocks.length < 200; tries++) {
    randDir(d);
    const h = heightB(d.x, d.y, d.z), above = h - R;
    if (above < 0.6 || onPlaza(d, 0.3 / SEA_R)) continue;
    if (noise.noise(d.x * 6 - 3, d.y * 6, d.z * 6) < 0.25) continue;
    const s = 0.07 + rng() * 0.16;
    rocks.push([place(d, h * S, s, s * (0.6 + rng() * 0.4)), new THREE.Color(STYLE.rockColor).multiplyScalar(0.85 + rng() * 0.25)]);
  }
  inst(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), rocks);

  /* ---------- pavillons ---------- */
  const white = new THREE.MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.55 });
  const beacons = [];
  const pavilions = anchors.map((an, k) => {
    const dir = an.dir, h = sites[k].flat * S, g = new THREE.Group();
    const color = new THREE.Color(an.color), mColor = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.05 });
    const glow = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.6, roughness: 0.3 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(PAV_R, PAV_R * 1.08, 0.5, 48), white); base.position.y = -0.08; g.add(base);
    const step = new THREE.Mesh(new THREE.CylinderGeometry(PAV_R * 0.78, PAV_R * 0.82, 0.12, 48), white); step.position.y = 0.22; g.add(step);
    for (let p = 0; p < 6; p++) {
      const ang = p / 6 * Math.PI * 2, col = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 1.25, 14), white);
      col.position.set(Math.cos(ang) * PAV_R * 0.66, 0.88, Math.sin(ang) * PAV_R * 0.66); g.add(col);
    }
    const dome = new THREE.Mesh(new THREE.SphereGeometry(PAV_R * 0.82, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), mColor); dome.position.y = 1.5; dome.scale.y = 0.78; g.add(dome);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(PAV_R * 0.8, 0.07, 10, 48), white); rim.rotation.x = Math.PI / 2; rim.position.y = 1.5; g.add(rim);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.26, 24, 16), glow); orb.position.y = 0.85; g.add(orb);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.045, 10, 48), glow); ring.position.y = 3.05; g.add(ring);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.7, 16), mColor); spire.position.y = 2.45; g.add(spire);
    beacons.push(ring);
    g.position.copy(dir).multiplyScalar(h); g.quaternion.copy(orient(dir));
    decor.add(g);
    return { id: an.id, dir: dir.clone(), top: dir.clone().multiplyScalar(h + 3.6) };
  });

  /* ---------- nuages arrondis ---------- */
  const clouds = new THREE.Group();
  const puff = new THREE.IcosahedronGeometry(1, 3), cloudMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, transparent: true, opacity: 0.92, emissive: '#ffffff', emissiveIntensity: 0.15 });
  const puffs = [];
  for (let c = 0; c < 22; c++) {
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
  function animate(t) { beacons.forEach((r, i) => { r.rotation.x = Math.PI / 2 + Math.sin(t * 0.9 + i) * 0.25; r.rotation.z = t * 0.6 + i; }); }

  return { groundMesh, waterMesh, waterUniforms, decor, clouds, pavilions, groundRadius, isWet, heightDir, animate, maxRelief: MAX_H * S };
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
