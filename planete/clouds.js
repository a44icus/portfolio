/* ============================================================================
   Nuages volumétriques animés : une forme géométrique (sphère, cumulus, tore…)
   sert d'enveloppe, et un bruit 3D (Perlin-Worley, plus des octaves de Worley
   pour le détail) en ronge les bords. Le rendu avance pas à pas le long du
   rayon de vue dans une boîte (ray marching) : à chaque pas, on mesure la
   densité, puis la lumière qui arrive du soleil à travers le nuage (loi de
   Beer, effet « poudre » sur les bords, diffusion vers l'avant pour le liseré
   argenté à contre-jour), plus une lumière ambiante plus claire en haut.

   Le bruit est calculé une fois au chargement dans une texture 3D qui se
   répète sans couture. Animation : le bruit de fond dérive avec le vent, le
   détail remonte et bouillonne.

   Réglages gardés dans le navigateur sous CLOUD_KEY (page fourrure.html).
   ============================================================================ */
import * as THREE from 'three';

export const CLOUD_KEY = 'planete-nuages';
export const CLOUD_SHAPES = { 'Sphère': 'sphere', 'Cumulus': 'cumulus', 'Cube arrondi': 'cube', 'Tore': 'tore', 'Boudin': 'capsule', 'Nappe': 'nappe' };
export const CLOUD_DEFAULTS = {
  forme: 'cumulus', taille: 4.55, douceur: 0.33, couverture: 0.84, densite: 4, absorption: 5,
  echelle: 1.49, detail: 0.23, echelleDetail: 0.5,
  vent: 0.001, directionVent: 0, bouillonnement: 0,
  pas: 38, pasLumiere: 2, distanceLumiere: 0.29,
  argente: 0.23, poudre: 0.31, ambiance: 0.13, soleil: 1.95,
  couleurNuage: '#ffffff', couleurSoleil: '#fff1dc', ambianceHaut: '#d4e6ff', ambianceBas: '#8f98ad',
  hauteurSoleil: 30, azimutSoleil: 94,
  // dans le jeu : combien de nuages, écart de taille entre eux (0 : tous pareils), vitesse de rotation autour de la planète (radians par seconde)
  nombre: 35, variationTaille: 0.65, rotation: 0.025,
};
const clone = o => JSON.parse(JSON.stringify(o));
export function loadClouds() {
  const out = clone(CLOUD_DEFAULTS);
  try { const s = JSON.parse(localStorage.getItem(CLOUD_KEY) || 'null'); if (s) for (const k in out) if (k in s) out[k] = s[k]; } catch (e) { /* stockage indisponible */ }
  return out;
}
export function saveClouds(p) { try { localStorage.setItem(CLOUD_KEY, JSON.stringify(p)); } catch (e) { /* stockage indisponible */ } }

