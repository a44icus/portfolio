/* ============================================================================
   Fourrure et plumes en temps réel, par « coquilles » (shells) : la surface de
   l'animal est redessinée N fois, chaque couche un peu plus loin le long de la
   normale ; un motif calculé au pixel (brins ou plumes) découpe chaque couche.
   Une seule géométrie instanciée par partie (une instance = une couche) : un
   seul appel de dessin, quel que soit le nombre de couches.

   Brins : grille de cellules, un brin par cellule (position et longueur tirées
   au hasard), plus fin vers la pointe. Plumes : rangées décalées de plumes en
   écailles, celle de devant recouvrant la base de celle de derrière, avec
   rachis et barbes. Le motif est projeté sur le plan dominant de la normale.

   Les réglages (par animal) sont gardés dans le navigateur sous FUR_KEY et
   s'exportent en JSON depuis la page fourrure.html.
   ============================================================================ */
import * as THREE from 'three';

export const FUR_KEY = 'planete-fourrure';
export const MAX_LAYERS = 48;

const BASE = {
  actif: true, type: 'poils',
  longueur: 0.014, couches: 20, gravite: 0.3, frisure: 0.1, vent: 0.25,
  densite: 420, epaisseur: 0.9, effilement: 0.7,          // brins
  taillePlume: 0.012, rachis: 0.5, barbes: 0.5,           // plumes
  ombre: 0.55, pointes: 0.2, couleurPointe: '#fff4e0', variation: 0.12,
  motif: 'aucun', couleurMotif: '#5a3a22', echelleMotif: 25, forceMotif: 0.5,
  degagement: 1,                                          // fourrure écartée autour des yeux, du nez, du bec
  couleurs: {},                                           // longueur par couleur du modèle (0 : pas de fourrure)
};
export const FUR_DEFAULTS = {
  lapin: { ...BASE, longueur: 0.049, couches: 24, gravite: 0.39, frisure: 0.05, vent: 0.59, densite: 320, epaisseur: 1.49, effilement: 0,
    ombre: 0.19, pointes: 0.12, variation: 0.5, motif: 'taches', couleurMotif: '#452207', echelleMotif: 27, forceMotif: 0.5,
    couleurs: { '#b07a46': 1.25, '#c48c52': 0.55, '#f5e8d0': 1.2, '#fffaf2': 1 } },
  martin: { ...BASE, actif: false, type: 'plumes', longueur: 0.0205, couches: 48, gravite: 0, frisure: 0, vent: 0.63, taillePlume: 0.018, ombre: 0.52, pointes: 0.15, couleurPointe: '#ffffff', variation: 0.38, rachis: 0.4, echelleMotif: 33 },
  colibri: { ...BASE, actif: false, type: 'plumes', longueur: 0.021, couches: 12, taillePlume: 0.0065, gravite: 0.05, vent: 0.05, ombre: 0.4, pointes: 0.3, couleurPointe: '#e8fff4', variation: 0.1, rachis: 0.3 },
  abeille: { ...BASE, actif: false, longueur: 0.0065, couches: 14, densite: 900, epaisseur: 1, effilement: 0.4, gravite: 0.1, frisure: 0.35, vent: 0.1, ombre: 0.4, pointes: 0.15, couleurPointe: '#fff3c0', variation: 0.1 },
};
/** Couleurs du modèle sans fourrure par défaut (yeux, reflets, joues, becs, pattes, ailes transparentes), ou à poil ras. */
const NO_FUR = ['#16110f', '#ffffff', '#ff9db0', '#1d1d1d', '#e98597', '#ef5a3c', '#eef6ff', '#cfeee4', '#e0433a'];
const SHORT = { '#f3a9b6': 0.35, '#f5e8d0': 0.7 };
export const defaultColorFur = hex => (NO_FUR.includes(hex.toLowerCase()) ? 0 : SHORT[hex.toLowerCase()] ?? 1);

