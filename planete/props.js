/* ============================================================================
   Décors des zones et petite voiture : grandes lettres en relief qu'on peut
   renverser, panneau en bois, caisses, lanternes, cercle lumineux au sol.
   Physique maison très simple : chaque objet glisse sur la sphère, frotte, et
   bascule à plat quand la voiture (ou un autre objet) le percute assez fort.
   ============================================================================ */
import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { leafCluster, LEAF_MAT, fadeNearCamera, SEA_R } from './world.js';
import { makeVan, VAN_WHEEL_Z } from './van.js';
import { makeBMX, makeKart, kartWheel } from './rides.js';

const FONT_URL = new URL('./vendor/three/fonts/helvetiker_bold.typeface.json', import.meta.url).href;   // servie par le site (pas de CDN)
const Y = new THREE.Vector3(0, 1, 0);

/* ---------- logo « sd » (même tracé que sur le site) : autocollant sur les véhicules ---------- */
const LOGO_PATH = 'M178.91,80.13c0-.09.03-.18.03-.27V7c0-2.38-1.93-4.31-4.31-4.31s-4.31,1.93-4.31,4.31v47.92c-8.81-12.63-23.09-20.33-39.41-20.51-4.18-.05-8.36.52-12.37,1.68-14.9,4.28-25.53,14.34-31.03,26.52-1.49,3.3-1.19,7.14.66,10.25l3.8,6.38c1-12.24,7.69-23.85,19.02-30.6,6.16-3.67,13.04-5.55,20.03-5.55,3.24,0,6.5.4,9.71,1.22,10.17,2.58,18.72,8.96,24.09,17.97,3.63,6.09,5.55,13.04,5.54,20.09-.01,13.77-7.36,26.7-19.18,33.74-9.01,5.37-19.57,6.91-29.74,4.33-10.17-2.58-18.72-8.96-24.09-17.97-.43-.73-13.99-23.64-13.99-23.64,0,.03-17.78-29.83-17.78-29.83-.36-.59-9-14.52-27.88-14.52S5.75,46.22,5.75,61.79s14.76,19.95,26.61,23.47c1.37.41,5.83,1.77,5.83,1.77,14.18,4.4,22.86,7.52,22.86,15.91,0,10.66-10.81,18.7-25.15,18.7s-21.85-10.01-22.17-10.49c-1.29-1.99-3.95-2.55-5.94-1.27-2,1.29-2.58,3.96-1.29,5.96.38.59,9.52,14.42,29.4,14.42s33.77-11.74,33.77-27.32-14.71-19.72-28.93-24.14c0,0-4.52-1.39-5.93-1.81-12.72-3.77-20.44-6.67-20.44-15.2,0-10.83,9.82-18.69,23.35-18.69s20.26,9.96,20.49,10.34c0,0,31.68,53.33,31.75,53.44,6.55,10.99,16.98,18.77,29.38,21.91,3.93.99,7.9,1.49,11.85,1.49,8.52,0,16.91-2.29,24.42-6.77,14.41-8.58,23.37-24.35,23.39-41.14,0-.75-.04-1.5-.07-2.25Z';
const LOGO_TEX = {};
/** Autocollant du logo, largeur w (la hauteur suit les proportions du logo), couleur au choix. Plan tourné vers +z. */
function logoDecal(w, color = '#f6406b') {
  if (!LOGO_TEX[color]) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 374;
    const g = c.getContext('2d'), k = 480 / 180.38;
    g.translate(16, (374 - 131.63 * k) / 2); g.scale(k, k);
    g.fillStyle = color; g.fill(new Path2D(LOGO_PATH));
    const tx = LOGO_TEX[color] = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4;
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 374 / 512), new THREE.MeshStandardMaterial({ map: LOGO_TEX[color], transparent: true, alphaTest: 0.35, roughness: 0.45, emissive: color, emissiveIntensity: 0.15, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  m.renderOrder = 2;
  return m;
}
const WOOD = '#de8a4e', WOOD_DARK = '#a8583a', CREAM = '#fbe9d7';

/** Les mots posés sur chaque zone (la police n'a pas d'accents : on ajoute celui de STÉPHANE). */
const WORDS = { profil: 'STEPHANE', services: 'SERVICES', travaux: 'TRAVAUX', perso: 'PERSO', photos: 'PHOTOS', parcours: 'PARCOURS', contact: 'CONTACT' };

function canvasTex(draw, w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

/* ---------- la Jeep (et son mode aéroglisseur) ---------- */
/* ---------- peinture pailletée (façon flocons holographiques) : de minuscules éclats colorés qui scintillent selon l'angle ---------- */
export const PAINT = { uFlakeI: { value: 3 }, uFlakeD: { value: 0.55 } };
export function flakePaint(m) {
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, PAINT);
    sh.vertexShader = 'varying vec3 vFlP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vFlP = position;');
    sh.fragmentShader = `uniform float uFlakeI, uFlakeD; varying vec3 vFlP;
      float flH(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      ` + sh.fragmentShader.replace('#include <opaque_fragment>', `{
        vec3 q = vFlP * 170.0, c = floor(q), f = fract(q) - 0.5;
        float h = flH(c), h2 = flH(c + 17.3);
        vec3 nf = normalize(normal + (vec3(flH(c + 3.1), flH(c + 7.7), flH(c + 11.3)) - 0.5) * 1.5);   // chaque paillette penche à sa façon
        vec3 V = normalize(vViewPosition), H = normalize(normalize(vec3(0.35, 0.85, 0.4)) + V);
        float sp = pow(max(dot(nf, H), 0.0), 28.0) * step(1.0 - uFlakeD, h) * smoothstep(0.5, 0.2, length(f));
        sp *= 1.0 - smoothstep(1.4, 3.0, length(fwidth(q)));                                              // de loin, on n'en fait pas de la neige
        vec3 hol = mix(0.55 + 0.45 * cos(6.2832 * (h2 + vec3(0.0, 0.33, 0.67))), vec3(1.0), 0.3);        // reflets arc-en-ciel
        vec3 fl = hol * sp * uFlakeI; outgoingLight += fl; totalEmissiveRadiance += fl;   // en émission : le rendu « illustration » les garde
      }
      #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'flake';
  return m;
}

/** Biplan aux couleurs de la jeep (nez vers +z, dessus vers +y). userData.prop : l'hélice à faire tourner. */
export function makeBiplane() {
  const plane = new THREE.Group(), body = new THREE.Group(); plane.add(body);
  const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, ...o });
  const paint = flakePaint(mat('#6b3fe0', { roughness: 0.32 })), black = mat('#1d1b26', { roughness: 0.75 }), cream = mat('#fff1dc', { roughness: 0.5 });
  const bronze = mat('#d08f4e', { roughness: 0.35, metalness: 0.35 }), pink = mat('#ff4f86', { roughness: 0.45 }), glass = mat('#a8dcff', { roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.6 });
  const box = (w, h, d, m, x, y, z, r = 0.04, parent = body) => {
    const g = new THREE.BoxGeometry(w, h, d, 2, 2, 2), p = g.attributes.position, v = new THREE.Vector3(), hw = w / 2 - r, hh = h / 2 - r, hd = d / 2 - r;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const c = new THREE.Vector3(Math.max(-hw, Math.min(hw, v.x)), Math.max(-hh, Math.min(hh, v.y)), Math.max(-hd, Math.min(hd, v.z)));
      v.sub(c).normalize().multiplyScalar(r).add(c); p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    const m2 = new THREE.Mesh(g, m); m2.position.set(x, y, z); parent.add(m2); return m2;
  };
  const bar = (a, b, r = 0.018, m = black) => {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), L = A.distanceTo(B);
    const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 6), m);
    t.position.copy(A).add(B).multiplyScalar(0.5); t.quaternion.setFromUnitVectors(Y, B.clone().sub(A).normalize()); body.add(t);
  };
  // fuselage effilé vers la queue, capot moteur rond
  box(0.36, 0.36, 1.1, paint, 0, 0, 0.2, 0.08);
  box(0.28, 0.28, 0.55, paint, 0, 0.02, -0.55, 0.07);
  box(0.18, 0.2, 0.4, paint, 0, 0.05, -0.98, 0.05);
  const cowl = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.22, 14), bronze); cowl.rotation.x = Math.PI / 2; cowl.position.set(0, 0, 0.82); body.add(cowl);
  const hub = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.14, 10), black); hub.rotation.x = Math.PI / 2; hub.position.set(0, 0, 1.0); body.add(hub);
  // bandes rétro sur le flanc
  [['#ff4f86', 0.07], ['#ffb03a', 0], ['#38d2ff', -0.07]].forEach(([c, y]) => { box(0.37, 0.035, 0.5, mat(c), 0, y, 0.2, 0.01); });
  // poste de pilotage : trou sombre, pare-brise, pilote à lunettes et écharpe
  box(0.24, 0.04, 0.3, black, 0, 0.18, -0.12, 0.015);
  box(0.24, 0.13, 0.02, glass, 0, 0.26, 0.06, 0.01);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 8), mat('#f2c39b')); head.position.set(0, 0.3, -0.14); body.add(head);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('#5a3a22')); cap.position.copy(head.position); body.add(cap);
  box(0.15, 0.035, 0.03, glass, 0, 0.31, -0.07, 0.01);
  const scarf = box(0.04, 0.025, 0.22, pink, 0.04, 0.22, -0.32, 0.01); scarf.rotation.y = 0.25;
  // deux ailes, la supérieure plus large et un peu avancée ; extrémités roses
  box(2.1, 0.05, 0.42, cream, 0, -0.14, 0.25, 0.02);
  box(2.35, 0.05, 0.44, cream, 0, 0.5, 0.32, 0.02);
  [-0.55, 0.55].forEach(x => { const lg = logoDecal(0.42); lg.rotation.set(-Math.PI / 2, 0, Math.PI); lg.position.set(x, 0.527, 0.32); body.add(lg); });   // logos sur l'aile supérieure
  [-1, 1].forEach(sd => { box(0.22, 0.055, 0.43, pink, sd * 1.07, 0.5, 0.32, 0.02); box(0.2, 0.055, 0.41, pink, sd * 0.96, -0.14, 0.25, 0.02); });
  // haubans entre les ailes, mâts de cabane
  [-0.8, 0.8].forEach(x => { bar([x, -0.12, 0.14], [x, 0.48, 0.2]); bar([x, -0.12, 0.38], [x, 0.48, 0.44]); bar([x, -0.12, 0.14], [x, 0.48, 0.44], 0.008); });
  [-0.16, 0.16].forEach(x => { bar([x, 0.16, 0.2], [x * 1.3, 0.48, 0.3]); bar([x, 0.16, 0.42], [x * 1.3, 0.48, 0.38]); });
  // empennage
  box(0.85, 0.04, 0.26, cream, 0, 0.06, -1.12, 0.015);
  box(0.04, 0.34, 0.3, pink, 0, 0.24, -1.12, 0.015);
  // train d'atterrissage
  [-1, 1].forEach(sd => {
    bar([sd * 0.12, -0.15, 0.45], [sd * 0.28, -0.46, 0.42]); bar([sd * 0.12, -0.15, 0.25], [sd * 0.28, -0.46, 0.42]);
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.07, 14), black); w.rotation.z = Math.PI / 2; w.position.set(sd * 0.31, -0.46, 0.42); body.add(w);
  });
  bar([0, -0.1, -0.95], [0, -0.2, -1.05], 0.012);
  // hélice : deux pales et un disque flou quand elle tourne vite
  const prop = new THREE.Group(); prop.position.set(0, 0, 0.95); body.add(prop);
  box(0.07, 0.95, 0.025, mat('#6a4428', { roughness: 0.6 }), 0, 0, 0, 0.01, prop);
  const blur = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide })); prop.add(blur);
  plane.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  blur.castShadow = false;
  plane.userData = { prop, body };
  return plane;
}

export function makeCar() {
  const car = new THREE.Group(), body = new THREE.Group(); car.add(body);
  const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, ...o });
  const paint = flakePaint(mat('#6b3fe0', { roughness: 0.32 })), black = mat('#1d1b26', { roughness: 0.75 }), glass = mat('#a8dcff', { roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.55 });
  const bronze = mat('#d08f4e', { roughness: 0.35, metalness: 0.35 }), interior = mat('#2a2436', { roughness: 0.9 }), seatM = mat('#ff4f86', { roughness: 0.7 });
  const box = (w, h, d, m, x, y, z, r = 0.06, parent = body) => {
    const g = new THREE.BoxGeometry(w, h, d, 2, 2, 2);
    // coins arrondis : on pousse chaque sommet vers une boîte à bords ronds
    const p = g.attributes.position, v = new THREE.Vector3(), hw = w / 2 - r, hh = h / 2 - r, hd = d / 2 - r;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const c = new THREE.Vector3(Math.max(-hw, Math.min(hw, v.x)), Math.max(-hh, Math.min(hh, v.y)), Math.max(-hd, Math.min(hd, v.z)));
      v.sub(c).normalize().multiplyScalar(r).add(c); p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    const m2 = new THREE.Mesh(g, m); m2.position.set(x, y, z); parent.add(m2); return m2;
  };
  const bar = (a, b, r = 0.022, m = black) => {   // tube de l'arceau entre deux points
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), L = A.distanceTo(B);
    const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 8), m);
    t.position.copy(A).add(B).multiplyScalar(0.5); t.quaternion.setFromUnitVectors(Y, B.clone().sub(A).normalize()); body.add(t);
  };
  // caisse : baquet, capot, plancher de l'habitacle ouvert
  box(0.68, 0.22, 1.12, paint, 0, 0.45, -0.02, 0.06);
  box(0.64, 0.1, 0.44, paint, 0, 0.6, 0.32, 0.05);
  box(0.6, 0.02, 0.6, interior, 0, 0.565, -0.2, 0.01);
  // bandes rétro sur le capot
  [['#ff4f86', -0.1], ['#ffb03a', 0], ['#38d2ff', 0.1]].forEach(([c, x]) => box(0.07, 0.012, 0.43, mat(c, { roughness: 0.4 }), x, 0.655, 0.32, 0.005));
  // calandre à sept fentes, phares ronds cerclés
  box(0.56, 0.2, 0.04, black, 0, 0.5, 0.56, 0.02);
  for (let i = 0; i < 7; i++) box(0.026, 0.14, 0.02, bronze, -0.12 + i * 0.04, 0.5, 0.585, 0.008);
  const lightMat = mat('#fff6c8', { emissive: '#fff2b0', emissiveIntensity: 2.2 }); lightMat.userData.glow = 2.2;
  for (const x of [-0.215, 0.215]) {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.068, 0.03, 18).rotateX(Math.PI / 2), bronze); ring.position.set(x, 0.51, 0.585); body.add(ring);
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 18).rotateX(Math.PI / 2), lightMat); l.position.set(x, 0.51, 0.595); body.add(l);
  }
  // pare-chocs costauds, antibrouillards, feux arrière
  box(0.8, 0.09, 0.1, black, 0, 0.34, 0.63, 0.03);
  for (const x of [-0.15, 0.15]) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.042, 12, 8), lightMat); f.position.set(x, 0.4, 0.66); body.add(f); }
  box(0.76, 0.08, 0.08, black, 0, 0.34, -0.62, 0.03);
  const tail = mat('#ff5a3c', { emissive: '#ff3a1c', emissiveIntensity: 1.2 });
  for (const x of [-0.27, 0.27]) box(0.06, 0.1, 0.02, tail, x, 0.5, -0.585, 0.01);
  // ailes élargies au-dessus des roues, marchepieds
  const flareGeo = new THREE.CylinderGeometry(0.255, 0.255, 0.18, 16, 1, true, 0, Math.PI).rotateZ(Math.PI / 2);
  const flareM = mat('#1d1b26', { roughness: 0.75, side: THREE.DoubleSide });
  for (const [x, z] of [[-0.37, 0.38], [0.37, 0.38], [-0.37, -0.38], [0.37, -0.38]]) { const f = new THREE.Mesh(flareGeo, flareM); f.position.set(x, 0.24, z); body.add(f); }
  for (const x of [-0.37, 0.37]) box(0.06, 0.035, 0.42, black, x, 0.33, 0, 0.012);
  // pare-brise, arceau, sièges, volant
  const ws = new THREE.Group(); ws.position.set(0, 0.57, 0.1); ws.rotation.x = -0.25; body.add(ws);
  box(0.64, 0.035, 0.035, paint, 0, 0.3, 0, 0.012, ws); for (const x of [-0.305, 0.305]) box(0.035, 0.3, 0.035, paint, x, 0.15, 0, 0.012, ws);
  box(0.58, 0.27, 0.012, glass, 0, 0.15, 0, 0.004, ws);
  for (const x of [-0.3, 0.3]) { bar([x, 0.56, -0.08], [x, 0.92, -0.08]); bar([x, 0.56, -0.5], [x, 0.9, -0.5]); bar([x, 0.92, -0.08], [x, 0.9, -0.5]); bar([x, 0.92, -0.08], [x, 0.86, 0.05]); }
  bar([-0.3, 0.92, -0.08], [0.3, 0.92, -0.08]); bar([-0.3, 0.9, -0.5], [0.3, 0.9, -0.5]);
  for (const x of [-0.14, 0.14]) { box(0.2, 0.07, 0.2, seatM, x, 0.61, -0.2, 0.03); box(0.2, 0.24, 0.06, seatM, x, 0.74, -0.31, 0.03); }
  const steer = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 16), black); steer.position.set(-0.14, 0.74, 0.0); steer.rotation.x = -0.9; body.add(steer);
  // roue de secours sur le hayon
  const tyreGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.17, 22).rotateZ(Math.PI / 2), lugGeo = new THREE.BoxGeometry(0.18, 0.035, 0.05);
  const spare = new THREE.Group(); spare.position.set(0, 0.55, -0.67); body.add(spare);
  { const lg = logoDecal(0.15, '#ffffff'); lg.rotation.y = Math.PI; lg.position.z = -0.067; spare.add(lg); }   // logo blanc, discret, sur la roue de secours
  { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.12, 20).rotateX(Math.PI / 2), black); spare.add(t); const h = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.13, 10).rotateX(Math.PI / 2), bronze); spare.add(h); }
  // deux échappements sous le pare-chocs arrière ; flammes du turbo
  const flames = [];
  {
    const pipeM = mat('#5a5464', { roughness: 0.35, metalness: 0.6 });
    const outer = mat('#ff7a1a', { emissive: '#ff5a10', emissiveIntensity: 3, transparent: true, opacity: 0.9, depthWrite: false });
    const inner = mat('#fff0a0', { emissive: '#ffe680', emissiveIntensity: 4 });
    for (const x of [-0.22, 0.22]) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.14, 10).rotateX(Math.PI / 2), pipeM); pipe.position.set(x, 0.27, -0.62); body.add(pipe);
      const fl = new THREE.Group(); fl.position.set(x, 0.27, -0.69); body.add(fl);
      fl.add(new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.34, 10).translate(0, 0.17, 0).rotateX(-Math.PI / 2), outer));
      fl.add(new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.2, 8).translate(0, 0.1, 0).rotateX(-Math.PI / 2), inner));
      fl.visible = false; flames.push(fl);
    }
  }
  // grosses roues à crampons, jantes bronze
  const wheels = [];
  const hubGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.18, 12).rotateZ(Math.PI / 2), capGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.19, 8).rotateZ(Math.PI / 2), holeGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.185, 8).rotateZ(Math.PI / 2);
  for (const [x, z] of [[-0.37, 0.38], [0.37, 0.38], [-0.37, -0.38], [0.37, -0.38]]) {
    const pivot = new THREE.Group(); pivot.position.set(x, 0.2, z); car.add(pivot);
    const w = new THREE.Group(); pivot.add(w);
    w.add(new THREE.Mesh(tyreGeo, black), new THREE.Mesh(hubGeo, bronze), new THREE.Mesh(capGeo, black));
    for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2, l = new THREE.Mesh(lugGeo, black); l.position.set(0, Math.cos(a) * 0.2, Math.sin(a) * 0.2); l.rotation.x = -a; w.add(l); }
    for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2, h = new THREE.Mesh(holeGeo, interior); h.position.set(0, Math.cos(a) * 0.065, Math.sin(a) * 0.065); w.add(h); }
    wheels.push({ pivot, w, front: z > 0, side: Math.sign(x), along: z });
  }
  /* ----- l'aéroglisseur : jupe gonflable sous la caisse, ventilateur caréné à l'arrière ----- */
  const rubber = mat('#262838', { roughness: 0.9 });
  const skirt = new THREE.Group(); body.add(skirt);
  {
    const g = new THREE.TorusGeometry(0.44, 0.13, 10, 40).rotateX(Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) * 1.38);
    g.computeVertexNormals();
    const ring = new THREE.Mesh(g, rubber); ring.position.y = 0.2; skirt.add(ring);
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.1, 24).scale(1, 1, 1.38), rubber); floor.position.y = 0.24; skirt.add(floor);
    const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.024, 6, 40).rotateX(Math.PI / 2).scale(1, 1, 1.38), mat('#38d2ff')); stripe.position.y = 0.3; skirt.add(stripe);
    // logo sur chaque flanc de la jupe, plaqué sur sa courbure (le boudin est rond en hauteur et ovale en longueur)
    [-1, 1].forEach(sd => {
      const lg = logoDecal(0.3); lg.geometry = new THREE.PlaneGeometry(0.3, 0.3 * 374 / 512, 10, 6);
      const P = lg.geometry.attributes.position, TR = 0.13, RX = 0.44 + TR, RZ = (0.44 + TR) * 1.38;
      for (let i = 0; i < P.count; i++) {
        const u = P.getX(i), v = P.getY(i);   // u : le long de la jupe, v : en hauteur
        P.setZ(i, (Math.sqrt(Math.max(0, TR * TR - v * v)) - TR) + RX * (Math.sqrt(Math.max(0, 1 - (u / RZ) ** 2)) - 1) + 0.004);
      }
      lg.geometry.computeVertexNormals();
      lg.rotation.y = sd * Math.PI / 2; lg.position.set(sd * RX, 0.2, 0); skirt.add(lg);
    });
  }
  const fan = new THREE.Group(); fan.position.set(0, 0.55, -0.5); body.add(fan);
  const blades = new THREE.Group();
  {
    const duct = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.045, 10, 28), paint); duct.position.y = 0.26; fan.add(duct);
    const grid = mat('#3a3c4e', { roughness: 0.6 });
    for (const x of [-0.13, 0.13]) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.06), grid); s.position.set(x, 0.05, 0); fan.add(s); }
    blades.position.y = 0.26; fan.add(blades);
    for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.17, 0.012), grid); b.position.y = 0.085; const arm = new THREE.Group(); arm.rotation.z = k * Math.PI / 2; arm.add(b); b.rotation.y = 0.5; blades.add(arm); }
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), bronze); blades.add(nose);
    const rudder = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.32, 0.1), paint); rudder.position.set(0, 0.26, -0.08); fan.add(rudder);
  }
  /**
   * Pose de la voiture à chaque image.
   * k : 0 = Jeep, 1 = aéroglisseur (les roues se replient, la jupe se gonfle, le ventilateur sort) ;
   * spin : pales ; wy : débattement de chaque roue ; bodyY, pitch, roll : la caisse sur ses ressorts.
   */
  function pose(k, spin = 0, wy = null, bodyY = 0, pitch = 0, roll = 0, flame = 0, t = 0) {
    const e = k * k * (3 - 2 * k), pop = Math.max(0, Math.min(1, (k - 0.35) / 0.65)), over = pop < 1 ? pop + Math.sin(pop * Math.PI) * 0.25 : 1;
    skirt.visible = k > 0.01; skirt.scale.set(0.8 + 0.2 * e, Math.max(0.02, e), 0.8 + 0.2 * e);
    fan.visible = ride === 'jeep' && pop > 0.01; fan.scale.setScalar(Math.max(0.01, over));
    spare.visible = ride === 'jeep' && e < 0.6; spare.scale.setScalar(Math.max(0.01, 1 - e * 1.6));
    blades.rotation.z = spin;
    flames.forEach((fl, i) => {
      const kf = flame * (1 - e), flick = 0.75 + 0.2 * Math.sin(t * 47 + i * 2.1) + 0.12 * Math.sin(t * 91 + i * 5.3);
      fl.visible = kf > 0.02; fl.scale.set(kf * (0.85 + 0.15 * flick), kf * (0.85 + 0.15 * flick), Math.max(0.01, kf * flick * 1.3));
    });
    body.position.y = 0.04 * e + bodyY * (1 - e);
    body.rotation.set(pitch, 0, roll);
    wheels.forEach((w, i) => {
      w.pivot.scale.setScalar(Math.max(0.001, 1 - e));
      w.pivot.position.y = 0.2 + 0.1 * e + (wy ? wy[i] : 0) * (1 - e);
      w.pivot.position.x = w.side * (0.37 - 0.1 * e);
      w.pivot.visible = e < 0.98;
    });
  }
  // le van WSQK, monté sur la même caisse et les mêmes roues (on le conduit dans le monde à l'envers)
  const jeepParts = body.children.filter(o => o !== skirt && o !== fan && o !== spare && !flames.includes(o));
  const van = makeVan({ wheels: false }); van.visible = false; body.add(van);
  wheels.forEach(w => { w.jeep = w.w.children.slice(); w.vw = van.userData.wheelPart(); w.vw.visible = false; w.w.add(w.vw); w.along0 = w.along; });
  // les véhicules des autres clins d'œil : le BMX (E.T.) et le kart (le tuyau vert)
  const bmx = makeBMX(); bmx.visible = false; body.add(bmx);
  const kart = makeKart({ paint: flakePaint(mat('#e0141e', { roughness: 0.22, metalness: 0.2 })) }); kart.visible = false; body.add(kart);   // châssis pailleté, comme la Jeep
  wheels.forEach(w => { w.kw = kartWheel(!w.front, w.side); w.kw.visible = false; w.w.add(w.kw); });
  const flameZ = flames.map(f => f.position.z), flameX = flames.map(f => f.position.x), flameY = flames.map(f => f.position.y);
  let ride = 'jeep';
  /** Change de véhicule : 'jeep', 'van', 'bmx' ou 'kart'. */
  function setRide(kind) {
    ride = kind; const on = kind === 'van';
    van.visible = on; bmx.visible = kind === 'bmx'; kart.visible = kind === 'kart'; jeepParts.forEach(o => { o.visible = kind === 'jeep'; });
    // le van est plus long : roues écartées (la suspension et les traces suivent), échappements au bout du pare-chocs
    wheels.forEach(w => {
      w.jeep.forEach(m => { m.visible = kind === 'jeep'; }); w.vw.visible = on; w.kw.visible = kind === 'kart';
      w.w.visible = kind !== 'bmx';   // le BMX a ses deux roues à lui
      w.along = on ? (w.front ? VAN_WHEEL_Z.front : VAN_WHEEL_Z.rear) : w.along0; w.pivot.position.z = w.along;
    });
    flames.forEach((f, i) => {
      f.position.z = on ? -1.06 : kind === 'kart' ? -0.68 : kind === 'bmx' ? -0.62 : flameZ[i];
      f.position.x = kind === 'kart' ? Math.sign(flameX[i] || (i ? 1 : -1)) * 0.19 : kind === 'bmx' ? (i ? 0.03 : -0.03) : flameX[i];
      f.position.y = kind === 'kart' ? 0.54 : kind === 'bmx' ? 0.27 : flameY[i];
    });
  }
  const setVan = on => setRide(on ? 'van' : 'jeep');
  pose(0);
  car.userData = { body, wheels, pose, flames, van, bmx, kart, setVan, setRide, get vanOn() { return ride === 'van'; }, get ride() { return ride; } };   // flames : sortie des échappements, d'où partent les traînées du turbo
  return car;
}

/* ---------- objets renversables ---------- */
class Bodies {
  constructor(planet) { this.planet = planet; this.list = []; this.time = 0; this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._a = new THREE.Vector3(); }
  /**
   * @param mesh   origine à la base de l'objet
   * @param opts   r : rayon de collision, lie : décalage quand il est couché, topple : peut basculer
   */
  add(mesh, dir, yaw, opts) {
    const b = { mesh, dir: dir.clone().normalize(), vel: new THREE.Vector3(), local: new THREE.Quaternion().setFromAxisAngle(Y, yaw), fall: null, down: false,
      r: opts.r, lie: opts.lie || 0, topple: opts.topple !== false, fixed: !!opts.fixed, hop: 0, vh: 0, awake: false, moved: false, lastHit: 0, ret: null, retOff: 0 };
    b.home = { dir: b.dir.clone(), local: b.local.clone() };
    this.list.push(b); this.place(b); return b;
  }
  frame(dir) { return this._q.setFromUnitVectors(Y, dir); }
  place(b) {
    const g = Math.max(this.planet.heightDir(b.dir), this.planet.seaR + 0.12);
    let off = 0, rot = b.local;
    if (b.fall) {
      const k = Math.min(1, b.fall.t), e = k * k;
      rot = this._tmpQ = (this._tmpQ || new THREE.Quaternion()).setFromAxisAngle(b.fall.axis, e * Math.PI / 2).multiply(b.local);
      off = b.lie * Math.sin(e * Math.PI / 2);
    } else if (b.down) off = b.lie;
    b.mesh.position.copy(b.dir).multiplyScalar(g + off + b.hop + (b.ret ? b.retOff : 0));
    b.mesh.quaternion.copy(this.frame(b.dir)).multiply(rot);
  }
  /** Pousse un objet (vitesse tangente) ; s'il est debout et que le choc est fort, il bascule dans le sens du choc. */
  hit(b, push, strength) {
    if (b.fixed) { if (this.onHit && strength > 0.3) this.onHit(b, strength, false); return; }   // planté dans le sol : il ne bouge pas
    b.vel.add(push); b.awake = true; b.moved = true; b.lastHit = this.time;
    if (this.onHit) this.onHit(b, strength, false);
    if (b.ret) { b.ret = null; b.retOff = 0; }
    if (b.topple && !b.down && !b.fall && strength > 1.6) {
      // axe de bascule dans le repère local de la zone de l'objet
      const n = this._v.copy(push).normalize();
      const axisW = this._a.crossVectors(b.dir, n).normalize();
      const axis = axisW.applyQuaternion(this.frame(b.dir).invert()).normalize();
      b.fall = { axis: axis.clone(), t: 0 }; b.vh = Math.min(3, strength * 0.5);
    } else if (!b.topple) { b.local.premultiply(new THREE.Quaternion().setFromAxisAngle(Y, (Math.random() - 0.5) * strength * 0.6)); b.vh = Math.max(b.vh, Math.min(2.5, strength * 0.4)); }
  }
  step(dt, car) {
    const P = this.planet, tmp = new THREE.Vector3(), axis = new THREE.Vector3(), d = new THREE.Vector3();
    this.time += dt;
    // collisions avec la voiture
    if (car) for (const b of this.list) {
      d.copy(b.mesh.position).sub(car.pos);
      const dist = d.length(), min = b.r + car.r;
      if (dist > min || dist < 1e-4) continue;
      d.addScaledVector(b.dir, -d.dot(b.dir)).normalize();               // poussée horizontale
      const rel = Math.max(0, car.vel.dot(d));
      if (b.fixed) { if (rel > 0.3 && this.time - b.lastHit > 0.4) { b.lastHit = this.time; this.hit(b, tmp, rel); } if (car.push) car.push(d, min - dist, rel); continue; }   // obstacle fixe : c'est la voiture qui s'arrête
      if (rel < 0.15 && dist > min * 0.7) continue;
      this.hit(b, tmp.copy(d).multiplyScalar(rel * 1.15 + 0.8), rel);
      b.dir.addScaledVector(d, (min - dist) / P.groundRadius(b.dir)).normalize();
      car.bump(rel);
    }
    // collisions entre objets réveillés (effet domino)
    const L = this.list;
    for (let i = 0; i < L.length; i++) {
      const a = L[i]; if (!a.awake) continue;
      for (let j = 0; j < L.length; j++) {
        if (i === j) continue; const b = L[j];
        d.copy(b.mesh.position).sub(a.mesh.position);
        const dist = d.length(), min = (a.r + b.r) * 0.9;
        if (dist > min || dist < 1e-4) continue;
        d.addScaledVector(b.dir, -d.dot(b.dir)).normalize();
        const rel = a.vel.dot(d) - b.vel.dot(d);
        if (rel > 0.05) { const imp = rel * 0.6; this.hit(b, tmp.copy(d).multiplyScalar(imp), rel); a.vel.addScaledVector(d, -imp * 0.5); }
        b.dir.addScaledVector(d, (min - dist) * 0.5 / SEA_R).normalize();
      }
    }
    // mouvement, frottement, chute, petit rebond
    for (const b of L) {
      if (!b.awake) continue;
      b.vel.addScaledVector(b.dir, -b.vel.dot(b.dir));
      const sp = b.vel.length();
      if (sp > 1e-4) {
        axis.crossVectors(b.dir, b.vel).normalize();
        const next = tmp.copy(b.dir).applyAxisAngle(axis, sp * dt / SEA_R).normalize();
        if (P.heightDir(next) - P.heightDir(b.dir) > 0.35) b.vel.multiplyScalar(-0.3);   // ne grimpe pas les falaises
        else b.dir.copy(next);
      }
      b.vel.multiplyScalar(Math.exp(-dt * (b.down ? 4 : 2.2)));
      if (b.fall) { b.fall.t += dt * 2.6; if (b.fall.t >= 1) { b.local.premultiply(new THREE.Quaternion().setFromAxisAngle(b.fall.axis, Math.PI / 2)); b.fall = null; b.down = true; if (this.onHit) this.onHit(b, 2.5 + b.r * 4, true); } }
      if (b.hop > 0 || b.vh > 0) { b.vh -= 18 * dt; b.hop = Math.max(0, b.hop + b.vh * dt); if (b.hop === 0 && b.vh < 0) b.vh = b.vh < -2 ? -b.vh * 0.3 : 0; }
      this.place(b);
      if (sp < 0.03 && !b.fall && b.hop === 0 && b.vh === 0) b.awake = false;
    }
    // retour au bercail : l'objet se relève et glisse jusqu'à sa place, en sautillant
    for (const b of L) {
      if (b.moved && !b.awake && !b.ret && !b.fall && this.time - b.lastHit > 30) {
        b.ret = { t: 0, dir0: b.dir.clone(), q0: b.local.clone(), off0: b.down ? b.lie : 0 }; b.down = false;
      }
      if (!b.ret) continue;
      b.ret.t += dt / 1.6;
      const k = Math.min(1, b.ret.t), e = k * k * (3 - 2 * k);
      b.dir.copy(b.ret.dir0).lerp(b.home.dir, e).normalize();
      b.local.copy(b.ret.q0).slerp(b.home.local, e);
      b.retOff = b.ret.off0 * (1 - e) + Math.sin(Math.PI * k) * 0.35;
      if (k >= 1) { b.ret = null; b.moved = false; b.retOff = 0; b.vel.set(0, 0, 0); b.hop = 0; b.vh = 0; b.dir.copy(b.home.dir); b.local.copy(b.home.local); }
      this.place(b);
    }
  }
}

/* ---------- les zones ---------- */
export async function buildZones(planet, sections) {
  const group = new THREE.Group(), bodies = new Bodies(planet), glows = [];
  let font = null;
  try { font = await new FontLoader().loadAsync(FONT_URL); } catch (e) { /* sans police : pas de lettres */ }

  const woodM = new THREE.MeshStandardMaterial({ color: WOOD, roughness: 0.85 }), woodD = new THREE.MeshStandardMaterial({ color: WOOD_DARK, roughness: 0.9 });
  const crateGeo = new THREE.BoxGeometry(0.42, 0.42, 0.42).translate(0, 0.21, 0);
  const crateTex = canvasTex((g, w, h) => {
    g.fillStyle = WOOD; g.fillRect(0, 0, w, h);
    g.strokeStyle = WOOD_DARK; g.lineWidth = 14; g.strokeRect(7, 7, w - 14, h - 14);
    g.lineWidth = 10; g.beginPath(); g.moveTo(10, 10); g.lineTo(w - 10, h - 10); g.stroke();
    g.globalAlpha = 0.18; for (let y = 24; y < h; y += 22) { g.fillStyle = '#000'; g.fillRect(0, y, w, 2); }
  }, 128, 128);
  const crateM = new THREE.MeshStandardMaterial({ map: crateTex, roughness: 0.85 });
  const postGeo = new THREE.CylinderGeometry(0.05, 0.06, 1.1, 8).translate(0, 0.55, 0);

  const at = (z, x, y) => z.dir.clone().addScaledVector(z.t1, x / SEA_R).addScaledVector(z.t2, y / SEA_R).normalize();   // point (x, y) de la zone

  /* ---------- matériaux et petits modèles partagés ---------- */
  const paveTex = canvasTex((g, w, h) => {
    g.fillStyle = '#d2703a'; g.fillRect(0, 0, w, h);
    const N = 4, cs = w / N;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const off = (y % 2) * cs / 2, k = 0.9 + Math.random() * 0.16;
      g.fillStyle = `rgb(${Math.min(255, Math.round(246 * k))},${Math.round(150 * k)},${Math.round(78 * k)})`;
      g.fillRect(x * cs + off + 3, y * cs + 3, cs - 6, cs - 6);
      if (off) g.fillRect(-cs / 2 + 3, y * cs + 3, cs - 6, cs - 6);
    }
    g.globalAlpha = 0.08; for (let i = 0; i < 300; i++) { g.fillStyle = Math.random() < 0.5 ? '#000' : '#fff'; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  }, 256, 256);
  paveTex.wrapS = paveTex.wrapT = THREE.RepeatWrapping;
  const paveM = new THREE.MeshStandardMaterial({ map: paveTex, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 });
  const bushGeo = leafCluster(38, 0.34, 0.75, 0.18);
  const bushCols = ['#c9b52e', '#a7a02a', '#ec7a2e', '#ee6aa4'].map(c => new THREE.Color(c));
  const bushMats = bushCols.map(c => { const m = fadeNearCamera(LEAF_MAT.clone()); m.color = c; return m; });
  const bushM = k => bushMats[k % bushMats.length];
  const soilM = new THREE.MeshStandardMaterial({ color: '#6a342c', roughness: 1 });
  const flowerGeo = new THREE.IcosahedronGeometry(0.045, 0);
  const flowerM = ['#ff7aa8', '#ffffff', '#ffd23a', '#ff8a3a', '#b48cff'].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }));
  const pebbleGeo = new THREE.DodecahedronGeometry(1, 0), pebbleM = new THREE.MeshStandardMaterial({ color: '#c9b8f2', roughness: 0.7, flatShading: true });
  function makeBench() {
    const b = new THREE.Group();
    for (const z2 of [-0.07, 0.07]) { const slat = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.035, 0.11), woodM); slat.position.set(0, 0.22, z2); b.add(slat); }
    for (const y of [0.34, 0.45]) { const back = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.07, 0.03), woodM); back.position.set(0, y, -0.15); back.rotation.x = -0.15; b.add(back); }
    for (const x of [-0.34, 0.34]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.3), woodD); leg.position.set(x, 0.11, -0.02); b.add(leg); const up2 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.04), woodD); up2.position.set(x, 0.36, -0.15); b.add(up2); }
    return b;
  }
  function makeFence() {
    const f = new THREE.Group();
    for (const x of [-0.48, 0.48]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.45, 0.07).translate(0, 0.225, 0), woodD); p.position.x = x; f.add(p); }
    for (const y of [0.17, 0.34]) { const r = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.06, 0.04), woodM); r.position.y = y; f.add(r); }
    return f;
  }
  function makeLamp(c) {
    const lamp = new THREE.Group(), lm = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 2.2, roughness: 0.3 });
    lm.userData.glow = 2.2; lamp.userData.lamp = true;   // l'ambiance les avive la nuit
    lamp.add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.75, 8).translate(0, 0.375, 0), woodD));
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.16), lm); head.position.y = 0.84; lamp.add(head);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.1, 4).rotateY(Math.PI / 4), woodD); cap.position.y = 0.99; lamp.add(cap);
    return lamp;
  }
  function signBoard(text, w = 0.9, h = 0.2, arrow = 0) {
    const face = a => new THREE.MeshStandardMaterial({ roughness: 0.8, map: canvasTex((g, W, H) => {
      g.fillStyle = WOOD; g.fillRect(0, 0, W, H);
      g.globalAlpha = 0.15; for (let y = 14; y < H; y += 20) { g.fillStyle = '#000'; g.fillRect(0, y, W, 3); } g.globalAlpha = 1;
      g.fillStyle = '#fff8ea'; g.font = '800 40px Manrope, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      const str = (a < 0 ? '← ' : '') + text + (a > 0 ? ' →' : '');
      g.font = '900 46px Manrope, Arial, sans-serif'; g.lineJoin = 'round'; g.lineWidth = 9; g.strokeStyle = '#3a1608'; g.strokeText(str, W / 2, H / 2 + 2, W - 24);   // contour sombre : lisible de loin
      g.fillText(str, W / 2, H / 2 + 2, W - 24);
    }, 512, 112) });
    // lisible des deux côtés : vue de dos, la flèche s'inverse (elle montre toujours la bonne direction)
    return new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.04), [woodM, woodM, woodM, woodM, face(arrow), face(-arrow)]);
  }
  /** Lacet (repère de l'objet) pour regarder vers une direction donnée. */
  function yawToward(dir, target) {
    const f = new THREE.Quaternion().setFromUnitVectors(Y, dir);
    const v = target.clone().sub(dir); v.addScaledVector(dir, -v.dot(dir)).normalize().applyQuaternion(f.invert());
    return Math.atan2(v.x, v.z);
  }
  const yawToPoint = (dir, target) => yawToward(dir, target);

  /* ---------- un objet propre à chaque zone ---------- */
  const lathe = (pts, m) => new THREE.Mesh(new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), 16), m);
  const THEMES = {
    profil({ add }) {   // une partie de quilles
      const white = new THREE.MeshStandardMaterial({ color: '#f7f4ee', roughness: 0.4 }), red = new THREE.MeshStandardMaterial({ color: '#ff5a3c', roughness: 0.4 });
      const rows = [[0], [-0.5, 0.5], [-1, 0, 1], [-1.5, -0.5, 0.5, 1.5]];
      rows.forEach((row, r) => row.forEach(c => {
        const pin = new THREE.Group();
        pin.add(lathe([[0, 0], [0.05, 0.01], [0.07, 0.1], [0.05, 0.2], [0.03, 0.26], [0.045, 0.32], [0.035, 0.37], [0, 0.38]], white));
        const band = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.03, 12), red); band.position.y = 0.255; pin.add(band);
        add(pin, -2.1 + c * 0.2, -0.7 - r * 0.18, { r: 0.07, lie: 0.06 });
      }));
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 14).translate(0, 0.13, 0), new THREE.MeshStandardMaterial({ color: '#3d5afe', roughness: 0.25 }));
      add(ball, -2.1, 0.6, { r: 0.13, topple: false });
    },
    photos({ add, color }) {   // un appareil photo sur trépied
      const g = new THREE.Group(), dark = new THREE.MeshStandardMaterial({ color: '#2b2b40', roughness: 0.5 });
      for (let k = 0; k < 3; k++) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.7, 6).translate(0, 0.35, 0), dark); leg.rotation.set(0.28 * Math.cos(k * 2.1), 0, 0.28 * Math.sin(k * 2.1)); g.add(leg); }
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.14), new THREE.MeshStandardMaterial({ color, roughness: 0.4 })); body.position.y = 0.78; g.add(body);
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.12, 16).rotateX(Math.PI / 2), dark); lens.position.set(0, 0.78, 0.12); g.add(lens);
      add(g, 2.4, -1.3, { r: 0.2, lie: 0.08 });
    },
    contact({ add, color }) {   // une boîte aux lettres
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.6, 0.06).translate(0, 0.3, 0), woodD));
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.2, 0.36), new THREE.MeshStandardMaterial({ color, roughness: 0.4 })); box.position.y = 0.7; g.add(box);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.36, 16, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2), box.material); top.position.y = 0.8; g.add(top);
      const flag = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.16, 0.08), new THREE.MeshStandardMaterial({ color: '#ff5a3c' })); flag.position.set(0.15, 0.86, -0.08); g.add(flag);
      add(g, 2.3, -1.2, { r: 0.2, lie: 0.1 });
    },
    parcours({ add }) {   // un poteau à flèches
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.4, 8).translate(0, 0.7, 0), woodD));
      [['Hier', -1, 1.25, 0.4], ['Aujourd’hui', 1, 1.0, -0.3], ['Demain', 1, 0.75, 0.9]].forEach(([t, ar, y, rot]) => { const b = signBoard(t, 0.8, 0.18, ar); b.position.y = y; b.rotation.y = rot; g.add(b); });
      add(g, 2.4, -1.3, { r: 0.25, lie: 0.06 });
    },
    perso({ add, color }) {   // une petite fusée
      const g = new THREE.Group(), white = new THREE.MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.4 }), acc = new THREE.MeshStandardMaterial({ color, roughness: 0.4 });
      g.add(lathe([[0, 0.12], [0.13, 0.14], [0.15, 0.4], [0.13, 0.62], [0.08, 0.78], [0, 0.88]], white));
      const win = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), new THREE.MeshStandardMaterial({ color: '#9fd8ff', roughness: 0.1 })); win.position.set(0, 0.5, 0.14); g.add(win);
      for (let k = 0; k < 3; k++) { const fin = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.22, 0.14), acc); const a = k / 3 * Math.PI * 2; fin.position.set(Math.sin(a) * 0.15, 0.2, Math.cos(a) * 0.15); fin.rotation.y = a; g.add(fin); }
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 12), acc); nose.position.y = 0.86; g.add(nose);
      add(g, 2.4, -1.3, { r: 0.2, lie: 0.14 });
    },
    services({ add }) {   // une pile de caisses
      [[2.2, -1.0], [2.65, -1.0], [3.1, -1.0], [2.42, -1.45], [2.88, -1.45], [2.65, -1.9]].forEach(([x, y]) => { const c = new THREE.Mesh(crateGeo, crateM); add(c, x, y, { r: 0.24, topple: false }, Math.random() * 0.4); });
    },
    travaux({ add, color }) {   // un chevalet et sa toile
      const g = new THREE.Group();
      for (const [x, rz] of [[-0.18, 0.12], [0.18, -0.12]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.0, 0.04).translate(0, 0.5, 0), woodD); l.position.x = x; l.rotation.z = rz; l.rotation.x = -0.12; g.add(l); }
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.9, 0.04).translate(0, 0.45, 0), woodD); back.position.z = -0.25; back.rotation.x = 0.3; g.add(back);
      const tex = canvasTex((c, W, H) => { const gr = c.createLinearGradient(0, 0, W, H); gr.addColorStop(0, '#' + color.getHexString()); gr.addColorStop(1, '#3d5afe'); c.fillStyle = gr; c.fillRect(0, 0, W, H); c.fillStyle = 'rgba(255,255,255,.85)'; c.beginPath(); c.arc(W * 0.62, H * 0.4, W * 0.16, 0, 7); c.fill(); c.fillRect(W * 0.15, H * 0.7, W * 0.5, H * 0.07); }, 256, 192);
      const canvas = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.45, 0.03), [woodM, woodM, woodM, woodM, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }), woodM]); canvas.position.set(0, 0.72, 0.04); canvas.rotation.x = -0.12; g.add(canvas);
      add(g, 2.4, -1.3, { r: 0.3, lie: 0.06 });
    },
  };

  for (const s of sections) {
    const z = planet.pavilions.find(p => p.id === s.id); if (!z) continue;
    const color = new THREE.Color(s.color);

    // cercle lumineux au sol et nom de la zone imprimé devant (chacun orienté selon le sol sous lui)
    const lay = (mesh, x, y, lift) => {
      const dir = at(z, x, y);
      mesh.position.copy(dir).multiplyScalar(planet.heightDir(dir) + lift);
      mesh.quaternion.setFromUnitVectors(Y, dir).multiply(new THREE.Quaternion().setFromAxisAngle(Y, yawToFace(dir, z)));
      group.add(mesh); return mesh;
    };
    const ring = lay(new THREE.Mesh(new THREE.RingGeometry(1.0, 1.18, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 })), 0, 0, 0.1);
    glows.push(ring);
    lay(new THREE.Mesh(new THREE.CircleGeometry(1.0, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 })), 0, 0, 0.1);
    const label = canvasTex((g, w, h) => {
      g.clearRect(0, 0, w, h); g.fillStyle = 'rgba(255,255,255,0.92)'; g.font = '800 92px Manrope, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(s.label.toUpperCase(), w / 2, h / 2 + 4);
    }, 1024, 160);
    lay(new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.375).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: label, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 })), 0, 1.55, 0.1);

    // grandes lettres en relief, alignées derrière le cercle
    if (font) {
      const word = WORDS[s.id] || s.label.toUpperCase(), size = 0.62, depth = 0.28;
      const geos = [...word].map(ch => {
        const g = new TextGeometry(ch, { font, size, depth, curveSegments: 6, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.02, bevelSegments: 2 });
        g.computeBoundingBox(); const bb = g.boundingBox;
        g.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
        g.computeBoundingBox(); return g;
      });
      const widths = geos.map(g => g.boundingBox.max.x - g.boundingBox.min.x), gap = 0.1;
      const total = widths.reduce((a, b) => a + b, 0) + gap * (geos.length - 1);
      const letterM = new THREE.MeshStandardMaterial({ color: CREAM, roughness: 0.5 });
      const accentM = new THREE.MeshStandardMaterial({ color, roughness: 0.45 });
      let x = -total / 2;
      geos.forEach((g, i) => {
        const cx = x + widths[i] / 2; x += widths[i] + gap;
        const m = new THREE.Mesh(g, i === 0 ? accentM : letterM);
        // accent aigu sur le E de STÉPHANE
        if (s.id === 'profil' && i === 2) { const acc = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, depth), letterM); acc.position.set(0.04, size + 0.18, 0); acc.rotation.z = -0.75; m.add(acc); }
        group.add(m);
        // l'arc des lettres suit l'esplanade : chacune est posée dans son propre repère
        const dir = at(z, -cx, -1.75);
        bodies.add(m, dir, yawToFace(dir, z), { r: Math.max(0.22, widths[i] * 0.5), lie: depth / 2 + 0.03 });
      });
    }

    // panneau en bois avec le titre de la section
    {
      const sign = new THREE.Group();
      sign.add(new THREE.Mesh(postGeo, woodD));
      const tex = canvasTex((g, w, h) => {
        g.fillStyle = WOOD; g.fillRect(0, 0, w, h);
        g.globalAlpha = 0.15; for (let y = 18; y < h; y += 26) { g.fillStyle = '#000'; g.fillRect(0, y, w, 3); } g.globalAlpha = 1;
        g.fillStyle = '#fff8ea'; g.font = '800 46px Manrope, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(s.title, w / 2, h / 2 + 2, w - 30);
      }, 512, 128);
      const board = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 0.05), [woodM, woodM, woodM, woodM, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }), woodM]);
      board.position.set(0, 0.95, 0.04); sign.add(board);
      group.add(sign);
      const dir = at(z, 3.3, -0.2);
      bodies.add(sign, dir, yawToFace(dir, z) - 0.4, { r: 0.3, lie: 0.06 });
    }

    // caisses et lanternes
    for (const [cx, cy] of [[-2.9, 0.2], [-3.3, 0.65], [-2.7, 0.75]]) {
      const c = new THREE.Mesh(crateGeo, crateM); group.add(c);
      bodies.add(c, at(z, cx, cy), Math.random() * 6, { r: 0.24, topple: false });
    }
    const lampTop = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.8, roughness: 0.3 }); lampTop.userData.glow = 1.8;
    for (const [lx, ly] of [[-1.25, 1.35], [1.25, 1.35]]) {
      const lamp = new THREE.Group(); lamp.userData.lamp = true;
      lamp.add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.75, 8).translate(0, 0.375, 0), woodD));
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.16), lampTop); head.position.y = 0.84; lamp.add(head);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.1, 4).rotateY(Math.PI / 4), woodD); cap.position.y = 0.99; lamp.add(cap);
      group.add(lamp);
      bodies.add(lamp, at(z, lx, ly), 0, { r: 0.16, lie: 0.08 });
    }

    /* ----- dallage de l'esplanade, qui épouse le sol ----- */
    {
      const RINGS = 12, SEG = 56, RAD = 3.05, pos = [], uv = [], idx = [];
      for (let r = 0; r <= RINGS; r++) for (let k = 0; k <= SEG; k++) {
        const rr = RAD * r / RINGS, a = k / SEG * Math.PI * 2, x = Math.cos(a) * rr, y = Math.sin(a) * rr, d = at(z, x, y);
        const p = d.multiplyScalar(planet.heightDir(d) + 0.035); pos.push(p.x, p.y, p.z); uv.push(x / 1.6, y / 1.6);
      }
      for (let r = 0; r < RINGS; r++) for (let k = 0; k < SEG; k++) { const a = r * (SEG + 1) + k, b = a + SEG + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
      const nn = g.attributes.normal; for (let i = 0; i < nn.count; i++) { const v = new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).normalize(); nn.setXYZ(i, v.x, v.y, v.z); }
      const m = new THREE.Mesh(g, paveM); m.receiveShadow = true; group.add(m);
    }

    /* ----- buissons autour de l'esplanade (l'avant reste dégagé) ----- */
    for (let k = 0; k < 11; k++) {
      const a = k / 11 * Math.PI * 2 + 0.3;
      if (Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))) < 0.75) continue;   // passage vers l'avant (+t2)
      const rr = 3.25 + Math.random() * 0.35, d = at(z, Math.cos(a) * rr, Math.sin(a) * rr), s2 = 0.75 + Math.random() * 0.45;
      const b = new THREE.Mesh(bushGeo, bushM(k)); b.position.copy(d).multiplyScalar(planet.heightDir(d) + 0.1 * s2);
      b.quaternion.setFromUnitVectors(Y, d); b.scale.set(s2, s2 * 0.8, s2); b.castShadow = true; group.add(b);
    }

    /* ----- bancs sur les côtés, tournés vers le cercle ----- */
    for (const side of [-1, 1]) {
      const bench = makeBench(); group.add(bench);
      const d = at(z, side * 2.35, 1.0);
      bodies.add(bench, d, yawToPoint(d, z.dir), { r: 0.36, lie: 0.12 });
    }

    /* ----- clôture en bois derrière les lettres ----- */
    for (let k = -2; k <= 2; k++) {
      const f = makeFence(); group.add(f);
      const d = at(z, k * 1.05, -2.7);
      bodies.add(f, d, yawToFace(d, z), { r: 0.42, lie: 0.06 });
    }

    /* ----- parterre fleuri ----- */
    for (const side of [-1, 1]) {
      const bed = new THREE.Group();
      bed.add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.14, 0.42).translate(0, 0.07, 0), woodD));
      bed.add(new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.04, 0.34).translate(0, 0.14, 0), soilM));
      for (let i = 0; i < 14; i++) {
        const fl = new THREE.Mesh(flowerGeo, flowerM[i % flowerM.length]); fl.position.set(-0.36 + (i % 7) * 0.12, 0.2 + Math.random() * 0.06, i < 7 ? -0.08 : 0.08); fl.scale.setScalar(0.8 + Math.random() * 0.5); bed.add(fl);
      }
      group.add(bed);
      const d = at(z, side * 3.0, -1.9);
      bodies.add(bed, d, yawToFace(d, z) + side * 0.5, { r: 0.4, topple: false });
    }

    /* ----- cailloux clairs semés sur les dalles ----- */
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * Math.PI * 2, rr = 1.4 + Math.random() * 1.5, d = at(z, Math.cos(a) * rr, Math.sin(a) * rr);
      const p = new THREE.Mesh(pebbleGeo, pebbleM); const sc = 0.05 + Math.random() * 0.05;
      p.position.copy(d).multiplyScalar(planet.heightDir(d) + 0.04); p.quaternion.setFromUnitVectors(Y, d); p.scale.set(sc * 1.4, sc * 0.7, sc); group.add(p);
    }

    /* ----- un objet propre à chaque zone ----- */
    const theme = THEMES[s.id];
    if (theme) theme({ z, at, color, add: (obj, x, y, opts, yaw) => { group.add(obj); const d = at(z, x, y); return bodies.add(obj, d, yaw !== undefined ? yaw : yawToFace(d, z), opts); } });
  }

  /* ---------- le long des routes : lanternes, bancs, et un panneau indicateur à mi-chemin ---------- */
  const labelOf = dir => { const s2 = sections.find(x => x.dir.dot(dir) > 0.9999); return s2 ? s2.label : ''; };
  const dry = d => !planet.isWet(d) && !(planet.bridgeR && planet.bridgeR(d) > 0);
  for (const e of planet.edges || []) {
    const start = (2.6 + 0.6 + 0.9) / SEA_R, stop = e.len - start;
    let k = 0;
    for (let th = start; th < stop; th += 3.2 / SEA_R, k++) {
      const side = k % 2 ? 1.25 : -1.25, d = e.point(th, side);
      if (!dry(d) || planet.onPlaza(d, 0.4 / SEA_R)) continue;
      const lamp = makeLamp(new THREE.Color('#ffd27a')); group.add(lamp);
      bodies.add(lamp, d, 0, { r: 0.16, lie: 0.08 });
      if (k % 3 === 1) {
        const d2 = e.point(th + 0.9 / SEA_R, side * 1.2);
        if (dry(d2)) { const bench = makeBench(); group.add(bench); bodies.add(bench, d2, yawToward(d2, e.point(th + 0.9 / SEA_R, 0)), { r: 0.36, lie: 0.12 }); }
      }
    }
    // panneau indicateur sur le bas-côté : un endroit bien dégagé (loin des ponts, de l'eau et des arbres), vers le milieu de la route
    if (e.len * SEA_R > 7) {
      let best = null, bs = -1e9;
      for (let k = 0.3; k <= 0.701; k += 0.05) for (const side of [-1.55, 1.55]) {
        const th = e.len * k, d = e.point(th, side);
        if (!dry(d) || planet.onPlaza && planet.onPlaza(d, 0.8 / SEA_R)) continue;
        let sc = -Math.abs(k - 0.5) * 4;
        const bi = planet.bridgeAt && planet.bridgeAt(d); if (bi) continue;                                           // pas contre un pont
        for (const a of [0, 1.6, 3.2, 4.8]) { const q = d.clone().add(new THREE.Vector3(Math.cos(a), Math.sin(a), Math.cos(a * 1.7)).projectOnPlane(d).normalize().multiplyScalar(2.2 / SEA_R)).normalize(); if (planet.isWet(q)) sc -= 3; }   // ni au bord de l'eau
        for (const t of planet.treeDirs) if (t.dot(d) > Math.cos(1.6 / SEA_R)) sc -= 1.5;                              // ni dans les arbres
        if (sc > bs) { bs = sc; best = { d, th, side }; }
      }
      if (best) {
        const { d: at, th, side } = best, post = new THREE.Group();
        post.userData.signpost = true;   // (cliquable : la caméra vient se mettre en face)
        post.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.45, 8).translate(0, 0.72, 0), woodD));
        // les panonceaux partent sur le côté du poteau (ils ne le traversent plus), chacun du côté de sa flèche
        const toA = signBoard(labelOf(e.a), 0.9, 0.2, -1); toA.position.set(-(0.45 + 0.065), 1.28, 0); post.add(toA);
        const toB = signBoard(labelOf(e.b), 0.9, 0.2, 1); toB.position.set(0.45 + 0.065, 1.02, 0); post.add(toB);
        const cap = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.1, 8), woodD); cap.position.y = 1.5; post.add(cap);
        group.add(post);
        // les flèches suivent la route : l'axe x du panneau pointe vers B
        bodies.add(post, at, yawToward(at, e.point(th + 1 / SEA_R, side)) - Math.PI / 2, { r: 0.25, lie: 0.06, topple: false, fixed: true });   // bien planté : il ne tombe pas, ne glisse pas
      }
    }
  }

  /* ---------- ponts en bois : planches, garde-corps, piles plantées dans l'eau ---------- */
  {
    const planks = [], posts = [], rails = [], piles = [];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), basis = new THREE.Matrix4();
    const up = new THREE.Vector3(), fwd = new THREE.Vector3(), right = new THREE.Vector3();
    const frame = (e, th, side) => {
      const d = e.point(th, side);
      fwd.copy(e.point(th + 0.05 / SEA_R, side)).sub(e.point(th - 0.05 / SEA_R, side)).normalize();
      up.copy(d); fwd.addScaledVector(up, -fwd.dot(up)).normalize(); right.crossVectors(up, fwd).normalize();
      q.setFromRotationMatrix(basis.makeBasis(right, up, fwd));
      return d;
    };
    for (const b of planet.bridges || []) {
      const e = b.e;
      // planches
      for (let th = b.t0; th <= b.t1; th += 0.24 / SEA_R) {
        const d = frame(e, th, 0), top = b.deck(th) + 0.07, w = 2.05 + Math.random() * 0.2;   // un peu plus large qu'avant
        {   // incline la planche selon la pente
          const pa = e.point(th - 0.05 / SEA_R).multiplyScalar(b.deck(th - 0.05 / SEA_R)), pb = e.point(th + 0.05 / SEA_R).multiplyScalar(b.deck(th + 0.05 / SEA_R));
          fwd.copy(pb).sub(pa).normalize(); right.crossVectors(d, fwd).normalize(); up.crossVectors(fwd, right).normalize();
          q.setFromRotationMatrix(basis.makeBasis(right, up, fwd));
        }
        planks.push([m4.compose(p.copy(d).multiplyScalar(top - 0.035), q, sc.set(w, 1, 1)).clone(), new THREE.Color(WOOD).multiplyScalar(0.85 + Math.random() * 0.25)]);
      }
      // garde-corps : poteaux tous les mètres, deux lisses entre eux
      for (const side of [-1.05, 1.05]) {
        let prev = null;
        for (let th = b.t0 + 0.3 / SEA_R; th <= b.t1 - 0.3 / SEA_R + 1e-6; th += 1.0 / SEA_R) {
          const d = frame(e, th, side), base = b.deck(th) + 0.07, foot = d.clone().multiplyScalar(base);
          posts.push(m4.compose(p.copy(d).multiplyScalar(base + 0.26), q, sc.set(1, 1, 1)).clone());
          if (prev) for (const hgt of [0.26, 0.48]) {
            const a = prev.foot.clone().addScaledVector(prev.d, hgt), c = foot.clone().addScaledVector(d, hgt), L = a.distanceTo(c);
            m4.lookAt(a, c, d); m4.setPosition(a.add(c).multiplyScalar(0.5)); m4.scale(sc.set(1, 1, L));
            rails.push(m4.clone());
          }
          prev = { foot, d };
        }
      }
      // piles dans l'eau
      for (let th = b.t0 + 1.2 / SEA_R; th <= b.t1 - 1.2 / SEA_R; th += 2.4 / SEA_R) for (const side of [-0.88, 0.88]) {
        const d = frame(e, th, side), top = b.deck(th) - 0.02, bed = Math.min(planet.heightDir(d), planet.waterR - 0.4), L = top - bed;
        if (L < 0.15 || !planet.isWet(d)) continue;
        piles.push(m4.compose(p.copy(d).multiplyScalar((top + bed) / 2), q, sc.set(1, L, 1)).clone());
      }
    }
    const make = (geo, mat, list, colored) => {
      if (!list.length) return;
      const m = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((it, i) => { if (colored) { m.setMatrixAt(i, it[0]); m.setColorAt(i, it[1]); } else m.setMatrixAt(i, it); });
      m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; group.add(m);
    };
    make(new THREE.BoxGeometry(1, 0.07, 0.2), new THREE.MeshStandardMaterial({ roughness: 0.85 }), planks, true);
    make(new THREE.BoxGeometry(0.08, 0.52, 0.08), woodD, posts);
    make(new THREE.BoxGeometry(0.05, 0.06, 1), woodM, rails);
    make(new THREE.CylinderGeometry(0.08, 0.09, 1, 8), woodD, piles);
  }


  /** Lacet (dans le repère de l'objet) pour que sa face avant regarde l'avant de la zone (+t2). */
  function yawToFace(dir, z) {
    const f = new THREE.Quaternion().setFromUnitVectors(Y, dir);
    const localFwd = z.t2.clone().addScaledVector(dir, -z.t2.dot(dir)).normalize().applyQuaternion(f.invert());
    return Math.atan2(localFwd.x, localFwd.z);
  }

  // moins d'appels de dessin (vital sur téléphone) : chaque objet fusionne ses pièces qui partagent un matériau
  const keep = new Set(glows), mInv = new THREE.Matrix4(), mRel = new THREE.Matrix4();
  const compact = root => {
    root.updateMatrixWorld(true); mInv.copy(root.matrixWorld).invert();
    const buckets = new Map();
    root.traverse(o => {
      if (o === root || !o.isMesh || o.isInstancedMesh || o.children.length || keep.has(o) || Array.isArray(o.material) || o.customDepthMaterial || Object.keys(o.userData).length) return;
      const m = o.material; if (m.transparent || m.alphaTest > 0 || m.userData.glow !== undefined) return;
      if (o.matrixWorld.determinant() * root.matrixWorld.determinant() < 0) return;   // pièce en miroir : on la laisse
      const g = o.geometry, sig = m.uuid + '|' + Object.keys(g.attributes).sort().join(',') + '|' + (g.index ? 'i' : 'n') + '|' + o.castShadow + o.receiveShadow + o.renderOrder;
      if (!buckets.has(sig)) buckets.set(sig, []); buckets.get(sig).push(o);
    });
    let saved = 0;
    for (const list of buckets.values()) {
      if (list.length < 2) continue;
      let merged = null;
      try { merged = mergeGeometries(list.map(o => { const g = o.geometry.clone(); for (const k in g.morphAttributes) delete g.morphAttributes[k]; return g.applyMatrix4(mRel.multiplyMatrices(mInv, o.matrixWorld)); })); } catch (e) { merged = null; }
      if (!merged) continue;
      const mm = new THREE.Mesh(merged, list[0].material);
      mm.castShadow = list[0].castShadow; mm.receiveShadow = list[0].receiveShadow; mm.renderOrder = list[0].renderOrder;
      root.add(mm); list.forEach(o => o.parent.remove(o)); saved += list.length - 1;
    }
    return saved;
  };
  let saved = 0;
  bodies.list.forEach(b => { saved += compact(b.mesh); });
  group.children.forEach(c => { if (c.isGroup && !bodies.list.some(b => b.mesh === c)) saved += compact(c); });
  group.userData.merged = saved;

  function update(dt, t, car) {
    bodies.step(dt, car);
    glows.forEach((g, i) => { g.material.opacity = 0.65 + 0.3 * Math.sin(t * 2.2 + i); });
  }
  return { group, update, bodies };
}
