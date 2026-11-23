/* ============================================================================
   Faune discrète et un peu kawaii : lapins, crabes, tortues de Floride,
   grenouilles (souvent sur les nénuphars), martins-pêcheurs (qui volent d'arbre
   en arbre et pêchent), colibris, papillons, abeilles, poissons et nuées de
   moucherons. Peu d'animaux, placés surtout près des routes et des rivages.
   Style : formes rondes à facettes, petits yeux brillants posés sur le visage,
   joues roses. Mouvements adoucis (transitions progressives), comportements
   variés tirés au hasard, pattes de crabe articulées.
   Une seule matière partagée (couleurs dans les sommets) : presque aucun shader
   de plus à compiler, ce qui compte sur téléphone. Animée seulement en conduite.
   ============================================================================ */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SEA_R } from './world.js';
import { TUNE } from './tune.js';
import { loadFur, furPartGeometry, makeFurGeometry, makeFurMaterial } from './fur.js';

const K = 1.5;   // échelle générale : à taille réelle, on ne les remarquait pas depuis la caméra de conduite
const SPH = new THREE.SphereGeometry(0.5, 10, 7), CONE = new THREE.ConeGeometry(0.5, 1, 8), EUL = new THREE.Euler(), M4 = new THREE.Matrix4();
/**
 * Assemble des formes colorées en une seule géométrie (échelle K comprise).
 * Pièce : [largeur, hauteur, profondeur, x, y, z, couleur, rotX, forme, rotY, rotZ, ordre des rotations] ;
 * forme : 'b' pavé (défaut), 's' ellipsoïde, 'c' cône (pointe vers +y).
 */
function blocks(parts) {
  const col = new THREE.Color();
  return mergeGeometries(parts.map(([w, h, d, x, y, z, c, rx = 0, shape = 'b', ry = 0, rz = 0, order = 'XYZ']) => {
    const g = shape === 's' ? SPH.clone().scale(w, h, d) : shape === 'c' ? CONE.clone().scale(w, h, d) : new THREE.BoxGeometry(w, h, d);
    if (rx || ry || rz) g.applyMatrix4(M4.makeRotationFromEuler(EUL.set(rx, ry, rz, order)));
    g.translate(x, y, z);
    col.set(c); const n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    g.clearGroups();
    return g;
  })).scale(K, K, K);
}
const S = 's', C = 'c', PI = Math.PI;
const INK = '#16110f', SHINE = '#ffffff', BLUSH = '#ff9db0';

/* ---------- visages : yeux et joues posés exactement sur la surface (ellipsoïde de la tête) ---------- */
/** Ellipsoïde décrit comme une pièce : largeur, hauteur, profondeur et centre. */
const ell = (w, h, d, x, y, z) => ({ c: [x, y, z], r: [w / 2, h / 2, d / 2] });
/** Point de la surface avant de l'ellipsoïde, décalé de (dx, dy) depuis son centre, et la normale en ce point. */
function onSurf(E, dx, dy) {
  const [cx, cy, cz] = E.c, [a, b, c] = E.r, u = dx / a, v = dy / b, dz = c * Math.sqrt(Math.max(0.03, 1 - u * u - v * v));
  const n = new THREE.Vector3(dx / (a * a), dy / (b * b), dz / (c * c)).normalize();
  return { p: [cx + dx, cy + dy, cz + dz], n, rx: -Math.asin(n.y), ry: Math.atan2(n.x, n.z) };
}
/** Une pièce plate, collée à la surface (légèrement enfoncée de `inset`), orientée selon la normale. */
function flat(E, dx, dy, w, h, d, color, inset = 0.0012, lift = [0, 0, 0]) {
  const { p, n, rx, ry } = onSurf(E, dx, dy);
  return [w, h, d, p[0] - n.x * inset + lift[0], p[1] - n.y * inset + lift[1], p[2] - n.z * inset + lift[2], color, rx, S, ry, 0, 'YXZ'];
}
/** Un œil kawaii : pastille noire posée sur le visage et petit reflet blanc. */
const eye = (E, dx, dy, s = 1) => [flat(E, dx, dy, 0.017 * s, 0.02 * s, 0.006, INK, 0.0008), flat(E, dx + 0.003 * s * Math.sign(dx || 1) * -1, dy + 0.005 * s, 0.0065 * s, 0.0065 * s, 0.004, SHINE, -0.0028)];
/** Deux yeux et deux joues roses. */
const face = (E, dx, dy, s = 1, blush = true) => [...eye(E, -dx, dy, s), ...eye(E, dx, dy, s),
  ...(blush ? [flat(E, -(dx + 0.014 * s), dy - 0.02 * s, 0.024 * s, 0.012 * s, 0.005, BLUSH), flat(E, dx + 0.014 * s, dy - 0.02 * s, 0.024 * s, 0.012 * s, 0.005, BLUSH)] : [])];
/** Pièce centrée sur la surface (ex. museau, bec), enfoncée d'une fraction de sa profondeur. */
function onFace(E, dx, dy, w, h, d, color, sink = 0.45, shape = S, extraRx = 0) {
  const { p, n, rx, ry } = onSurf(E, dx, dy), k = d * (0.5 - sink);
  return [w, h, d, p[0] + n.x * k, p[1] + n.y * k, p[2] + n.z * k, color, rx + extraRx, shape, ry, 0, 'YXZ'];
}

/* ---------- modèles (y vers le haut, z vers l'avant ; unités avant l'échelle K ; la voiture mesure ~0,9) ----------
   Les parties mobiles (tête, oreilles, pinces…) sont décrites autour de leur pivot ; PIV donne la place du pivot. */
