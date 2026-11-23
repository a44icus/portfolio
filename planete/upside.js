/* ============================================================================
   Clin d'œil : le van de la radio WSQK est garé, caché à la lisière d'une forêt.
   On monte dedans : le monde bascule « à l'envers » (une vague part du van et
   gagne toute la planète). L'antenne du van se tourne vers la fréquence ; il faut
   la suivre jusqu'au portail. On le traverse : tout redevient normal, on retrouve
   la Jeep et tout est réinitialisé.
   ============================================================================ */
import * as THREE from 'three';
import { makeVan } from './van.js';
import { LOOK } from './look.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const UP_SPEED = 0.22;   // vitesse de la vague (radians par seconde) : environ 15 s pour faire le tour de la planète

export function makeUpside({ planet, scene, sections, quality, R }) {
  const low = quality === 'low';
  // tirage déterministe : le van et le portail sont toujours au même endroit
  let seed = 917311; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const randDir = v => { do v.set(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1); while (v.lengthSq() > 1 || v.lengthSq() < 0.01); return v.normalize(); };
  const tangent = (d, ref = new THREE.Vector3(0, 1, 0)) => { const t = ref.clone().projectOnPlane(d); if (t.lengthSq() < 1e-6) t.set(1, 0, 0).projectOnPlane(d); return t.normalize(); };
  const farFromZones = (d, a) => sections.every(s => s.dir.dot(d) < Math.cos(a));
  const treesWithin = (d, r) => { const c = Math.cos(r / R); let n = 0; for (const t of planet.treeDirs) if (t.dot(d) > c) n++; return n; };
  const flat = d => {   // assez plat pour y poser un véhicule
    const h0 = planet.heightDir(d), t1 = tangent(d), t2 = new THREE.Vector3().crossVectors(d, t1);
    let m = 0; for (const t of [t1, t2]) for (const s of [-1, 1]) m = Math.max(m, Math.abs(planet.heightDir(d.clone().addScaledVector(t, s * 0.5 / R).normalize()) - h0));
    return m < 0.1;
  };
  const dry = (d, road = 0.2) => !planet.isWet(d) && !planet.onPlaza(d, 0.8 / R) && planet.pathDir(d) < road;

  /* ---------- le van : à l'orée d'un bois, à l'écart des zones et des routes ---------- */
  const home = { dir: new THREE.Vector3(0, 1, 0), fwd: new THREE.Vector3(1, 0, 0) };
  { let best = null, bs = -1; const d = new THREE.Vector3();
    for (let i = 0; i < 2500; i++) {
      randDir(d); if (!dry(d) || !farFromZones(d, 0.45) || treesWithin(d, 1.8) > 0 || !flat(d)) continue;
      const n = treesWithin(d, 3.6); if (n > bs && n < 16) { bs = n; best = d.clone(); }   // le plus caché, sans être en pleine forêt
    }
    if (best) home.dir.copy(best);
    home.fwd.copy(tangent(home.dir, new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5))); }
  const van = makeVan(); scene.add(van);
  van.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const placeOn = (obj, dir, fwd, lift = 0) => {
    const up = dir.clone().normalize(), f = fwd.clone().projectOnPlane(up).normalize(), r = new THREE.Vector3().crossVectors(up, f);
    obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(r, up, f));
    obj.position.copy(up).multiplyScalar(planet.heightDir(up) + lift);
  };
  placeOn(van, home.dir, home.fwd);

  /* ---------- le portail : loin du van (30 à 45 unités), sur la terre ferme ---------- */
  /* ---------- carte des chemins praticables (terre ferme et ponts) : le portail doit être atteignable sans passer sur l'eau ---------- */
  const NG = low ? 18000 : 26000, gd = new Float32Array(NG * 3), walk = new Uint8Array(NG), gh = new Float32Array(NG), gcell = new Map();
  const CS = 1.0 / R, ck = (x, y, z) => (Math.floor(x / CS) + 512) * 1048576 + (Math.floor(y / CS) + 512) * 1024 + (Math.floor(z / CS) + 512);
  { const d = new THREE.Vector3();
    for (let i = 0; i < NG; i++) {
      const y = 1 - 2 * (i + 0.5) / NG, rr = Math.sqrt(1 - y * y), a = i * 2.399963;
      d.set(Math.cos(a) * rr, y, Math.sin(a) * rr); gd[i * 3] = d.x; gd[i * 3 + 1] = d.y; gd[i * 3 + 2] = d.z;
      const bi = planet.bridgeAt(d), onBridge = !!(bi && Math.abs(bi.lat) < 1.0);
      walk[i] = onBridge ? 2 : planet.isWet(d) ? 0 : 1;   // 0 eau, 1 terre, 2 pont
      gh[i] = onBridge ? bi.top : planet.heightDir(d);
      const k = ck(d.x, d.y, d.z); let c = gcell.get(k); if (!c) gcell.set(k, c = []); c.push(i);
    } }
  const near = (i, rad, fn) => {   // voisins à moins de rad unités
    const x = gd[i * 3], y = gd[i * 3 + 1], z = gd[i * 3 + 2], c0 = Math.cos(rad / R);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      const cell = gcell.get(ck(x + a * CS, y + b * CS, z + c * CS)); if (!cell) continue;
      for (const j of cell) if (j !== i && x * gd[j * 3] + y * gd[j * 3 + 1] + z * gd[j * 3 + 2] > c0) fn(j);
    }
  };
  const nodeOf = d => { let best = -1, bd = -2; const k0 = ck(d.x, d.y, d.z);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) { const cell = gcell.get(k0 + a * 1048576 + b * 1024 + c); if (cell) for (const j of cell) { const v = d.x * gd[j * 3] + d.y * gd[j * 3 + 1] + d.z * gd[j * 3 + 2]; if (v > bd) { bd = v; best = j; } } }
    return best; };
  // les petites étendues d'eau (flaques, mares) ne sont pas clôturées : le van les traverse (3 : flaque)
  { const seen = new Uint8Array(NG), PUDDLE = 60;   // ~60 nœuds ≈ 30 unités²
    for (let i = 0; i < NG; i++) {
      if (walk[i] !== 0 || seen[i]) continue;
      const comp = [i], q = [i]; seen[i] = 1;
      while (q.length) { const j = q.pop(); near(j, 1.0, n => { if (walk[n] === 0 && !seen[n]) { seen[n] = 1; comp.push(n); q.push(n); } }); }
      if (comp.length < PUDDLE) for (const j of comp) walk[j] = 3;
    } }
  /** Grande étendue d'eau (clôturée) sous cette direction ? Les flaques ne comptent pas. */
  function bigWater(d) {
    const n = nodeOf(d); if (n < 0 || walk[n] === 0) return true; if (walk[n] === 3) return false;
    let big = false, pud = false; near(n, 1.2, j => { if (walk[j] === 0) big = true; else if (walk[j] === 3) pud = true; });
    return big || !pud;
  }
  const reach = new Uint8Array(NG);
  { const s = nodeOf(home.dir), q = s >= 0 ? [s] : []; if (s >= 0) reach[s] = 1;
    while (q.length) { const i = q.pop(); near(i, 1.0, j => { if (!reach[j] && walk[j] && Math.abs(gh[j] - gh[i]) < 0.4) { reach[j] = 1; q.push(j); } }); } }
  const reachable = d => { const n = nodeOf(d); return n >= 0 && reach[n] === 1; };

  /* ---------- barrières en bois brut tout autour de l'eau (seulement dans le monde à l'envers) ---------- */
  const fence = new THREE.Group(); fence.visible = false; scene.add(fence);
  const segCells = new Map(), segV = new THREE.Vector3(), segW = new THREE.Vector3();
  /** Un point (monde) touche-t-il une barrière ? (distance à un panneau, en unités) */
  function fenceHit(p, rad = 0.3) {
    const d = segW.copy(p).normalize(), k0 = ck(d.x, d.y, d.z);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      const cell = segCells.get(k0 + a * 1048576 + b * 1024 + c); if (!cell) continue;
      for (const [A, B] of cell) {
        segV.copy(B).sub(A); const l2 = segV.lengthSq(), t = l2 > 1e-9 ? Math.max(0, Math.min(1, segV.dot(segW.copy(p).sub(A)) / l2)) : 0;
        if (segW.copy(A).addScaledVector(segV, t).distanceTo(p) < rad) return true;
      }
    }
    return false;
  }
  { const posts = [], pc = new Map(), P = new THREE.Vector3(), Q = new THREE.Vector3();
    // poteaux : sur la rive, un peu en retrait de l'eau, espacés d'environ un mètre (pas devant les ponts ni sur les places)
    for (let i = 0; i < NG; i++) {
      if (walk[i] !== 1) continue;
      let wet = 0; const away = new THREE.Vector3();
      near(i, 1.0, j => { if (walk[j] === 0) { wet++; away.x -= gd[j * 3]; away.y -= gd[j * 3 + 1]; away.z -= gd[j * 3 + 2]; } });
      if (!wet) continue;
      P.set(gd[i * 3], gd[i * 3 + 1], gd[i * 3 + 2]);
      const bi = planet.bridgeAt(P); if (bi && Math.abs(bi.lat) < 2.2) continue;
      if (planet.onPlaza(P, 0.3 / R)) continue;
      away.addScaledVector(P, -away.dot(P) / wet).projectOnPlane(P); if (away.lengthSq() > 1e-12) { away.normalize(); P.addScaledVector(away, 0.25 / R).normalize(); } else away.copy(tangent(P));
      const k = ck(P.x, P.y, P.z); let ok = true;
      for (let a = -1; a <= 1 && ok; a++) for (let b = -1; b <= 1 && ok; b++) for (let c = -1; c <= 1 && ok; c++) { const cell = pc.get(k + a * 1048576 + b * 1024 + c); if (cell) for (const p of cell) if (p.d.dot(P) > Math.cos(0.85 / R)) { ok = false; break; } }
      if (!ok) continue;
      const p = { d: P.clone(), h: planet.heightDir(P), t: new THREE.Vector3().crossVectors(P, away).normalize() }; posts.push(p); let cell = pc.get(k); if (!cell) pc.set(k, cell = []); cell.push(p);   // t : le long de la rive
    }
    // pièces : poteaux, lisses et piquets irréguliers, bois gris-brun délavé
    const parts = [], tips = [], m = new THREE.Matrix4(), X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3(), S3 = new THREE.Vector3(), qq = new THREE.Quaternion(), e = new THREE.Euler();
    const woods = ['#8a7a66', '#75685a', '#9a8b75', '#655a4c', '#83776a'].map(c => new THREE.Color(c));
    const piece = (pos, x, y, sx, sy, sz, rx = 0, rz = 0, list = parts) => {
      Y.copy(y); X.copy(x).projectOnPlane(Y).normalize(); Z.crossVectors(X, Y);
      m.makeBasis(X, Y, Z); qq.setFromRotationMatrix(m).multiply(new THREE.Quaternion().setFromEuler(e.set(rx, 0, rz)));
      list.push([new THREE.Matrix4().compose(pos, qq, S3.set(sx, sy, sz)), woods[(rnd() * woods.length) | 0]]);
    };
    for (const p of posts) {   // poteau
      const up = p.d, h = 0.62 + rnd() * 0.12;
      piece(up.clone().multiplyScalar(p.h + h / 2 - 0.05), tangent(up), up, 0.075 + rnd() * 0.03, h, 0.075 + rnd() * 0.03, (rnd() - 0.5) * 0.08, (rnd() - 0.5) * 0.08);
    }
    // panneaux : chaque poteau rejoint son plus proche voisin de chaque côté, le long de la rive (une chaîne continue, sans brèche)
    const addSeg = (A, B) => { const mm = A.clone().add(B).multiplyScalar(0.5).normalize(), kk = ck(mm.x, mm.y, mm.z); let c = segCells.get(kk); if (!c) segCells.set(kk, c = []); c.push([A, B]); };
    for (const p of posts) addSeg(p.d.clone().multiplyScalar(p.h), p.d.clone().multiplyScalar(p.h));   // les poteaux arrêtent aussi
    const linked = new Set(), pid = new Map(posts.map((p, i) => [p, i]));
    for (const p of posts) {
      const k = ck(p.d.x, p.d.y, p.d.z), side = [null, null], sd = [1.75, 1.75];
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) { const cell = pc.get(k + a * 1048576 + b * 1024 + c); if (cell) for (const o of cell) if (o !== p) {
        const dd = Math.acos(Math.min(1, o.d.dot(p.d))) * R; if (dd >= 1.75) continue;
        const along = o.d.clone().sub(p.d).normalize().dot(p.t); if (Math.abs(along) < 0.35) continue;   // pas en travers (vers l'eau ou les terres)
        const s2 = along > 0 ? 0 : 1; if (dd < sd[s2]) { sd[s2] = dd; side[s2] = o; }
      } }
      for (const o of side) if (o) link(p, o);
    }
    // brèches : chaque bout de clôture resté ouvert rejoint le bout libre le plus proche (sans traverser l'eau ni l'entrée d'un pont)
    const deg = new Map(posts.map(p => [p, 0])); linked.forEach(key => { const [i, j] = key.split(':').map(Number); deg.set(posts[i], deg.get(posts[i]) + 1); deg.set(posts[j], deg.get(posts[j]) + 1); });
    const crossesWater = (a, b, dd) => { for (const f of [0.25, 0.5, 0.75]) { const m = a.clone().lerp(b, f).normalize(), n = nodeOf(m); if (dd > 2.2 && n >= 0 && walk[n] === 0) return true; const bi = planet.bridgeAt(m); if (bi && Math.abs(bi.lat) < 2.4) return true; } return false; };   // (un petit pan peut enjamber le creux d'une berge)
    for (let pass = 0; pass < 4; pass++) for (const p of posts) {
      if (deg.get(p) >= 2) continue;
      let best = null, bd = pass < 2 ? 3.2 : pass === 2 ? 2.6 : 4.2; const k = ck(p.d.x, p.d.y, p.d.z);   // 3e passe : vers n'importe quel poteau voisin (bout de clôture en impasse)
      for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) for (let c = -3; c <= 3; c++) { const cell = pc.get(k + a * 1048576 + b * 1024 + c); if (cell) for (const o of cell) {
        if (o === p || (pass < 2 && deg.get(o) >= 2) || deg.get(o) >= 3) continue; const i = pid.get(p), j = pid.get(o); if (linked.has(i < j ? i + ':' + j : j + ':' + i)) continue;
        const dd = Math.acos(Math.min(1, o.d.dot(p.d))) * R; if (dd < bd && !crossesWater(p.d, o.d, dd)) { bd = dd; best = o; }
      } }
      if (best) { link(p, best); deg.set(p, deg.get(p) + 1); deg.set(best, deg.get(best) + 1); }
    }
    // derniers bouts libres (pointes de sable étroites…) : la clôture se prolonge jusque dans l'eau
    let nv = 0;
    for (const p of posts) {
      if (deg.get(p) >= 2) continue;
      const n0 = nodeOf(p.d); if (n0 < 0) continue;
      let bj = -1, bd = -2; near(n0, 3.0, j => { if (walk[j] === 0) { const v = gd[j * 3] * p.d.x + gd[j * 3 + 1] * p.d.y + gd[j * 3 + 2] * p.d.z; if (v > bd) { bd = v; bj = j; } } });
      if (bj < 0) continue;
      const wd = new THREE.Vector3(gd[bj * 3], gd[bj * 3 + 1], gd[bj * 3 + 2]), o = { d: p.d.clone().lerp(wd, 0.8).normalize(), h: 0 };
      o.h = Math.max(planet.heightDir(o.d), planet.waterR - 0.15); pid.set(o, posts.length + nv++);
      link(p, o); deg.set(p, deg.get(p) + 1);
      piece(o.d.clone().multiplyScalar(o.h + 0.28), tangent(o.d), o.d, 0.08, 0.7, 0.08);   // poteau planté dans l'eau
    }
    function link(p, o) {
      { const i = pid.get(p), j = pid.get(o), key = i < j ? i + ':' + j : j + ':' + i; if (linked.has(key)) return; linked.add(key); }
        const A = p.d.clone().multiplyScalar(p.h), B = o.d.clone().multiplyScalar(o.h), L = A.distanceTo(B), v = B.clone().sub(A).normalize();
        addSeg(A.clone(), B.clone());
        const mid = A.clone().add(B).multiplyScalar(0.5), up = mid.clone().normalize();
        for (const hh of [0.17, 0.4]) piece(mid.clone().addScaledVector(up, hh + (rnd() - 0.5) * 0.03), v, up, L + 0.08, 0.045, 0.03, 0, (rnd() - 0.5) * 0.06);
        const n = Math.max(2, Math.round(L / 0.2));
        for (let s = 1; s < n; s++) {
          const pos = A.clone().lerp(B, s / n), u = pos.clone().normalize(), h = 0.42 + rnd() * 0.2, w = 0.05 + rnd() * 0.03;
          const g = Math.max(planet.heightDir(u), planet.waterR - 0.15); pos.copy(u).multiplyScalar(g + h / 2 - 0.04);
          piece(pos, v, u, w, h, 0.025, (rnd() - 0.5) * 0.12, (rnd() - 0.5) * 0.12);
          if (rnd() < 0.55) piece(u.clone().multiplyScalar(g + h - 0.04 + 0.035), v, u, w * 0.75, 0.07, 0.025, 0, 0, tips);   // pointe taillée
        }
    }
    const fmat = new THREE.MeshStandardMaterial({ roughness: 0.95 });
    const mk = (geo, list) => {
      const im = new THREE.InstancedMesh(geo, fmat, Math.max(1, list.length)); im.count = list.length;
      list.forEach(([mm, c], i) => { im.setMatrixAt(i, mm); im.setColorAt(i, c); }); im.castShadow = !low; im.receiveShadow = true; im.frustumCulled = false; fence.add(im);
    };
    mk(new THREE.BoxGeometry(1, 1, 1), parts);
    mk(new THREE.ConeGeometry(0.75, 1, 4).rotateY(Math.PI / 4).scale(1, 1, 0.4), tips);
    fence.userData.count = parts.length + tips.length; fence.userData.loose = posts.filter(p => deg.get(p) < 2).map(p => p.d); fence.userData.posts = posts.length;
  }
  const gateDir = new THREE.Vector3();
  /** Le portail change de place à chaque passage : un point au hasard, loin du van (55 à 85 unités), atteignable par la terre et les ponts. */
  function gateOk(d) {   // sans barrière entre le van et lui, ni autour de lui
    freeNodes(); const n = nodeOf(d); if (n < 0 || !reachFree[n]) return false;
    return !fenceHit(d.clone().multiplyScalar(planet.heightDir(d) + 0.2), 2.5);
  }
  function pickGate() {
    const d = new THREE.Vector3(); let found = false;
    for (let i = 0; i < 8000 && !found; i++) {
      do d.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1); while (d.lengthSq() > 1 || d.lengthSq() < 0.01); d.normalize();
      const a = Math.acos(Math.min(1, d.dot(home.dir)));
      if (a > 1.7 && a < 2.65 && dry(d, 0.5) && farFromZones(d, 0.3) && treesWithin(d, 1.4) === 0 && gateOk(d)) { gateDir.copy(d); found = true; }
    }
    // sinon : un point atteignable au hasard parmi les plus éloignés du van
    if (!found) { const far = []; for (let i = 0; i < NG; i++) if (reachFree[i] && walk[i] === 1) { d.set(gd[i * 3], gd[i * 3 + 1], gd[i * 3 + 2]); if (d.dot(home.dir) < -0.2 && farFromZones(d, 0.3)) far.push(i); }
      if (far.length) { const i = far[(Math.random() * far.length) | 0]; gateDir.set(gd[i * 3], gd[i * 3 + 1], gd[i * 3 + 2]); } else gateDir.copy(home.dir).negate(); }
    placeOn(gate, gateDir, home.dir.clone().sub(gateDir));   // il fait face au chemin qui vient du van
    toGate = null;                                           // la ligne néon sera recalculée
  }
  gateDir.copy(home.dir).negate();
  const gate = new THREE.Group(); gate.visible = false; scene.add(gate);
  const gateU = { uTime: { value: 0 }, uK: { value: 0 }, uOpen: { value: 0.1 } };
  const GW = 0.55, GH = 1.75, GY = 1.9;   // une faille verticale, haute et étroite
  {
    // le cœur : une fente incandescente, blanche au centre, rouge sur les bords, qui palpite et dont les lèvres ondulent
    const rift = new THREE.Mesh(new THREE.PlaneGeometry(GW * 2.6, GH * 2.4), new THREE.ShaderMaterial({
      uniforms: gateU, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false,
      vertexShader: `varying vec2 vP; void main(){ vP = position.xy / vec2(${GW.toFixed(2)}, ${GH.toFixed(2)}); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float uTime; uniform float uK; uniform float uOpen; varying vec2 vP;
        void main(){
          float y = vP.y, wob = 0.18 * sin(y * 7.0 + uTime * 2.3) + 0.1 * sin(y * 17.0 - uTime * 3.1);
          float w = sqrt(max(0.0, 1.0 - y * y)) * (0.75 + wob) * uOpen;  // largeur de la fente : elle s'ouvre quand on approche
          float x = abs(vP.x) / max(w, 0.02);
          float core = 1.0 - smoothstep(0.0, 0.35, x), lips = 1.0 - smoothstep(0.2, 1.0, x);
          float halo = exp(-dot(vP * vec2(1.0, 0.75), vP * vec2(1.0, 0.75)) * 1.4) * 0.55 * (0.35 + 0.65 * uOpen);
          float pulse = 0.85 + 0.15 * sin(uTime * 4.0) + 0.08 * sin(uTime * 11.0);
          vec3 c = vec3(1.9, 1.6, 1.7) * core + vec3(2.2, 0.18, 0.25) * lips + vec3(1.0, 0.05, 0.12) * halo;
          gl_FragColor = vec4(c * pulse * uK, 1.0);
        }`,
    })); rift.position.y = GY; gate.add(rift);
    const rift2 = rift.clone(); rift2.rotation.y = Math.PI / 2; rift2.scale.set(0.35, 1, 1); gate.add(rift2);   // de biais, elle garde du volume
    // vrilles sombres autour, comme une chair qui s'ouvre
    const vine = new THREE.MeshBasicMaterial({ color: '#12060a' });
    for (let i = 0; i < 18; i++) {
      const a = i / 18 * Math.PI * 2, L = 0.3 + (i * 37 % 10) / 10 * 0.55;
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.045, L, 5).translate(0, L / 2, 0), vine);
      c.position.set(Math.cos(a) * GW * 1.05, GY + Math.sin(a) * GH * 1.02, 0); c.rotation.z = a - Math.PI / 2; gate.add(c);
    }
    // une colonne de lueur rouge, visible de loin seulement quand on capte bien la fréquence
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.8, 34, 16, 1, true).translate(0, 17, 0), new THREE.MeshBasicMaterial({ color: '#ff3040', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
    gate.add(beam); gate.userData = { beam };
  }

  /* ---------- guirlandes de Noël : enroulées autour des troncs proches du chemin, et le long des garde-corps des ponts ---------- */
  const bulbs = [];
  { // les arbres autour du van, puis d'autres semés sur toute la planète (seulement des arbres gardés dans le monde à l'envers, où la moitié disparaît)
    const kept = planet.trunkSpots.filter(t => t.i < planet.treeMeshes[t.m][2] * 0.15);   // (un quart des arbres reste debout)
    const byHome = kept.slice().sort((a, b) => b.d.dot(home.dir) - a.d.dot(home.dir)), N1 = low ? 15 : 30, N2 = low ? 45 : 110;
    const pick = byHome.slice(0, N1), rest = byHome.slice(N1);
    for (let i = 0; i < N2 && rest.length; i++) pick.push(rest.splice((rnd() * rest.length) | 0, 1)[0]);
    const near = pick.map(t => ({ t }));
    const cols = ['#ff2a3a', '#2aff6a', '#3a7bff', '#ffd23a', '#ff7a1a', '#ff3ad0'];
    near.forEach(({ t }, j) => {
      const up = t.d, t1 = tangent(up), t2 = new THREE.Vector3().crossVectors(up, t1), n = 9 + (j % 4);
      const r = 0.15 * t.s + 0.05, h0 = 0.25 * t.s, h1 = 1.6 * t.s, ph = j * 1.7;
      for (let i = 0; i < n; i++) {
        const k = i / n, a = ph + k * Math.PI * 2 * 2.2;   // un peu plus de deux tours
        const p = up.clone().multiplyScalar(t.base + h0 + (h1 - h0) * k).addScaledVector(t1, Math.cos(a) * r).addScaledVector(t2, Math.sin(a) * r);
        bulbs.push([p, cols[(i + j) % cols.length]]);
      }
    });
    // ponts : une guirlande qui pend entre les poteaux, de chaque côté
    for (const b of planet.bridges || []) for (const side of [-1.05, 1.05]) {
      let i = 0;
      for (let th = b.t0 + 0.3 / R; th <= b.t1 - 0.3 / R; th += 0.25 / R, i++) {
        const sag = 0.09 * Math.sin(Math.PI * (((th - b.t0 - 0.3 / R) * R) % 1));
        const d = b.e.point(th, side).normalize();
        bulbs.push([d.multiplyScalar(b.deck(th) + 0.07 + 0.5 - sag), cols[i % cols.length]]);
      }
    }
  }
  const bulbMat = new THREE.MeshBasicMaterial({ color: '#ffffff', fog: false });
  const bulbU = { uTime: { value: 0 }, uK: { value: 0 } };
  bulbMat.onBeforeCompile = sh => {   // chaque ampoule scintille à son rythme ; elles s'allument avec le monde à l'envers
    Object.assign(sh.uniforms, bulbU);
    sh.vertexShader = 'uniform float uTime;\nvarying float vTw;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vTw = 0.55 + 0.45 * sin(uTime * (1.3 + mod(float(gl_InstanceID), 5.0) * 0.4) + float(gl_InstanceID) * 2.17);');
    sh.fragmentShader = 'uniform float uK;\nvarying float vTw;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', 'outgoingLight *= 2.6 * vTw * uK;\n  #include <opaque_fragment>');
  };
  bulbMat.customProgramCacheKey = () => 'fairy-bulbs';
  const bulbMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.032, 0), bulbMat, Math.max(1, bulbs.length));
  { const m = new THREE.Matrix4(), c = new THREE.Color(); bulbs.forEach(([p, col], i) => { bulbMesh.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z)); bulbMesh.setColorAt(i, c.set(col)); }); }
  bulbMesh.count = bulbs.length; bulbMesh.frustumCulled = false; bulbMesh.visible = false; scene.add(bulbMesh);

  /* ---------- éclairs : de vrais traits de foudre ramifiés dans le ciel rouge (un cœur blanc et un halo rose) ---------- */
  const boltMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.0, 2.4, 2.8), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const haloMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.35, 0.5), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const bolt = new THREE.Group(); bolt.visible = false; scene.add(bolt);
  const boltCore = new THREE.Mesh(new THREE.BufferGeometry(), boltMat), boltHalo = new THREE.Mesh(new THREE.BufferGeometry(), haloMat);
  boltCore.frustumCulled = boltHalo.frustumCulled = false; bolt.add(boltHalo, boltCore);
  const jitter = (L, a, b, c) => new THREE.Vector3().addScaledVector(a, (Math.random() - 0.5) * L).addScaledVector(b, (Math.random() - 0.5) * L).addScaledVector(c, (Math.random() - 0.5) * L * 0.4);
  // tracé en zigzag par déplacement des milieux
  function zigzag(a, b, rough, iters, r, f, up) {
    let pts = [a.clone(), b.clone()];
    for (let it = 0; it < iters; it++) {
      const np = [];
      for (let i = 0; i < pts.length - 1; i++) { const p = pts[i], q = pts[i + 1], L = p.distanceTo(q); np.push(p, p.clone().add(q).multiplyScalar(0.5).add(jitter(L * rough, r, f, up))); }
      np.push(pts[pts.length - 1]); pts = np;
    }
    return pts;
  }
  const tube = (pts, rad) => { const path = new THREE.CurvePath(); for (let i = 1; i < pts.length; i++) path.add(new THREE.LineCurve3(pts[i - 1], pts[i])); return new THREE.TubeGeometry(path, pts.length * 2, rad, 4, false); };
  const sray = new THREE.Raycaster();
  function strike(car, camera) {
    // on vise le haut de l'image : l'éclair tombe là où on le voit, au loin, au-dessus des arbres
    sray.setFromCamera(new THREE.Vector2((Math.random() * 2 - 1) * 0.75, 0.55 + Math.random() * 0.35), camera);
    const up = car.clone().normalize(), f = sray.ray.direction.clone().projectOnPlane(up).normalize(), r = new THREE.Vector3().crossVectors(up, f);
    const base = sray.ray.at(38 + Math.random() * 18, new THREE.Vector3());
    const top = base.clone().addScaledVector(up, 18 + Math.random() * 8).addScaledVector(r, (Math.random() - 0.5) * 8);
    const bottom = base.clone().addScaledVector(up, -(14 + Math.random() * 10));
    const main = zigzag(top, bottom, 0.32, 6, r, f, up);
    const core = [{ pts: main, rad: 0.34 }];
    // ramifications : elles partent du tronc, descendent en s'écartant, et se divisent encore une fois
    const nb = 4 + Math.floor(Math.random() * 4);
    for (let i = 0; i < nb; i++) {
      const k = 0.12 + Math.random() * 0.6, o = main[Math.floor(k * (main.length - 1))];
      const dir = new THREE.Vector3().addScaledVector(up, -(0.6 + Math.random() * 0.6)).addScaledVector(r, (Math.random() - 0.5) * 2.4).addScaledVector(f, (Math.random() - 0.5) * 0.8).normalize();
      const L = (6 + Math.random() * 12) * (1 - k * 0.6), end = o.clone().addScaledVector(dir, L);
      const br = zigzag(o, end, 0.38, 4, r, f, up); core.push({ pts: br, rad: 0.16 });
      if (Math.random() < 0.7) {
        const o2 = br[Math.floor((0.3 + Math.random() * 0.4) * (br.length - 1))], d2 = dir.clone().addScaledVector(r, (Math.random() - 0.5) * 1.6).normalize();
        core.push({ pts: zigzag(o2, o2.clone().addScaledVector(d2, L * 0.45), 0.4, 3, r, f, up), rad: 0.08 });
      }
    }
    boltCore.geometry.dispose(); boltHalo.geometry.dispose();
    boltCore.geometry = mergeGeometries(core.map(c => tube(c.pts, c.rad)));
    boltHalo.geometry = mergeGeometries(core.map(c => tube(c.pts, c.rad * 4)));
    bolt.visible = true;
  }

  /* ---------- spores en suspension autour du joueur ---------- */
  const NS = low ? 220 : 480, sporePos = new Float32Array(NS * 3), sporeGeo = new THREE.BufferGeometry();
  sporeGeo.setAttribute('position', new THREE.BufferAttribute(sporePos, 3));
  const sporeMat = new THREE.PointsMaterial({ color: '#d6e6ff', size: 0.085, sizeAttenuation: true, transparent: true, opacity: 0.8, depthWrite: false });
  sporeMat.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <map_particle_fragment>', '#include <map_particle_fragment>\n float sr = length(gl_PointCoord - 0.5) * 2.0; if (sr > 1.0) discard; diffuseColor.a *= 1.0 - smoothstep(0.3, 1.0, sr);'); };
  sporeMat.customProgramCacheKey = () => 'spores';
  const spores = new THREE.Points(sporeGeo, sporeMat); spores.frustumCulled = false; spores.visible = false; scene.add(spores);
  const sv = new THREE.Vector3(), su = new THREE.Vector3();
  const spawnSpore = (i, c) => { randDir(sv).multiplyScalar(1 + rnd() * 8); sv.add(c); sporePos[i * 3] = sv.x; sporePos[i * 3 + 1] = sv.y; sporePos[i * 3 + 2] = sv.z; };

  /* ---------- ligne néon rouge au sol : le plus court chemin praticable jusqu'au portail (elle s'allume au bout de 20 s) ---------- */
  let toGate = null;   // pour chaque nœud de la carte : le suivant sur le chemin du portail (-1 : pas de chemin)
  // nœuds « libres » : terre ferme hors de la rive (là où sont les barrières) ; les abords des ponts restent ouverts
  let freeN = null, reachFree = null;
  function freeNodes() {
    if (freeN) return freeN;
    const free = new Uint8Array(NG), d = new THREE.Vector3();
    for (let i = 0; i < NG; i++) {
      if (!walk[i]) continue;
      if (walk[i] === 2) { free[i] = 1; continue; }
      let wet = false; near(i, 1.15, j => { if (walk[j] === 0) wet = true; });
      if (wet) { d.set(gd[i * 3], gd[i * 3 + 1], gd[i * 3 + 2]); const bi = planet.bridgeAt(d); if (!(bi && Math.abs(bi.lat) < 2.2)) continue; }
      free[i] = 1;
    }
    // ce qu'on atteint depuis le van sans franchir de barrière
    reachFree = new Uint8Array(NG); const s0 = nodeOf(home.dir), q = s0 >= 0 ? [s0] : []; if (s0 >= 0) reachFree[s0] = 1;
    while (q.length) { const i = q.pop(); near(i, 1.0, j => { if (!reachFree[j] && free[j] && Math.abs(gh[j] - gh[i]) < 0.4) { reachFree[j] = 1; q.push(j); } }); }
    return (freeN = free);
  }
  function buildRoute() {
    const free = freeNodes();
    const run = ok => {
      const nx = new Int32Array(NG).fill(-1), g = nodeOf(gateDir); if (g < 0) return nx;
      nx[g] = g; const q = [g]; let h = 0;
      while (h < q.length) { const i = q[h++]; near(i, 1.0, j => { if (nx[j] === -1 && ok(j) && Math.abs(gh[j] - gh[i]) < 0.4) { nx[j] = i; q.push(j); } }); }
      return nx;
    };
    // les arbres encore debout (la moitié a disparu) : la ligne passe à distance de leurs troncs
    const tree = new Uint8Array(NG);
    for (const t of planet.trunkSpots) {
      if (t.i >= planet.treeMeshes[t.m][0].count) continue;
      const n = nodeOf(t.d); if (n < 0) continue; tree[n] = 1; near(n, 0.75 + 0.15 * t.s, j => { tree[j] = 1; });
    }
    const s = nodeOf(home.dir);
    toGate = run(j => free[j] === 1 && !tree[j]);
    if (s < 0 || toGate[s] === -1) toGate = run(j => free[j] === 1);                      // repli : sans éviter les arbres
    if (s < 0 || toGate[s] === -1) toGate = run(j => walk[j] > 0);                        // dernier repli : sans éviter la rive
  }
  const MAXP = 900, routePos = new Float32Array(MAXP * 2 * 3), routeUV = new Float32Array(MAXP * 2 * 2), routeIdx = [];
  for (let i = 0; i < MAXP - 1; i++) { const a = i * 2; routeIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const routeGeo = new THREE.BufferGeometry();
  routeGeo.setAttribute('position', new THREE.BufferAttribute(routePos, 3).setUsage(THREE.DynamicDrawUsage));
  routeGeo.setAttribute('uv', new THREE.BufferAttribute(routeUV, 2).setUsage(THREE.DynamicDrawUsage));
  routeGeo.setIndex(routeIdx); routeGeo.setDrawRange(0, 0);
  const routeU = { uTime: { value: 0 }, uK: { value: 0 }, uLen: { value: 1 } };
  const route = new THREE.Mesh(routeGeo, new THREE.ShaderMaterial({
    uniforms: routeU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uTime; uniform float uK; uniform float uLen; varying vec2 vU;
      void main(){
        float v = abs(vU.y), core = 1.0 - smoothstep(0.1, 0.28, v), glow = exp(-v * v * 7.0) * 0.55;
        float pulse = 0.7 + 0.3 * sin(vU.x * 2.2 - uTime * 7.0);                 // des impulsions filent vers le portail
        float ends = smoothstep(0.0, 1.2, vU.x) * smoothstep(0.0, 2.0, uLen - vU.x);
        vec3 c = vec3(4.0, 0.08, 0.16) * core * pulse + vec3(1.3, 0.02, 0.06) * glow;
        gl_FragColor = vec4(c * uK * ends, 1.0);
      }`,
  }));
  route.frustumCulled = false; route.visible = false; scene.add(route);
  const rp = [], rU = new THREE.Vector3(), rT = new THREE.Vector3(), rS = new THREE.Vector3(), rA = new THREE.Vector3();
  function updateRoute(car) {
    if (!toGate) buildRoute();
    let s = nodeOf(rA.copy(car).normalize());
    if (s >= 0 && toGate[s] === -1) { let bd = 1e9, bj = -1; near(s, 2.5, j => { if (toGate[j] !== -1) { const dd = 1 - (gd[j * 3] * gd[s * 3] + gd[j * 3 + 1] * gd[s * 3 + 1] + gd[j * 3 + 2] * gd[s * 3 + 2]); if (dd < bd) { bd = dd; bj = j; } } }); s = bj; }
    if (s < 0 || toGate[s] === -1) { routeGeo.setDrawRange(0, 0); return; }
    // points du chemin, lissés (coins arrondis)
    let pts = [rA.clone()];
    for (let i = s, n = 0; n < MAXP / 2; n++) { pts.push(new THREE.Vector3(gd[i * 3], gd[i * 3 + 1], gd[i * 3 + 2])); if (toGate[i] === i) break; i = toGate[i]; }
    pts.push(gateDir.clone());
    for (let it = 0; it < 2; it++) { const q = [pts[0]]; for (let i = 0; i < pts.length - 1; i++) { q.push(pts[i].clone().lerp(pts[i + 1], 0.25).normalize(), pts[i].clone().lerp(pts[i + 1], 0.75).normalize()); } q.push(pts[pts.length - 1]); pts = q; }
    if (pts.length > MAXP) pts.length = MAXP;
    rp.length = 0;
    for (const d of pts) { const bi = planet.bridgeAt(d), h = bi && Math.abs(bi.lat) < 1.0 ? bi.top : Math.max(planet.heightDir(d), planet.waterR); rp.push(d.clone().multiplyScalar(h + 0.05)); }
    let L = 0;
    for (let i = 0; i < rp.length; i++) {
      const p = rp[i]; rU.copy(p).normalize();
      rT.copy(rp[Math.min(rp.length - 1, i + 1)]).sub(rp[Math.max(0, i - 1)]).normalize();
      rS.crossVectors(rU, rT).normalize().multiplyScalar(0.2);
      if (i) L += p.distanceTo(rp[i - 1]);
      routePos.set([p.x + rS.x, p.y + rS.y, p.z + rS.z, p.x - rS.x, p.y - rS.y, p.z - rS.z], i * 6);
      routeUV.set([L, 1, L, -1], i * 4);
    }
    routeU.uLen.value = L;
    routeGeo.attributes.position.needsUpdate = true; routeGeo.attributes.uv.needsUpdate = true;
    routeGeo.setDrawRange(0, Math.max(0, rp.length - 1) * 6);
  }
  /* ---------- la radio : un petit poste en haut de l'écran ---------- */
  const st = document.createElement('style');
  st.textContent = `
    #radioHud{ position:fixed; left:50%; top:74px; transform:translate(-50%,-8px); z-index:22; display:flex; align-items:center; gap:.7rem; padding:.55rem 1rem;
      border-radius:16px; background:rgba(20,6,12,.72); border:1px solid rgba(255,70,70,.35); backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px);
      color:#ffe9e4; font:700 .85rem/1.2 "Space Mono", ui-monospace, monospace; opacity:0; pointer-events:none; transition:opacity .5s, transform .5s; white-space:nowrap; }
    #radioHud.on{ opacity:1; transform:translate(-50%,0); }
    #radioHud .st{ color:#ff4a4a; font-family:"Arial Black", Impact, sans-serif; font-style:italic; font-size:1rem; letter-spacing:.02em; }
    #radioHud .fq{ min-width:5.2em; text-align:right; font-variant-numeric:tabular-nums; }
    #radioHud .bars{ display:flex; gap:3px; align-items:flex-end; height:18px; }
    #radioHud .bars i{ width:5px; border-radius:2px; background:rgba(255,255,255,.18); }
    #radioHud .bars i.on{ background:#ff5a4a; box-shadow:0 0 6px #ff3a2a; }
    #radioHud small{ font-weight:400; opacity:.75; font-size:.72rem; }
    #upFlash{ position:fixed; inset:0; z-index:40; pointer-events:none; opacity:0; background:radial-gradient(circle, #fff 0%, #ffd2c8 45%, #ff3a2a 100%); transition:opacity .9s ease; }
    #upFlash.on{ opacity:1; transition:opacity .12s ease; }
    body.upside #walkBtn{ display:none !important; }
    body.upside .minimap{ filter:grayscale(1) brightness(.55) sepia(.6) hue-rotate(-40deg) saturate(2.2); transition:filter 2s; }
    @media (max-width: 640px){ #radioHud small{ display:none; } #radioHud{ top:70px; left:auto; right:10px; transform:translateY(-8px); gap:.5rem; padding:.5rem .75rem; } #radioHud.on{ transform:none; } }`;
  document.head.appendChild(st);
  const hud = document.createElement('div'); hud.id = 'radioHud';
  hud.innerHTML = '<span class="st">WSQK</span><span class="fq">94.5 FM</span><span class="bars">' + [6, 9, 12, 15, 18].map(h => '<i style="height:' + h + 'px"></i>').join('') + '</span><small>Suis la fréquence jusqu\'au portail</small>';
  document.body.appendChild(hud);
  const bars = [...hud.querySelectorAll('.bars i')], fq = hud.querySelector('.fq'), hint = hud.querySelector('small');
  const flashEl = document.createElement('div'); flashEl.id = 'upFlash'; document.body.appendChild(flashEl);
  const flash = () => { flashEl.classList.add('on'); setTimeout(() => flashEl.classList.remove('on'), 160); };

  /* ---------- état ---------- */
  const S = { on: false, k: 0, r: 0, signal: 0, bolt: 0, nextBolt: 4, fqT: 0, shown: 0 };
  // nuit bleu profond, brume froide ; seul le ciel reste rougeâtre, zébré d'éclairs
  const C = { sun: new THREE.Color('#aab6c8'), hemi: new THREE.Color('#26303e'), gnd: new THREE.Color('#0e1116'), zen: new THREE.Color('#1c0306'), hor: new THREE.Color('#701219'),
    fog: new THREE.Color('#1c2a3b'), red: new THREE.Color('#ff3a40'), water: new THREE.Color('#9aa8bc'), sh: new THREE.Vector3(0.3, 0.31, 0.36), lit: new THREE.Vector3(0.9, 0.93, 1.0) };
  const gatePos = () => gate.position;
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();

  function enter() {
    S.on = true; S.k = 0; S.r = 0; S.signal = 0; S.bolt = 0; S.nextBolt = 3; S.time = 0; S.routeT = 0;
    pickGate(); S.open = 0.04;
    van.visible = false; gate.visible = true; gate.scale.setScalar(0.01); spores.visible = true;
    LOOK.uUpO.value.copy(home.dir); LOOK.uUpR.value = 0;
    document.body.classList.add('upside'); hud.classList.add('on'); flash();
    return { dir: home.dir.clone(), fwd: home.fwd.clone() };
  }
  function reset(withFlash = true) {
    S.on = false; S.k = 0; S.r = 0;
    LOOK.uUpK.value = 0; LOOK.uUpR.value = 0; if (gradeU) gradeU.value = 0;
    if (S.bloom0 && postRef) { postRef.bloom.radius = S.bloom0.r; postRef.bloom.threshold = S.bloom0.th; } S.bloom0 = undefined;
    if (S.trail0 && trailRef) { trailRef.uC1.value.copy(S.trail0[0]); trailRef.uC2.value.copy(S.trail0[1]); trailRef.uC3.value.copy(S.trail0[2]); } S.trail0 = null;
    if (ambRef) ambRef.state.forceLamp = 0;
    van.visible = true; gate.visible = false; spores.visible = false; bulbMesh.visible = false; bolt.visible = false; fence.visible = false; route.visible = false; routeU.uK.value = 0; hint.textContent = "Suis la fréquence jusqu'au portail";
    document.body.classList.remove('upside'); hud.classList.remove('on');
    if (withFlash) flash();
  }
  /** Le van garé : touché par le rayon de la souris / du doigt ? */
  const ray = new THREE.Raycaster();
  function hitVan(ndc, camera) { if (S.on || !van.visible) return false; ray.setFromCamera(ndc, camera); return ray.intersectObject(van, true).length > 0; }
  /** Distance (unités) entre un point et le van garé. */
  const vanDist = p => (S.on ? Infinity : p.distanceTo(van.position));

  /**
   * À chaque image. ctx : { dt, t, car (position), fwd (cap de la voiture), avatar, camera, sun, hemi, amb, skyU, fog, renderer, post, waterUniforms, audio }.
   * Retourne true quand on vient de traverser le portail.
   */
  let gradeU = null, postRef = null, trailRef = null, ambRef = null;
  const SCARLET = [new THREE.Color('#ff6a50'), new THREE.Color('#ff1424'), new THREE.Color('#7a0010')];
  function update(ctx) {
    const { dt, t } = ctx;
    gradeU = ctx.post.grade.uniforms.uUp || null; postRef = ctx.post;
    // le van garé : l'antenne balaie lentement le ciel, les phares vacillent (il se passe quelque chose…)
    if (!S.on) {
      const a = van.userData.antenna; a.rotation.y += dt * 0.6; a.userData.led.visible = Math.sin(t * 5) > 0;
      van.userData.lights.emissiveIntensity = Math.sin(t * 13) * Math.sin(t * 3.1) > 0.3 ? 0.4 : 2;
      ctx.audio && ctx.audio.radio(dt, false, 0);
      return false;
    }
    S.k = Math.min(1, S.k + dt / 3); S.r = Math.min(3.5, S.r + dt * UP_SPEED);
    const k = S.k * S.k * (3 - 2 * S.k);
    LOOK.uUpK.value = k; LOOK.uUpR.value = S.r;
    ctx.camera.updateMatrixWorld(); LOOK.uViewInv.value.copy(ctx.camera.matrixWorld);
    // signal : plus on est près du portail et plus on roule dans sa direction, mieux on capte
    const cd = tmp.copy(ctx.car).normalize(), ang = Math.acos(Math.min(1, cd.dot(gateDir)));
    const toGate = tmp2.copy(gateDir).addScaledVector(cd, -cd.dot(gateDir)); const facing = toGate.lengthSq() > 1e-8 ? ctx.fwd.dot(toGate.normalize()) : 1;
    const close = 1 - THREE.MathUtils.smoothstep(ang, 0.04, 2.8);
    const target = ang < 0.06 ? 1 : Math.min(1, 0.35 * close + 0.65 * Math.pow(Math.max(0, facing), 2) * (0.6 + 0.4 * close));
    S.signal += (target - S.signal) * (1 - Math.exp(-dt * 3));
    // l'antenne du van se tourne vers la fréquence ; son voyant clignote d'autant plus vite que le signal est bon
    const ant = ctx.avatar.userData.van.userData.antenna, loc = ctx.avatar.worldToLocal(tmp.copy(gatePos()));
    let dy = Math.atan2(loc.x, loc.z) - ant.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); ant.rotation.y += dy * (1 - Math.exp(-dt * 5));
    ant.userData.led.visible = Math.sin(t * (3 + 22 * S.signal)) > 0;
    // poste de radio : barres et fréquence qui dérive quand on capte mal
    const nb = Math.round(S.signal * 5); bars.forEach((b, i) => b.classList.toggle('on', i < nb));
    if ((S.fqT -= dt) <= 0) { S.fqT = 0.12; const drift = (1 - S.signal) * 6 * (Math.random() * 2 - 1); fq.textContent = (94.5 + (S.signal > 0.85 ? 0 : drift)).toFixed(1) + ' FM'; }
    ctx.audio && ctx.audio.radio(dt, true, S.signal);
    // portail : il s'ouvre une fois la vague bien partie
    const gk = THREE.MathUtils.smoothstep(S.r, 0.4, 1.0);
    // plus on s'approche, plus la faille s'ouvre (à peine entrouverte de loin, grande ouverte à quelques mètres)
    // (la brume cache tout au-delà d'une vingtaine d'unités : l'ouverture se joue entre 22 et 3 unités)
    const gdist = ctx.car.distanceTo(gate.position), near01 = 1 - THREE.MathUtils.smoothstep(gdist, 3, 22), openT = 0.04 + 0.96 * near01 * near01;
    S.open = (S.open || 0.04) + (openT - (S.open || 0.04)) * (1 - Math.exp(-dt * 4));
    gate.scale.set(Math.max(0.01, gk * (0.6 + 2.6 * S.open)), Math.max(0.01, gk * (1 + 0.03 * Math.sin(t * 3))), Math.max(0.01, gk));   // seule la largeur change : la faille s'écarte
    gateU.uTime.value = t; gateU.uK.value = gk; gateU.uOpen.value = S.open;
    gate.userData.beam.material.opacity = gk * 0.18 * THREE.MathUtils.smoothstep(S.signal, 0.55, 0.95);
    // éclairs rouges et tonnerre
    if ((S.nextBolt -= dt) <= 0) { S.bolt = 1; S.nextBolt = 2.5 + Math.random() * 5; strike(ctx.car, ctx.camera); ctx.audio && ctx.audio.thunder(0.2 + Math.random() * 0.5); }
    S.bolt *= Math.exp(-dt * 3.2); const fl = S.bolt * (0.6 + 0.4 * Math.sin(t * 60));
    { const fk = Math.min(1, S.bolt * 1.8) * (S.bolt > 0.55 ? 1 : 0.55 + 0.45 * Math.sin(t * 38)); boltMat.opacity = fk; haloMat.opacity = fk * 0.22; bolt.visible = S.bolt > 0.03; }
    bulbMesh.visible = true; bulbU.uTime.value = t; bulbU.uK.value = k; fence.visible = true;
    // au bout de 20 s, la ligne néon montre le chemin le plus court (recalculée chaque seconde, depuis la position du van)
    S.time += dt;
    if (S.time > 20) {
      if ((S.routeT -= dt) <= 0) { S.routeT = 1; updateRoute(ctx.car); }
      if (!route.visible) { route.visible = true; hint.textContent = "Suis la ligne rouge jusqu'au portail"; }
      routeU.uK.value = Math.min(1, routeU.uK.value + dt / 2); routeU.uTime.value = t;
    }
    // traînée du turbo : rouge écarlate ; lampadaires et phares allumés
    if (ctx.trails) {
      const U = ctx.trails; if (!S.trail0) S.trail0 = [U.uC1.value.clone(), U.uC2.value.clone(), U.uC3.value.clone()];
      U.uC1.value.copy(S.trail0[0]).lerp(SCARLET[0], k); U.uC2.value.copy(S.trail0[1]).lerp(SCARLET[1], k); U.uC3.value.copy(S.trail0[2]).lerp(SCARLET[2], k);
      trailRef = U;
    }
    if (ctx.ambience) { ctx.ambience.state.forceLamp = k; ambRef = ctx.ambience; }
    // lumière, ciel, brume : on prend la main sur l'ambiance
    const { sun, hemi, amb, skyU, fog, renderer, post, waterUniforms } = ctx;
    sun.color.lerp(C.sun, k); sun.intensity *= 1 - 0.6 * k;
    hemi.color.lerp(C.hemi, k).lerp(C.red, fl * 0.35 * k); hemi.groundColor.lerp(C.gnd, k); hemi.intensity = hemi.intensity * (1 - 0.1 * k) + fl * 1.6 * k;
    amb.intensity *= 1 - 0.45 * k;
    skyU.uZen.value.lerp(C.zen, k).lerp(C.red, fl * 0.5 * k); skyU.uHor.value.lerp(C.hor, k).lerp(C.red, fl * 0.6 * k);
    fog.color.lerp(C.fog, k).lerp(C.red, fl * 0.12 * k);
    const fn = fog.near > 1000 ? 140 : fog.near, ff = fog.far > 1000 ? 300 : fog.far;
    fog.near = THREE.MathUtils.lerp(fn, 1.5, k); fog.far = THREE.MathUtils.lerp(ff, 24, k);
    renderer.toneMappingExposure *= 1 - 0.05 * k;
    LOOK.uShadowTint.value.lerp(C.sh, k); LOOK.uLitTint.value.lerp(C.lit, k);
    // lampadaires et ampoules : une lumière blanche très diffuse (halo large, seuil plus bas)
    if (S.bloom0 === undefined) S.bloom0 = { r: post.bloom.radius, th: post.bloom.threshold };
    post.bloom.strength += 0.45 * k; post.bloom.radius = THREE.MathUtils.lerp(S.bloom0.r, Math.min(1, S.bloom0.r + 0.45), k); post.bloom.threshold = THREE.MathUtils.lerp(S.bloom0.th, S.bloom0.th * 0.75, k);
    if (post.grade.uniforms.uUp) { post.grade.uniforms.uUp.value = k; post.grade.uniforms.uTime.value = t; }
    waterUniforms.uSunColor.value.lerp(C.water, k);
    // spores qui montent doucement autour de la voiture
    if (S.shown++ === 0) for (let i = 0; i < NS; i++) spawnSpore(i, ctx.car);
    for (let i = 0; i < NS; i++) {
      sv.set(sporePos[i * 3], sporePos[i * 3 + 1], sporePos[i * 3 + 2]); su.copy(sv).normalize();
      sv.addScaledVector(su, dt * 0.12).add(tmp.set(Math.sin(t * 0.7 + i), Math.cos(t * 0.5 + i * 1.3), Math.sin(t * 0.6 + i * 0.7)).multiplyScalar(dt * 0.05));
      if (sv.distanceToSquared(ctx.car) > 81) spawnSpore(i, ctx.car); else { sporePos[i * 3] = sv.x; sporePos[i * 3 + 1] = sv.y; sporePos[i * 3 + 2] = sv.z; }
    }
    sporeGeo.attributes.position.needsUpdate = true; sporeMat.opacity = 0.8 * k;
    // traversée du portail
    // traversée : dans l'épaisseur du portail et dans sa largeur actuelle (repère du portail, sans son échelle)
    if (gk < 0.9) return false;
    const rel = tmp.copy(ctx.car).sub(gate.position), q = gate.quaternion, ax = tmp2.set(1, 0, 0).applyQuaternion(q), lx = rel.dot(ax);
    const az = tmp2.set(0, 0, 1).applyQuaternion(q), lz = rel.dot(az), halfW = Math.max(0.5, GW * 0.95 * gate.scale.x);
    return Math.abs(lz) < 0.7 && Math.abs(lx) < halfW && rel.length() < halfW + 2;
  }
  return { van, fence, fenceHit, bigWater, home, gateDir, enter, reset, hitVan, vanDist, update, flash: (car, cam) => { strike(car, cam); S.bolt = 1; }, skip: () => { S.time = 21; },   // (flash, skip : pour les essais)
    get on() { return S.on; }, get k() { return S.k; }, get signal() { return S.signal; } };
}
