/* ============================================================================
   Le van de la radio WSQK (clin d'œil à une série des années 80) : maquette
   d'un grand van américain, caisse bleue, bande crème en tête d'aigle, lignes
   arc-en-ciel en zigzag, antenne grillagée sur le toit (elle sert de boussole
   radio). Avant en +z ; même voie que la Jeep (roues en x ±0,37, rayon 0,2),
   mais empattement plus long : roues en z +0,62 et -0,60.
   ============================================================================ */
import * as THREE from 'three';

const BLUE = '#2d6fd6', CREAM = '#e7dcc0', RED = '#d9303f';
export const VAN_WHEEL_Z = { front: 0.62, rear: -0.6 };
export const VAN_LEN = { front: 1.04, rear: 1.06, half: 0.44 };   // encombrement (collisions)

/* ---------- habillage dessiné sur toile ---------- */
// Flanc : la toile couvre z de 0,98 (avant) à -1,00 (arrière) et y de 1,00 (haut) à 0,30 (bas).
const SIDE_Z0 = 0.98, SIDE_L = 1.98, SIDE_Y0 = 1.0, SIDE_H = 0.7;
function sideTexture(frontLeft) {
  const W = 1024, H = Math.round(W * SIDE_H / SIDE_L), c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  if (!frontLeft) { g.translate(W, 0); g.scale(-1, 1); }   // l'autre flanc : avant à droite (le texte est redressé plus bas)
  const U = u => u * W, V = v => v * H, u = z => (SIDE_Z0 - z) / SIDE_L, v = y => (SIDE_Y0 - y) / SIDE_H;
  const ZU = z => U(u(z)), YV = y => V(v(y));
  // lignes arc-en-ciel : horizontales vers l'arrière, avec un grand zigzag en éclair
  const cols = ['#3fd0e6', '#3a8cf0', '#a05ad8', '#e8384a', '#f2c230', '#f08a2a'];
  g.lineWidth = H * 0.011; g.lineJoin = 'miter';
  cols.forEach((col, i) => {
    const y = V(0.62 + i * 0.03), yt = V(0.36 + i * 0.03), dz = i * U(0.012);
    g.strokeStyle = col; g.beginPath();
    g.moveTo(U(0.3), y); g.lineTo(U(0.66) + dz, y); g.lineTo(U(0.73) + dz, yt); g.lineTo(U(0.8) + dz, yt); g.lineTo(U(0.74) + dz, y); g.lineTo(U(1.0), y);
    g.stroke();
  });
  // tête d'aigle crème à l'avant : bord supérieur en dents de scie, bec tourné vers l'arrière
  g.fillStyle = CREAM; g.beginPath(); g.moveTo(0, V(0.48));
  for (let i = 0; i < 6; i++) { g.lineTo(U(0.025 + i * 0.04), V(0.42 - i * 0.01)); g.lineTo(U(0.045 + i * 0.04), V(0.5 - i * 0.008)); }
  g.lineTo(U(0.29), V(0.46)); g.lineTo(U(0.34), V(0.54)); g.lineTo(U(0.3), V(0.585)); g.lineTo(U(0.27), V(0.6));
  for (let i = 0; i < 5; i++) { g.lineTo(U(0.25 - i * 0.04), V(0.68 + (i % 2) * 0.06)); g.lineTo(U(0.225 - i * 0.04), V(0.62 + (i % 2) * 0.05)); }
  g.lineTo(U(0.015), V(0.74)); g.lineTo(0, V(1)); g.closePath(); g.fill();
  g.fillStyle = '#1b2a4a'; g.beginPath(); g.arc(U(0.272), V(0.505), H * 0.016, 0, Math.PI * 2); g.fill();   // œil
  // vitre de portière (son bord avant suit le pare-brise incliné), avec un reflet
  g.fillStyle = '#141d2b'; g.beginPath();
  g.moveTo(ZU(0.69), YV(0.67)); g.lineTo(ZU(0.535), YV(0.95)); g.lineTo(ZU(0.22), YV(0.95)); g.lineTo(ZU(0.22), YV(0.67)); g.fill();
  g.fillStyle = 'rgba(190,220,255,0.22)'; g.beginPath();
  g.moveTo(ZU(0.5), YV(0.92)); g.lineTo(ZU(0.43), YV(0.92)); g.lineTo(ZU(0.55), YV(0.7)); g.lineTo(ZU(0.62), YV(0.7)); g.fill();
  // joints des portes (portière, porte coulissante, battants arrière) et poignées chromées
  g.strokeStyle = 'rgba(12,30,70,0.75)'; g.lineWidth = Math.max(2, H * 0.006);
  for (const z of [0.2, 0.12, -0.44, -0.97]) { g.beginPath(); g.moveTo(ZU(z), YV(0.97)); g.lineTo(ZU(z), YV(0.33)); g.stroke(); }
  g.beginPath(); g.moveTo(ZU(0.12), YV(0.97)); g.lineTo(ZU(-0.44), YV(0.97)); g.stroke();
  g.beginPath(); g.moveTo(ZU(0.71), YV(0.64)); g.lineTo(ZU(0.72), YV(0.33)); g.stroke();
  g.fillStyle = '#e4e8ee'; for (const z of [0.26, 0.06]) g.fillRect(ZU(z) - W * 0.012, YV(0.62), W * 0.024, H * 0.018);
  // textes (toujours lisibles : on annule le miroir)
  g.setTransform(1, 0, 0, 1, 0, 0);
  const X = uu => (frontLeft ? U(uu) : W - U(uu));
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `italic 900 ${Math.round(H * 0.33)}px "Arial Black", Impact, sans-serif`;
  g.lineWidth = H * 0.018; g.strokeStyle = '#7a1420'; g.fillStyle = RED;
  g.save(); g.translate(X(0.56), V(0.25)); g.transform(1, 0, -0.12, 1, 0, 0); g.strokeText('WSQK', 0, 0); g.fillText('WSQK', 0, 0); g.restore();
  g.font = `700 ${Math.round(H * 0.115)}px "Arial", sans-serif`; g.fillStyle = '#ffffff'; g.fillText('94.5 FM', X(0.58), V(0.485));
  g.font = `italic 700 ${Math.round(H * 0.07)}px Georgia, serif`; g.fillStyle = RED; g.fillText('The SQUAWK', X(0.6), V(0.86));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function hoodTexture() {
  const W = 512, H = 180, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  g.fillStyle = CREAM; g.beginPath(); g.moveTo(0, H);
  for (let i = 0; i <= 12; i++) g.lineTo(i * W / 12, i % 2 ? H * 0.3 : H * 0.04);
  g.lineTo(W, H); g.fill();
  g.font = `italic 900 ${Math.round(H * 0.4)}px "Arial Black", Impact, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = RED; g.save(); g.translate(W / 2, H * 0.66); g.transform(1, 0, -0.12, 1, 0, 0); g.fillText('WSQK', 0, 0); g.restore();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function plateTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64; const g = c.getContext('2d');
  g.fillStyle = '#2a78d8'; g.fillRect(0, 0, 128, 64); g.strokeStyle = '#fff'; g.lineWidth = 4; g.strokeRect(3, 3, 122, 58);
  g.fillStyle = '#fff'; g.font = '700 26px Arial, sans-serif'; g.textAlign = 'center'; g.fillText('94.5 FM', 64, 32);
  g.beginPath(); g.moveTo(40, 40); g.lineTo(60, 46); g.lineTo(56, 40); g.lineTo(88, 52); g.lineTo(66, 44); g.lineTo(70, 50); g.closePath(); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function glowTexture() {   // halo doux pour les feux
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.25, 'rgba(255,255,255,0.55)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
}
let TEX = null;
const textures = () => TEX || (TEX = { right: sideTexture(false), left: sideTexture(true), hood: hoodTexture(), plate: plateTexture(), glow: glowTexture() });

/**
 * Le van. wheels : false pour la version montée sur la voiture du joueur (ses roues viennent se loger dans celles de la Jeep).
 * userData : { antenna (pivot qui tourne), lights (matériau des phares), tail (feux arrière), glows (halos), wheelPart () => une roue }.
 */
export function makeVan({ wheels = true } = {}) {
  const van = new THREE.Group(), T = textures();
  const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, ...o });
  const blue = mat(BLUE, { roughness: 0.32, metalness: 0.12 }), cream = mat(CREAM, { roughness: 0.5 }), chrome = mat('#dfe3ea', { roughness: 0.18, metalness: 0.9 });
  const dark = mat('#191c25', { roughness: 0.75 }), trim = mat('#2a2d36', { roughness: 0.6 }), glass = mat('#18273a', { roughness: 0.08, metalness: 0.35 });
  const lights = mat('#fff6d8', { emissive: '#fff0c0', emissiveIntensity: 2.2 }); lights.userData.glow = 2.2;
  const tail = mat('#ff0010', { emissive: '#ff0008', emissiveIntensity: 1.5 }), amber = mat('#ffae3a', { emissive: '#ff8a10', emissiveIntensity: 1.4 });
  const add = (geo, m, x = 0, y = 0, z = 0, parent = van) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); parent.add(o); return o; };
  const box = (w, h, d, m, x, y, z) => add(new THREE.BoxGeometry(w, h, d), m, x, y, z);

  // caisse : profil latéral extrudé sur la largeur, arêtes arrondies (toit plat, pare-brise incliné, capot court)
  const B = 0.05, prof = [[-1.0, 0.30], [-1.0, 1.0], [0.52, 1.0], [0.72, 0.64], [0.98, 0.585], [0.98, 0.30]];
  const sh = new THREE.Shape(); prof.forEach(([z, y], i) => { const pz = z - Math.sign(z) * B, py = y + (y > 0.5 ? -B : B); i ? sh.lineTo(pz, py) : sh.moveTo(pz, py); }); sh.closePath();
  const bodyGeo = new THREE.ExtrudeGeometry(sh, { depth: 0.8 - 2 * B, bevelEnabled: true, bevelThickness: B, bevelSize: B, bevelSegments: 3, curveSegments: 1 });
  bodyGeo.rotateY(-Math.PI / 2).translate(0.4 - B, 0, 0);
  add(bodyGeo, blue);
  // pare-brise
  { const a = Math.atan2(0.36, 0.2), L = Math.hypot(0.2, 0.36);
    const ws = add(new THREE.PlaneGeometry(0.7, L * 0.86), glass, 0, 0.82, 0.62); ws.rotation.x = -(Math.PI / 2 - a); ws.position.addScaledVector(new THREE.Vector3(0, Math.cos(a), Math.sin(a)), 0.004);
    box(0.012, L * 0.9, 0.012, trim, 0, 0.82, 0.625).rotation.x = -(Math.PI / 2 - a);   // montant central
  }
  // flancs peints (livrée), hublot en relief à l'arrière
  [[1, T.left], [-1, T.right]].forEach(([sd, map]) => {
    const p = add(new THREE.PlaneGeometry(SIDE_L, SIDE_H), mat('#ffffff', { map, alphaTest: 0.5, roughness: 0.38, polygonOffset: true, polygonOffsetFactor: -2 }), sd * 0.402, SIDE_Y0 - SIDE_H / 2, SIDE_Z0 - SIDE_L / 2);
    p.rotation.y = sd * Math.PI / 2;
    const ring = add(new THREE.TorusGeometry(0.075, 0.016, 8, 24), chrome, sd * 0.405, 0.78, -0.75); ring.rotation.y = Math.PI / 2;
    const bub = add(new THREE.SphereGeometry(0.072, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), glass, sd * 0.403, 0.78, -0.75); bub.rotation.z = -sd * Math.PI / 2; bub.scale.set(1, 0.35, 1);
    // passages de roue : ombre sombre et petite aile en relief
    for (const z of [VAN_WHEEL_Z.front, VAN_WHEEL_Z.rear]) {
      const a = add(new THREE.CircleGeometry(0.235, 18, 0, Math.PI), dark, sd * 0.404, 0.22, z); a.rotation.y = sd * Math.PI / 2;
      const fl = add(new THREE.TorusGeometry(0.245, 0.02, 6, 18, Math.PI), blue, sd * 0.4, 0.22, z); fl.rotation.y = Math.PI / 2;
    }
    // gouttière de toit, rétroviseur, tube chromé sous le flanc
    box(0.016, 0.016, 1.46, trim, sd * 0.4, 0.985, -0.25);
    box(0.06, 0.015, 0.015, chrome, sd * 0.43, 0.72, 0.6);
    box(0.025, 0.11, 0.07, chrome, sd * 0.47, 0.76, 0.6);
    const pipe = add(new THREE.CylinderGeometry(0.024, 0.024, 0.78, 10).rotateX(Math.PI / 2), chrome, sd * 0.43, 0.26, -0.02);
    add(new THREE.CylinderGeometry(0.032, 0.032, 0.5, 10).rotateX(Math.PI / 2), mat('#9aa0aa', { roughness: 0.4, metalness: 0.7 }), 0, 0, 0.05, pipe);
  });
  // capot crème avec le nom de la radio
  { const h = add(new THREE.PlaneGeometry(0.74, 0.25), mat('#ffffff', { map: T.hood, alphaTest: 0.5, roughness: 0.45, polygonOffset: true, polygonOffsetFactor: -2 }), 0, 0.617, 0.85);
    h.rotation.x = -Math.PI / 2 + Math.atan2(0.055, 0.26); }
  // face avant : bande crème, calandre chromée à barrettes, phares ronds dans leurs cadres, clignotants, pare-chocs, plaque
  box(0.76, 0.07, 0.01, cream, 0, 0.53, 0.984);
  box(0.46, 0.15, 0.02, dark, 0, 0.42, 0.985);
  for (let i = 0; i < 5; i++) box(0.44, 0.012, 0.012, chrome, 0, 0.36 + i * 0.03, 0.996);
  box(0.012, 0.15, 0.014, chrome, 0, 0.42, 0.997);
  for (const x of [-0.3, 0.3]) {
    box(0.13, 0.13, 0.02, chrome, x, 0.43, 0.987);
    add(new THREE.CylinderGeometry(0.048, 0.048, 0.02, 18).rotateX(Math.PI / 2), lights, x, 0.43, 0.998);
    box(0.08, 0.035, 0.015, amber, x, 0.345, 0.99);
  }
  box(0.88, 0.065, 0.07, chrome, 0, 0.3, 1.0);
  add(new THREE.PlaneGeometry(0.16, 0.08), mat('#ffffff', { map: T.plate, roughness: 0.4 }), 0, 0.3, 1.037);
  // arrière : deux battants vitrés, joint central, feux verticaux, pare-chocs chromé, plaque, poignée
  for (const x of [-0.18, 0.18]) add(new THREE.PlaneGeometry(0.27, 0.25), glass, x, 0.79, -1.003).rotation.y = Math.PI;
  box(0.008, 0.62, 0.006, trim, 0, 0.64, -1.004);
  box(0.06, 0.018, 0.02, chrome, 0.06, 0.6, -1.008);
  for (const x of [-0.355, 0.355]) { box(0.07, 0.15, 0.02, tail, x, 0.5, -1.006); box(0.07, 0.04, 0.02, amber, x, 0.6, -1.006); }
  box(0.88, 0.065, 0.07, chrome, 0, 0.3, -1.02);
  { const p = add(new THREE.PlaneGeometry(0.14, 0.07), mat('#ffffff', { map: T.plate, roughness: 0.4 }), 0, 0.42, -1.003); p.rotation.y = Math.PI; }
  // halos des feux (ils restent lisibles de loin et dans la brume), et le reflet rouge des feux arrière au sol
  const glows = [];
  const glow = (x, y, z, col, s) => { const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.glow, color: col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
    g.position.set(x, y, z); g.scale.setScalar(s); van.add(g); glows.push(g); return g; };
  for (const x of [-0.3, 0.3]) glow(x, 0.43, 1.04, '#fff2c8', 0.38);
  for (const x of [-0.355, 0.355]) { glow(x, 0.5, -1.04, '#ff1408', 0.3); glow(x, 0.5, -1.06, '#ff2010', 0.62).material.opacity = 0.45; }   // feux arrière : un cœur rouge et un halo plus large
  // antenne grillagée sur le toit, sur un pivot (elle se tourne vers la fréquence)
  const antenna = new THREE.Group(); antenna.position.set(0, 1.0, -0.3); van.add(antenna);
  { box(0.12, 0.03, 0.12, trim, 0, 1.01, -0.3);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.22, 8), chrome); mast.position.y = 0.11; antenna.add(mast);
    const grid = new THREE.Group(); grid.position.y = 0.33; antenna.add(grid);
    const W2 = 0.44, H2 = 0.25, bar = (w, h, x, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.008), chrome); m.position.set(x, y, 0); grid.add(m); };
    bar(W2, 0.012, 0, H2 / 2); bar(W2, 0.012, 0, -H2 / 2); bar(0.012, H2, -W2 / 2, 0); bar(0.012, H2, W2 / 2, 0);
    for (let i = 1; i < 12; i++) bar(0.005, H2, -W2 / 2 + i * W2 / 12, 0);
    for (let i = 1; i < 4; i++) bar(W2, 0.004, 0, -H2 / 2 + i * H2 / 4);
    const feed = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.18, 6).rotateX(Math.PI / 2), chrome); feed.position.z = 0.09; grid.add(feed);
    for (let i = 0; i < 4; i++) { const dpl = new THREE.Mesh(new THREE.BoxGeometry(0.1 - i * 0.015, 0.006, 0.006), chrome); dpl.position.z = 0.04 + i * 0.035; grid.add(dpl); }
    // petit voyant rouge au bout : il clignote plus vite quand le signal est bon
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), mat('#ff3040', { emissive: '#ff2030', emissiveIntensity: 2.5 })); led.position.z = 0.19; grid.add(led);
    { const h = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.glow, color: '#ff2a3a', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
      h.scale.setScalar(0.22); led.add(h); }   // halo rouge du voyant (il clignote avec lui)
    antenna.userData.led = led; }
  const wheelPart = () => {
    const w = new THREE.Group();
    w.add(new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.13, 22).rotateZ(Math.PI / 2), dark));
    for (const sd of [-1, 1]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.024, 6, 22).rotateY(Math.PI / 2), mat('#f4f1ea', { roughness: 0.6 })); ring.position.x = sd * 0.066; w.add(ring);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.02, 16).rotateZ(Math.PI / 2), chrome); hub.position.x = sd * 0.068; w.add(hub);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 10).rotateZ(Math.PI / 2), mat('#8a909c', { roughness: 0.3, metalness: 0.8 })); cap.position.x = sd * 0.078; w.add(cap);
      for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2, n = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.012, 0.012), dark); n.position.set(sd * 0.08, Math.cos(a) * 0.058, Math.sin(a) * 0.058); w.add(n); }
    }
    return w;
  };
  if (wheels) for (const x of [-0.37, 0.37]) for (const z of [VAN_WHEEL_Z.front, VAN_WHEEL_Z.rear]) { const w = wheelPart(); w.position.set(x, 0.2, z); van.add(w); }
  van.userData = { antenna, lights, tail, glows, wheelPart };
  return van;
}
