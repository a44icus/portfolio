/* ============================================================================
   Clin d'œil : un tuyau vert dépasse des buissons. On y descend : le monde
   passe en jeu de plateforme VU DE PROFIL, sur un tour complet de la planète
   (la planète reste en 3D, la caméra la regarde de côté et suit le kart).
   Gauche / droite pour rouler, saut pour de bon : blocs « ? » à cogner par en
   dessous (pièce, champignon qui fait grandir, étoile d'invincibilité),
   tuyaux et escaliers de pierre à franchir, plateformes au-dessus de l'eau
   (y tomber renvoie au dernier point de passage), petites bestioles à écraser
   en leur sautant dessus. Au bout du tour : le mât à drapeau (plus on
   l'attrape haut, plus ça rapporte), le château, le feu d'artifice, la Jeep.
   ============================================================================ */
import * as THREE from 'three';
import { getPlace } from './placement.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeKit, makeHud, makeFlash, makeToast } from './eggkit.js';
import { glowSprite } from './rides.js';
import { LOOK } from './look.js';

const G = 24, JUMP = 9.6, VMAX = 6.2, DS = 0.2;   // gravité, élan du saut, vitesse, pas du profil du terrain

export function makeMario({ planet, scene, sections, quality, R }) {
  const low = quality === 'low';
  const K = makeKit({ planet, sections, R, seed: 771177 });
  const { rnd, tangent, placeOn, findSpot } = K;
  const Y = new THREE.Vector3(0, 1, 0), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
  const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, ...o });
  const WR = planet.waterR;

  /* ---------- le tuyau vert, à moitié caché dans les buissons ---------- */
  const home = { dir: new THREE.Vector3(0, 0, 1), fwd: new THREE.Vector3(1, 0, 0) };
  { const d = findSpot(d => K.dry(d) && K.farFromZones(d, 0.45) && K.treesWithin(d, 1.2) === 0 && K.flat(d), { tries: 2500, score: d => { const n = K.treesWithin(d, 3.2); return n < 14 ? n : -1; } });
    if (d) home.dir.copy(d);
    const man = getPlace('tuyau'); if (man) home.dir.copy(man.dir); }   // (emplacement choisi à la main : outil ?placer ; le cap suit le parcours)
  // le parcours : le grand cercle qui passe par le tuyau, orienté pour éviter les zones et le plus d'eau possible
  { const t1 = tangent(home.dir), t2 = new THREE.Vector3().crossVectors(home.dir, t1); let best = -1e9;
    for (let a = 0; a < Math.PI; a += Math.PI / 36) {
      const F = t1.clone().multiplyScalar(Math.cos(a)).addScaledVector(t2, Math.sin(a)), N = new THREE.Vector3().crossVectors(F, home.dir);
      let sc = 0; for (const z of sections) { const lat = z.dir.dot(N) * R; if (Math.abs(lat) < 6) sc -= 50 * (6 - Math.abs(lat)); else if (lat > 0 && lat < 18) sc -= 8; }
      let wet = 0; for (let i = 0; i < 120; i++) { const th = i / 120 * Math.PI * 2; if (planet.isWet(home.dir.clone().multiplyScalar(Math.cos(th)).addScaledVector(F, Math.sin(th)))) wet++; }
      sc -= wet * 0.6; if (sc > best) { best = sc; home.fwd.copy(F); }
    } }
  const A = home.dir.clone(), B = home.fwd.clone(), NRM = new THREE.Vector3().crossVectors(B, A).normalize();   // NRM : du côté de la caméra (le parcours défile de gauche à droite)
  const L = Math.PI * 2 * R;
  const dirAt = (s, o = new THREE.Vector3()) => o.copy(A).multiplyScalar(Math.cos(s / R)).addScaledVector(B, Math.sin(s / R));
  const tanAt = (s, o = new THREE.Vector3()) => o.copy(A).multiplyScalar(-Math.sin(s / R)).addScaledVector(B, Math.cos(s / R));
  const ptAt = (s, r, o = new THREE.Vector3()) => dirAt(s, o).multiplyScalar(r);
  const basis = (s, o) => { const U = dirAt(s), T = tanAt(s); o.makeBasis(T, U, NRM); return o; };   // x : le long du parcours, y : en haut, z : vers la caméra
  const prop = new THREE.Group(); scene.add(prop);
  const green = std('#1fb83a', { roughness: 0.25, metalness: 0.05 }), greenD = std('#128a28', { roughness: 0.3 });
  function pipeMesh(h) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, h, 28), green); body.position.y = h / 2 - 0.1; g.add(body);
    const lip = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.22, 28), green); lip.position.y = h - 0.01; g.add(lip);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.02, 6, 28).rotateX(Math.PI / 2), greenD); ring.position.y = h - 0.12; g.add(ring);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.37, 28).rotateX(-Math.PI / 2), std('#061a0a', { roughness: 1 })); hole.position.y = h + 0.105; g.add(hole);
    for (const x of [-0.24, -0.12]) { const hl = new THREE.Mesh(new THREE.BoxGeometry(0.05, h - 0.1, 0.02), std('#8af09a', { roughness: 0.2 })); hl.position.set(x, h / 2 - 0.1, 0.33); hl.rotation.y = -0.4; g.add(hl); }
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return g;
  }
  prop.add(pipeMesh(0.82));
  placeOn(prop, home.dir, home.fwd, -0.05);

  /* ---------- textures ---------- */
  const canvasTex = draw => { const c = document.createElement('canvas'); c.width = c.height = 64; draw(c.getContext('2d')); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; return t; };
  const qTex = used => canvasTex(x => {
    x.fillStyle = used ? '#a0622a' : '#ffb21a'; x.fillRect(0, 0, 64, 64);
    x.strokeStyle = used ? '#5a3010' : '#c86a00'; x.lineWidth = 4; x.strokeRect(2, 2, 60, 60);
    x.fillStyle = used ? '#5a3010' : '#c86a00'; for (const [a, b] of [[8, 8], [56, 8], [8, 56], [56, 56]]) { x.beginPath(); x.arc(a, b, 3, 0, 7); x.fill(); }
    if (!used) { x.font = '900 44px Arial Black, Impact, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#7a3a00'; x.fillText('?', 34, 36); x.fillStyle = '#fff'; x.fillText('?', 32, 33); }
  });
  const brickTex = canvasTex(x => { x.fillStyle = '#c4581c'; x.fillRect(0, 0, 64, 64); x.fillStyle = '#5a2208'; for (let r = 0; r < 4; r++) { x.fillRect(0, r * 16, 64, 2); for (let k = 0; k < 2; k++) x.fillRect((k * 32 + (r % 2) * 16) % 64, r * 16, 2, 16); } x.fillStyle = 'rgba(255,200,150,.35)'; for (let r = 0; r < 4; r++) x.fillRect(0, r * 16 + 2, 64, 2); });
  const stoneTex = canvasTex(x => { x.fillStyle = '#d88a4a'; x.fillRect(0, 0, 64, 64); x.fillStyle = '#7a3a12'; x.fillRect(0, 60, 64, 4); x.fillRect(60, 0, 4, 64); x.fillStyle = '#ffd0a0'; x.fillRect(0, 0, 64, 4); x.fillRect(0, 0, 4, 64); x.fillStyle = 'rgba(120,50,10,.5)'; x.fillRect(14, 14, 36, 36); x.fillStyle = '#d88a4a'; x.fillRect(18, 18, 28, 28); });
  const qMat = std('#ffffff', { map: qTex(false), emissive: '#ffb21a', emissiveIntensity: 0.3, roughness: 0.4 }), uMat = std('#ffffff', { map: qTex(true), roughness: 0.7 });
  const bMat = std('#ffffff', { map: brickTex, roughness: 0.8 }), sMat = std('#ffffff', { map: stoneTex, roughness: 0.7 });

  /* ---------- objets permanents de ce monde : nuages, ponts arc-en-ciel ---------- */
  const world = new THREE.Group(); world.visible = false; scene.add(world);
  const course = new THREE.Group(); world.add(course);   // le niveau, reconstruit à chaque partie
  const cloudG = (() => { const parts = []; [[0, 0, 0, 1], [0.9, -0.15, 0.1, 0.75], [-0.9, -0.2, 0, 0.7], [0.4, 0.45, 0, 0.7], [-0.45, 0.35, 0.1, 0.62]].forEach(([x, y, z, r]) => { const g = new THREE.SphereGeometry(r, 14, 10); g.translate(x, y, z); parts.push(g); }); return mergeGeometries(parts); })();
  const NC = low ? 40 : 70;
  const clouds = new THREE.InstancedMesh(cloudG, new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#dff0ff', emissiveIntensity: 0.6, roughness: 1 }), NC);
  { // derrière le parcours (côté opposé à la caméra), bien hauts, comme un décor de fond
    for (let i = 0; i < NC; i++) { const s = i / NC * L + rnd() * 2, back = -(4 + rnd() * 14), d = dirAt(s).addScaledVector(NRM, back / R).normalize(); qq.setFromRotationMatrix(basis(s, m4)); const sc = 0.8 + rnd() * 0.9; m4.compose(d.multiplyScalar(planet.heightDir(d.clone()) + 5 + rnd() * 4), qq, tmp.set(sc * 1.4, sc, sc * 0.6)); clouds.setMatrixAt(i, m4); } }
  clouds.frustumCulled = false; world.add(clouds);
  const rainbowMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { uTime: { value: 0 } }, polygonOffset: true, polygonOffsetFactor: -2,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float uTime; varying vec2 vUv; vec3 hue(float h){ return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); } void main(){ vec3 c = hue(vUv.y * 0.85 + 0.02); float sh = 0.75 + 0.25 * sin(vUv.x * 3.0 - uTime * 4.0); gl_FragColor = vec4(c * (1.3 * sh), 0.85); }',
  });
  for (const b of planet.bridges || []) {
    const pos = [], uv = [], idx = []; let n = 0;
    for (let th = b.t0; th <= b.t1 + 1e-6; th += 0.12 / R, n++) for (const lat of [-0.95, 0.95]) { const d = b.e.point(th, lat).normalize(); pos.push(...d.multiplyScalar(b.deck(th) + 0.075).toArray()); uv.push((th - b.t0) * R, lat > 0 ? 1 : 0); }
    for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    const m = new THREE.Mesh(g, rainbowMat); m.frustumCulled = false; world.add(m);
  }
  // pièce d'or : rebord épais et bombé, face légèrement creusée, une barre verticale en relief de chaque côté
  const coinGeo = (() => {
    const Rr = 0.17, h = 0.032, f = 0.016, ri = 0.112, rr = 0.128, prof = [];
    const top = [[0, f], [ri, f], [ri + 0.006, f + 0.006], [rr, h], [Rr - 0.012, h], [Rr - 0.003, h - 0.008], [Rr, h - 0.02]];
    top.forEach(([r, y]) => prof.push(new THREE.Vector2(r, y)));
    top.slice().reverse().forEach(([r, y]) => prof.push(new THREE.Vector2(r, -y)));
    const disc = new THREE.LatheGeometry(prof.reverse(), 36).rotateX(Math.PI / 2);   // axe de la pièce : z
    const sh = new THREE.Shape(), w = 0.022, hh = 0.074, rc = 0.012;   // barre aux coins arrondis
    sh.moveTo(-w + rc, -hh); sh.lineTo(w - rc, -hh); sh.quadraticCurveTo(w, -hh, w, -hh + rc); sh.lineTo(w, hh - rc); sh.quadraticCurveTo(w, hh, w - rc, hh); sh.lineTo(-w + rc, hh); sh.quadraticCurveTo(-w, hh, -w, hh - rc); sh.lineTo(-w, -hh + rc); sh.quadraticCurveTo(-w, -hh, -w + rc, -hh);
    const bar = new THREE.ExtrudeGeometry(sh, { depth: 0.006, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 2, curveSegments: 4 });
    const front = bar.clone().translate(0, 0, f), back = bar.clone().rotateY(Math.PI).translate(0, 0, -f);
    const parts = [disc, front, back].map(g => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k); return n; });
    return mergeGeometries(parts).scale(1.3, 1.3, 1.3);   // un peu plus grosses qu'avant, pour qu'on lise le relief
  })(), coinMat = std('#ffc21a', { metalness: 0.45, roughness: 0.28, emissive: '#ff8a00', emissiveIntensity: 0.1 });
  const coinMesh = new THREE.InstancedMesh(coinGeo, coinMat, 400); coinMesh.frustumCulled = false; world.add(coinMesh);
  const popCoin = new THREE.Mesh(coinGeo, coinMat); popCoin.visible = false; world.add(popCoin);

  /* ---------- modèles : champignon, étoile, bestiole, drapeau, château ---------- */
  function mushMesh() { const g = new THREE.Group(); const cap = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), std('#e82a2a', { roughness: 0.3 })); cap.position.y = 0.18; g.add(cap);
    for (let i = 0; i < 5; i++) { const a = i / 5 * 6.28, sp = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), std('#fff')); sp.position.set(Math.cos(a) * 0.15, 0.3, Math.sin(a) * 0.15); sp.scale.y = 0.5; g.add(sp); }
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.2, 12), std('#f6e6c8')); stem.position.y = 0.09; g.add(stem); return g; }
  function starMesh() { const g = new THREE.Group(), sh = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 + Math.PI / 2, r = i % 2 ? 0.11 : 0.26; i ? sh.lineTo(Math.cos(a) * r, Math.sin(a) * r) : sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    const s = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.08, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 1 }).translate(0, 0, -0.04), std('#ffe01a', { emissive: '#ffb000', emissiveIntensity: 1.2, roughness: 0.3 })); s.position.y = 0.28; g.add(s);
    const gl = glowSprite('#fff2a0', 1.1, 0.6); gl.position.y = 0.28; g.add(gl); return g; }
  // la bestiole : une boule bleu nuit grognon sur deux pattes (on l'écrase en lui sautant dessus)
  const critM = std('#3a3a8a', { roughness: 0.6 }), footM = std('#1a1a30', { roughness: 0.8 }), eyeW = std('#ffffff', { roughness: 0.3 }), eyeB = std('#101018');
  function critter() {
    const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), critM); b.scale.set(1, 0.85, 0.9); b.position.y = 0.26; body.add(b);
    for (const sx of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), eyeW); e.position.set(0.17, 0.33, sx * 0.09); body.add(e);
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), eyeB); p.position.set(0.225, 0.32, sx * 0.09); body.add(p);
      const br = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.025, 0.11), eyeB); br.position.set(0.19, 0.42, sx * 0.09); br.rotation.x = sx * 0.5; body.add(br);
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), footM); f.scale.set(1.4, 0.6, 1); f.position.set(0, 0.04, sx * 0.13); g.add(f); g.userData['f' + (sx > 0 ? 1 : 0)] = f;
    }
    g.userData.body = body; g.traverse(o => { if (o.isMesh) o.castShadow = true; }); return g;
  }
  const POLE_H = 5;
  const flagG = new THREE.Group(); world.add(flagG);
  { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, POLE_H, 10), std('#9af0a0', { roughness: 0.3 })); pole.position.y = POLE_H / 2 + 0.4; flagG.add(pole);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 10), green); ball.position.y = POLE_H + 0.45; flagG.add(ball);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), sMat); base.position.y = 0.15; flagG.add(base);
    const fc = document.createElement('canvas'); fc.width = 128; fc.height = 96; const x = fc.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 128, 96); x.fillStyle = '#1fb83a'; x.beginPath(); x.arc(64, 48, 26, 0, 7); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.arc(64, 48, 12, 0, 7); x.fill();
    const ft = new THREE.CanvasTexture(fc); ft.colorSpace = THREE.SRGBColorSpace;
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.62).translate(-0.45, 0, 0), new THREE.MeshStandardMaterial({ map: ft, side: THREE.DoubleSide, roughness: 0.8 })); flag.position.y = POLE_H; flagG.add(flag); flagG.userData.flag = flag;
    flagG.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); }
  const castleG = new THREE.Group(); world.add(castleG);
  { const keep = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.8, 1.8), bMat); keep.position.y = 0.85; castleG.add(keep);
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.0, 1.1), bMat); top.position.y = 2.2; castleG.add(top);
    for (let i = -2; i <= 2; i++) for (const z of [-0.72, 0.72]) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.34), bMat); c.position.set(i * 0.56, 1.9, z); castleG.add(c); }
    for (let i = -1; i <= 1; i++) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.26), bMat); c.position.set(i * 0.5, 2.83, 0.42); castleG.add(c); }
    const doorM = std('#140a04', { roughness: 1 });
    const door = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.05, 16, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2), doorM); door.position.set(0, 0.5, 0.91); door.scale.set(1, 1.3, 1); castleG.add(door);
    const doorB = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.05), doorM); doorB.position.set(0, 0.25, 0.91); castleG.add(doorB);
    castleG.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); }
  // feu d'artifice
  const FW = 6, FP = 90, fwPos = new Float32Array(FW * FP * 3), fwCol = new Float32Array(FW * FP * 3), fwVel = [];
  const fwGeo = new THREE.BufferGeometry(); fwGeo.setAttribute('position', new THREE.BufferAttribute(fwPos, 3)); fwGeo.setAttribute('color', new THREE.BufferAttribute(fwCol, 3));
  const fireworks = new THREE.Points(fwGeo, new THREE.PointsMaterial({ size: 0.24, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  fireworks.frustumCulled = false; fireworks.visible = false; scene.add(fireworks);
  let bursts = [];

  /* ---------- panneau ---------- */
  const hud = makeHud('marioHud', 'background:rgba(20,30,90,.55); border:2px solid rgba(255,255,255,.7); color:#fff; font-family:"Arial Black", Impact, sans-serif; letter-spacing:.03em; text-shadow:0 2px 0 rgba(0,0,0,.45);',
    '<span style="color:#ffcf1a">●</span><span class="ct">× 00</span><span class="tm ct">0:00</span><span class="pc ct">0 %</span><span class="pw"></span><small style="font-family:Manrope, Arial, sans-serif; text-shadow:none">← → rouler · saut pour cogner les blocs · fais le tour de la planète</small>');
  const coinEl = hud.querySelector('.ct'), timeEl = hud.querySelector('.tm'), pcEl = hud.querySelector('.pc'), pwEl = hud.querySelector('.pw'), hint = hud.querySelector('small');
  const flash = makeFlash('radial-gradient(circle, #fff 0%, #fff6c0 45%, #ffcf1a 100%)');
  const toast = makeToast('color:#fff; -webkit-text-stroke:2px #1a1a40; text-shadow:0 4px 0 #1a1a40;');

  /* ---------- le niveau ---------- */
  const NP = Math.ceil(L / DS), gnd = new Float32Array(NP);   // rayon du sol le long du parcours (-1 : eau, on y tombe)
  let solids = [], foes = [], coins = [], items = [], sFlag = 0, sCastle = 0;
  const gIdx = s => ((Math.round(s / DS) % NP) + NP) % NP;
  const gAt = s => gnd[gIdx(s)];
  function groundUnder(s, hw) { let g = -1; for (const o of [-hw * 0.7, 0, hw * 0.7]) g = Math.max(g, gAt(s + o)); return g; }
  function box(s0, s1, y0, y1, kind, mat) {
    const w = s1 - s0, h = y1 - y0, sc = (s0 + s1) / 2;
    let mm = mat;
    if (mat === bMat || mat === sMat) {   // pavage : la texture se répète selon la taille
      mm = mat.clone(); mm.map = mat.map.clone(); mm.map.wrapS = mm.map.wrapT = THREE.RepeatWrapping; mm.map.repeat.set(Math.max(1, Math.round(w / 0.5)), Math.max(1, Math.round(h / 0.5))); mm.map.needsUpdate = true;
    }
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.9), mm);
    basis(sc, m4); m.quaternion.setFromRotationMatrix(m4); m.position.copy(ptAt(sc, (y0 + y1) / 2)); m.castShadow = true; m.receiveShadow = true;
    course.add(m);
    const o = { s0, s1, y0, y1, kind, m, used: false, bump: 0, r0: (y0 + y1) / 2 }; solids.push(o); return o;
  }
  const coin = (s, y) => coins.push({ s, y, alive: true });
  function newFoe(s0, s1, onTop) {
    const m = critter(); course.add(m);
    return { m, s: (s0 + s1) / 2, s0, s1, dir: Math.random() < 0.5 ? -1 : 1, y: onTop ?? gAt((s0 + s1) / 2), top: onTop, alive: true, squash: 0 };
  }
  function build() {
    course.clear(); solids = []; foes = []; coins = []; items = [];
    // profil du sol : terrain, ponts ; l'eau devient un trou (sauf les flaques)
    const d = new THREE.Vector3();
    for (let i = 0; i < NP; i++) { const s = i * DS; dirAt(s, d); const bi = planet.bridgeAt(d); gnd[i] = bi && Math.abs(bi.lat) < 1.0 ? bi.top : planet.isWet(d) ? -1 : planet.heightDir(d); }
    for (let i = 0; i < NP; i++) if (gnd[i] < 0) { let j = i; while (j < NP && gnd[j] < 0) j++; if ((j - i) * DS < 1.0) for (let k = i; k < j; k++) gnd[k] = WR + 0.03; i = j; }
    const R1 = () => Math.random();
    // eau : un saut si c'est étroit, sinon des plateformes de pierre
    const busy = [];
    for (let i = 0; i < NP; i++) if (gnd[i] < 0) {
      let j = i; while (j < NP && gnd[j] < 0) j++;
      const a = i * DS, b = j * DS, len = b - a; busy.push([a - 2, b + 2]);
      const hl = gAt(a - 0.4) > 0 ? gAt(a - 0.4) : WR + 0.4, hr = gAt(b + 0.4) > 0 ? gAt(b + 0.4) : WR + 0.4;
      if (len > 3.2) {
        let s = a + 0.9, prev = hl, lastEnd = a;
        while (s + 1.8 < b - 0.9) {
          const w = 1.8 + R1() * 0.8, e = Math.min(s + w, b - 0.9), k = (s - a) / len;
          let top = THREE.MathUtils.lerp(hl, hr, k) + (R1() - 0.4) * 0.5; top = Math.max(WR + 0.35, Math.min(prev + 0.6, top));
          box(s, e, top - 0.36, top, 'plat', sMat); prev = top; lastEnd = e;
          for (let c = 0; c < 3; c++) coin(e + 0.35 + c * 0.32, top + 1.0 + Math.sin((c + 0.5) / 3 * Math.PI) * 0.35);   // au-dessus du trou suivant
          if (e - s > 2.3 && R1() < 0.25) foes.push(newFoe(s + 0.4, e - 0.4, top));
          s = e + 1.2 + R1() * 0.6;
        }
        // dernier écart jusqu'à la rive trop grand : une petite plateforme de plus
        if (b - lastEnd > 3) { const s1 = Math.min(lastEnd + 1.3, b - 1.5), e1 = Math.max(s1 + 0.8, b - 1.0), top = Math.max(WR + 0.35, Math.min(prev + 0.6, hr)); box(s1, e1, top - 0.36, top, 'plat', sMat); }
      } else for (let c = 0; c < 5; c++) coin(a + len * (c + 0.5) / 5, Math.max(hl, hr) + 0.9 + Math.sin((c + 0.5) / 5 * Math.PI) * 0.6);
      i = j;
    }
    // falaises trop hautes pour un saut : des marches de pierre pour les gravir (dans les deux sens)
    for (let i = 0; i < NP - 6; i++) {
      const a = gnd[i], b = gnd[i + 5]; if (a < 0 || b < 0 || Math.abs(b - a) < 1.2) continue;
      const lo = Math.min(a, b), hi = Math.max(a, b), up = b > a, n = Math.ceil((hi - lo) / 1.1) - 1, s = i * DS;
      for (let k = 1; k <= n; k++) { const x = up ? s - 0.65 * (n - k + 1) + 0.2 : s + 5 * DS + 0.65 * (k - 1) - 0.2; box(x, x + 0.65, lo - 0.3, lo + (hi - lo) * (up ? k : n - k + 1) / (n + 1), 'stone', sMat); }
      busy.push([s - 0.65 * n - 1, s + 5 * DS + 0.65 * n + 1]); i += 6;
    }
    // fin du parcours : le drapeau et le château juste avant de revenir au tuyau (sur la terre ferme)
    sFlag = L - 16; while (sFlag > L * 0.6 && !([-3, -1, 0, 1, 2, 3, 4, 5, 6, 7].every(o => gAt(sFlag + o) > 0) && Math.abs(gAt(sFlag + 5) - gAt(sFlag)) < 0.5)) sFlag -= 0.5;
    sCastle = sFlag + 5; busy.push([sFlag - 3, L + 2]); busy.push([-2, 5]);
    const free = (a, b) => busy.every(([x, y]) => b < x || a > y) && [a, (a + b) / 2, b].every(s => gAt(s) > 0);
    // terre ferme : une succession de petits défis
    const kinds = ['qrow', 'pipe', 'stairs', 'plat', 'foes', 'coins', 'qrow', 'pipe', 'plat', 'foes'];
    let s = 7, n = 0;
    while (s < sFlag - 6) {
      const kind = n < 2 ? (n === 0 ? 'qrow' : 'pipe') : kinds[(R1() * kinds.length) | 0], len = { qrow: 3, pipe: 1, stairs: 4.5, plat: 3, foes: 4, coins: 3 }[kind];
      if (!free(s - 0.5, s + len + 0.5)) { s += 1; continue; }
      const gmin = Math.min(gAt(s), gAt(s + len)), gmax = Math.max(gAt(s), gAt(s + len), gAt(s + len / 2));
      if (gmax - gmin > 0.8) { s += 1; continue; }   // terrain trop pentu ici : plus loin
      if (kind === 'qrow') {   // briques et blocs « ? » en hauteur
        const nb = 3 + ((R1() * 3) | 0), y0 = gmax + 1.45; let any = false;
        for (let k = 0; k < nb; k++) { const q = R1() < 0.5 || (!any && k === nb - 1); any = any || q; box(s + k * 0.5, s + k * 0.5 + 0.5, y0, y0 + 0.5, q ? 'q' : 'brick', q ? qMat : bMat); }
      } else if (kind === 'pipe') {
        const h = 0.6 + R1() * 0.35, g = new THREE.Group(); g.add(pipeMesh(gmax - gmin + h + 0.1)); basis(s + 0.45, m4); g.quaternion.setFromRotationMatrix(m4); g.position.copy(ptAt(s + 0.45, gmin - 0.1)); course.add(g);
        solids.push({ s0: s, s1: s + 0.9, y0: gmin - 0.2, y1: gmax + h + 0.1, kind: 'pipe', m: null });
        coin(s + 0.45, gmax + h + 0.6);
      } else if (kind === 'stairs') {   // escalier de pierre qui monte puis redescend
        for (let k = 0; k < 4; k++) { const hgt = k < 2 ? k + 1 : 4 - k; box(s + k * 0.55, s + k * 0.55 + 0.55, gmin - 0.3, gmax + hgt * 0.45, 'stone', sMat); }
        coin(s + 1.1, gmax + 1.6); coin(s + 1.6, gmax + 1.7);
      } else if (kind === 'plat') {   // plateforme de briques avec des pièces dessus, un bloc « ? » au-dessus
        const top = gmax + 1.4; box(s, s + 3, top - 0.35, top, 'brick', bMat);   // dessous à 1,05 : même grand, le kart passe dessous
        for (let k = 0; k < 4; k++) coin(s + 0.5 + k * 0.65, top + 0.45);
        if (R1() < 0.6) box(s + 1.25, s + 1.75, top + 1.45, top + 1.95, 'q', qMat);
      } else if (kind === 'foes') { foes.push(newFoe(s, s + len, null)); if (R1() < 0.5) foes.push(newFoe(s + 1, s + len, null)); }
      else for (let k = 0; k < 6; k++) coin(s + k * 0.5, gmax + 0.7 + Math.sin((k + 0.5) / 6 * Math.PI) * 0.9);   // arc de pièces : on saute dedans
      s += len + 2.6 + R1() * 3.5; n++;
    }
    // drapeau et château
    basis(sFlag, m4); flagG.quaternion.setFromRotationMatrix(m4); flagG.position.copy(ptAt(sFlag, gAt(sFlag))); flagG.userData.flag.position.y = POLE_H;
    basis(sCastle, m4); castleG.quaternion.setFromRotationMatrix(m4); castleG.position.copy(ptAt(sCastle, Math.min(gAt(sCastle - 1.3), gAt(sCastle), gAt(sCastle + 1.3)) - 0.05));
  }

  /* ---------- état ---------- */
  const S = { on: false, k: 0, coins: 0, time: 0, big: false, star: 0, inv: 0, end: -1, lock: false, score: 0, s: 0, y: 0, vs: 0, vy: 0, ground: true, face: 1, cp: 2, jumpHeld: false, best: 0 };
  const C = { zen: new THREE.Color('#2f7dff'), hor: new THREE.Color('#bfe8ff'), fog: new THREE.Color('#bfe6ff'), sun: new THREE.Color('#fff8ea'), hemi: new THREE.Color('#dff0ff'), gnd: new THREE.Color('#5aa040'), sh: new THREE.Vector3(0.62, 0.66, 0.9), lit: new THREE.Vector3(1.06, 1.04, 0.98) };
  const ray = new THREE.Raycaster();
  let treeSave = [];

  function enter() {
    Object.assign(S, { on: true, k: 0, coins: 0, time: 0, big: false, star: 0, inv: 0, end: -1, lock: true, score: 0, s: 1.4, vs: 0, vy: 5, ground: false, face: 1, cp: 1.4, best: 0, jumpHeld: true });
    build();
    S.y = gAt(S.s) + 0.9;   // on sort du tuyau en sautant
    // les arbres entre la caméra et le parcours sont escamotés (bois et feuillage sauvegardés)
    treeSave = []; const Z = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const t of planet.trunkSpots) {
      const lat = t.d.dot(NRM) * R; if (lat < -1.6 || lat > 15) continue;
      const [w, l] = planet.treeMeshes[t.m]; if (t.i >= w.count) continue;
      const a = new THREE.Matrix4(), b = new THREE.Matrix4(); w.getMatrixAt(t.i, a); l.getMatrixAt(t.i, b); treeSave.push([w, l, t.i, a, b]); w.setMatrixAt(t.i, Z); l.setMatrixAt(t.i, Z);
    }
    planet.treeMeshes.forEach(([w, l]) => { w.instanceMatrix.needsUpdate = true; l.instanceMatrix.needsUpdate = true; });
    world.visible = true; fireworks.visible = false; bursts = [];
    pwEl.textContent = ''; hint.textContent = '← → rouler · saut pour cogner les blocs · fais le tour de la planète';
    document.body.classList.add('egg', 'mario'); hud.classList.add('on'); flash();
    return { dir: dirAt(S.s), fwd: tanAt(S.s) };
  }
  let ctxRef = null;
  function reset(withFlash = true) {
    S.on = false; S.k = 0; S.end = -1; S.lock = false;
    world.visible = false; fireworks.visible = false; course.clear(); solids = []; foes = []; items = [];
    for (const [w, l, i, a, b] of treeSave) { w.setMatrixAt(i, a); l.setMatrixAt(i, b); } treeSave = [];
    planet.treeMeshes.forEach(([w, l]) => { w.instanceMatrix.needsUpdate = true; l.instanceMatrix.needsUpdate = true; });
    if (ctxRef) {
      const { avatar, post, carBody } = ctxRef; avatar.scale.setScalar(1); avatar.visible = true; if (carBody) carBody.r = 0.42;
      if (post.grade.uniforms.uSat && S.sat0 !== undefined) post.grade.uniforms.uSat.value = S.sat0;
      const kp = avatar.userData.kart.userData; kp.paint.forEach(m => { m.color.copy(kp.base); m.emissive.setRGB(0, 0, 0); });
      if (ctxRef.ambience) ctxRef.ambience.state.forceHour = null;
      if (S.sh0) { LOOK.uShadowTint.value.copy(S.sh0); LOOK.uLitTint.value.copy(S.lit0); } S.sh0 = null;
    }
    document.body.classList.remove('egg', 'mario'); hud.classList.remove('on');
    if (withFlash) flash();
  }
  function hit(ndc, camera) { if (S.on || !prop.visible) return false; ray.setFromCamera(ndc, camera); return ray.intersectObject(prop, true).length > 0; }
  const fmt = n => String(n).padStart(2, '0');

  function die(ctx, why) {
    ctx.audio.sfx('spin'); flash(); toast(why || 'Oups !', 900);
    while (S.cp > 1.4 && groundUnder(S.cp, 0.4) < 0) S.cp -= 0.5;   // toujours sur la terre ferme
    S.s = S.cp; S.y = groundUnder(S.cp, 0.4) + 0.6; S.vs = 0; S.vy = 0; S.ground = false; S.big = false; S.inv = 1.6; S.star = 0;
  }
  function hurt(ctx) { if (S.inv > 0 || S.star > 0) return; if (S.big) { S.big = false; S.inv = 2; ctx.audio.sfx('pipe'); } else die(ctx, 'Aïe !'); }
  let popT = -1, popS = 0, popY = 0;
  function bumpBlock(o, ctx) {
    o.bump = 1;
    if (o.kind !== 'q' || o.used) { ctx.audio.impact(2, 0, 'bois'); return; }
    o.used = true; o.m.material = uMat; ctx.audio.sfx('bump');
    const r = Math.random(), kind = r < 0.12 && S.star <= 0 ? 'star' : r < 0.38 && !S.big ? 'mush' : 'coin';
    if (kind === 'coin') { S.coins++; ctx.audio.sfx('coin'); popCoin.visible = true; popT = 0; popS = (o.s0 + o.s1) / 2; popY = o.y1 + 0.3; return; }
    const g = kind === 'mush' ? mushMesh() : starMesh(); g.traverse(m => { if (m.isMesh) m.castShadow = true; }); course.add(g);
    items.push({ g, kind, s: (o.s0 + o.s1) / 2, y: o.y1, vs: 1.8 * (S.face || 1), vy: kind === 'star' ? 5 : 0, rise: 0.4, ground: false });
    ctx.audio.sfx('power');
  }
  const overlaps = (a0, a1, b0, b1) => a0 < b1 && a1 > b0;
  /** Déplace une boîte (o.s, o.y en bas, demi-largeur hw, hauteur hh) contre les solides et le sol. */
  function physics(o, hw, hh, dt, solid = true) {
    let ns = o.s + o.vs * dt; const res = { ground: false, head: null, wall: false };
    // encastré dans un bloc (grandi dessous, repoussé…) : on ressort par le dessus
    if (solid) for (const b of solids) if (overlaps(o.s - hw * 0.9, o.s + hw * 0.9, b.s0, b.s1) && overlaps(o.y + 0.05, o.y + hh - 0.05, b.y0, b.y1)) { o.y = b.y1; o.vy = 0; }
    // mur de terrain (une marche trop haute) quand on roule au sol
    if (o.ground) { const g = groundUnder(ns, hw); if (g > 0 && g - o.y > 0.42) { ns = o.s; o.vs = 0; res.wall = true; } }
    if (solid) for (const b of solids) if (overlaps(ns - hw, ns + hw, b.s0, b.s1) && overlaps(o.y + 0.03, o.y + hh, b.y0, b.y1)) { const ns2 = o.vs > 0 ? b.s0 - hw - 1e-3 : b.s1 + hw + 1e-3; ns = Math.abs(ns2 - o.s) > 1 ? o.s : ns2; o.vs = 0; res.wall = true; }
    o.s = ns;
    // vertical
    let floor = -1; const g = groundUnder(o.s, hw); if (g > 0 && g <= o.y + 0.42) floor = g;
    if (solid) for (const b of solids) if (overlaps(o.s - hw, o.s + hw, b.s0, b.s1) && b.y1 <= o.y + 0.08) floor = Math.max(floor, b.y1);
    if (o.ground && floor > 0 && floor >= o.y - 0.32 && o.vy <= 0) { o.y = floor; o.vy = 0; res.ground = true; return res; }   // on suit le sol (pentes, marches)
    o.vy -= G * dt; if (o.vy < -18) o.vy = -18;
    let ny = o.y + o.vy * dt;
    if (o.vy > 0 && solid) for (const b of solids) if (overlaps(o.s - hw, o.s + hw, b.s0, b.s1) && b.y0 >= o.y + hh - 0.08 && ny + hh > b.y0) { ny = b.y0 - hh; o.vy = -1; res.head = b; break; }
    if (o.vy <= 0 && floor > 0 && ny <= floor) { ny = floor; o.vy = 0; res.ground = true; }
    o.y = ny; return res;
  }
  function spawnBurst(c, col) {
    const b = bursts.length % FW, base = b * FP; bursts[b] = { t: 0 };
    for (let i = 0; i < FP; i++) {
      fwVel[base + i] = K.randDir(new THREE.Vector3(), Math.random).multiplyScalar(2.2 + Math.random() * 1.2);
      fwPos.set([c.x, c.y, c.z], (base + i) * 3); const cc = new THREE.Color(col).offsetHSL((Math.random() - 0.5) * 0.08, 0, 0); fwCol.set([cc.r * 2, cc.g * 2, cc.b * 2], (base + i) * 3);
    }
  }

  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), camS = { s: 0, y: 0 }, bm = new THREE.Matrix4(), tiltQ = new THREE.Quaternion(), XA = new THREE.Vector3(1, 0, 0);
  function update(ctx) {
    const { dt, t } = ctx; ctxRef = ctx;
    if (!S.on) return false;
    S.k = Math.min(1, S.k + dt / 1.2); const k = S.k * S.k * (3 - 2 * S.k);
    // plein jour, ciel bleu franc, couleurs saturées
    ctx.ambience.state.forceHour = 12.5;
    const { sun, hemi, skyU, fog, post, P, avatar } = ctx, input = ctx.input || { x: 0, jump: false, boost: false };
    sun.color.lerp(C.sun, k); sun.intensity = Math.max(sun.intensity, 3.0 * k);
    hemi.color.lerp(C.hemi, k); hemi.groundColor.lerp(C.gnd, k); hemi.intensity = Math.max(hemi.intensity, 1.15 * k);
    skyU.uZen.value.lerp(C.zen, k); skyU.uHor.value.lerp(C.hor, k); fog.color.lerp(C.fog, k);
    if (S.sh0 == null) { S.sh0 = LOOK.uShadowTint.value.clone(); S.lit0 = LOOK.uLitTint.value.clone(); }
    LOOK.uShadowTint.value.copy(S.sh0).lerp(C.sh, k); LOOK.uLitTint.value.copy(S.lit0).lerp(C.lit, k);
    if (post.grade.uniforms.uSat) { if (S.sat0 === undefined) S.sat0 = post.grade.uniforms.uSat.value; post.grade.uniforms.uSat.value = THREE.MathUtils.lerp(S.sat0, 1.5, k); }
    rainbowMat.uniforms.uTime.value = t;
    ctx.audio.theme('mario', S.star > 0 ? 1.3 : 1);
    const sc = S.big ? 1.55 : 1, hw = 0.42 * sc, hh = 0.62 * sc;
    { const cur = avatar.scale.x; avatar.scale.setScalar(cur + (sc - cur) * (1 - Math.exp(-dt * 8))); }

    if (S.end < 0) {
      S.time += dt; const s0 = Math.floor(S.time); timeEl.textContent = Math.floor(s0 / 60) + ':' + fmt(s0 % 60);
      // commandes : gauche / droite, saut (maintenu = plus haut), turbo
      const vmax = VMAX * (input.boost ? 1.45 : 1) * (S.star > 0 ? 1.3 : 1);
      const want = Math.max(-1, Math.min(1, input.x)) * vmax;
      S.vs += (want - S.vs) * (1 - Math.exp(-dt * (input.x ? (S.ground ? 5 : 2.5) : (S.ground ? 4 : 0.6))));
      if (Math.abs(input.x) > 0.2) S.face = Math.sign(input.x);
      if (input.jump && !S.jumpHeld && S.ground) { S.vy = JUMP; S.ground = false; ctx.audio.sfx('jump'); }
      if (!input.jump && S.vy > 2) S.vy -= dt * 40;   // saut relâché tôt : petit saut
      S.jumpHeld = input.jump;
      const wasGround = S.ground, vy0 = S.vy;
      const r = physics(S, hw, hh, dt); S.ground = r.ground;
      if (r.ground && !wasGround && vy0 < -6) ctx.audio.impact(Math.min(3, -vy0 * 0.25), 0, 'sol');
      if (r.head) bumpBlock(r.head, ctx);
      if (S.y < WR - 1.2) die(ctx, 'Plouf !');
      if (S.s < 0.6) { S.s = 0.6; S.vs = Math.max(0, S.vs); }   // derrière nous, le tuyau de départ
      if (S.ground && groundUnder(S.s, hw) > 0 && S.s > S.cp + 12) S.cp = S.s;   // point de passage
      S.best = Math.max(S.best, S.s); pcEl.textContent = Math.min(100, Math.round(S.best / sFlag * 100)) + ' %';
      S.inv = Math.max(0, S.inv - dt); S.star = Math.max(0, S.star - dt);
      // bestioles
      for (const f of foes) {
        if (!f.alive) { if (f.squash > 0) { f.squash -= dt; f.m.scale.set(1.2, Math.max(0.15, f.squash * 2), 1.2); if (f.squash <= 0) f.m.visible = false; } continue; }
        f.s += f.dir * 0.9 * dt; if (f.s < f.s0 || f.s > f.s1) { f.dir *= -1; f.s = Math.max(f.s0, Math.min(f.s1, f.s)); }
        if (f.top == null) { const g = gAt(f.s); if (g > 0) f.y = g; else { f.dir *= -1; f.s += f.dir * 0.1; } }
        basis(f.s, m4); f.m.quaternion.setFromRotationMatrix(m4); if (f.dir < 0) f.m.rotateY(Math.PI); f.m.position.copy(ptAt(f.s, f.y));
        f.m.userData.f0.position.x = Math.sin(t * 10) * 0.07; f.m.userData.f1.position.x = -Math.sin(t * 10) * 0.07; f.m.userData.body.position.y = Math.abs(Math.sin(t * 10)) * 0.03;
        if (!overlaps(S.s - hw, S.s + hw, f.s - 0.26, f.s + 0.26) || !overlaps(S.y, S.y + hh, f.y, f.y + 0.5)) continue;
        if (S.star > 0) { f.alive = false; f.squash = 0; f.m.visible = false; ctx.audio.sfx('bump'); S.coins++; continue; }
        if (S.vy < 0 && S.y > f.y + 0.22) { f.alive = false; f.squash = 0.5; S.vy = 6.5; S.ground = false; ctx.audio.sfx('bump'); continue; }
        hurt(ctx);
      }
      // objets sortis des blocs : ils montent, glissent, tombent, se ramassent
      for (const it of items) {
        if (it.done) continue;
        if (it.rise > 0) { it.rise -= dt; it.y += dt * 1.3; }
        else { const r2 = physics(it, 0.2, 0.4, dt); it.ground = r2.ground; if (r2.wall) it.vs = -(Math.sign(it.vs) || 1) * 1.8; if (it.kind === 'star' && r2.ground) { it.vy = 6; it.ground = false; } if (it.y < WR - 1) { it.done = true; it.g.visible = false; } }
        if (Math.abs(it.vs) < 1.8) it.vs = (Math.sign(it.vs) || 1) * 1.8;
        basis(it.s, m4); it.g.quaternion.setFromRotationMatrix(m4); it.g.position.copy(ptAt(it.s, it.y)); if (it.kind === 'star') it.g.children[0].rotation.y = t * 5;
        if (it.rise <= 0 && overlaps(S.s - hw, S.s + hw, it.s - 0.25, it.s + 0.25) && overlaps(S.y, S.y + hh, it.y, it.y + 0.45)) {
          it.done = true; it.g.visible = false;
          if (it.kind === 'mush') { S.big = true; ctx.audio.sfx('grow'); toast('SUPER KART !'); }
          else { S.star = 10; ctx.audio.sfx('star'); toast('INVINCIBLE !'); }
        }
      }
      // le mât : on l'attrape
      if (S.s >= sFlag - hw - 0.1) {
        const hgt = S.y - gAt(sFlag), pts = hgt > 1.0 ? 5000 : hgt > 0.6 ? 2000 : hgt > 0.25 ? 800 : 400;
        S.score = pts + S.coins * 100; S.end = 0; S.vs = 0; S.vy = 0; S.s = sFlag - hw - 0.05; S.grabY = S.y;
        ctx.audio.sfx('flag'); toast(pts + ' !'); hint.textContent = 'Score : ' + S.score; pcEl.textContent = '100 %';
      }
    } else if (ending(ctx, dt, t, hw)) return true;
    // blocs cognés : petit rebond
    for (const b of solids) if (b.bump > 0 && b.m) { b.bump = Math.max(0, b.bump - dt * 5); b.m.position.copy(ptAt((b.s0 + b.s1) / 2, b.r0 + Math.sin(b.bump * Math.PI) * 0.16)); }
    if (popT >= 0) { popT += dt; popY += dt * (3.5 - popT * 9); popCoin.position.copy(ptAt(popS, popY)); popCoin.rotateY(dt * 20); if (popT > 0.6) { popT = -1; popCoin.visible = false; } }
    // pièces
    let n = 0;
    for (const c of coins) {
      if (!c.alive) continue;
      if (S.end < 0 && overlaps(S.s - hw, S.s + hw, c.s - 0.2, c.s + 0.2) && overlaps(S.y, S.y + hh, c.y - 0.22, c.y + 0.22)) { c.alive = false; S.coins++; ctx.audio.sfx('coin'); continue; }
      basis(c.s, m4); qq.setFromRotationMatrix(m4).multiply(tiltQ.setFromAxisAngle(Y, t * 3 + c.s)); m4.compose(ptAt(c.s, c.y), qq, one); if (n < 400) coinMesh.setMatrixAt(n++, m4);
    }
    coinMesh.count = n; coinMesh.instanceMatrix.needsUpdate = true;
    coinEl.textContent = '× ' + fmt(S.coins);
    pwEl.textContent = S.star > 0 ? '★ ' + Math.ceil(S.star) : S.big ? '▲' : '';
    // le kart : posé sur le parcours, face au sens de la marche, penché selon la pente
    const U = dirAt(S.s), T = tanAt(S.s).multiplyScalar(S.face);
    let pitch = 0; if (S.ground) { const ga = groundUnder(S.s + 0.4 * S.face, hw), gb = groundUnder(S.s - 0.4 * S.face, hw); if (ga > 0 && gb > 0) pitch = Math.atan2(ga - gb, 0.8); } else pitch = Math.max(-0.4, Math.min(0.4, S.vy * 0.04));
    S.pitch = (S.pitch || 0) + (pitch - (S.pitch || 0)) * (1 - Math.exp(-dt * 10));
    const right = tmp2.crossVectors(U, T).normalize(); bm.makeBasis(right, U, T); avatar.quaternion.setFromRotationMatrix(bm).multiply(tiltQ.setFromAxisAngle(XA, -S.pitch));
    avatar.position.copy(U).multiplyScalar(S.y);
    if (S.end < 0) avatar.visible = S.inv > 0 ? Math.sin(t * 40) > 0 : true;
    avatar.userData.wheels.forEach(w => { w.w.rotation.x += Math.abs(S.vs) * dt / 0.19; w.pivot.rotation.y = 0; });
    avatar.userData.pose(0, 0, null, 0, 0, 0, input.boost && S.end < 0 && Math.abs(S.vs) > 1 ? 1 : 0, t);
    const kp = avatar.userData.kart.userData;
    if (S.star > 0) { const h = (t * 2.5) % 1; kp.paint.forEach(m => { m.color.setHSL(h, 1, 0.55); m.emissive.setHSL(h, 1, 0.35); }); } else kp.paint.forEach(m => { m.color.copy(kp.base); m.emissive.setRGB(0, 0, 0); });
    // pour le reste du jeu (mini-carte, son, ombres, objets renversables)
    P.dir.copy(U); P.fwd.copy(T); P.mv.copy(T); P.r = S.y; P.speed = Math.abs(S.vs); P.ground = S.ground; P.throttle = Math.abs(input.x); P.boost = input.boost ? 1 : 0; P.hover = 0;
    if (ctx.carBody) { ctx.carBody.r = 0.42 * sc; ctx.carBody.pos.copy(avatar.position).addScaledVector(U, 0.25); ctx.carBody.vel.copy(tanAt(S.s)).multiplyScalar(S.vs); }
    // caméra de profil : un peu en avance dans le sens de la marche, elle suit la hauteur en douceur
    const zoom = ctx.zoom || 1, lead = (S.end < 0 ? S.face * 0.9 + S.vs * 0.12 : 1.2) * zoom;   // le kart reste un peu à gauche du centre
    camS.s += (S.s + lead - camS.s) * (1 - Math.exp(-dt * 3)); if (Math.abs(camS.s - S.s) > 20) camS.s = S.s;
    camS.y += (S.y - camS.y) * (1 - Math.exp(-dt * 2.5)); if (Math.abs(camS.y - S.y) > 6) camS.y = S.y;
    const CU = dirAt(camS.s);
    camPos.copy(CU).multiplyScalar(camS.y + 1.9 * zoom).addScaledVector(NRM, 11.5 * zoom);
    camLook.copy(CU).multiplyScalar(camS.y + 1.0);
    ctx.camera.position.lerp(camPos, 1 - Math.exp(-dt * (S.k < 1 ? 3 : 8))); ctx.camera.up.copy(CU); ctx.camera.lookAt(camLook);
    return false;
  }
  function ending(ctx, dt, t, hw) {
    S.end += dt; const e = S.end, flag = flagG.userData.flag, g0 = gAt(sFlag);
    flag.position.y = Math.max(0.7, POLE_H - e * 4);
    if (e < 1.1) S.y = Math.max(g0, S.grabY - (S.grabY - g0) * Math.min(1, e / 0.9));   // on glisse le long du mât
    else if (e < 2.8) { S.vs = 3.2; S.face = 1; S.ground = true; const r = physics(S, hw, 0.6, dt, false); S.ground = r.ground; if (S.s >= sCastle) { S.s = sCastle; ctx.avatar.visible = false; } }   // jusqu'au château
    else { ctx.avatar.visible = false; S.vs = 0; }
    if (e > 2.4 && bursts.filter(Boolean).length < Math.min(FW, Math.floor((e - 2.4) / 0.45) + 1)) {
      fireworks.visible = true; spawnBurst(ptAt(sCastle + (Math.random() - 0.5) * 4, gAt(sCastle) + 4 + Math.random() * 2.5).addScaledVector(NRM, -1), ['#ff4a4a', '#ffd23a', '#3aff8a', '#3aa0ff', '#ff5ad8'][bursts.length % 5]); ctx.audio.sfx('boom');
    }
    const Uc = dirAt(sCastle);
    for (let b = 0; b < FW; b++) { if (!bursts[b]) continue; for (let i = 0; i < FP; i++) { const j = b * FP + i, v = fwVel[j]; v.addScaledVector(Uc, -dt * 1.6).multiplyScalar(Math.exp(-dt * 1.2)); fwPos[j * 3] += v.x * dt; fwPos[j * 3 + 1] += v.y * dt; fwPos[j * 3 + 2] += v.z * dt; const f = Math.exp(-dt * 0.9); fwCol[j * 3] *= f; fwCol[j * 3 + 1] *= f; fwCol[j * 3 + 2] *= f; } }
    fwGeo.attributes.position.needsUpdate = true; fwGeo.attributes.color.needsUpdate = true;
    if (e > 6) { S.lock = false; return true; }
    return false;
  }
  function pins() {
    if (!S.on) return [{ dir: home.dir, icon: 'pipe' }];
    return [{ dir: dirAt(sFlag), color: '#ffffff', glyph: '⚑', fg: '#1fb83a' }];
  }
  return {
    id: 'mario', ride: 'kart', prop, home, enter, reset, hit, update, pins, get exitDir() { return dirAt(sCastle + 1.8); }, trees: 1, tilt: 0.15,
    box: { half: 0.48, front: 0.48, rear: 0.48 }, prompt: 'Descendre dans le tuyau', music: 'mario',
    get on() { return S.on; }, get k() { return S.k; }, get lock() { return S.lock; },
    get state() { return S; }, get solids() { return solids; }, get foes() { return foes; }, get coinsLeft() { return coins.filter(c => c.alive).length; }, get sFlag() { return sFlag; }, L, gAt,
  };
}