/* ---------- bruit 3D qui se répète (N³ voxels) ---------- */
function rng(seed) { return () => (seed = (Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0) / 4294967296; }
/** Worley périodique : 1 près des points, 0 loin (F cellules par période). */
function worleyField(N, F, seed) {
  const r = rng(seed), pts = new Float32Array(F * F * F * 3);
  for (let i = 0; i < pts.length; i++) pts[i] = r();
  const out = new Float32Array(N * N * N), inv = F / N;
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const px = (x + 0.5) * inv, py = (y + 0.5) * inv, pz = (z + 0.5) * inv, cx = Math.floor(px), cy = Math.floor(py), cz = Math.floor(pz);
    let best = 9;
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const ix = cx + dx, iy = cy + dy, iz = cz + dz, w = (((ix % F) + F) % F) + ((((iy % F) + F) % F) + (((iz % F) + F) % F) * F) * F;
      const qx = ix + pts[w * 3] - px, qy = iy + pts[w * 3 + 1] - py, qz = iz + pts[w * 3 + 2] - pz, d = qx * qx + qy * qy + qz * qz;
      if (d < best) best = d;
    }
    out[x + (y + z * N) * N] = Math.max(0, 1 - Math.sqrt(best));
  }
  return out;
}
/** Bruit de gradient (Perlin) périodique, en fBm de 3 octaves, ramené dans [0, 1]. */
function perlinField(N, F, seed) {
  const r = rng(seed), G = [];
  const grad = (P) => { const g = []; for (let i = 0; i < P * P * P; i++) { const a = r() * Math.PI * 2, z = r() * 2 - 1, s = Math.sqrt(1 - z * z); g.push([Math.cos(a) * s, Math.sin(a) * s, z]); } return g; };
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  const oct = [F, F * 2, F * 4].map(P => ({ P, g: grad(P) }));
  const out = new Float32Array(N * N * N);
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let sum = 0, amp = 1, norm = 0;
    for (const { P, g } of oct) {
      const px = x / N * P, py = y / N * P, pz = z / N * P, ix = Math.floor(px), iy = Math.floor(py), iz = Math.floor(pz), fx = px - ix, fy = py - iy, fz = pz - iz;
      let v = 0;
      for (let c = 0; c < 8; c++) {
        const ox = c & 1, oy = (c >> 1) & 1, oz = (c >> 2) & 1, k = ((ix + ox) % P) + (((iy + oy) % P) + ((iz + oz) % P) * P) * P, gr = g[k];
        const dot = gr[0] * (fx - ox) + gr[1] * (fy - oy) + gr[2] * (fz - oz);
        v += dot * (ox ? fade(fx) : 1 - fade(fx)) * (oy ? fade(fy) : 1 - fade(fy)) * (oz ? fade(fz) : 1 - fade(fz));
      }
      sum += v * amp; norm += amp; amp *= 0.5;
    }
    out[x + (y + z * N) * N] = Math.min(1, Math.max(0, sum / norm * 1.6 + 0.5));
  }
  return out;
}
/**
 * Texture 3D RGBA : R = Perlin-Worley (masses de fond), G, B, A = fBm de Worley de plus en plus fines (détail).
 * Environ une demi-seconde pour N = 64.
 */
export function makeCloudNoise(N = 64) {
  const w = [4, 8, 16, 32].map((F, i) => worleyField(N, F, 1234 + i * 77)), p = perlinField(N, 4, 99);
  const data = new Uint8Array(N * N * N * 4);
  for (let i = 0; i < N * N * N; i++) {
    const wf = w[0][i] * 0.625 + w[1][i] * 0.25 + w[2][i] * 0.125;
    const pw = Math.min(1, Math.max(0, (p[i] - (wf - 1)) / (1 - (wf - 1)) * 0.9 + (wf - 0.5) * 0.1));   // Perlin « regonflé » par le Worley
    data[i * 4] = pw * 255;
    data[i * 4 + 1] = (w[1][i] * 0.625 + w[2][i] * 0.25 + w[3][i] * 0.125) * 255;
    data[i * 4 + 2] = (w[2][i] * 0.625 + w[3][i] * 0.375) * 255;
    data[i * 4 + 3] = w[3][i] * 255;
  }
  const tex = new THREE.Data3DTexture(data, N, N, N);
  tex.format = THREE.RGBAFormat; tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping; tex.unpackAlignment = 1; tex.needsUpdate = true;
  return tex;
}

const SHAPE_ID = { sphere: 0, cumulus: 1, cube: 2, tore: 3, capsule: 4, nappe: 5 };
const VERT = /* glsl */`
uniform vec3 uSunWorld;
varying vec3 vObj, vCam, vSun, vSeed;
void main() {
  mat4 inv = inverse(modelMatrix);
  vObj = position; vCam = (inv * vec4(cameraPosition, 1.0)).xyz; vSun = normalize(mat3(inv) * uSunWorld);
  vSeed = fract(modelMatrix[3].xyz * 0.1371) * 7.0;   // chaque nuage a son propre morceau de bruit
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const FRAG = /* glsl */`
precision highp sampler3D;
uniform sampler3D uNoise;
uniform vec3 uWind, uCloudCol, uSunCol, uAmbTop, uAmbBottom;
uniform float uTime, uSoft, uCoverage, uDensity, uAbsorb, uScale, uDetail, uDetailScale, uBoil, uSteps, uLightSteps, uLightDist, uG, uPowder, uAmbient, uSun;
uniform int uShape;
varying vec3 vObj, vCam, vSun, vSeed;