const FUR = '#b07a46', FUR2 = '#c48c52', CREAM = '#f5e8d0', PINK = '#f3a9b6';
const R_HEAD = ell(0.14, 0.12, 0.12, 0, 0.05, 0.04), R_MUZ = onFace(R_HEAD, 0, -0.026, 0.066, 0.044, 0.042, CREAM, 0.55);
const R_MUZE = ell(0.066, 0.044, 0.042, R_MUZ[3], R_MUZ[4], R_MUZ[5]);
const RABBIT = {
  body: [
    [0.16, 0.15, 0.19, 0, 0.095, -0.02, FUR, -0.15, S], [0.1, 0.1, 0.08, 0, 0.085, 0.05, CREAM, 0, S],
    [0.07, 0.09, 0.11, -0.06, 0.065, -0.05, FUR2, 0, S], [0.07, 0.09, 0.11, 0.06, 0.065, -0.05, FUR2, 0, S],
    [0.03, 0.03, 0.035, -0.03, 0.018, 0.07, CREAM, 0, S], [0.03, 0.03, 0.035, 0.03, 0.018, 0.07, CREAM, 0, S],
    [0.04, 0.022, 0.085, -0.06, 0.011, -0.03, CREAM, 0, S], [0.04, 0.022, 0.085, 0.06, 0.011, -0.03, CREAM, 0, S],
    [0.06, 0.06, 0.055, 0, 0.11, -0.115, '#fffaf2', 0, S],
  ],
  head: [   // pivot : le cou
    [0.14, 0.12, 0.12, 0, 0.05, 0.04, FUR, 0, S], R_MUZ, onFace(R_MUZE, 0, 0.012, 0.016, 0.011, 0.01, '#e98597', 0.5),
    ...face(R_HEAD, 0.036, 0.012, 1),
  ],
  ears: [   // pivot : le haut de la tête
    [0.036, 0.13, 0.024, -0.03, 0.06, -0.005, FUR, 0, S, 0, 0.16], [0.036, 0.13, 0.024, 0.03, 0.06, -0.005, FUR, 0, S, 0, -0.16],
    [0.018, 0.09, 0.008, -0.03, 0.058, 0.007, PINK, 0, S, 0, 0.16], [0.018, 0.09, 0.008, 0.03, 0.058, 0.007, PINK, 0, S, 0, -0.16],
  ],
  PIV: { head: [0, 0.15, 0.06], ears: [0, 0.1, 0.03] },
};
const CR = '#e45b34', CR2 = '#f27a4c', CR3 = '#c4472a';
const CR_SHELL = ell(0.16, 0.07, 0.12, 0, 0.065, 0), CR_EYE = [-1, 1].map(s => ell(0.024, 0.024, 0.022, s * 0.026, 0.126, 0.047));
const CRAB = {
  body: [   // carapace et yeux ; les pattes sont à part (articulées)
    [0.16, 0.07, 0.12, 0, 0.065, 0, CR, 0, S], [0.11, 0.03, 0.08, 0, 0.092, -0.005, CR2, 0, S], [0.14, 0.022, 0.1, 0, 0.042, 0, '#ffd7b4', 0, S],
    [0.008, 0.034, 0.008, -0.026, 0.104, 0.045, CR3], [0.008, 0.034, 0.008, 0.026, 0.104, 0.045, CR3],
    [0.024, 0.024, 0.022, -0.026, 0.126, 0.047, INK, 0, S], [0.024, 0.024, 0.022, 0.026, 0.126, 0.047, INK, 0, S],
    flat(CR_EYE[0], 0.002, 0.005, 0.008, 0.008, 0.004, SHINE, -0.002), flat(CR_EYE[1], 0.002, 0.005, 0.008, 0.008, 0.004, SHINE, -0.002),
    flat(CR_SHELL, -0.05, 0.0, 0.026, 0.013, 0.005, BLUSH), flat(CR_SHELL, 0.05, 0.0, 0.026, 0.013, 0.005, BLUSH),
  ],
  claws: [   // pivot : l'avant du corps ; les deux pinces se lèvent ensemble
    [0.055, 0.02, 0.02, -0.045, 0, 0.012, CR3, 0, 'b', 0.6], [0.055, 0.02, 0.02, 0.045, 0, 0.012, CR3, 0, 'b', -0.6],
    [0.052, 0.042, 0.048, -0.075, 0.006, 0.045, CR, 0, S, 0.3], [0.046, 0.038, 0.042, 0.072, 0.005, 0.043, CR, 0, S, -0.3],
    [0.012, 0.012, 0.03, -0.08, 0.016, 0.073, '#ffd2b0', 0, S, 0.3], [0.01, 0.01, 0.026, 0.077, 0.014, 0.068, '#ffd2b0', 0, S, -0.3],
  ],
  PIV: { claws: [0, 0.06, 0.05] },
};
// pattes de crabe : deux segments (cuisse, jambe), chacun partant de son articulation vers +x
const LEG_A = [[0.065, 0.016, 0.016, 0.0325, 0, 0, CR3]], LEG_B = [[0.09, 0.013, 0.013, 0.045, 0, 0, CR3], [0.014, 0.01, 0.01, 0.092, 0, 0, '#a53a22']];   // la jambe redescend jusqu'au sable
const LEG_LA = 0.065 * K, LEG_Z = [0.032, -0.004, -0.04], LEG_YAW = [0.45, 0.05, -0.4];
const TSH = '#4a6a2c', TSK = '#5f8336', T_HEAD = ell(0.068, 0.058, 0.066, 0, 0.012, 0.046);
const TURTLE = {
  body: [   // carapace lisse et bombée, bordure claire, plastron jaune
    [0.15, 0.03, 0.18, 0, 0.035, 0, '#e2d47a', 0, S], [0.15, 0.09, 0.18, 0, 0.06, 0, TSH, 0, S], [0.158, 0.016, 0.188, 0, 0.046, 0, '#a9b65c', 0, S],
    [0.09, 0.03, 0.11, 0, 0.09, 0, '#557a32', 0, S],
    [0.055, 0.02, 0.036, -0.078, 0.026, 0.062, TSK, 0, S, 0.5], [0.055, 0.02, 0.036, 0.078, 0.026, 0.062, TSK, 0, S, -0.5],
    [0.05, 0.02, 0.034, -0.072, 0.024, -0.062, TSK, 0, S, -0.5], [0.05, 0.02, 0.034, 0.072, 0.024, -0.062, TSK, 0, S, 0.5],
    [0.016, 0.035, 0.016, 0, 0.034, -0.1, TSK, -PI / 2, C],
  ],
  head: [   // pivot : le bord avant de la carapace ; la tête sort et rentre
    [0.034, 0.03, 0.045, 0, 0, 0.01, TSK, 0, S], [0.068, 0.058, 0.066, 0, 0.012, 0.046, TSK, 0, S],
    [0.01, 0.012, 0.02, -0.033, 0.012, 0.04, '#e0433a', 0, S], [0.01, 0.012, 0.02, 0.033, 0.012, 0.04, '#e0433a', 0, S],
    ...face(T_HEAD, 0.019, 0.008, 0.85),
  ],
  PIV: { head: [0, 0.05, 0.085] },
};
const KB = '#22aee0', KB2 = '#1488c2', KO = '#f5843a', B_HEAD = ell(0.072, 0.066, 0.07, 0, 0.026, 0.012);
const BIRD = {
  body: [   // martin-pêcheur tout rond
    [0.068, 0.078, 0.09, 0, 0.062, 0, KB, -0.35, S], [0.058, 0.064, 0.07, 0, 0.054, 0.014, KO, -0.35, S],
    [0.028, 0.012, 0.05, 0, 0.032, -0.055, '#0f6aa8', 0.7], [0.008, 0.018, 0.008, -0.013, 0.009, 0.012, '#ef5a3c'], [0.008, 0.018, 0.008, 0.013, 0.009, 0.012, '#ef5a3c'],
  ],
  head: [   // pivot : le cou
    [0.072, 0.066, 0.07, 0, 0.026, 0.012, '#1b9bd2', 0, S], onFace(B_HEAD, 0, -0.016, 0.07, 0.026, 0.03, KO, 0.75), onFace(B_HEAD, 0, -0.027, 0.04, 0.016, 0.02, '#fbf6ee', 0.6),
    onFace(B_HEAD, 0, -0.004, 0.014, 0.05, 0.014, '#1d1d1d', 0.1, C, PI / 2),
    ...face(B_HEAD, 0.024, 0.008, 0.85),
  ],
  PIV: { head: [0, 0.1, 0.02] },
};
const WING = [[0.06, 0.012, 0.08, 0.03, 0, -0.01, KB2, 0, S], [0.03, 0.013, 0.04, 0.05, 0, -0.035, '#0e5e94', 0, S]];
const mirror = parts => parts.map(([w, h, d, x, ...r]) => [w, h, d, -x, ...r]);   // côté droit : miroir sans échelle négative (sinon faces inversées)
const PERCH = [[0.03, 0.48, 0.03, 0, 0.24, 0, '#8a6644', 0, 'b', 0, 0.04], [0.1, 0.02, 0.02, 0.03, 0.47, 0, '#7a5a3a', 0, 'b', 0, -0.15], [0.03, 0.02, 0.02, -0.02, 0.45, 0.01, '#7a5a3a']];
const F_BODY = ell(0.046, 0.054, 0.1, 0, 0, 0);
const FISH = [   // blanc, teinté par poisson : dos plus sombre, nageoires, queue fourchue
  [0.046, 0.054, 0.1, 0, 0, 0, '#ffffff', 0, S], [0.048, 0.026, 0.08, 0, 0.014, -0.005, '#d0d0d0', 0, S],
  [0.004, 0.034, 0.034, 0, 0.013, -0.064, '#ececec', 0.5], [0.004, 0.034, 0.034, 0, -0.013, -0.064, '#ececec', -0.5],
  [0.004, 0.022, 0.036, 0, 0.032, -0.006, '#e2e2e2', 0.3], [0.028, 0.004, 0.016, -0.026, -0.01, 0.018, '#f2f2f2', 0, 'b', 0.5], [0.028, 0.004, 0.016, 0.026, -0.01, 0.018, '#f2f2f2', 0, 'b', -0.5],
  flat(F_BODY, -0.018, 0.008, 0.01, 0.012, 0.004, INK, 0.0005), flat(F_BODY, 0.018, 0.008, 0.01, 0.012, 0.004, INK, 0.0005),
];
const BFLY_WING = [   // blanc, teinté par papillon : bordure sombre et taches claires
  [0.062, 0.003, 0.048, 0.032, 0, 0.014, '#ffffff', 0, S, -0.25], [0.046, 0.003, 0.038, 0.026, 0, -0.022, '#f2f2f2', 0, S, 0.35],
  [0.016, 0.004, 0.012, 0.055, 0.001, 0.026, '#2e2622', 0, S], [0.01, 0.004, 0.01, 0.04, 0.001, 0.018, '#fffdf4', 0, S], [0.013, 0.004, 0.011, 0.04, 0.001, -0.032, '#2e2622', 0, S],
];
const BFLY_BODY = [[0.013, 0.013, 0.055, 0, 0, -0.005, '#3a302a', 0, S], [0.018, 0.018, 0.018, 0, 0.002, 0.026, '#3a302a', 0, S],
  [0.002, 0.002, 0.035, -0.006, 0.012, 0.044, '#3a302a', -0.6], [0.002, 0.002, 0.035, 0.006, 0.012, 0.044, '#3a302a', -0.6],
  [0.006, 0.006, 0.006, -0.012, 0.022, 0.058, '#3a302a', 0, S], [0.006, 0.006, 0.006, 0.012, 0.022, 0.058, '#3a302a', 0, S]];
const FG = '#74bd45', FG2 = '#4f8c2e', FB = '#e7efb4';
const FR_HEAD = ell(0.11, 0.055, 0.08, 0, 0.075, 0.05), FR_BUMP = [-1, 1].map(s => ell(0.034, 0.03, 0.032, s * 0.032, 0.097, 0.052));
const FROG = [   // grenouille ronde : yeux en petites bosses sur le dessus, sourire, joues roses
  [0.12, 0.075, 0.12, 0, 0.05, -0.012, FG, -0.25, S], [0.1, 0.05, 0.085, 0, 0.034, 0.018, FB, -0.25, S],
  [0.11, 0.055, 0.08, 0, 0.075, 0.05, FG, 0.05, S],
  [0.034, 0.03, 0.032, -0.032, 0.097, 0.052, FG, 0, S], [0.034, 0.03, 0.032, 0.032, 0.097, 0.052, FG, 0, S],
  ...eye(FR_BUMP[0], 0, 0.002, 0.85), ...eye(FR_BUMP[1], 0, 0.002, 0.85),
  flat(FR_HEAD, -0.042, -0.006, 0.024, 0.012, 0.005, BLUSH), flat(FR_HEAD, 0.042, -0.006, 0.024, 0.012, 0.005, BLUSH),
  flat(FR_HEAD, 0, -0.012, 0.036, 0.004, 0.004, '#355f20', 0.0005),
  [0.05, 0.042, 0.08, -0.058, 0.032, -0.035, FG, 0, S, 0.35], [0.05, 0.042, 0.08, 0.058, 0.032, -0.035, FG, 0, S, -0.35],
  [0.04, 0.012, 0.055, -0.072, 0.007, 0.012, FG2, 0, S, -0.3], [0.04, 0.012, 0.055, 0.072, 0.007, 0.012, FG2, 0, S, 0.3],
  [0.018, 0.05, 0.018, -0.036, 0.026, 0.068, FG, 0.2, S], [0.018, 0.05, 0.018, 0.036, 0.026, 0.068, FG, 0.2, S],
  [0.03, 0.008, 0.024, -0.04, 0.004, 0.082, FG2, 0, S], [0.03, 0.008, 0.024, 0.04, 0.004, 0.082, FG2, 0, S],
];
const THROAT = [[0.05, 0.036, 0.04, 0, 0, 0, '#f3f7cf', 0, S]];
const BEE = [   // abeille dodue : abdomen rayé, thorax duveteux, petites ailes claires
  [0.036, 0.034, 0.046, 0, 0, -0.02, '#f7c22a', 0, S], [0.037, 0.034, 0.009, 0, 0, -0.012, '#231b14', 0, S], [0.033, 0.03, 0.009, 0, 0, -0.03, '#231b14', 0, S],
  [0.03, 0.03, 0.028, 0, 0.002, 0.01, '#8a5e24', 0, S], [0.024, 0.024, 0.02, 0, 0, 0.029, '#231b14', 0, S],
  [0.034, 0.003, 0.022, -0.021, 0.02, 0.002, '#eef6ff', 0, S, 0.3, 0.35], [0.034, 0.003, 0.022, 0.021, 0.02, 0.002, '#eef6ff', 0, S, -0.3, -0.35],
];
const H_HEAD = ell(0.038, 0.036, 0.038, 0, 0.014, 0.042);
const HUM = [   // colibri : dos vert irisé, gorge rubis, long bec fin
  [0.04, 0.04, 0.07, 0, 0, 0, '#2fb06c', 0, S], [0.034, 0.03, 0.05, 0, -0.01, 0.004, '#eef2f0', 0, S], [0.032, 0.022, 0.022, 0, 0.002, 0.03, '#e2295c', 0, S],
  [0.038, 0.036, 0.038, 0, 0.014, 0.042, '#29a062', 0, S], onFace(H_HEAD, 0, -0.002, 0.006, 0.055, 0.006, '#1d1d1d', 0.05, C, PI / 2),
  [0.022, 0.006, 0.036, 0, -0.004, -0.05, '#1c7a4a', 0.3],
  ...face(H_HEAD, 0.012, 0.005, 0.55, false),
];
const HUM_WING = [[0.055, 0.004, 0.02, 0.028, 0, 0, '#cfeee4', 0, S]];
const FISH_COLORS = ['#ff8a3c', '#ffd84a', '#4cc8ff', '#ff62a8', '#86f070', '#b88cff'];
const BFLY_COLORS = ['#ff9a3c', '#fff07a', '#6cc0ff', '#ff7fbf', '#ffffff', '#cdaaff'];