const clone = o => JSON.parse(JSON.stringify(o));
/** Réglages de tous les animaux : valeurs par défaut, complétées par ce qui est enregistré dans le navigateur. */
export function loadFur() {
  const out = clone(FUR_DEFAULTS);
  try {
    const saved = JSON.parse(localStorage.getItem(FUR_KEY) || 'null');
    if (saved) for (const k in out) if (saved[k]) for (const p in out[k]) if (p in saved[k]) out[k][p] = p === 'couleurs' ? { ...saved[k][p] } : saved[k][p];
  } catch (e) { /* stockage indisponible */ }
  return out;
}
export function saveFur(all) { try { localStorage.setItem(FUR_KEY, JSON.stringify(all)); } catch (e) { /* stockage indisponible */ } }

/**
 * Normales lissées par position (les sommets confondus d'une même pièce partagent leur normale) :
 * les couches restent fermées aux arêtes au lieu de s'ouvrir en éventail.
 */
export function smoothNormals(geo) {
  const p = geo.attributes.position, n = geo.attributes.normal, acc = new Map(), key = i => `${Math.round(p.getX(i) * 1e4)},${Math.round(p.getY(i) * 1e4)},${Math.round(p.getZ(i) * 1e4)}`;
  for (let i = 0; i < p.count; i++) { const k = key(i), a = acc.get(k) || [0, 0, 0]; a[0] += n.getX(i); a[1] += n.getY(i); a[2] += n.getZ(i); acc.set(k, a); }
  const out = new Float32Array(p.count * 3), v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { const a = acc.get(key(i)); v.set(a[0], a[1], a[2]).normalize(); out.set([v.x, v.y, v.z], i * 3); }
  geo.setAttribute('aN', new THREE.BufferAttribute(out, 3));
  return geo;
}

/**
 * Géométrie d'une partie d'animal : ses pièces fusionnées, avec la longueur de fourrure par sommet (aFur, selon la couleur
 * de la pièce) et des normales lissées (aN). Autour des petites pièces sans fourrure (yeux, joues, nez, bec), la fourrure
 * s'écarte. blocks : le constructeur de pièces de fauna.js.
 */
export function furPartGeometry(list, p, blocks, mergeGeometries) {
  const geos = list.map(pt => {
    const g = smoothNormals(blocks([pt])), hex = pt[6].toLowerCase(), f = p.couleurs[hex] ?? defaultColorFur(hex);
    g.setAttribute('aFur', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(f), 1));
    g.userData = { f, big: Math.max(pt[0], pt[1], pt[2]) };
    return g;
  });
  if (p.degagement > 0) {
    const holes = geos.filter(g => g.userData.f === 0 && g.userData.big < 0.06).map(g => { g.computeBoundingSphere(); return g.boundingSphere; });
    const v = new THREE.Vector3(), L = p.longueur;
    for (const g of geos) {
      if (!g.userData.f) continue;
      const pos = g.attributes.position, a = g.attributes.aFur;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i); let k = 1;
        for (const h of holes) { const inner = h.radius * (0.6 + 0.5 * p.degagement), outer = inner + (h.radius + 2 * L) * p.degagement; k = Math.min(k, THREE.MathUtils.smoothstep(v.distanceTo(h.center), inner, outer)); }
        a.setX(i, a.getX(i) * k);
      }
    }
  }
  return mergeGeometries(geos);
}

/** Géométrie des couches : la géométrie de base (avec aN et aFur) instanciée une fois par couche. */
export function makeFurGeometry(geo, layers, maxLen = 0.03) {
  const ig = new THREE.InstancedBufferGeometry();
  ig.index = geo.index;
  for (const k in geo.attributes) ig.setAttribute(k, geo.attributes[k]);
  ig.setAttribute('aLayer', new THREE.InstancedBufferAttribute(Float32Array.from({ length: MAX_LAYERS }, (_, i) => i), 1));
  ig.instanceCount = Math.min(MAX_LAYERS, layers);
  if (!geo.boundingSphere) geo.computeBoundingSphere();
  ig.boundingSphere = geo.boundingSphere.clone(); ig.boundingSphere.radius += maxLen * 2;
  return ig;
}