float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
float sdShape(vec3 p) {
  if (uShape == 0) return length(p) - 0.72;
  if (uShape == 1) {   // cumulus : bulles fondues, base plate
    float d = length(p - vec3(0.0, -0.12, 0.0)) - 0.5;
    d = smin(d, length(p - vec3(0.45, -0.22, 0.08)) - 0.38, 0.2);
    d = smin(d, length(p - vec3(-0.46, -0.26, -0.05)) - 0.34, 0.2);
    d = smin(d, length(p - vec3(0.08, 0.22, 0.04)) - 0.4, 0.2);
    d = smin(d, length(p - vec3(-0.16, 0.08, 0.34)) - 0.32, 0.2);
    d = smin(d, length(p - vec3(0.22, -0.05, -0.36)) - 0.3, 0.2);
    return max(d, -(p.y + 0.42));
  }
  if (uShape == 2) { vec3 q = abs(p) - vec3(0.5); return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - 0.15; }
  if (uShape == 3) { vec2 q = vec2(length(p.xz) - 0.55, p.y); return length(q) - 0.24; }
  if (uShape == 4) { vec3 q = p; q.x -= clamp(q.x, -0.55, 0.55); q.y *= 1.3; return length(q) - 0.32; }
  vec3 q = abs(p) - vec3(0.78, 0.1, 0.78); return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - 0.08;   // nappe
}
float remap(float v, float a, float b, float c, float d) { return c + (v - a) / max(b - a, 1e-4) * (d - c); }
float density(vec3 p, bool detail) {
  float sd = sdShape(p);
  if (sd > uSoft) return 0.0;
  float env = 1.0 - smoothstep(-uSoft, uSoft * 0.35, sd);
  vec4 n = texture(uNoise, p * uScale + uWind * uTime + vSeed);
  float fbm = n.g * 0.625 + n.b * 0.25 + n.a * 0.125;
  float base = clamp(remap(n.r, fbm - 1.0, 1.0, 0.0, 1.0), 0.0, 1.0);
  float d = clamp(remap(base, 1.0 - env * uCoverage, 1.0, 0.0, 1.0), 0.0, 1.0) * env;
  if (detail && d > 0.0) {
    vec4 m = texture(uNoise, p * uDetailScale + uWind * uTime * 1.6 + vec3(0.0, -uTime * uBoil, 0.0) + vSeed * 1.7);
    float hf = m.g * 0.625 + m.b * 0.25 + m.a * 0.125;
    d = clamp(remap(d, hf * uDetail, 1.0, 0.0, 1.0), 0.0, 1.0);
  }
  return d * uDensity;
}
float hg(float c, float g) { float g2 = g * g; return (1.0 - g2) / pow(1.0 + g2 - 2.0 * g * c, 1.5); }
void main() {
  vec3 ro = vCam, rd = normalize(vObj - vCam), sunO = vSun;
  vec3 inv = 1.0 / rd, t0 = (-1.0 - ro) * inv, t1 = (1.0 - ro) * inv, tmin = min(t0, t1), tmax = max(t0, t1);
  float tN = max(max(max(tmin.x, tmin.y), tmin.z), 0.0), tF = min(min(tmax.x, tmax.y), tmax.z);
  if (tF <= tN) discard;
  float nSteps = clamp(ceil((tF - tN) * uSteps * 0.5), 2.0, 160.0), dt = (tF - tN) / nSteps;
  float t = tN + dt * fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233)) + uTime * 0.0) * 43758.5453);
  float cosT = dot(rd, sunO), phase = mix(hg(cosT, uG), hg(cosT, -0.2), 0.3);
  vec3 col = vec3(0.0); float T = 1.0;
  float ls = uLightDist / uLightSteps;
  for (int i = 0; i < 160; i++) {
    if (float(i) >= nSteps || T < 0.01) break;
    vec3 p = ro + rd * t;
    float d = density(p, true);
    if (d > 0.002) {
      float dl = 0.0;
      for (int j = 0; j < 12; j++) { if (float(j) >= uLightSteps) break; dl += density(p + sunO * ls * (float(j) + 0.5), false) * ls; }
      float beer = exp(-dl * uAbsorb * 0.45), powder = 1.0 - exp(-dl * uAbsorb * 0.9 - d * 0.5);
      float light = beer * mix(1.0, powder * 2.0, uPowder);
      vec3 amb = mix(uAmbBottom, uAmbTop, clamp(p.y * 0.5 + 0.5, 0.0, 1.0)) * uAmbient;
      vec3 L = (uSunCol * uSun * light * phase + amb) * uCloudCol;
      float tr = exp(-d * uAbsorb * dt);
      col += T * L * (1.0 - tr);
      T *= tr;
    }
    t += dt;
  }
  if (T > 0.995) discard;
  gl_FragColor = vec4(col, 1.0 - T);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/**
 * Matières des nuages (uniformes partagés) : `front` quand la caméra est dehors, `back` quand elle est dans la boîte.
 * Chaque nuage est une boîte de côté 2 (de -1 à 1) ; sa position, sa rotation et son échelle placent le volume.
 */
