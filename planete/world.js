/* ============================================================================
   Petite planète océan au relief lisse, sur le modèle des planètes de
   Social World : une fonction de hauteur continue (côtes qui ondulent, plages
   en pente douce, collines, crêtes, fond marin), maillée en sphère cubique avec
   normales et couleurs par sommet, et une mer en sphère translucide.
   Une île par section du portfolio, avec un pavillon au centre.
   ============================================================================ */
import * as THREE from 'three';

export const SEA_R = 16;      // rayon de la mer
export const PAV_R = 1.45;    // rayon du socle des pavillons
const BASE = SEA_R + 0.15;    // le sol au ras de l'eau
const MAX_H = 2.6;            // relief maximal au-dessus de la mer

/* ---------- bruit de gradient 3D (Perlin amélioré), comme Social World ---------- */
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

/* ---------- palette (biome « lush / océan » de Social World) ---------- */
const COL = { low: new THREE.Color('#3f8a2a'), high: new THREE.Color('#86c94a'), dry: new THREE.Color('#a8b85a'), rock: new THREE.Color('#b4b0ac'), shore: new THREE.Color('#e6d49a'), snow: new THREE.Color('#f4f8ff') };
const tmpC = new THREE.Color(), tmpC2 = new THREE.Color();

/* ---------- sphère cubique ---------- */
const FACES = [
  [[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
  [[0, 1, 0], [1, 0, 0], [0, 0, -1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
  [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
];
function faceDir(f, s, t, out) { // s, t dans -1..1 (déformation tangente : mailles plus régulières)
  const [n, a, b] = FACES[f], u = Math.tan(s * Math.PI / 4), v = Math.tan(t * Math.PI / 4);
  return out.set(n[0] + u * a[0] + v * b[0], n[1] + u * a[1] + v * b[1], n[2] + u * a[2] + v * b[2]).normalize();
}

/**
 * @param {{id:string,color:string,dir:THREE.Vector3}[]} anchors  une île par section
 */
export function buildPlanet(anchors) {
  const noise = new Noise3(0x5d0c4e);
  const islands = anchors.map(a => ({ dir: a.dir.clone().normalize(), r: 0.4 }));

  /** « Terre » au-dessus du niveau de la mer (négatif = sous l'eau) et facteur de plateau. */
  function landAt(x, y, z) {
    const wx = x + 0.18 * noise.noise(x * 1.7 + 11.3, y * 1.7, z * 1.7);
    const wy = y + 0.18 * noise.noise(x * 1.7, y * 1.7 + 27.1, z * 1.7);
    const wz = z + 0.18 * noise.noise(x * 1.7, y * 1.7, z * 1.7 + 41.9);
    let land = noise.fbm(wx * 2.4, wy * 2.4, wz * 2.4, 4) * 0.5 - 0.34;    // îlots et hauts-fonds
    let plateau = 0, tMax = 0;
    for (const isl of islands) {
      const c = x * isl.dir.x + y * isl.dir.y + z * isl.dir.z;
      const t = 1 - Math.acos(Math.min(1, Math.max(-1, c))) / isl.r;
      if (t <= 0) continue;
      tMax = Math.max(tMax, t);
      const coast = noise.fbm(wx * 5.5 + 3, wy * 5.5, wz * 5.5, 3) * 0.28;   // côtes découpées
      land = Math.max(land, smoothstep(0, 0.8, t) * 0.55 + coast * (1 - smoothstep(0.4, 0.7, t)) - 0.06); // île en dôme
      plateau = Math.max(plateau, smoothstep(0.66, 0.76, t));
    }
    return [land, plateau, tMax];
  }
  /** Rayon du sol dans une direction unitaire. */
  function height(x, y, z) {
    const [land, plateau, tMax] = landAt(x, y, z);
    if (land < 0) return BASE + Math.max(-2.2, land * 4.5 - land * land * 6);  // fond marin en pente douce
    const shore = smoothstep(0, 0.14, land);                                      // plage large et douce
    const rolling = noise.fbm(x * 5 + 5.1, y * 5, z * 5, 3) * 0.5 + 0.5;
    const detail = noise.fbm(x * 16 + 2, y * 16, z * 16, 2);
    let h = land * 1.5 + rolling * 0.38 * shore + detail * 0.06 * shore;
    const ridge = 1 - Math.abs(noise.noise(x * 3.1 + 3.7, y * 3.1, z * 3.1));     // quelques collines, loin des côtes et du pavillon
    h += ridge * ridge * ridge * 1.15 * smoothstep(0.16, 0.36, land) * (1 - smoothstep(0.45, 0.62, tMax));
    const flat = 0.55 * 1.5 + 0.22;                                               // esplanade au sommet de l'île
    h = h * (1 - plateau) + flat * plateau;
    return BASE + Math.min(MAX_H, h);
  }
  const heightDir = d => height(d.x, d.y, d.z);

  function colorAt(d, h, steep, out) {
    const above = h - SEA_R;
    const tone = noise.fbm(d.x * 9 + 9, d.y * 9, d.z * 9, 3) * 0.5 + 0.5;
    const dry = smoothstep(0.55, 0.8, noise.noise(d.x * 4.5 - 4, d.y * 4.5, d.z * 4.5) * 0.5 + 0.5);
    out.copy(COL.low).lerp(COL.high, Math.min(1, Math.max(0, above / 2.4 + (tone - 0.5) * 0.6)));
    out.lerp(COL.dry, dry * 0.6);
    out.lerp(COL.shore, 1 - smoothstep(0.22, 0.4, above));                       // plages
    if (above < 0.15) out.lerp(tmpC2.copy(COL.shore).multiplyScalar(0.62), Math.min(1, (0.15 - above) / 1.2)); // fond marin
    out.lerp(COL.rock, smoothstep(1.1, 1.5, steep));                              // roche dans les pentes raides
    out.lerp(COL.snow, smoothstep(0.9, 1.0, (above + tone * 0.3) / MAX_H) * (1 - smoothstep(0.8, 1.2, steep))); // rares sommets enneigés
    return out;
  }

  /* ---------- maillage lisse : 6 patchs, normales issues de la fonction de hauteur ---------- */
  const n = 110, side = n + 3, group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0 });
  const d = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), nn = new THREE.Vector3(), q = new THREE.Vector3();
  for (let f = 0; f < 6; f++) {
    const pos = new Float32Array(side * side * 3), dirs = new Float32Array(side * side * 3);
    for (let j = 0; j < side; j++) for (let i = 0; i < side; i++) {
      faceDir(f, -1 + 2 * (i - 1) / n, -1 + 2 * (j - 1) / n, d);
      const h = heightDir(d), k = (j * side + i) * 3;
      pos[k] = d.x * h; pos[k + 1] = d.y * h; pos[k + 2] = d.z * h; dirs[k] = d.x; dirs[k + 1] = d.y; dirs[k + 2] = d.z;
    }
    const cnt = (n + 1) * (n + 1), vp = new Float32Array(cnt * 3), vn = new Float32Array(cnt * 3), vc = new Float32Array(cnt * 3);
    const at = (i, j, out) => { const k = (j * side + i) * 3; return out.set(pos[k], pos[k + 1], pos[k + 2]); };
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
      const gi = i + 1, gj = j + 1, k = (gj * side + gi) * 3, v = (j * (n + 1) + i) * 3;
      vp[v] = pos[k]; vp[v + 1] = pos[k + 1]; vp[v + 2] = pos[k + 2];
      at(gi + 1, gj, a).sub(at(gi - 1, gj, q)); at(gi, gj + 1, b).sub(at(gi, gj - 1, q));
      nn.crossVectors(a, b).normalize(); d.set(dirs[k], dirs[k + 1], dirs[k + 2]); if (nn.dot(d) < 0) nn.negate();
      vn[v] = nn.x; vn[v + 1] = nn.y; vn[v + 2] = nn.z;
      const cos = Math.min(1, Math.max(0.05, nn.dot(d))), steep = Math.sqrt(1 - cos * cos) / cos;
      colorAt(d, Math.hypot(pos[k], pos[k + 1], pos[k + 2]), steep, tmpC);
      vc[v] = tmpC.r; vc[v + 1] = tmpC.g; vc[v + 2] = tmpC.b;
    }
    const index = new Uint32Array(n * n * 6); let w = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const v00 = j * (n + 1) + i, v10 = v00 + 1, v01 = v00 + n + 1, v11 = v01 + 1;
      index[w++] = v00; index[w++] = v10; index[w++] = v11; index[w++] = v00; index[w++] = v11; index[w++] = v01;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(vp, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(vn, 3)); geo.setAttribute('color', new THREE.BufferAttribute(vc, 3));
    geo.setIndex(new THREE.BufferAttribute(index, 1)); geo.computeBoundingSphere();
    group.add(new THREE.Mesh(geo, mat));
  }
  const groundMesh = group;

  /* ---------- mer ---------- */
  const seaMat = new THREE.MeshStandardMaterial({ color: '#1fb0d8', roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.9 });
  const waterUniforms = { uTime: { value: 0 } };
  seaMat.onBeforeCompile = sh => {
    sh.uniforms.uTime = waterUniforms.uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n vec3 _p = position * 0.9; float _w = sin(_p.x*1.3 + uTime*1.1) * cos(_p.z*1.2 + uTime*0.9) + sin(_p.y*1.6 - uTime*0.8);\n transformed += normalize(position) * _w * 0.035;');
  };
  const waterMesh = new THREE.Mesh(new THREE.SphereGeometry(SEA_R + 0.1, 192, 144), seaMat);
  waterMesh.renderOrder = 2;

  /* ---------- repère local (vertical = direction du sol) ---------- */
  const Y = new THREE.Vector3(0, 1, 0), quat = new THREE.Quaternion();
  const orient = dir => quat.setFromUnitVectors(Y, dir);
  const slopeAt = dir => {
    const t1 = new THREE.Vector3(1, 0, 0); if (Math.abs(dir.x) > 0.9) t1.set(0, 1, 0); t1.addScaledVector(dir, -t1.dot(dir)).normalize();
    const t2 = new THREE.Vector3().crossVectors(dir, t1), e = 0.006, h0 = heightDir(dir);
    const ha = heightDir(dir.clone().addScaledVector(t1, e).normalize()), hb = heightDir(dir.clone().addScaledVector(t2, e).normalize());
    return Math.hypot(ha - h0, hb - h0) / (e * h0);
  };

  /* ---------- arbres (ronds et cyprès, comme sur les planètes océan) ---------- */
  const rng = (() => { let s = 0x9e3779b9; return () => { s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0; return s / 4294967296; }; })();
  const trunks = [], rounds = [], cypress = [];
  const m4 = new THREE.Matrix4(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
  for (let tries = 0; tries < 9000 && trunks.length < 520; tries++) {
    d.set(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1); if (d.lengthSq() > 1 || d.lengthSq() < 0.01) continue; d.normalize();
    const [land, plateau] = landAt(d.x, d.y, d.z);
    if (land < 0.05 || plateau > 0.01) continue;
    if (islands.some(isl => d.dot(isl.dir) > Math.cos(isl.r * 0.36))) continue;          // esplanade dégagée
    if (noise.fbm(d.x * 7, d.y * 7 + 3, d.z * 7, 2) < -0.05) continue;                     // bosquets
    const h = heightDir(d); if (h - SEA_R > 2.6 || slopeAt(d) > 0.55) continue;
    const s = 0.75 + rng() * 0.55; orient(d);
    const kind = rng() < 0.72 ? 'round' : 'cypress';
    m4.compose(ps.copy(d).multiplyScalar(h - 0.05), quat, sc.set(s, s * (kind === 'round' ? 1 : 1.25), s)); trunks.push(m4.clone());
    if (kind === 'round') { m4.compose(ps.copy(d).multiplyScalar(h + 0.62 * s), quat, sc.set(s * (0.9 + rng() * 0.3), s * (0.85 + rng() * 0.3), s * (0.9 + rng() * 0.3))); rounds.push([m4.clone(), rng()]); }
    else { m4.compose(ps.copy(d).multiplyScalar(h + 0.55 * s * 1.25), quat, sc.set(s, s * 1.25, s)); cypress.push([m4.clone(), rng()]); }
  }
  const decor = new THREE.Group();
  const trunkGeo = new THREE.CylinderGeometry(0.06, 0.09, 0.6, 7).translate(0, 0.3, 0);
  const trunkMesh = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: '#6e4a2e', roughness: 0.9 }), trunks.length);
  trunks.forEach((m, i) => trunkMesh.setMatrixAt(i, m)); decor.add(trunkMesh);
  const leafCol = c => new THREE.Color('#3f8a2a').lerp(new THREE.Color('#86c94a'), c);
  const roundMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.42, 2), new THREE.MeshStandardMaterial({ roughness: 0.85 }), rounds.length);
  rounds.forEach(([m, c], i) => { roundMesh.setMatrixAt(i, m); roundMesh.setColorAt(i, leafCol(c * 0.8)); }); decor.add(roundMesh);
  const cypMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(0.22, 1.05, 10), new THREE.MeshStandardMaterial({ roughness: 0.85 }), cypress.length);
  cypress.forEach(([m, c], i) => { cypMesh.setMatrixAt(i, m); cypMesh.setColorAt(i, leafCol(c * 0.5).multiplyScalar(0.85)); }); decor.add(cypMesh);
  [trunkMesh, roundMesh, cypMesh].forEach(m => { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; });

  /* ---------- pavillons arrondis ---------- */
  const white = new THREE.MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.55 });
  const beacons = [];
  const pavilions = anchors.map((an, k) => {
    const dir = islands[k].dir, h = heightDir(dir), g = new THREE.Group();
    const color = new THREE.Color(an.color), mColor = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.05 });
    const glow = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.6, roughness: 0.3 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(PAV_R, PAV_R * 1.08, 0.22, 48), white); base.position.y = 0.06; g.add(base);
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
    g.position.copy(dir).multiplyScalar(h - 0.02); g.quaternion.copy(orient(dir));
    decor.add(g);
    return { id: an.id, dir: dir.clone(), top: dir.clone().multiplyScalar(h + 3.6) };
  });

  /* ---------- nuages arrondis ---------- */
  const clouds = new THREE.Group();
  const puff = new THREE.IcosahedronGeometry(1, 3), cloudMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, transparent: true, opacity: 0.92 });
  const puffs = [];
  for (let c = 0; c < 16; c++) {
    d.set(rng() * 2 - 1, (rng() * 2 - 1) * 0.8, rng() * 2 - 1).normalize(); orient(d);
    const t1 = new THREE.Vector3(1, 0, 0).applyQuaternion(quat), t2 = new THREE.Vector3(0, 0, 1).applyQuaternion(quat), alt = SEA_R + MAX_H + 2.2 + rng() * 1.4;
    for (let p = 0, np = 4 + Math.floor(rng() * 4); p < np; p++) {
      const s = 0.55 + rng() * 0.55;
      m4.compose(ps.copy(d).multiplyScalar(alt).addScaledVector(t1, (rng() - 0.5) * 2.6).addScaledVector(t2, (rng() - 0.5) * 1.4), quat, sc.set(s * 1.25, s * 0.62, s));
      puffs.push(m4.clone());
    }
  }
  const cloudMesh = new THREE.InstancedMesh(puff, cloudMat, puffs.length); puffs.forEach((m, i) => cloudMesh.setMatrixAt(i, m)); clouds.add(cloudMesh);

  function groundRadius(dir) { return Math.max(heightDir(dir), SEA_R - 0.18); }   // on marche, ou on nage
  function isWet(dir) { return heightDir(dir) < SEA_R + 0.05; }
  function animate(t) { beacons.forEach((r, i) => { r.rotation.x = Math.PI / 2 + Math.sin(t * 0.9 + i) * 0.25; r.rotation.z = t * 0.6 + i; }); }

  return { groundMesh, waterMesh, waterUniforms, decor, clouds, pavilions, groundRadius, isWet, heightDir, animate };
}