const GLSL_COMMON = /* glsl */`
uniform float uLen, uLayers, uTime, uGrav, uCurl, uWind, uDens, uThick, uTaper, uFeather, uRachis, uBarbs, uShade, uTip, uVar, uPat, uPatScale, uPatAmt;
uniform vec3 uTipCol, uPatCol;
varying float vFH, vFur;
varying vec3 vP0, vN0;
`;
const GLSL_FRAG_UTIL = /* glsl */`
float fHash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 fHash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float fHash13(vec3 p) { p = fract(p * .1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float fNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(fHash13(i), fHash13(i + vec3(1, 0, 0)), f.x), mix(fHash13(i + vec3(0, 1, 0)), fHash13(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(fHash13(i + vec3(0, 0, 1)), fHash13(i + vec3(1, 0, 1)), f.x), mix(fHash13(i + vec3(0, 1, 1)), fHash13(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
`;

/** Matière des couches (éclairée comme le reste du jeu). p : réglages d'un animal. */
export function makeFurMaterial(p) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 });
  const u = {
    uLen: { value: 0 }, uLayers: { value: 1 }, uTime: { value: 0 }, uGrav: { value: 0 }, uCurl: { value: 0 }, uWind: { value: 0 },
    uDens: { value: 1 }, uThick: { value: 1 }, uTaper: { value: 0.5 }, uFeather: { value: 0.01 }, uRachis: { value: 0 }, uBarbs: { value: 0 },
    uShade: { value: 0.5 }, uTip: { value: 0 }, uTipCol: { value: new THREE.Color() }, uVar: { value: 0 },
    uPat: { value: 0 }, uPatCol: { value: new THREE.Color() }, uPatScale: { value: 1 }, uPatAmt: { value: 0 },
  };
  mat.userData.u = u;
  mat.userData.feather = p.type === 'plumes';
  mat.customProgramCacheKey = () => (mat.userData.feather ? 'fur-feather' : 'fur-hair');
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    if (mat.userData.feather) sh.defines = { ...(sh.defines || {}), FUR_FEATHER: '' };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aLayer, aFur;
attribute vec3 aN;
${GLSL_COMMON}`)
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = normalize(aN);')
      .replace('#include <begin_vertex>', `