export function makeFauna(planet, quality = 'high') {
  const low = quality === 'low';
  const group = new THREE.Group(); group.visible = false;   // seulement en conduite
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, flatShading: true });
  const WR = planet.waterR, U = 1 / SEA_R;
  // tirage reproductible : la faune est toujours au même endroit
  let seed = 0x5eed1234; const rnd = () => (seed = (Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0) / 4294967296;
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), tA = new THREE.Vector3(), tB = new THREE.Vector3();
  /** Deux directions tangentes en dir. */
  const tangents = (dir, a, b) => { a.set(0, 1, 0); if (Math.abs(dir.y) > 0.9) a.set(1, 0, 0); a.addScaledVector(dir, -a.dot(dir)).normalize(); b.crossVectors(dir, a); };
  /** Déplace une direction de (dx, dz) unités dans le repère tangent (a, b). */
  const offset = (out, dir, a, b, dx, dz) => out.copy(dir).addScaledVector(a, dx * U).addScaledVector(b, dz * U).normalize();
  const above = d => planet.heightDir(d) - WR;   // hauteur du sol au-dessus de l'eau
  /** L'eau est-elle à moins de `dist` unités ? (renvoie la direction vers l'eau, ou null) */
  function waterNear(dir, dist) {
    tangents(dir, tA, tB);
    for (let k = 0; k < 8; k++) { const a = k / 8 * PI * 2; offset(v1, dir, tA, tB, Math.cos(a) * dist, Math.sin(a) * dist); if (planet.isWet(v1)) return v2.copy(tA).multiplyScalar(Math.cos(a)).addScaledVector(tB, Math.sin(a)).clone(); }
    return null;
  }
  /** Candidats : surtout le long des routes (à quelques unités de la chaussée), parfois n'importe où. */
  function candidate(nearRoad = 0.75, sideMin = 1.5, sideMax = 6) {
    const E = planet.edges;
    if (E.length && rnd() < nearRoad) { const e = E[Math.floor(rnd() * E.length)], s = (rnd() < 0.5 ? -1 : 1) * (sideMin + rnd() * (sideMax - sideMin)); return e.point(rnd() * e.len, s); }
    return new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize();
  }
  /** Cherche n emplacements qui vérifient ok(dir), espacés d'au moins gap unités. */
  function spots(n, ok, gap, gen, tries = 1500) {
    const out = [];
    for (let i = 0; i < tries && out.length < n; i++) {
      const d = gen(); if (!d || !ok(d)) continue;
      if (out.some(o => o.dot(d) > Math.cos(gap * U))) continue;
      out.push(d.clone());
    }
    return out;
  }
  const dry = d => !planet.isWet(d) && !planet.onPlaza(d, 0.02) && planet.pathDir(d) < 0.15;
  const nearTree = (spread = 2.5) => { const T = planet.treeDirs; if (!T.length) return null; const t = T[Math.floor(rnd() * T.length)]; tangents(t, tA, tB); return offset(v1, t, tA, tB, (rnd() - 0.5) * spread, (rnd() - 0.5) * spread).clone(); };

  /* ---------- placement d'un objet posé sur la sphère ---------- */
  const mB = new THREE.Matrix4(), xA = new THREE.Vector3(), qT = new THREE.Quaternion(), qP = new THREE.Quaternion(), AXX = new THREE.Vector3(1, 0, 0), AXY = new THREE.Vector3(0, 1, 0), AXZ = new THREE.Vector3(0, 0, 1);
  /** Oriente o : haut = dir, avant = fwd (tangent), puis tangage et roulis ; rayon r. */
  function pose(o, dir, fwd, r, pitch = 0, roll = 0) {
    xA.crossVectors(dir, fwd).normalize();
    mB.makeBasis(xA, dir, fwd); o.quaternion.setFromRotationMatrix(mB);
    if (pitch) o.quaternion.multiply(qP.setFromAxisAngle(AXX, pitch));
    if (roll) o.quaternion.multiply(qP.setFromAxisAngle(AXZ, roll));
    o.position.copy(dir).multiplyScalar(r);
  }
  /** Avance d'une distance (unités) dans la direction fwd ; fwd reste tangent. */
  function step(dir, fwd, dist) { dir.addScaledVector(fwd, dist * U).normalize(); fwd.addScaledVector(dir, -fwd.dot(dir)).normalize(); }
  /** Tourne fwd autour de la verticale dir. */
  const turn = (dir, fwd, a) => fwd.applyAxisAngle(dir, a).addScaledVector(dir, -fwd.dot(dir)).normalize();
  /** Fait pivoter fwd vers la direction cible, en douceur (rate : vitesse). */
  const steer = (dir, fwd, target, rate, dt) => fwd.lerp(v3.copy(target).projectOnPlane(dir).normalize(), 1 - Math.exp(-rate * dt)).projectOnPlane(dir).normalize();
  const randFwd = dir => { tangents(dir, tA, tB); const a = rnd() * PI * 2; return tA.clone().multiplyScalar(Math.cos(a)).addScaledVector(tB, Math.sin(a)).normalize(); };
  /** Direction tangente qui s'éloigne de p (position monde). */
  const away = (dir, p, out) => out.copy(dir).sub(v1.copy(p).normalize()).projectOnPlane(dir).normalize();
  const near = (dir, r, p, d) => p && v2.copy(dir).multiplyScalar(r).distanceToSquared(p) < d * d;
  /** Un animal articulé : un groupe racine (posé sur la sphère) + des parties mobiles placées à leur pivot. */
  /* ---------- fourrure et plumes (réglées sur la page fourrure.html) : couches dessinées seulement près de la caméra ---------- */
  const FUR = loadFur(), FUR_OF = new Map([[RABBIT, 'lapin'], [BIRD, 'martin']]), furMats = {}, furAnimals = [];
  /** Maillage d'une partie ; avec ses couches de fourrure si l'animal en porte. */
  function partMesh(key, list) {
    const p = key && FUR[key];
    if (!p || !p.actif) return new THREE.Mesh(blocks(list), mat);
    const geo = furPartGeometry(list, p, blocks, mergeGeometries), m = new THREE.Mesh(geo, mat);
    const fm = furMats[key] || (furMats[key] = makeFurMaterial(p));
    const shell = new THREE.Mesh(makeFurGeometry(geo, Math.max(4, Math.round(p.couches * (low ? 0.5 : 1))), p.longueur * 2), fm);
    shell.userData.fur = true; shell.castShadow = false; m.add(shell);
    return m;
  }
  function rig(model, extra = {}) {
    const root = new THREE.Group(), parts = {}, key = FUR_OF.get(model);
    root.add(partMesh(key, model.body));
    for (const k of Object.keys(model.PIV || {})) {
      const p = new THREE.Group(); p.position.fromArray(model.PIV[k]).multiplyScalar(K); p.add(partMesh(key, model[k]));
      (k === 'ears' ? parts.head : root).add(p); parts[k] = p;
    }
    group.add(root);
    const a = Object.assign({ root, ...parts }, extra);
    if (key && FUR[key].actif) furAnimals.push(a);
    return a;
  }
  const ease = x => x * x * (3 - 2 * x), easeIO = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const lerpTo = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
  /** Étirement / écrasement pendant un saut (k : 0 au décollage, 1 à l'atterrissage). */
  function squash(o, k, amount = 1) {
    let sy = 1;
    if (k < 0.18) sy = 1 + 0.22 * amount * Math.sin(k / 0.18 * PI / 2);
    else if (k < 0.8) sy = 1 + 0.22 * amount * (1 - (k - 0.18) / 0.62) * 0.6;
    else sy = 1 - 0.2 * amount * Math.sin((k - 0.8) / 0.2 * PI);
    const sx = 1 / Math.sqrt(sy); o.scale.set(sx, sy, sx);
  }
  /** Choisit au hasard une action dans { nom: poids }. */
  const pick = w => { let s = 0; for (const k in w) s += w[k]; let r = rnd() * s; for (const k in w) { if ((r -= w[k]) <= 0) return k; } return Object.keys(w)[0]; };

  /* ---------- lapins : broutent, regardent, se dressent, font leur toilette, se couchent ; bonds ; fuient la voiture ---------- */
  // réserves : on en crée plus qu'il n'en faut ; le panneau « Animaux » choisit combien sont visibles (les autres ne coûtent rien)
  const POOL = k => Math.round({ lapins: 24, crabes: 24, tortues: 14, martins: 6, colibris: 14, papillons: 16, abeilles: 14, poissons: 18, moucherons: 100 }[k] * (low ? 0.65 : 1));
  const rabbits = spots(POOL('lapins'), d => dry(d) && planet.sandAt(d) < 0.1 && above(d) > 1 && above(d) < 14, 6, () => candidate(0.85, 2, 6), 5000)
    .map(d => rig(RABBIT, { dir: d.clone(), home: d.clone(), fwd: randFwd(d), tgt: new THREE.Vector3(), state: 'idle', act: 'graze', actT: rnd() * 2, timer: 1 + rnd() * 3, hopT: 0, hops: 0, hopLen: 0.3 * K, hopDur: 0.32, look: 0, twitch: 0, ph: rnd() * 9, sit: 0, lie: 0, groom: 0 }));
  /* ---------- crabes : marchent de côté sur leurs pattes articulées, pinces qui s'agitent ---------- */
  const crabs = spots(POOL('crabes'), d => !planet.isWet(d) && planet.sandAt(d) > 0.5 && waterNear(d, 1.4), 5, () => candidate(0.5, 1, 9), 5000)
    .map(d => rig(CRAB, { dir: d.clone(), home: d.clone(), fwd: randFwd(d), sgn: 1, speed: 0, want: 0, timer: rnd() * 2, wave: 0, gp: rnd() * 6, ph: rnd() * 9, spin: 0 }));
  const legA = new THREE.InstancedMesh(blocks(LEG_A), mat, Math.max(1, crabs.length * 6)), legB = new THREE.InstancedMesh(blocks(LEG_B), mat, Math.max(1, crabs.length * 6));
  [legA, legB].forEach(m => { m.count = crabs.length * 6; m.frustumCulled = false; if (crabs.length) group.add(m); });
  /* ---------- petites tortues de Floride : marchent, se chauffent au soleil, rentrent la tête si la voiture approche ---------- */
  const turtles = spots(POOL('tortues'), d => !planet.isWet(d) && above(d) < 0.6 && waterNear(d, 0.9), 6, () => candidate(0.5, 1, 9), 5000)
    .map(d => rig(TURTLE, { dir: d.clone(), home: d.clone(), fwd: randFwd(d), tgt: randFwd(d), timer: rnd() * 4, act: 'rest', out: 1, look: 0, ph: rnd() * 9, speed: 0 }));
  /* ---------- grenouilles : surtout sur les nénuphars (près des routes) ; quelques-unes sur la berge ---------- */
  const frogGeo = blocks(FROG), throatGeo = blocks(THROAT);
  const pads = planet.pads || [], padR = planet.padR || WR + 0.012;
  const roadPts = []; planet.edges.forEach(e => { for (let s = 0; s <= e.len; s += 2 * U) roadPts.push(e.point(s, 0)); });
  const roadDist = d => { let best = -1; for (const p of roadPts) { const c = p.dot(d); if (c > best) best = c; } return Math.acos(Math.min(1, best)) * SEA_R; };
  const padPos = (i, out) => out.copy(pads[i].home).multiplyScalar(padR).add(pads[i].off).normalize();
  const padCand = pads.map((p, i) => i).filter(i => roadDist(pads[i].home) < 9);
  const padFrogIdx = []; for (let k = 0; k < 200 && padFrogIdx.length < (low ? 7 : 11) && padCand.length; k++) { const i = padCand[Math.floor(rnd() * padCand.length)]; if (!padFrogIdx.some(j => pads[j].home.dot(pads[i].home) > Math.cos(4 * U))) padFrogIdx.push(i); }
  const makeFrog = (d, pad) => { const root = new THREE.Group(), th = new THREE.Mesh(throatGeo, mat); th.position.set(0, 0.05 * K, 0.08 * K); th.scale.setScalar(0.35); root.add(new THREE.Mesh(frogGeo, mat), th); group.add(root);
    return { root, th, dir: d.clone(), home: d.clone(), fwd: randFwd(d), state: 'sit', timer: 1 + rnd() * 4, hopT: 0, hopLen: 0.25 * K, hopDur: 0.4, hops: 0, croak: 0, ph: rnd() * 9, pad, toPad: -1, from: new THREE.Vector3(), look: 0 }; };
  const frogs = [...padFrogIdx.map(i => makeFrog(padPos(i, new THREE.Vector3()), i)),
    ...spots(low ? 3 : 5, d => !planet.isWet(d) && above(d) < 0.7 && planet.pathDir(d) < 0.1 && waterNear(d, 0.8), 6, () => candidate(0.5, 1, 9), 3000).map(d => makeFrog(d, -1))];
  // ordre : deux sur un nénuphar pour une sur la berge (le nombre réglé prend les premières)
  { const pf = frogs.filter(f => f.pad >= 0), sf = frogs.filter(f => f.pad < 0); frogs.length = 0; while (pf.length || sf.length) { if (pf.length) frogs.push(pf.shift()); if (pf.length) frogs.push(pf.shift()); if (sf.length) frogs.push(sf.shift()); } }
  /** Nénuphar voisin (à moins de `dist` unités), ou -1. */
  const padNear = (i, dist) => { const h = pads[i].home, c = []; for (let j = 0; j < pads.length; j++) if (j !== i && pads[j].home.dot(h) > Math.cos(dist * U)) c.push(j); return c.length ? c[Math.floor(rnd() * c.length)] : -1; };
  /* ---------- martins-pêcheurs : piquet au bord de l'eau + quelques arbres alentour ; volent d'arbre en arbre, pêchent depuis le piquet ---------- */
  const wingGeo = blocks(WING), wingRGeo = blocks(mirror(WING)), perchGeo = blocks(PERCH);
  const birds = spots(POOL('martins'), d => !planet.isWet(d) && above(d) < 1.2 && planet.pathDir(d) < 0.1 && waterNear(d, 1.2), 12, () => candidate(0.7, 1, 8), 5000).map(d => {
    const toW = waterNear(d, 1.2), fwd = toW.clone().projectOnPlane(d).normalize(), target = d.clone().addScaledVector(fwd, 1.9 * U).normalize();
    if (!planet.isWet(target)) target.copy(d).addScaledVector(fwd, 1.3 * U).normalize();
    const perch = new THREE.Mesh(perchGeo, mat); pose(perch, d, fwd, planet.heightDir(d) - 0.03); group.add(perch);
    // perchoirs dans les arbres voisins (à moins de 10 unités), dans le bas du feuillage
    const trees = planet.treeDirs.filter(t => t.dot(d) > Math.cos(10 * U) && t.dot(d) < Math.cos(2 * U));
    const roosts = [{ dir: d.clone(), h: planet.heightDir(d) + 0.45 * K, post: true }];
    for (let k = 0; k < 6 && trees.length; k++) { const t = trees[Math.floor(rnd() * trees.length)]; tangents(t, tA, tB); const a = rnd() * PI * 2; const p = offset(new THREE.Vector3(), t, tA, tB, Math.cos(a) * 0.32, Math.sin(a) * 0.32); roosts.push({ dir: p, h: planet.heightDir(p) + 1.0 + rnd() * 0.35, post: false }); }
    const b = rig(BIRD, { perch, roosts, at: 0, target, state: 'perch', t: 0, dur: 1, timer: 2 + rnd() * 4, look: 0, lookT: 0, dir: d.clone(), f: fwd.clone(), fwd0: fwd.clone(), from: null, to: null, ph: rnd() * 9, h: roosts[0].h, flapT: 0 });
    b.wl = FUR.martin.actif ? partMesh('martin', WING) : new THREE.Mesh(wingGeo, mat); b.wr = FUR.martin.actif ? partMesh('martin', mirror(WING)) : new THREE.Mesh(wingRGeo, mat);
    b.wl.position.set(0.03 * K, 0.075 * K, -0.005 * K); b.wr.position.set(-0.03 * K, 0.075 * K, -0.005 * K); b.root.add(b.wl, b.wr);
    return b;
  });
  /* ---------- poissons colorés : petits bancs en eau peu profonde, le dos à fleur d'eau ; fuient la voiture ---------- */
  const schoolHomes = spots(POOL('poissons'), d => {
    if (!planet.isWet(d)) return false; const dep = -above(d); if (dep < 0.25 || dep > 2.2) return false;
    tangents(d, tA, tB); for (let k = 0; k < 6; k++) { const a = k / 6 * PI * 2; if (!planet.isWet(offset(v1, d, tA, tB, Math.cos(a) * 1.3, Math.sin(a) * 1.3))) return false; }
    return true;
  }, 6, () => candidate(0.6, 3, 12), 6000);
  const fishList = [];
  schoolHomes.forEach(h => { const n = 2 + Math.floor(rnd() * 2); for (let i = 0; i < n; i++) fishList.push({ home: h, a: rnd() * 6.28, rad: 0.45 + rnd() * 0.7, spd: (0.35 + rnd() * 0.3) * (rnd() < 0.5 ? -1 : 1), dep: 0.015 + rnd() * 0.02, jump: -1, next: 3 + rnd() * 15, dir: h.clone(), f: new THREE.Vector3(), ph: rnd() * 9, scare: 0, off: new THREE.Vector3(), flee: new THREE.Vector3(), pos: h.clone().multiplyScalar(WR) }); });
  const fishMesh = new THREE.InstancedMesh(blocks(FISH), mat, Math.max(1, fishList.length)); fishMesh.count = fishList.length; fishMesh.frustumCulled = false;
  fishList.forEach((f, i) => fishMesh.setColorAt(i, new THREE.Color(FISH_COLORS[i % FISH_COLORS.length])));
  if (fishList.length) group.add(fishMesh);
  /* ---------- papillons : autour des arbres près des routes, le jour ; battements, vol plané, pauses sur une fleur ---------- */
  const bflyHomes = spots(POOL('papillons'), d => dry(d) && above(d) > 1.2, 8, () => (rnd() < 0.7 ? nearTree(3) : candidate(0.9, 1.5, 5)));
  const bflies = [];
  bflyHomes.forEach(h => { const n = 2 + Math.floor(rnd() * 2); for (let i = 0; i < n; i++) bflies.push({ home: h, p: rnd() * 100, s: 0.55 + rnd() * 0.4, dir: h.clone(), prev: h.clone(), f: new THREE.Vector3(1, 0, 0), flap: rnd() * 6, rest: 0, restT: 4 + rnd() * 10, spot: h.clone(), restDir: h.clone() }); });
  const NB = Math.max(1, bflies.length), bflyWingGeo = blocks(BFLY_WING), bwL = new THREE.InstancedMesh(bflyWingGeo, mat, NB), bwR = new THREE.InstancedMesh(bflyWingGeo, mat, NB), bBody = new THREE.InstancedMesh(blocks(BFLY_BODY), mat, NB);
  [bwL, bwR, bBody].forEach(m => { m.count = bflies.length; m.frustumCulled = false; if (m !== bBody) bflies.forEach((b, i) => m.setColorAt(i, new THREE.Color(BFLY_COLORS[i % BFLY_COLORS.length]))); if (bflies.length) group.add(m); });
  /* ---------- abeilles : petits groupes autour des fleurs, le jour ; butinent en vol stationnaire puis filent ---------- */
  const beeHomes = spots(POOL('abeilles'), d => dry(d) && above(d) > 1 && planet.sandAt(d) < 0.1, 8, () => candidate(0.9, 1.5, 5), 4000);
  const bees = [];
  beeHomes.forEach(h => { for (let i = 0; i < 3; i++) bees.push({ home: h, p: rnd() * 100, s: 0.8 + rnd() * 0.5, dir: h.clone(), prev: h.clone(), f: new THREE.Vector3(1, 0, 0) }); });
  const beeMesh = new THREE.InstancedMesh(blocks(BEE), mat, Math.max(1, bees.length)); beeMesh.count = bees.length; beeMesh.frustumCulled = false; if (bees.length) group.add(beeMesh);
  /* ---------- colibris : quelques-uns près des fleurs ; vol stationnaire, ailes qui vibrent, puis ils filent ---------- */
  const humGeo = blocks(HUM), humWL = blocks(HUM_WING), humWR = blocks(mirror(HUM_WING));
  const hums = spots(POOL('colibris'), d => dry(d) && above(d) > 1.2 && planet.sandAt(d) < 0.1, 9, () => (rnd() < 0.6 ? nearTree(2.5) : candidate(0.9, 1.5, 5))).map(h => {
    const root = new THREE.Group(), wl = new THREE.Mesh(humWL, mat), wr = new THREE.Mesh(humWR, mat);
    wl.position.set(0.012 * K, 0.014 * K, 0.005 * K); wr.position.set(-0.012 * K, 0.014 * K, 0.005 * K);
    root.add(new THREE.Mesh(humGeo, mat), wl, wr); group.add(root);
    return { root, wl, wr, home: h, p: rnd() * 100, dir: h.clone(), prev: h.clone(), f: randFwd(h), ph: rnd() * 9, pitch: -0.65 };
  });
  /* ---------- moucherons : une multitude de points minuscules, en nuées qui tourbillonnent près de l'eau et sous les arbres ---------- */
  const swarms = spots(POOL('moucherons'), d => !planet.isWet(d) && !planet.onPlaza(d, 0.02), 2.5, () => (rnd() < 0.3 ? nearTree(3) : candidate(0.92, 0.6, 3.5)), 6000)
    .map(h => ({ home: h, p: rnd() * 100, n: low ? 22 : 38, r: 0.3 + rnd() * 0.25, hgt: 0.45 + rnd() * 0.45 }));
  const NM = swarms.reduce((s, w) => s + w.n, 0), midgePos = new Float32Array(Math.max(1, NM) * 3), midgeP = new Float32Array(Math.max(1, NM) * 4);
  for (let i = 0; i < NM * 4; i++) midgeP[i] = rnd() * 100;
  // couleur par point : sombre le jour (moucherons), jaune-vert lumineux qui clignote la nuit (lucioles)
  const midgeCol = new Float32Array(Math.max(1, NM) * 3); for (let i = 0; i < NM; i++) { midgeCol[i * 3] = 0.12; midgeCol[i * 3 + 1] = 0.095; midgeCol[i * 3 + 2] = 0.08; }
  const midgeGeo = new THREE.BufferGeometry(); midgeGeo.setAttribute('position', new THREE.BufferAttribute(midgePos, 3)); midgeGeo.setAttribute('color', new THREE.BufferAttribute(midgeCol, 3));
  // point rond (et non carré) : un disque net au centre ; la nuit, un halo doux autour (les lucioles)
  const midgeU = { uGlow: { value: 0 } };
  const midgeMat = new THREE.PointsMaterial({ vertexColors: true, size: 0.09, sizeAttenuation: true, transparent: true, depthWrite: false });
  midgeMat.onBeforeCompile = sh => {
    sh.uniforms.uGlow = midgeU.uGlow;
    sh.fragmentShader = 'uniform float uGlow;\n' + sh.fragmentShader.replace('#include <map_particle_fragment>', `#include <map_particle_fragment>
      { float r = length(gl_PointCoord - 0.5) * 2.0;
        float core = 1.0 - smoothstep(0.2, 0.3, r), halo = 1.0 - smoothstep(0.2, 1.0, r);
        float a = max(core, halo * halo * 0.55 * uGlow);
        if (a < 0.01) discard;
        diffuseColor.a *= a; }`);
  };
  midgeMat.customProgramCacheKey = () => 'midges-round';
  const midges = new THREE.Points(midgeGeo, midgeMat);   // ~5 pixels à quelques mètres (à 0,03 on ne les voyait pas)
  midges.frustumCulled = false; if (NM) group.add(midges);
  swarms.forEach(w => { const R0 = planet.heightDir(w.home) + w.hgt; w.c = w.home.clone().multiplyScalar(R0); });   // positions de départ
  { let k = 0; swarms.forEach(w => { for (let i = 0; i < w.n; i++, k++) { midgePos[k * 3] = w.c.x; midgePos[k * 3 + 1] = w.c.y; midgePos[k * 3 + 2] = w.c.z; } }); }

  // pose initiale
  rabbits.forEach(r => pose(r.root, r.dir, r.fwd, planet.heightDir(r.dir)));
  crabs.forEach(c => pose(c.root, c.dir, c.fwd, planet.heightDir(c.dir)));
  turtles.forEach(t => pose(t.root, t.dir, t.fwd, Math.max(planet.heightDir(t.dir), WR - 0.05)));
  birds.forEach(b => pose(b.root, b.roosts[0].dir, b.f, b.h));
  frogs.forEach(f => pose(f.root, f.dir, f.fwd, f.pad >= 0 ? padR : planet.heightDir(f.dir)));

  /* ---------- nombre d'individus visibles (panneau « Animaux ») ---------- */
  const LISTS = { lapins: rabbits, crabes: crabs, tortues: turtles, grenouilles: frogs, martins: birds, colibris: hums, papillons: bflies, abeilles: bees, poissons: fishList, moucherons: swarms };
  const activeN = k => { const n = TUNE.animaux && TUNE.animaux.nombre ? TUNE.animaux.nombre[k] : undefined; return Math.min(LISTS[k].length, Math.max(0, Math.round((n ?? LISTS[k].length) * (low ? 0.65 : 1)))); };
  /** Les n premiers d'une liste sont visibles, les autres cachés. */
  const act = (list, n, key = 'root') => { for (let i = 0; i < list.length; i++) if (list[i][key]) list[i][key].visible = i < n; return n >= list.length ? list : list.slice(0, n); };
  const o3 = new THREE.Object3D(), tmpF = new THREE.Vector3(), qW = new THREE.Quaternion();
  const mHip = new THREE.Matrix4(), mTmp = new THREE.Matrix4(), mKnee = new THREE.Matrix4(), ROT_Y_PI = new THREE.Matrix4().makeRotationY(PI);
  const homeDist = (dir, home) => Math.acos(Math.min(1, dir.dot(home))) * SEA_R;
  const towardHome = (dir, home, out) => out.copy(home).projectOnPlane(dir).normalize();

  /**
   * walk : en conduite (sinon rien n'est animé ni dessiné) ; car : position de la voiture ;
   * carSpeed : sa vitesse ; night : 0 (jour) à 1 (nuit).
   */
  function update(dt, t, walk, car, carSpeed, night) {
    group.visible = walk;
    if (!walk) return;
    const scary = carSpeed > 0.4, day = night < 0.6;
    const A = TUNE.animaux || {}, sz = k => (A.taille || 1) * (A[k] || 1);   // tailles réglables (panneau « Animaux »)
    for (const k in furMats) furMats[k].userData.u.uTime.value = t;
    for (const a of furAnimals) { const near = a.root.position.distanceToSquared(car) < 22 * 22; a.root.traverse(o => { if (o.userData.fur) o.visible = near; }); }
    const nR = activeN('lapins'), nC = activeN('crabes'), nT = activeN('tortues'), nF = activeN('grenouilles'), nB = activeN('martins'), nH = activeN('colibris'), nP = activeN('papillons'), nA = activeN('abeilles'), nFi = activeN('poissons'), nM = activeN('moucherons');
    const zR = sz('lapins'), zC = sz('crabes'), zT = sz('tortues'), zF = sz('grenouilles'), zB = sz('martins'), zH = sz('colibris'), zP = sz('papillons'), zA = sz('abeilles'), zFi = sz('poissons'), zM = sz('moucherons');

    /* ===== lapins ===== */
    for (const r of act(rabbits, nR)) {
      const R0 = planet.heightDir(r.dir);
      if (r.state !== 'flee' && near(r.dir, R0, car, scary ? 3.2 : 1.6)) { away(r.dir, car, r.tgt); r.state = 'flee'; r.hops = 4 + Math.floor(rnd() * 2); r.hopT = 0; r.hopDur = 0.22; r.hopLen = 0.42 * K; }
      if (r.twitch <= 0 && rnd() < dt * 0.4) r.twitch = 0.35;
      r.twitch -= dt;
      const moving = r.state === 'hop' || r.state === 'flee';
      r.ears.rotation.x = lerpTo(r.ears.rotation.x, (moving ? -0.75 : r.sit > 0.5 ? 0.1 : -0.15) + (r.twitch > 0 ? Math.sin(r.twitch * 40) * 0.18 : 0), 10, dt);
      r.ears.rotation.z = lerpTo(r.ears.rotation.z, r.twitch > 0 ? Math.sin(r.twitch * 25) * 0.08 : 0, 10, dt);
      if (r.state === 'idle') {
        // une action après l'autre : brouter, regarder, se dresser, toilette, se coucher
        if ((r.actT -= dt) < 0) { r.act = pick({ graze: 4, look: 3, sit: 1.2, groom: 1, lie: 0.6 }); r.actT = 1.2 + rnd() * (r.act === 'lie' ? 6 : 2.5); r.look = (rnd() - 0.5) * 1.6; }
        if ((r.timer -= dt) < 0 && r.act !== 'lie') {
          if (homeDist(r.dir, r.home) > 3.5) towardHome(r.dir, r.home, r.tgt); else r.tgt.copy(r.fwd).applyAxisAngle(r.dir, (rnd() - 0.5) * 2.4);
          r.state = 'turn'; r.hops = 1 + Math.floor(rnd() * 3); r.hopT = 0; r.hopDur = 0.3 + rnd() * 0.08; r.hopLen = (0.24 + rnd() * 0.12) * K;
        }
        r.sit = lerpTo(r.sit, r.act === 'sit' ? 1 : 0, 4, dt); r.lie = lerpTo(r.lie, r.act === 'lie' ? 1 : 0, 3, dt); r.groom = lerpTo(r.groom, r.act === 'groom' ? 1 : 0, 6, dt);
        const nib = r.act === 'graze' ? 0.4 + Math.max(0, Math.sin(t * 10 + r.ph)) * 0.08 : 0;
        r.head.rotation.x = lerpTo(r.head.rotation.x, nib - 0.35 * r.sit + 0.25 * r.groom + Math.sin(t * 22) * 0.05 * r.groom, 6, dt);
        r.head.rotation.y = lerpTo(r.head.rotation.y, r.act === 'look' || r.act === 'sit' ? r.look : 0, 4, dt);
        r.head.rotation.z = lerpTo(r.head.rotation.z, r.groom * 0.35 * Math.sin(t * 3 + r.ph), 6, dt);
        const br = 1 + Math.sin(t * (r.lie > 0.5 ? 1.8 : 3.2) + r.ph) * 0.025;
        r.root.scale.set(1 / Math.sqrt(br) * (1 + 0.08 * r.lie), br * (1 - 0.18 * r.lie), 1 / Math.sqrt(br) * (1 + 0.06 * r.lie));
        r.root.scale.multiplyScalar(zR); pose(r.root, r.dir, r.fwd, R0, -0.62 * r.sit);
      } else if (r.state === 'turn') {   // il pivote d'abord vers sa direction, en douceur
        steer(r.dir, r.fwd, r.tgt, 9, dt); r.sit = lerpTo(r.sit, 0, 8, dt); r.lie = lerpTo(r.lie, 0, 8, dt);
        r.head.rotation.x = lerpTo(r.head.rotation.x, -0.1, 8, dt); r.head.rotation.y = lerpTo(r.head.rotation.y, 0, 8, dt);
        r.root.scale.setScalar(zR); pose(r.root, r.dir, r.fwd, R0, -0.62 * r.sit);
        if (r.fwd.dot(v3.copy(r.tgt).projectOnPlane(r.dir).normalize()) > 0.97) r.state = 'hop';
      } else {               // bonds (fuite : plus longs, plus rapides)
        if (r.state === 'flee') steer(r.dir, r.fwd, r.tgt, 12, dt);
        const k0 = r.hopT; r.hopT = Math.min(1, r.hopT + dt / r.hopDur);
        tmpF.copy(r.dir); step(tmpF, v2.copy(r.fwd), r.hopLen * 1.2);
        if (planet.isWet(tmpF) || planet.onPlaza(tmpF, 0.02)) { r.tgt.copy(r.fwd).applyAxisAngle(r.dir, PI * (0.6 + rnd() * 0.8)); r.state = 'turn'; }
        else step(r.dir, r.fwd, r.hopLen * (easeIO(r.hopT) - easeIO(k0)));
        const lift = Math.sin(PI * r.hopT) * 0.12 * K * (r.state === 'flee' ? 1.2 : 1);
        r.head.rotation.x = lerpTo(r.head.rotation.x, -0.15, 10, dt); r.head.rotation.y = lerpTo(r.head.rotation.y, 0, 10, dt); r.head.rotation.z = lerpTo(r.head.rotation.z, 0, 10, dt);
        squash(r.root, r.hopT, 0.9); r.root.scale.multiplyScalar(zR);
        pose(r.root, r.dir, r.fwd, planet.heightDir(r.dir) + lift, -0.3 * Math.cos(PI * r.hopT));
        if (r.hopT >= 1) { r.hopT = 0; if (--r.hops <= 0) { r.state = 'idle'; r.timer = 1.5 + rnd() * 4.5; r.root.scale.setScalar(1); } }
      }
    }
    /* ===== crabes : vitesse qui monte et descend en douceur, pattes en deux trépieds qui alternent ===== */
    legA.count = legB.count = nC * 6;
    act(crabs, nC).forEach((c, ci) => {
      const R0 = planet.heightDir(c.dir), side = v1.crossVectors(c.dir, c.fwd).normalize();   // ils marchent de côté
      if (near(c.dir, R0, car, scary ? 2.6 : 1.2)) { c.want = 1.15; c.timer = 0.8; c.sgn = side.dot(away(c.dir, car, tmpF)) > 0 ? 1 : -1; }
      else if ((c.timer -= dt) < 0) {
        const a = pick({ walk: 3, pause: 3, wave: 1, spin: 0.8 });
        c.want = a === 'walk' ? 0.25 + rnd() * 0.25 : 0; c.timer = a === 'walk' ? 0.6 + rnd() * 1.4 : 0.8 + rnd() * 2.2;
        if (a === 'wave') c.wave = 1.4; if (a === 'spin') c.spin = (rnd() - 0.5) * 2.4;
        if (a === 'walk') { c.sgn = rnd() < 0.5 ? 1 : -1; if (homeDist(c.dir, c.home) > 1.6) c.sgn = side.dot(towardHome(c.dir, c.home, tmpF)) > 0 ? 1 : -1; }
      }
      c.speed = lerpTo(c.speed, c.want, c.want > c.speed ? 6 : 4, dt);
      if (Math.abs(c.spin) > 0.01) { const da = c.spin * Math.min(1, dt * 2.5); turn(c.dir, c.fwd, da); c.spin -= da; }
      if (c.speed > 0.02) {
        tmpF.copy(c.dir).addScaledVector(side, c.sgn * 0.12 * U).normalize();
        if (planet.isWet(tmpF) || planet.sandAt(tmpF) < 0.2) { c.sgn = -c.sgn; c.speed *= 0.3; }
        else { c.dir.addScaledVector(side, c.sgn * c.speed * dt * U).normalize(); c.fwd.addScaledVector(c.dir, -c.fwd.dot(c.dir)).normalize(); }
      }
      c.gp += dt * (2 + c.speed * 30);
      c.wave -= dt;
      const walking = c.speed > 0.05;
      const clawT = walking ? -0.45 : c.wave > 0 ? -0.65 + Math.sin(c.wave * 12) * 0.35 : -0.12 + Math.sin(t * 1.3 + c.ph) * 0.08;
      c.claws.rotation.x = lerpTo(c.claws.rotation.x, clawT, 8, dt);
      const bob = walking ? Math.abs(Math.sin(c.gp)) * 0.007 : 0, br = 1 + (walking ? 0 : Math.sin(t * 2.4 + c.ph) * 0.02);
      c.root.scale.set(zC, br * zC, zC);
      pose(c.root, c.dir, c.fwd, R0 + bob, 0, walking ? Math.sin(c.gp) * 0.05 * c.sgn : 0);
      // pattes : deux segments par patte, trépieds alternés (avant et arrière d'un côté avec le milieu de l'autre)
      c.root.updateMatrix();
      for (let s = -1; s <= 1; s += 2) for (let i = 0; i < 3; i++) {
        const k = ci * 6 + (s > 0 ? 3 : 0) + i, ph = c.gp + ((i % 2 === 0) === (s > 0) ? 0 : PI);
        const lift = walking ? Math.max(0, Math.sin(ph)) * Math.min(1, c.speed * 2.5) : 0;
        const sweep = walking ? Math.cos(ph) * 0.28 * Math.min(1, c.speed * 2.5) * c.sgn * s : Math.sin(t * 0.7 + i + c.ph) * 0.03;
        mHip.copy(c.root.matrix).multiply(mTmp.makeTranslation(s * 0.066 * K, 0.07 * K, LEG_Z[i] * K));   // (l'échelle du crabe est dans sa matrice)
        if (s < 0) mHip.multiply(ROT_Y_PI);
        mHip.multiply(mTmp.makeRotationY((LEG_YAW[i] + sweep) * (s > 0 ? -1 : 1))).multiply(mTmp.makeRotationZ(0.3 + lift * 0.5));
        legA.setMatrixAt(k, mHip);
        mKnee.copy(mHip).multiply(mTmp.makeTranslation(LEG_LA, 0, 0)).multiply(mTmp.makeRotationZ(-1.75 - lift * 0.1));
        legB.setMatrixAt(k, mKnee);
      }
    });
    if (crabs.length) { legA.instanceMatrix.needsUpdate = true; legB.instanceMatrix.needsUpdate = true; }
    /* ===== tortues : marche lente et ondulée, bain de soleil, regard alentour, tête rentrée face au danger ===== */
    for (const tu of act(turtles, nT)) {
      const R0 = planet.heightDir(tu.dir), scared = near(tu.dir, R0, car, scary ? 2.5 : 1.3);
      if (scared) { tu.act = 'hide'; tu.timer = 2.5; }
      else if ((tu.timer -= dt) < 0) {
        tu.act = pick({ walk: 3, rest: 2, look: 2, bask: 1.5 }); tu.timer = tu.act === 'walk' ? 2 + rnd() * 5 : 2 + rnd() * 5;
        if (tu.act === 'walk') { if (homeDist(tu.dir, tu.home) > 1.4) towardHome(tu.dir, tu.home, tu.tgt); else tu.tgt.copy(tu.fwd).applyAxisAngle(tu.dir, (rnd() - 0.5) * 2); }
        if (tu.act === 'look') tu.look = (rnd() - 0.5) * 1.3;
      }
      const wet = planet.isWet(tu.dir), walking = tu.act === 'walk';
      tu.speed = lerpTo(tu.speed, walking ? (wet ? 0.14 : 0.06) : 0, 2, dt);
      if (walking) steer(tu.dir, tu.fwd, tu.tgt, 1.5, dt);
      if (tu.speed > 0.002) step(tu.dir, tu.fwd, tu.speed * dt * (wet ? 1 : 0.6 + 0.4 * Math.abs(Math.sin(t * 3 + tu.ph))));
      if (walking && -above(tu.dir) > 0.9) tu.tgt.copy(tu.fwd).negate();   // pas trop loin du bord
      tu.out = lerpTo(tu.out, tu.act === 'hide' ? 0 : tu.act === 'bask' ? 1.25 : 1, tu.act === 'hide' ? 10 : 2, dt);
      tu.head.position.z = (0.085 - 0.05 * (1 - Math.min(1, tu.out)) + 0.012 * Math.max(0, tu.out - 1) * 4) * K; tu.head.scale.setScalar(0.6 + 0.4 * Math.min(1, tu.out));
      tu.head.rotation.y = lerpTo(tu.head.rotation.y, walking ? Math.sin(t * 2 + tu.ph) * 0.15 : tu.act === 'look' ? tu.look + Math.sin(t * 0.8) * 0.2 : 0, 2.5, dt);
      tu.head.rotation.x = lerpTo(tu.head.rotation.x, tu.act === 'bask' ? -0.35 : walking ? Math.sin(t * 3 + tu.ph) * 0.06 : 0, 3, dt);
      const g = planet.heightDir(tu.dir), sw = tu.speed > 0.01 && !wet ? Math.sin(t * 3 + tu.ph) : 0;
      tu.root.scale.setScalar(zT); pose(tu.root, tu.dir, tu.fwd, wet ? Math.max(g, WR - 0.07) : g, sw * 0.02, sw * 0.05);
    }
    /* ===== martins-pêcheurs ===== */
    act(birds, nB, 'perch');
    for (const b of act(birds, nB)) {
      const roost = b.roosts[b.at]; b.root.scale.setScalar(zB); b.perch.scale.setScalar(zB);
      let flap = 0;
      if (b.state === 'perch') {   // posé : tête par à-coups vifs, queue qui hoche
        if ((b.lookT -= dt) < 0) { b.lookT = 0.4 + rnd() * 1.6; b.look = (rnd() - 0.5) * 2.2; }
        b.head.rotation.y = lerpTo(b.head.rotation.y, b.look, 18, dt); b.head.rotation.x = lerpTo(b.head.rotation.x, 0, 8, dt);
        pose(b.root, roost.dir, b.f, roost.h, Math.max(0, Math.sin(t * 1.7 + b.ph)) ** 8 * 0.25);
        if ((b.timer -= dt) < 0) {
          const next = roost.post ? pick({ dive: 1.2, fly: 1 }) : pick({ fly: 1.6, home: 1 });
          if (next === 'dive') { b.state = 'dive'; b.t = 0; b.dur = 0.9; }
          else {
            const to = next === 'home' || b.roosts.length < 2 ? 0 : 1 + Math.floor(rnd() * (b.roosts.length - 1));
            if (to === b.at) { b.timer = 1 + rnd() * 2; continue; }
            b.from = b.at; b.to = to; b.state = 'fly'; b.t = 0;
            b.dur = Math.max(0.9, homeDist(roost.dir, b.roosts[to].dir) / 3.2);   // vol rapide et droit, au ras du sol
          }
        }
      } else if (b.state === 'fly') {
        b.t += dt / b.dur; const s = Math.min(1, b.t), e = easeIO(s), A = b.roosts[b.from], B = b.roosts[b.to];
        b.dir.copy(A.dir).lerp(B.dir, e).normalize();
        const ground = planet.heightDir(b.dir), arc = Math.sin(PI * s) * 0.35;
        const h = Math.max(A.h + (B.h - A.h) * e + arc + Math.sin(s * PI * 6) * 0.04, ground + 0.4);
        tmpF.copy(B.dir).sub(A.dir).projectOnPlane(b.dir).normalize(); if (tmpF.lengthSq() > 0.5) b.f.copy(tmpF);
        b.head.rotation.y = lerpTo(b.head.rotation.y, 0, 12, dt); b.head.rotation.x = lerpTo(b.head.rotation.x, 0, 8, dt);
        pose(b.root, b.dir, b.f, h, s > 0.85 ? -0.5 * (s - 0.85) / 0.15 : 0.12);   // il se redresse pour se poser
        flap = 1;
        if (s >= 1) { b.at = b.to; b.state = 'perch'; b.timer = 2.5 + rnd() * 6; if (B.post) b.f.copy(b.fwd0); }
      } else {                       // pêche : plongeon depuis le piquet, puis retour
        b.t += dt / (b.state === 'dive' ? 0.9 : 1.3);
        const s = Math.min(1, b.t), dive = b.state === 'dive', P0 = b.roosts[0];
        const from = dive ? P0.dir : b.target, to = dive ? b.target : P0.dir;
        b.dir.copy(from).lerp(to, easeIO(s)).normalize();
        const h = dive ? P0.h + (WR - 0.06 - P0.h) * s * s : WR + (P0.h - WR) * easeIO(s) + Math.sin(PI * s) * 0.35;
        tmpF.copy(to).sub(from).projectOnPlane(b.dir).normalize(); b.f.copy(tmpF);
        b.head.rotation.x = lerpTo(b.head.rotation.x, dive ? 0.4 : 0, 6, dt);
        pose(b.root, b.dir, b.f, h, dive ? 0.9 * s : -0.25 * Math.sin(PI * s));
        flap = dive ? (s < 0.6 ? 1 : 0) : 1;
        if (s >= 1) { if (dive) { b.state = 'rise'; b.t = 0; } else { b.state = 'perch'; b.at = 0; b.f.copy(b.fwd0); b.timer = 3 + rnd() * 7; } }
      }
      b.flapT += dt * (flap ? 26 : 0);
      const a = flap ? 0.2 + Math.abs(Math.sin(b.flapT)) * 1.1 : lerpTo(b.wl.rotation.z, 0.04, 12, dt);
      b.wl.rotation.z = a; b.wr.rotation.z = -a;
    }
    /* ===== grenouilles ===== */
    for (const f of act(frogs, nF)) {
      const onPad = f.pad >= 0, R0 = onPad ? padR : planet.heightDir(f.dir), wet = !onPad && planet.isWet(f.dir);
      if (onPad && f.state !== 'hop') padPos(f.pad, f.dir);   // elle suit son nénuphar quand la vague le pousse
      if ((f.state === 'sit') && near(f.dir, R0, car, scary ? 2.4 : 1.1)) {
        if (onPad) { f.state = 'dive'; f.t = 0; f.timer = 3 + rnd() * 4; }   // plouf, elle disparaît sous l'eau
        else { const w = waterNear(f.dir, 1.2); if (w) f.fwd.copy(w).projectOnPlane(f.dir).normalize(); else away(f.dir, car, f.fwd); f.state = 'hop'; f.hops = 2; f.hopT = 0; f.hopLen = 0.55 * K; f.hopDur = 0.45; f.toPad = -1; }
      }
      if (f.state === 'sit') {
        if ((f.timer -= dt) < 0) {
          f.timer = 2 + rnd() * 6;
          const a = pick({ hop: onPad ? 1 : 1.5, look: 2, croak: 1 });
          if (a === 'look') f.look = (rnd() - 0.5) * 1.4;
          else if (a === 'croak') f.croak = 1.4;
          else if (onPad) { const j = padNear(f.pad, 1.1); if (j >= 0) { f.toPad = j; f.from.copy(f.dir); f.state = 'hop'; f.hops = 1; f.hopT = 0; f.hopDur = 0.5; } }
          else { if (homeDist(f.dir, f.home) > 1.2) towardHome(f.dir, f.home, f.fwd); else turn(f.dir, f.fwd, (rnd() - 0.5) * 2.4); f.state = 'hop'; f.hops = 1; f.hopT = 0; f.hopLen = 0.25 * K; f.hopDur = 0.4; f.toPad = -1; }
        }
        if (f.look) { const da = f.look * Math.min(1, dt * 3); turn(f.dir, f.fwd, da); f.look -= da; if (Math.abs(f.look) < 0.01) f.look = 0; }
        f.croak -= dt; f.th.scale.setScalar(lerpTo(f.th.scale.x, 0.35 + (f.croak > 0 ? 0.65 * Math.abs(Math.sin(f.croak * 9)) : 0), 20, dt));
        const br = 1 + Math.sin(t * 4 + f.ph) * 0.03; f.root.scale.set((1 + (br - 1) * 0.6) * zF, br * zF, zF);
        pose(f.root, f.dir, f.fwd, wet ? Math.max(R0, WR - 0.045) : R0);
      } else if (f.state === 'dive') {   // sous l'eau un moment, puis elle remonte sur son nénuphar
        f.t += dt; const down = Math.min(1, f.t / 0.35), up = Math.max(0, 1 - (f.timer - f.t) / 0.5);
        const sink = f.t < f.timer - 0.5 ? down : 1 - up;
        f.root.scale.setScalar(zF); pose(f.root, f.dir, f.fwd, R0 + Math.sin(PI * Math.min(1, f.t / 0.35)) * 0.06 * (f.t < 0.35 ? 1 : 0) - sink * 0.25, f.t < 0.35 ? 0.8 * down : 0);
        if (f.t >= f.timer) { f.state = 'sit'; f.timer = 2 + rnd() * 4; }
      } else {                       // saut : vers un autre nénuphar, ou sur la berge
        const k0 = f.hopT; f.hopT = Math.min(1, f.hopT + dt / f.hopDur); const k = f.hopT, e = easeIO(k), air = Math.sin(PI * k);
        let base;
        if (f.toPad >= 0) { padPos(f.toPad, tmpF); f.dir.copy(f.from).lerp(tmpF, e).normalize(); v3.copy(tmpF).sub(f.from).projectOnPlane(f.dir); if (v3.lengthSq() > 1e-12) f.fwd.copy(v3.normalize()); base = padR; }
        else {
          step(f.dir, f.fwd, f.hopLen * (e - easeIO(k0)));
          if (-above(f.dir) > 0.8) turn(f.dir, f.fwd, PI);
          base = planet.isWet(f.dir) ? Math.max(planet.heightDir(f.dir), WR - 0.045) : planet.heightDir(f.dir);
        }
        if (k > 0.15 && k < 0.8) f.root.scale.set(0.9, 0.9, 1 + 0.35 * air); else squash(f.root, k, 1);   // allongée en l'air, écrasée à l'arrivée
        f.root.scale.multiplyScalar(zF);
        pose(f.root, f.dir, f.fwd, base + air * (0.07 + (f.toPad >= 0 ? 0.12 : f.hopLen * 0.35)), -0.55 * Math.cos(PI * k));
        f.th.scale.setScalar(0.35);
        if (f.hopT >= 1) { f.hopT = 0; if (f.toPad >= 0) { f.pad = f.toPad; f.toPad = -1; } if (--f.hops <= 0) { f.state = 'sit'; f.timer = 2 + rnd() * 6; f.root.scale.setScalar(1); } }
      }
    }
    /* ===== poissons : ronde tranquille ; à l'approche de la voiture, fuite rapide et plongée ===== */
    fishMesh.count = nFi;
    fishList.slice(0, nFi).forEach((f, i) => {
      if (car && f.pos.distanceToSquared(car) < (scary ? 9 : 2.5)) { if (f.scare < 0.5) away(f.dir, car, f.flee); f.scare = 1; }
      f.scare = Math.max(0, f.scare - dt / 2.5);
      f.a += f.spd * dt / f.rad * (1 + 0.4 * Math.sin(t * 0.8 + f.ph)) * (1 + 2 * f.scare);
      if (f.scare > 0) { f.off.addScaledVector(f.flee, 2 * f.scare * dt); if (f.off.length() > 2.5) f.off.setLength(2.5); }
      else f.off.multiplyScalar(Math.exp(-dt * 0.25));   // puis il revient lentement
      tangents(f.home, tA, tB);
      offset(f.dir, f.home, tA, tB, Math.cos(f.a) * f.rad, Math.sin(f.a) * f.rad);
      f.dir.addScaledVector(f.off, U).normalize();
      if (f.scare > 0 && !planet.isWet(f.dir)) { f.off.multiplyScalar(0.85); f.flee.negate(); }
      f.f.copy(tB).multiplyScalar(Math.cos(f.a)).addScaledVector(tA, -Math.sin(f.a)).multiplyScalar(Math.sign(f.spd));
      if (f.scare > 0.05) f.f.lerp(f.flee, f.scare);
      f.f.projectOnPlane(f.dir).normalize();
      let r = WR - f.dep - 0.28 * ease(Math.min(1, f.scare * 1.5)), pitch = 0;
      if (f.jump >= 0) { f.jump += dt / 0.75; const s = f.jump; r = WR - f.dep + Math.sin(PI * s) * 0.5; pitch = -Math.cos(PI * s) * 1.1; if (s >= 1) { f.jump = -1; f.next = 6 + rnd() * 20; } }
      else if (f.scare === 0 && (f.next -= dt) < 0) f.jump = 0;
      turn(f.dir, f.f, Math.sin(t * (11 + 14 * f.scare) + f.ph) * 0.22);   // la queue frétille (plus vite en fuyant)
      pose(o3, f.dir, f.f, r, pitch); f.pos.copy(o3.position); o3.scale.setScalar(zFi); o3.updateMatrix(); fishMesh.setMatrixAt(i, o3.matrix);
    });
    if (fishList.length) fishMesh.instanceMatrix.needsUpdate = true;
    /* ===== papillons (cachés la nuit) : battements, vol plané, et parfois une pause sur une fleur, ailes qui s'ouvrent lentement ===== */
    bwL.count = bwR.count = bBody.count = nP;
    bflies.slice(0, nP).forEach((b, i) => {
      if (!day) { o3.scale.setScalar(0); o3.updateMatrix(); bwL.setMatrixAt(i, o3.matrix); bwR.setMatrixAt(i, o3.matrix); bBody.setMatrixAt(i, o3.matrix); return; }
      if ((b.restT -= dt) < 0) {
        if (b.rest < 0.5) { b.restT = 3 + rnd() * 5; b.restDir.copy(b.dir); b.restTarget = 1; tangents(b.home, tA, tB); offset(b.spot, b.home, tA, tB, (rnd() - 0.5) * 2, (rnd() - 0.5) * 2); }
        else { b.restT = 6 + rnd() * 12; b.restTarget = 0; }
      }
      b.rest = lerpTo(b.rest, b.restTarget || 0, 1.6, dt);
      const T = t * b.s + b.p, glide = Math.sin(T * 1.6 + b.p) > 0.35;
      b.flap += dt * (b.rest > 0.8 ? 1.2 : glide ? 3 : 20);
      tangents(b.home, tA, tB); b.prev.copy(b.dir);
      offset(b.dir, b.home, tA, tB, Math.sin(T * 0.9) * 1.3 + Math.sin(T * 2.3) * 0.35, Math.cos(T * 0.7) * 1.3 + Math.sin(T * 1.9 + 1) * 0.35);
      const fly = planet.heightDir(b.dir) + 0.5 + Math.sin(T * 1.3) * 0.25 + (glide ? 0 : Math.abs(Math.sin(b.flap)) * 0.03);
      const rr = ease(Math.min(1, b.rest)); b.dir.lerp(b.spot, rr).normalize();
      const r = fly + (planet.heightDir(b.dir) + 0.12 - fly) * rr;
      tmpF.copy(b.dir).sub(b.prev).projectOnPlane(b.dir); if (tmpF.lengthSq() > 1e-12 && rr < 0.7) b.f.lerp(tmpF.normalize(), 0.25).projectOnPlane(b.dir).normalize(); else b.f.projectOnPlane(b.dir).normalize();
      const flapFly = glide ? 0.35 + Math.sin(b.flap) * 0.08 : 0.25 + Math.abs(Math.sin(b.flap)) * 1.2, flapRest = 0.5 + (0.5 + 0.5 * Math.sin(b.flap)) * 0.9;
      const flapA = flapFly + (flapRest - flapFly) * rr;
      pose(o3, b.dir, b.f, r, (glide ? 0.15 : -0.1) * (1 - rr)); b.pos = o3.position.clone(); o3.scale.setScalar(zP); qW.copy(o3.quaternion);
      o3.quaternion.copy(qW).multiply(qT.setFromAxisAngle(AXZ, flapA)); o3.updateMatrix(); bwL.setMatrixAt(i, o3.matrix);
      o3.quaternion.copy(qW).multiply(qT.setFromAxisAngle(AXZ, PI - flapA)); o3.updateMatrix(); bwR.setMatrixAt(i, o3.matrix);
      o3.quaternion.copy(qW); o3.updateMatrix(); bBody.setMatrixAt(i, o3.matrix);
    });
    if (bflies.length) { bwL.instanceMatrix.needsUpdate = true; bwR.instanceMatrix.needsUpdate = true; bBody.instanceMatrix.needsUpdate = true; }
    /* ===== abeilles (rentrées la nuit) : butinent sur place, puis filent vers la fleur suivante ===== */
    beeMesh.count = nA;
    bees.slice(0, nA).forEach((b, i) => {
      if (!day) { o3.scale.setScalar(0); o3.updateMatrix(); beeMesh.setMatrixAt(i, o3.matrix); return; }
      const T = t * b.s + b.p, u = T * 0.45, k = Math.floor(u), fr = u - k, go = easeIO(Math.min(1, Math.max(0, (fr - 0.6) / 0.4)));
      const ax = Math.sin(k * 12.9898 + b.p) * 0.8, az = Math.cos(k * 78.233 + b.p) * 0.8, bx = Math.sin((k + 1) * 12.9898 + b.p) * 0.8, bz = Math.cos((k + 1) * 78.233 + b.p) * 0.8;
      tangents(b.home, tA, tB); b.prev.copy(b.dir);
      offset(b.dir, b.home, tA, tB, ax + (bx - ax) * go + Math.sin(T * 9) * 0.04, az + (bz - az) * go + Math.cos(T * 7.3) * 0.04);
      tmpF.copy(b.dir).sub(b.prev).projectOnPlane(b.dir); if (tmpF.lengthSq() > 1e-10) b.f.lerp(tmpF.normalize(), 0.2).projectOnPlane(b.dir).normalize(); else b.f.projectOnPlane(b.dir).normalize();
      pose(o3, b.dir, b.f, planet.heightDir(b.dir) + 0.22 + Math.sin(T * 2.1) * 0.06 + Math.sin(T * 23) * 0.012, 0, Math.sin(T * 31) * 0.12);
      b.pos = o3.position.clone(); o3.scale.setScalar(zA); o3.updateMatrix(); beeMesh.setMatrixAt(i, o3.matrix);
    });
    if (bees.length) beeMesh.instanceMatrix.needsUpdate = true;
    /* ===== colibris (rentrés la nuit) : vol stationnaire presque debout, petits pivots, puis un trait rapide ===== */
    for (const h of act(hums, nH)) {
      h.root.visible = day; if (!day) continue;
      const u = (t + h.p) * 0.3, k = Math.floor(u), fr = u - k, go = easeIO(Math.min(1, Math.max(0, (fr - 0.82) / 0.18)));
      const ax = Math.sin(k * 12.9898 + h.p) * 1.6, az = Math.cos(k * 78.233 + h.p) * 1.6, bx = Math.sin((k + 1) * 12.9898 + h.p) * 1.6, bz = Math.cos((k + 1) * 78.233 + h.p) * 1.6;
      tangents(h.home, tA, tB); h.prev.copy(h.dir);
      offset(h.dir, h.home, tA, tB, ax + (bx - ax) * go + Math.sin(t * 3 + h.ph) * 0.02, az + (bz - az) * go + Math.cos(t * 2.6 + h.ph) * 0.02);
      tmpF.copy(h.dir).sub(h.prev).projectOnPlane(h.dir);
      if (tmpF.lengthSq() > 1e-9) h.f.lerp(tmpF.normalize(), 0.3).projectOnPlane(h.dir).normalize();
      else if (rnd() < dt * 0.8) turn(h.dir, h.f, (rnd() - 0.5) * 1.2);
      const moving = go > 0 && go < 1;
      h.pitch = lerpTo(h.pitch, moving ? 0.2 : -0.65, 8, dt);
      h.root.scale.setScalar(zH); pose(h.root, h.dir, h.f, planet.heightDir(h.dir) + 0.55 + Math.sin(t * 1.7 + h.ph) * 0.06 + (moving ? Math.sin(PI * go) * 0.2 : 0), h.pitch);
      const a = 0.9 * Math.sin(t * 90 + h.ph);   // les ailes vibrent
      h.wl.rotation.set(0, 0.6 * Math.cos(t * 90 + h.ph), a); h.wr.rotation.set(0, -0.6 * Math.cos(t * 90 + h.ph), -a);
    }
    /* ===== moucherons : seules les nuées proches sont animées (les autres sont trop loin pour être vues) ===== */
    // la nuit, les moucherons deviennent des lucioles : plus gros, lumineux, plus lents
    const glow = ease(Math.min(1, Math.max(0, (night - 0.35) / 0.4)));
    midges.visible = true; midges.material.size = (0.3 + 0.3 * glow) * zM; midgeU.uGlow.value = glow;   // (le disque n'occupe que le centre du point : le reste est le halo)
    if (NM) {
      let k = 0;
      midgeGeo.setDrawRange(0, swarms.slice(0, nM).reduce((s, w) => s + w.n, 0));
      for (const w of swarms.slice(0, nM)) {
        if (car && w.c.distanceToSquared(car) > 22 * 22) { k += w.n; continue; }
        w.tt = (w.tt || 0) + dt * (1 - 0.65 * glow);   // temps propre à la nuée : les lucioles volent plus lentement
        const T = w.tt + w.p, R = w.r * (1 + 0.8 * glow);
        tangents(w.home, tA, tB);
        offset(v1, w.home, tA, tB, Math.sin(T * 0.13) * 0.5, Math.cos(T * 0.11) * 0.5);
        w.c.copy(v1).multiplyScalar(planet.heightDir(v1) + w.hgt * (1 - 0.35 * glow) + Math.sin(T * 0.4) * 0.12);
        for (let i = 0; i < w.n; i++, k++) {
          const p = k * 4, s1 = midgeP[p], s2 = midgeP[p + 1], s3 = midgeP[p + 2], s4 = midgeP[p + 3];
          const ox = Math.sin(T * (1.3 + (s1 % 1.7)) + s2) * R + Math.sin(T * 7.1 + s3) * 0.03 * (1 - glow);
          const oy = Math.sin(T * (1.1 + (s3 % 1.3)) + s4) * R * 0.7 + Math.sin(T * 9.3 + s1) * 0.02 * (1 - glow);
          const oz = Math.cos(T * (1.2 + (s2 % 1.5)) + s1) * R + Math.cos(T * 6.7 + s4) * 0.03 * (1 - glow);
          // luciole : s'allume et s'éteint à son propre rythme (couleur au-delà de 1 : le halo la fait briller)
          const blink = glow > 0 ? Math.pow(Math.max(0, Math.sin(t * (0.9 + (s4 % 1.1)) + s2 * 3)), 3) : 0, L = glow * (0.15 + 3.2 * blink);
          midgeCol[k * 3] = 0.12 * (1 - glow) + 0.85 * L; midgeCol[k * 3 + 1] = 0.095 * (1 - glow) + 1.0 * L; midgeCol[k * 3 + 2] = 0.08 * (1 - glow) + 0.35 * L;
          midgePos[k * 3] = w.c.x + tA.x * ox + v1.x * oy + tB.x * oz;
          midgePos[k * 3 + 1] = w.c.y + tA.y * ox + v1.y * oy + tB.y * oz;
          midgePos[k * 3 + 2] = w.c.z + tA.z * ox + v1.z * oy + tB.z * oz;
        }
      }
      midgeGeo.attributes.position.needsUpdate = true; midgeGeo.attributes.color.needsUpdate = true;
    }
  }
  /** Position (monde) du i-ème animal d'une espèce (pour aller le voir), et le nombre d'individus. */
  const LIST = { lapins: [rabbits, a => a.root.position], crabes: [crabs, a => a.root.position], tortues: [turtles, a => a.root.position], grenouilles: [frogs, a => a.root.position],
    martins: [birds, a => a.root.position], colibris: [hums, a => a.root.position], papillons: [bflies, a => a.pos || a.dir.clone().multiplyScalar(planet.heightDir(a.dir) + 0.5)],
    abeilles: [bees, a => a.pos || a.dir.clone().multiplyScalar(planet.heightDir(a.dir) + 0.25)], poissons: [fishList, a => a.pos], moucherons: [swarms, a => a.c] };
  function locate(kind, i) { const L = LIST[kind]; const n = L ? activeN(kind) : 0; if (!n) return null; const a = L[0][((i % n) + n) % n]; return { pos: L[1](a).clone(), n, flying: ['martins', 'colibris', 'papillons', 'abeilles', 'moucherons'].includes(kind) }; }
  return { group, update, locate, counts: { lapins: rabbits.length, crabes: crabs.length, tortues: turtles.length, grenouilles: frogs.length, grenouillesNenuphars: padFrogIdx.length, martinsPecheurs: birds.length, perchoirsArbres: birds.map(b => b.roosts.length - 1), poissons: fishList.length, papillons: bflies.length, abeilles: bees.length, colibris: hums.length, moucherons: NM } };
}

/* ---------- modèles exposés pour la page de réglage des fourrures et plumes (fourrure.html) ----------
   piv : position du pivot de chaque partie (avant l'échelle K) ; parent : partie qui porte celle-ci. */
export const FUR_MODELS = {
  lapin: { nom: 'Lapin', parts: { corps: RABBIT.body, tete: RABBIT.head, oreilles: RABBIT.ears }, piv: { tete: RABBIT.PIV.head, oreilles: RABBIT.PIV.ears }, parent: { oreilles: 'tete' } },
  martin: { nom: 'Martin-pêcheur', parts: { corps: BIRD.body, tete: BIRD.head, aileG: WING, aileD: mirror(WING) }, piv: { tete: BIRD.PIV.head, aileG: [0.03, 0.075, -0.005], aileD: [-0.03, 0.075, -0.005] } },
  colibri: { nom: 'Colibri', parts: { corps: HUM, aileG: HUM_WING, aileD: mirror(HUM_WING) }, piv: { aileG: [0.012, 0.014, 0.005], aileD: [-0.012, 0.014, 0.005] } },
  abeille: { nom: 'Abeille', parts: { corps: BEE } },
};
export { blocks, K as FAUNA_K };