export function makeCloudMaterials(noise, p) {
  const u = {
    uNoise: { value: noise }, uSunWorld: { value: new THREE.Vector3(0, 1, 0) }, uWind: { value: new THREE.Vector3() },
    uCloudCol: { value: new THREE.Color() }, uSunCol: { value: new THREE.Color() }, uAmbTop: { value: new THREE.Color() }, uAmbBottom: { value: new THREE.Color() },
    uTime: { value: 0 }, uSoft: { value: 0.3 }, uCoverage: { value: 1 }, uDensity: { value: 1 }, uAbsorb: { value: 8 }, uScale: { value: 0.5 },
    uDetail: { value: 0.3 }, uDetailScale: { value: 2 }, uBoil: { value: 0 }, uSteps: { value: 64 }, uLightSteps: { value: 6 }, uLightDist: { value: 0.6 },
    uG: { value: 0.5 }, uPowder: { value: 0.5 }, uAmbient: { value: 0.7 }, uSun: { value: 3 }, uShape: { value: 1 },
  };
  const mk = side => { const m = new THREE.ShaderMaterial({ uniforms: u, vertexShader: VERT, fragmentShader: FRAG, side, transparent: true, depthWrite: false, premultipliedAlpha: true }); m.color = u.uCloudCol.value; return m; };
  const front = mk(THREE.FrontSide), back = mk(THREE.BackSide);
  /** Réglages → uniformes (taille : laissée à qui place les nuages). */
  function apply(q) {
    u.uShape.value = SHAPE_ID[q.forme] ?? 1; u.uSoft.value = q.douceur; u.uCoverage.value = q.couverture; u.uDensity.value = q.densite; u.uAbsorb.value = q.absorption;
    u.uScale.value = q.echelle; u.uDetail.value = q.detail; u.uDetailScale.value = q.echelleDetail; u.uBoil.value = q.bouillonnement;
    const a = q.directionVent * Math.PI / 180; u.uWind.value.set(Math.cos(a), 0, Math.sin(a)).multiplyScalar(q.vent);
    u.uSteps.value = q.pas; u.uLightSteps.value = q.pasLumiere; u.uLightDist.value = q.distanceLumiere;
    u.uG.value = q.argente; u.uPowder.value = q.poudre; u.uAmbient.value = q.ambiance; u.uSun.value = q.soleil;
    u.uCloudCol.value.set(q.couleurNuage); u.uSunCol.value.set(q.couleurSoleil); u.uAmbTop.value.set(q.ambianceHaut); u.uAmbBottom.value.set(q.ambianceBas);
  }
  const inv = new THREE.Matrix4(), loc = new THREE.Vector3();
  /** Face à dessiner selon que la caméra est dans la boîte ou non. */
  function pickSide(mesh, camera) {
    mesh.updateMatrixWorld(); loc.copy(camera.position).applyMatrix4(inv.copy(mesh.matrixWorld).invert());
    const inside = Math.abs(loc.x) < 1.02 && Math.abs(loc.y) < 1.02 && Math.abs(loc.z) < 1.02;
    mesh.material = inside ? back : front;
  }
  apply(p);
  return { u, front, back, apply, pickSide };
}

/** Un nuage seul (page de réglage) : une boîte mise à l'échelle par « taille ». */
export function makeCloud(noise, p) {
  const set = makeCloudMaterials(noise, p), mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), set.front);
  mesh.userData.apply = q => { mesh.scale.setScalar(q.taille); set.apply(q); };
  /** À chaque image : temps, soleil (direction monde vers le soleil), face selon la caméra. */
  mesh.userData.tick = (t, camera, sunDir) => { set.u.uTime.value = t; set.u.uSunWorld.value.copy(sunDir); set.pickSide(mesh, camera); };
  mesh.userData.apply(p);
  return mesh;
}