float fh = aLayer / max(1.0, uLayers - 1.0);
vFH = fh; vFur = aFur; vP0 = position; vN0 = normalize(aN);
float L = uLen * aFur;
mat3 toObj = transpose(mat3(modelMatrix));
vec3 gO = normalize(toObj * vec3(0.0, -1.0, 0.0)), wO = normalize(toObj * vec3(1.0, 0.0, 0.35));
float sway = sin(uTime * 2.3 + dot(position, vec3(23.0, 17.0, 31.0))) * 0.6 + sin(uTime * 3.7 + position.x * 41.0) * 0.3;
vec3 curl = vec3(sin(position.y * 157.0 + fh * 7.0), sin(position.z * 131.0 + fh * 7.0), sin(position.x * 149.0 + fh * 7.0)) * uCurl;
vec3 transformed = position + (vN0 * max(fh, 0.03) + (gO * uGrav + wO * sway * uWind) * fh * fh + curl * fh) * L;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
${GLSL_COMMON}
${GLSL_FRAG_UTIL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  if (vFur < 0.02) discard;                       // pas de fourrure ici : la surface d'origine reste visible
  float fh = vFH;
  vec3 an = abs(vN0);
  // projection sur le plan dominant ; q.y suit le sens des plumes (vers l'arrière, ou vers le bas sur l'avant)
  vec2 q = an.y >= an.x && an.y >= an.z ? vec2(vP0.x, -vP0.z) : an.x >= an.z ? vec2(vP0.y, -vP0.z) : vec2(vP0.x, -vP0.y);
  vec3 col = diffuseColor.rgb;
  float t = fh, rnd = 0.5;
#ifdef FUR_FEATHER
  vec2 g = q / uFeather;
  float row = floor(g.y), topR = 1e9, A = 0.0, B = 0.0;
  for (int dr = -1; dr <= 0; dr++) {
    float r = row + float(dr), off = mod(r, 2.0) * 0.5, cx0 = floor(g.x - off);
    for (int dc = -1; dc <= 1; dc++) {
      float cx = cx0 + float(dc) + off + 0.5;
      float a = (g.x - cx) / 0.62, b = (g.y - r) / 1.7;
      if (b < 0.0 || b > 1.0) continue;
      float w = b < 0.45 ? mix(0.6, 1.0, b / 0.45) : sqrt(max(0.0, 1.0 - pow((b - 0.45) / 0.55, 2.0)));
      if (abs(a) > w || r >= topR) continue;
      topR = r; A = a / max(w, 1e-3); B = b; rnd = fHash12(vec2(cx, r));
    }
  }
  if (fh > 0.0) {
    if (topR > 1e8) discard;
    float hf = (0.3 + 0.7 * B) * (1.0 - 0.45 * A * A);
    if (fh > hf) discard;
    t = fh / max(hf, 1e-3);
  }
  float rach = (1.0 - smoothstep(0.035, 0.09, abs(A))) * step(B, 0.92);
  float barb = step(0.5, fract((B * 2.0 - abs(A) * 1.3) * 7.0));
  col *= (1.0 - 0.28 * uRachis * rach) * (1.0 - 0.18 * uBarbs * barb);
  col = mix(col, uTipCol, uTip * smoothstep(0.7, 1.0, B) * smoothstep(0.55, 1.0, abs(A) * 0.5 + B * 0.6));
#else
  vec2 g = q * uDens, c = floor(g), f = fract(g);
  rnd = fHash12(c + 7.13);
  float lenK = 0.6 + 0.4 * fHash12(c + 3.31);
  if (fh > 0.0) {
    vec2 ctr = 0.3 + 0.4 * fHash22(c);
    float rad = 0.3 * uThick * (1.0 - pow(min(fh / lenK, 1.0), mix(4.0, 0.6, uTaper)));
    if (fh > lenK || length(f - ctr) > rad) discard;
    t = fh / lenK;
  }
  col = mix(col, uTipCol, uTip * smoothstep(0.55, 1.0, t));
#endif
  float shade = mix(1.0 - uShade, 1.0, t);
  col *= shade * (1.0 + (rnd - 0.5) * 2.0 * uVar);
  if (uPat > 0.5) {
    float nz = fNoise(vP0 * uPatScale) * 0.65 + fNoise(vP0 * uPatScale * 2.3) * 0.35;
    float pat = uPat < 1.5 ? smoothstep(0.56, 0.62, nz) : step(0.5, fract(vP0.y * uPatScale * 0.5 + nz * 0.8));
    col = mix(col, uPatCol * shade, pat * uPatAmt);
  }
  diffuseColor.rgb = col;
}`);
  };
  updateFurMaterial(mat, p);
  return mat;
}

/** Applique des réglages à une matière déjà créée (changer de type recompile le shader). */
export function updateFurMaterial(mat, p) {
  const u = mat.userData.u, feather = p.type === 'plumes';
  if (feather !== mat.userData.feather) { mat.userData.feather = feather; mat.needsUpdate = true; }
  u.uLen.value = p.longueur; u.uLayers.value = Math.min(MAX_LAYERS, p.couches);
  u.uGrav.value = p.gravite; u.uCurl.value = p.frisure * 0.25; u.uWind.value = p.vent * 0.5;
  u.uDens.value = p.densite; u.uThick.value = p.epaisseur; u.uTaper.value = p.effilement;
  u.uFeather.value = p.taillePlume; u.uRachis.value = p.rachis; u.uBarbs.value = p.barbes;
  u.uShade.value = p.ombre; u.uTip.value = p.pointes; u.uTipCol.value.set(p.couleurPointe); u.uVar.value = p.variation;
  u.uPat.value = { aucun: 0, taches: 1, rayures: 2 }[p.motif] ?? 0; u.uPatCol.value.set(p.couleurMotif); u.uPatScale.value = p.echelleMotif; u.uPatAmt.value = p.forceMotif;
}
