/* ============================================================================
   Clin d'œil : un BMX rouge est appuyé à la lisière d'un bois, une piste de
   bonbons y mène ; dans son panier, une silhouette sous un drap, deux grands
   yeux qui brillent. On l'enfourche : la nuit tombe, la forêt se noie dans une
   brume bleutée, une lune immense se lève. On prend de l'élan vers la rampe…
   et le vélo s'envole. On le pilote dans le ciel (gauche/droite pour virer,
   haut/bas pour monter et descendre), d'anneau de lumière en anneau de lumière,
   en évitant les projecteurs des fourgons, jusqu'au vaisseau qui attend dans
   une clairière. Il repart en laissant un arc-en-ciel : on retrouve la Jeep.
   ============================================================================ */
import * as THREE from 'three';
import { makeKit, makeHud, makeFlash, makeToast } from './eggkit.js';
import { makeBMX, glowSprite } from './rides.js';
import { LOOK } from './look.js';

const FLY_V = 1.7, FLY_MIN = 2.3, FLY_MAX = 10.5, NR = 8;   // vitesse de vol, altitude mini / maxi au-dessus du sol, nombre d'anneaux

const MOON_S = 3, MOON_H = 4.6, CAM_D = 16;   // la lune est centrée derrière le vélo à cet endroit du vol (abscisse, altitude), puis reste en arrière

export function makeET({ planet, scene, sections, quality, R }) {
  const low = quality === 'low';
  const K = makeKit({ planet, sections, R, seed: 424243 });
  const { rnd, tangent, placeOn, offset, findSpot, angDist } = K;
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), tmp3 = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), m4 = new THREE.Matrix4(), qq = new THREE.Quaternion();
  const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, ...o });
  const groundR = d => Math.max(planet.heightDir(d), planet.waterR);

  /* ---------- le vélo garé, à l'orée d'un bois ---------- */
  const home = { dir: new THREE.Vector3(1, 0, 0), fwd: new THREE.Vector3(0, 1, 0) };
  { const d = findSpot(d => K.dry(d) && K.farFromZones(d, 0.45) && K.treesWithin(d, 1.3) === 0 && K.flat(d), { tries: 2500, score: d => { const n = K.treesWithin(d, 3.4); return n < 14 ? n : -1; } });
    if (d) home.dir.copy(d); home.fwd.copy(tangent(home.dir, new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5))); }
  const prop = new THREE.Group(); scene.add(prop);
  const parked = makeBMX({ rider: false }); parked.rotation.z = 0.2; parked.position.y = -0.02; prop.add(parked);   // posé sur sa béquille
  { const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 4), std('#c9ccd4', { metalness: 0.9, roughness: 0.2 })); stand.position.set(0.1, 0.13, -0.05); stand.rotation.z = 0.5; prop.add(stand); }
  placeOn(prop, home.dir, home.fwd);
  // piste de bonbons multicolores qui mène au vélo
  const candies = [];
  { let d = home.dir.clone(), a = rnd() * Math.PI * 2;
    for (let i = 0; i < 16; i++) { a += (rnd() - 0.5) * 0.5; d = offset(d, a, 0.9 + rnd() * 0.3); if (K.dry(d, 0.6)) candies.push(d.clone()); } }
  const candyMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 10, 8).scale(1.5, 0.7, 1), std('#ffffff', { roughness: 0.25 }), Math.max(1, candies.length));
  { const c = new THREE.Color(), cols = ['#ff7a12', '#ffcf1a', '#7a3a12', '#ff7a12', '#ffd84a'];
    candies.forEach((d, i) => { qq.setFromUnitVectors(Y, d).multiply(new THREE.Quaternion().setFromAxisAngle(Y, rnd() * 6)); m4.compose(d.clone().multiplyScalar(planet.heightDir(d) + 0.04), qq, new THREE.Vector3(1, 1, 1)); candyMesh.setMatrixAt(i, m4); candyMesh.setColorAt(i, c.set(cols[i % cols.length])); }); }
  candyMesh.count = candies.length; candyMesh.castShadow = true; scene.add(candyMesh);

  /* ---------- la lune, immense ---------- */
  const moonTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d');
    const g = x.createRadialGradient(236, 224, 20, 256, 256, 252); g.addColorStop(0, '#fffdf2'); g.addColorStop(0.75, '#f1ead2'); g.addColorStop(1, '#ddd3b4');
    x.fillStyle = g; x.beginPath(); x.arc(256, 256, 252, 0, Math.PI * 2); x.fill();
    let sd = 7; const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 70; i++) { const cx = 50 + r() * 412, cy = 50 + r() * 412, rr = 6 + r() * (i < 8 ? 52 : 18); if (Math.hypot(cx - 256, cy - 256) + rr > 248) continue; x.fillStyle = `rgba(150,140,112,${0.1 + r() * 0.16})`; x.beginPath(); x.arc(cx, cy, rr, 0, Math.PI * 2); x.fill(); x.fillStyle = 'rgba(255,255,245,.12)'; x.beginPath(); x.arc(cx - rr * 0.15, cy - rr * 0.15, rr * 0.8, 0, Math.PI * 2); x.fill(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const moon = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: moonTex, color: new THREE.Color(1.3, 1.26, 1.12), transparent: true, fog: false, depthWrite: false }));
  moon.renderOrder = -1; moon.visible = false; scene.add(moon);
  const moonHalo = glowSprite('#cfe0ff', 1, 0); moonHalo.material.fog = false; moonHalo.renderOrder = -1; moon.add(moonHalo); moonHalo.scale.setScalar(2.4); moonHalo.position.z = -0.01;
  const moonDir = new THREE.Vector3();

  /* ---------- brume bleutée : de grandes nappes douces au ras du sol, autour de la caméra ---------- */
  const NM = low ? 40 : 80;
  const mistTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(0.5, 'rgba(255,255,255,.2)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
  const mistPos = new Float32Array(NM * 3), mistGeo = new THREE.BufferGeometry(); mistGeo.setAttribute('position', new THREE.BufferAttribute(mistPos, 3));
  const mistMat = new THREE.PointsMaterial({ map: mistTex, color: '#a8c4f0', size: 9, transparent: true, opacity: 0, depthWrite: false, fog: false, sizeAttenuation: true });
  const mist = new THREE.Points(mistGeo, mistMat); mist.frustumCulled = false; mist.visible = false; scene.add(mist);
  const placeMist = (i, c) => { const d = tmp.copy(c).normalize(), t1 = tangent(d), t2 = tmp2.crossVectors(d, t1), a = Math.random() * 6.28, rr = 3 + Math.random() * 24; d.addScaledVector(t1, Math.cos(a) * rr / R).addScaledVector(t2, Math.sin(a) * rr / R).normalize(); d.multiplyScalar(groundR(d) + 0.3 + Math.random() * 1.4); mistPos.set([d.x, d.y, d.z], i * 3); };

  /* ---------- la rampe, les anneaux, la clairière du vaisseau ---------- */
  const ramp = new THREE.Group(); ramp.visible = false; scene.add(ramp);
  { const sh = new THREE.Shape(); sh.moveTo(-0.9, 0); sh.lineTo(0.9, 0); sh.lineTo(0.9, 0.55); sh.quadraticCurveTo(0.1, 0.12, -0.9, 0);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 1.1, bevelEnabled: false }).translate(0, 0, -0.55).rotateY(-Math.PI / 2);   // la pente monte vers l'avant (+z)
    const m = new THREE.Mesh(g, std('#7a5a3a', { roughness: 0.95 })); m.castShadow = true; m.receiveShadow = true; ramp.add(m);
    for (let i = 0; i < 4; i++) { const pl = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.03, 0.22), std('#a07a50', { roughness: 0.9 })); const z = -0.6 + i * 0.42, y = 0.04 + 0.5 * Math.pow((z + 0.9) / 1.8, 1.6); pl.position.set(0, y, z); pl.rotation.x = -0.35 - i * 0.08; ramp.add(pl); }
    const glow = glowSprite('#bfe0ff', 2.2, 0.5); glow.position.set(0, 0.8, 0.6); ramp.add(glow);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.6, 8, 14, 1, true).translate(0, 4, 0), new THREE.MeshBasicMaterial({ color: '#cfe4ff', transparent: true, opacity: 0.14, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false })); beam.position.z = 0.6; ramp.add(beam); }
  // des objets qui flottent dans la nuit (ballon, cubes de bois, bonbons, livre, jouets), auréolés d'une lueur douce : on les attrape au vol
  function floater(i) {
    const g = new THREE.Group(), kind = i % 6;
    if (kind === 0) {   // ballon à bandes
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.28, 20, 14), std('#e8402a', { roughness: 0.4 })); g.add(b);
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.282, 0.05, 8, 28), std('#ffffff', { roughness: 0.4 })); g.add(band);
    } else if (kind === 1) {   // cube de bois à lettre
      const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); x.fillStyle = '#e8c48a'; x.fillRect(0, 0, 64, 64); x.strokeStyle = '#a8743a'; x.lineWidth = 6; x.strokeRect(3, 3, 58, 58); x.font = '900 40px Arial Black, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = ['#2a6ae8', '#e8402a', '#2ab84a'][i % 3]; x.fillText('ABCDEFGH'[i % 8], 32, 35);
      const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; g.add(new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 0.38), std('#ffffff', { map: tx, roughness: 0.7 })));
    } else if (kind === 2) {   // bonbon emballé
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), std(['#ff7a12', '#ffcf1a', '#ff5ab0'][i % 3], { roughness: 0.25 })); b.scale.set(1.3, 1, 1); g.add(b);
      for (const sx of [-1, 1]) { const w = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.16, 8), b.material); w.rotation.z = sx * Math.PI / 2; w.position.x = sx * 0.28; g.add(w); }
    } else if (kind === 3) {   // livre ouvert
      for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.03, 0.34), std('#f4efe2', { roughness: 0.8 })); p.position.x = sx * 0.13; p.rotation.z = sx * 0.25; g.add(p); const cv = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.012, 0.36), std('#2a4a8a')); cv.position.set(sx * 0.13, -0.022, 0); cv.rotation.z = sx * 0.25; g.add(cv); }
    } else if (kind === 4) {   // petite fusée jouet
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.34, 14), std('#e8e8ee', { roughness: 0.3, metalness: 0.3 })); g.add(b);
      const n = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.18, 14), std('#e8402a')); n.position.y = 0.26; g.add(n);
      for (let k = 0; k < 3; k++) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.12, 0.12), std('#2a6ae8')); const a = k / 3 * Math.PI * 2; f.position.set(Math.cos(a) * 0.1, -0.13, Math.sin(a) * 0.1); f.rotation.y = -a; g.add(f); }
    } else {   // fleur en pot
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.1, 0.18, 14), std('#c0602a', { roughness: 0.8 })); g.add(pot);
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 6), std('#3a8a3a')); st.position.y = 0.24; g.add(st);
      for (let k = 0; k < 6; k++) { const pe = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), std('#ffd23a')); const a = k / 6 * Math.PI * 2; pe.position.set(Math.cos(a) * 0.08, 0.4, Math.sin(a) * 0.08); pe.scale.set(1, 0.5, 1); g.add(pe); }
      const ce = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), std('#7a3a12')); ce.position.y = 0.41; g.add(ce);
    }
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    const halo = glowSprite('#cfe4ff', 1.5, 0.3); halo.material.fog = false;
    const root = new THREE.Group(); root.add(g, halo); root.visible = false; scene.add(root);
    return { g: root, body: g, h: halo, pos: new THREE.Vector3(), done: false, gone: 0, spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(), ph: Math.random() * 6 };
  }
  const rings = []; for (let i = 0; i < NR; i++) rings.push(floater(i));
  // Smarties : petites lentilles de chocolat enrobées, couleurs vives et brillantes
  const SM_COLS = ['#e8202a', '#ff7a12', '#ffd21a', '#2ab84a', '#2a6ae8', '#ff5ab0', '#8a3ae8', '#7a4220'].map(c => new THREE.Color(c));
  const SMAX = 160, smarties = [];
  const smMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.14, 16, 10).scale(1, 0.42, 1), std('#ffffff', { roughness: 0.18, metalness: 0.05 }), SMAX);
  smMesh.material.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * 1.3;'); };   // leur couleur brille un peu : elle traverse le clair de lune bleuté
  smMesh.material.customProgramCacheKey = () => 'smarties';
  smMesh.frustumCulled = false; smMesh.visible = false; smMesh.castShadow = true; for (let i = 0; i < SMAX; i++) smMesh.setColorAt(i, SM_COLS[i % 8]); smMesh.count = 0; scene.add(smMesh);   // (couleurs par instance créées d'emblée : le shader est compilé au chargement)
  const smQ = new THREE.Quaternion(), smE = new THREE.Euler(), smS = new THREE.Vector3();
  const site = { dir: new THREE.Vector3() };

  /* ---------- fourgons et projecteurs qui fouillent le ciel ---------- */
  const NS = 0, lights = [];   // (les fourgons à projecteurs ont été retirés)
  const vanM = std('#e8ece6', { roughness: 0.6 }), darkM = std('#1a1e26', { roughness: 0.4 });
  for (let i = 0; i < NS; i++) {
    const g = new THREE.Group(); g.visible = false; scene.add(g);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 1.6), vanM); body.position.y = 0.5; g.add(body);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.3, 0.5), darkM); cab.position.set(0, 0.62, 0.62); g.add(cab);
    const siren = glowSprite('#ff3040', 0.5, 0.9); siren.position.set(0, 0.95, 0.4); g.add(siren);
    const head = new THREE.Group(); head.position.set(0, 0.95, -0.3); g.add(head);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 1.6, 22, 18, 1, true).translate(0, 11, 0), new THREE.MeshBasicMaterial({ color: '#fff4d0', transparent: true, opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
    head.add(beam); const lens = glowSprite('#fff4d0', 0.8, 0.9); head.add(lens);
    g.traverse(o => { if (o.isMesh && o !== beam) o.castShadow = true; });
    lights.push({ g, head, siren, ph: rnd() * 6, dir: new THREE.Vector3() });
  }

  /* ---------- le vaisseau ---------- */
  const ship = new THREE.Group(); ship.visible = false; scene.add(ship);
  { const hull = new THREE.Mesh(new THREE.SphereGeometry(1.6, 28, 18), std('#8a8f9a', { metalness: 0.7, roughness: 0.35 })); hull.scale.set(1, 0.72, 1); ship.add(hull);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.62, 0.12, 8, 40).rotateX(Math.PI / 2), std('#5c616c', { metalness: 0.8, roughness: 0.3 })); ship.add(ring);
    const cols = ['#ff4a3a', '#ffd23a', '#3aff8a', '#3a9aff', '#ff3ad0'], ls = [];
    for (let i = 0; i < 20; i++) { const a = i / 20 * Math.PI * 2, s = glowSprite(cols[i % 5], 0.7, 0.9); s.position.set(Math.cos(a) * 1.75, 0, Math.sin(a) * 1.75); ship.add(s); ls.push(s); }
    const under = glowSprite('#ffb070', 4, 0.8); under.position.y = -1.1; ship.add(under);
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 2.2, 5, 20, 1, true).translate(0, -3.4, 0), new THREE.MeshBasicMaterial({ color: '#ffd8a0', transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false })); ship.add(cone);
    ship.userData = { lights: ls, under, cone }; }
  const rainbow = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.4, 40, 24, 1, true).translate(0, -20, 0), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uK: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float uK; varying vec2 vUv; vec3 hue(float h){ return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); } void main(){ float a = smoothstep(0.0, 0.25, vUv.y) * (1.0 - smoothstep(0.85, 1.0, vUv.y)); gl_FragColor = vec4(hue(vUv.x * 2.0 + vUv.y) * 1.6, a * uK * 0.7); }',
  })); rainbow.visible = false; ship.add(rainbow);

  /* ---------- panneau et effets ---------- */
  const hud = makeHud('etHud', 'background:rgba(8,14,34,.7); border:1px solid rgba(160,200,255,.35); color:#eef3ff;',
    '<span style="color:#ff5a5a;font-size:1.05rem">♥</span><span class="ct rg">✦ 0 / ' + NR + '</span><span class="ct sm" style="color:#ffd21a">● 0</span><span class="ct ds"></span><small>Prends de l\'élan vers la rampe lumineuse</small>');
  const rgEl = hud.querySelector('.rg'), dsEl = hud.querySelector('.ds'), smEl = hud.querySelector('.sm'), hint = hud.querySelector('small');
  const flash = makeFlash('radial-gradient(circle, #fff 0%, #e8f0ff 50%, #9ab8ff 100%)');
  const toast = makeToast('color:#fff; text-shadow:0 0 18px rgba(140,180,255,.9), 0 3px 0 rgba(0,0,0,.35);');

  /* ---------- état ---------- */
  const S = { on: false, k: 0, phase: 'ground', h: 0, yaw: 0, bank: 0, pitch: 0, rings: 0, next: 0, caught: 0, cine: -1, lock: false, heart: 0, lift: 0 };
  const F = { dir: new THREE.Vector3(), fwd: new THREE.Vector3() };   // en vol : position (direction) et cap
  const C = { hemi: new THREE.Color('#3a5a9a'), gnd: new THREE.Color('#0e1830'), zen: new THREE.Color('#040a20'), hor: new THREE.Color('#1e3866'), fog: new THREE.Color('#1c3058'), moon: new THREE.Color('#c4d6ff'), sh: new THREE.Vector3(0.32, 0.42, 0.72), lit: new THREE.Vector3(0.82, 0.92, 1.12) };
  const ray = new THREE.Raycaster();

  // le vol suit un arc de grand cercle (rampe → vaisseau) ; on le regarde de profil, le vélo passe de gauche à droite devant la lune
  const ARC = { A: new THREE.Vector3(), B: new THREE.Vector3(), N: new THREE.Vector3(), sSite: 60 };
  const arcDir = (s, o = new THREE.Vector3()) => o.copy(ARC.A).multiplyScalar(Math.cos(s / R)).addScaledVector(ARC.B, Math.sin(s / R));
  const arcTan = (s, o = new THREE.Vector3()) => o.copy(ARC.A).multiplyScalar(-Math.sin(s / R)).addScaledVector(ARC.B, Math.cos(s / R));
  const arcPt = (s, h, o = new THREE.Vector3()) => { arcDir(s, o); return o.multiplyScalar(groundR(o) + h); };
  let treeSave = [];
  function hideTrees(on) {
    if (on) {
      const Z = new THREE.Matrix4().makeScale(0, 0, 0);
      for (const t of planet.trunkSpots) {
        const lat = t.d.dot(ARC.N) * R; if (lat < -1.5 || lat > 13) continue;
        const s = Math.atan2(t.d.dot(ARC.B), t.d.dot(ARC.A)) * R; if (s < -6 || s > ARC.sSite + 12) continue;
        const [w, l] = planet.treeMeshes[t.m]; if (t.i >= w.count) continue;
        const a = new THREE.Matrix4(), b = new THREE.Matrix4(); w.getMatrixAt(t.i, a); l.getMatrixAt(t.i, b); treeSave.push([w, l, t.i, a, b]); w.setMatrixAt(t.i, Z); l.setMatrixAt(t.i, Z);
      }
    } else { for (const [w, l, i, a, b] of treeSave) { w.setMatrixAt(i, a); l.setMatrixAt(i, b); } treeSave = []; }
    planet.treeMeshes.forEach(([w, l]) => { w.instanceMatrix.needsUpdate = true; l.instanceMatrix.needsUpdate = true; });
  }

  function enter() {
    Object.assign(S, { on: true, k: 0, phase: 'ground', h: 0, s: 0, bank: 0, pitch: 0, rings: 0, next: 0, caught: 0, cine: -1, lock: false, heart: 0, lift: 0, slow: 0 });
    // la rampe : droit devant, sur un passage dégagé
    let best = null, bs = -1;
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; let ok = 0; for (let d = 2; d <= 9; d += 1) { const p = offset(home.dir, a, d); if (K.dry(p, 0.9) && K.treesWithin(p, 0.9) === 0) ok++; else break; } if (ok > bs) { bs = ok; best = a; } }
    const rampDir = offset(home.dir, best, 7), toRamp = rampDir.clone().sub(home.dir).projectOnPlane(rampDir).normalize();
    placeOn(ramp, rampDir, toRamp); ramp.visible = true;
    // l'arc du vol, et la clairière du vaisseau au bout (sur la terre ferme, sans arbre)
    ARC.A.copy(rampDir); ARC.B.copy(toRamp); ARC.N.crossVectors(ARC.B, ARC.A).normalize();
    ARC.sSite = 62; for (let s = 58; s < 95; s += 1) { const d = arcDir(s); if (K.dry(d, 0.5) && K.treesWithin(d, 2.2) === 0 && K.farFromZones(d, 0.2)) { ARC.sSite = s; break; } }
    site.dir.copy(arcDir(ARC.sSite));
    // les anneaux : face à la caméra, à des hauteurs qui ondulent (plusieurs passent devant la lune)
    rings.forEach((r, i) => {
      const s = 9 + (ARC.sSite - 17) * i / (NR - 1), alt = 5.2 + Math.sin(i * 0.85 + 0.4) * 2.6 + (i % 3 === 1 ? 0.8 : 0);
      arcPt(s, alt, r.pos); r.s = s; r.alt = alt; r.done = false; r.gone = 0; r.g.visible = true; r.g.scale.setScalar(1);
      r.g.position.copy(r.pos); r.g.quaternion.setFromUnitVectors(Y, arcDir(s, tmp2)); r.h.material.opacity = 0.3;
    });
    // fourgons à projecteurs, au sol derrière l'arc : leurs faisceaux balaient le ciel dans le plan du vol
    lights.forEach((l, i) => {
      const s = 14 + (ARC.sSite - 24) * (i + 0.5) / NS, d = arcDir(s).addScaledVector(ARC.N, -2.5 / R).normalize();
      placeOn(l.g, d, arcTan(s)); l.g.position.copy(d).multiplyScalar(groundR(d)); l.g.visible = true; l.dir.copy(d); l.s = s;
    });
    // le vaisseau attend, au-dessus de la clairière
    ship.visible = true; rainbow.visible = false; ship.userData.cone.material.opacity = 0.12; ship.position.copy(site.dir).multiplyScalar(groundR(site.dir) + 3.4); ship.quaternion.setFromUnitVectors(Y, site.dir);
    // Smarties dans la forêt (autour du vélo et sur le chemin de la rampe) et en arcs entre les objets, le long du vol
    smarties.length = 0; S.sm = 0;
    for (let i = 0, tries = 0; i < 46 && tries < 3000; tries++) {
      const a = Math.random() * Math.PI * 2, dist = 1.5 + Math.random() * 13, d = offset(home.dir, a, dist);
      if (!K.dry(d, 0.9) || K.treesWithin(d, 0.45) > 0) continue;
      smarties.push({ p: d.clone().multiplyScalar(planet.heightDir(d) + 0.22), air: false, alive: true, c: SM_COLS[i % SM_COLS.length], ph: Math.random() * 6 }); i++;
    }
    for (let k = 1; k < 7; k++) { const d = offset(home.dir, best, k); smarties.push({ p: d.clone().multiplyScalar(planet.heightDir(d) + 0.22), air: false, alive: true, c: SM_COLS[k % SM_COLS.length], ph: k }); }
    const ss = [3].concat(rings.map(r => r.s)), hs = [4.4].concat(rings.map(r => r.alt));
    for (let i = 0; i < ss.length - 1; i++) for (let j = 1; j <= 5; j++) {
      const f = j / 6, s2 = ss[i] + (ss[i + 1] - ss[i]) * f, h2 = hs[i] + (hs[i + 1] - hs[i]) * f + Math.sin(f * Math.PI) * 1.1;
      smarties.push({ p: arcPt(s2, h2, new THREE.Vector3()), air: true, alive: true, c: SM_COLS[(i * 5 + j) % SM_COLS.length], ph: j });
    }
    smMesh.visible = true; smEl.textContent = '● 0';
    prop.visible = false; candyMesh.visible = false; moon.visible = true; moonHalo.material.opacity = 0; mist.visible = true; mistMat.opacity = 0; S.mistInit = false;
    rgEl.textContent = '✦ 0 / ' + NR; dsEl.textContent = ''; hint.textContent = "Prends de l'élan vers la rampe lumineuse";
    document.body.classList.add('egg'); hud.classList.add('on'); flash();
    return { dir: home.dir.clone(), fwd: toRamp.clone() };
  }
  let ctxRef = null;
  function reset(withFlash = true) {
    S.on = false; S.k = 0; S.cine = -1; S.lock = false;
    prop.visible = true; candyMesh.visible = true; moon.visible = false; ship.visible = false; rainbow.visible = false; ramp.visible = false; mist.visible = false;
    rings.forEach(r => { r.g.visible = false; }); lights.forEach(l => { l.g.visible = false; });
    hideTrees(false); if (planet.clouds) planet.clouds.visible = true;
    smMesh.visible = false; smMesh.count = 0; smarties.length = 0;
    if (ctxRef) {
      if (ctxRef.ambience) ctxRef.ambience.state.forceHour = null;
      if (S.sh0) { LOOK.uShadowTint.value.copy(S.sh0); LOOK.uLitTint.value.copy(S.lit0); } S.sh0 = null;
      if (S.sat0 !== undefined && ctxRef.post.grade.uniforms.uSat) ctxRef.post.grade.uniforms.uSat.value = S.sat0;
      if (ctxRef.post.grade.uniforms.uMoon) ctxRef.post.grade.uniforms.uMoon.value = 0;
      ctxRef.avatar.userData.bmx.userData.fork.rotation.y = 0; ctxRef.avatar.visible = true;
    }
    document.body.classList.remove('egg'); hud.classList.remove('on');
    if (withFlash) flash();
  }
  function hit(ndc, camera) { if (S.on || !prop.visible) return false; ray.setFromCamera(ndc, camera); return ray.intersectObject(prop, true).length > 0; }

  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), cUp = new THREE.Vector3(), cF = new THREE.Vector3(), cR = new THREE.Vector3(), bm = new THREE.Matrix4(), q2 = new THREE.Quaternion(), XA = new THREE.Vector3(1, 0, 0);
  const cam2 = { s: 0, h: 0 };
  function update(ctx) {
    const { dt, t } = ctx; ctxRef = ctx;
    if (!S.on) { parked.userData.anim({ t, dt, heart: 0.35 + 0.25 * Math.sin(t * 0.7) }); return false; }
    S.k = Math.min(1, S.k + dt / 2.5); const k = S.k * S.k * (3 - 2 * S.k);
    ctx.ambience.state.forceHour = 23.3;
    // nuit bleue de pleine lune, forêt dans la brume
    const { hemi, skyU, fog, sun, post } = ctx;
    hemi.color.lerp(C.hemi, k * 0.8); hemi.groundColor.lerp(C.gnd, k * 0.8); hemi.intensity = Math.max(hemi.intensity, 0.7 * k);
    sun.color.lerp(C.moon, k); sun.intensity = Math.max(sun.intensity, 0.9 * k);
    skyU.uZen.value.lerp(C.zen, k); skyU.uHor.value.lerp(C.hor, k); fog.color.lerp(C.fog, k);
    const fn = fog.near > 1000 ? 140 : fog.near, ff = fog.far > 1000 ? 300 : fog.far;
    fog.near = THREE.MathUtils.lerp(fn, S.phase === 'fly' ? 9 : 3, k); fog.far = THREE.MathUtils.lerp(ff, S.phase === 'fly' ? 55 : 30, k);   // en vol, la brume adoucit la silhouette
    if (S.sh0 == null) { S.sh0 = LOOK.uShadowTint.value.clone(); S.lit0 = LOOK.uLitTint.value.clone(); }
    LOOK.uShadowTint.value.copy(S.sh0).lerp(C.sh, k); LOOK.uLitTint.value.copy(S.lit0).lerp(C.lit, k);
    if (post.grade.uniforms.uSat) { if (S.sat0 === undefined) S.sat0 = post.grade.uniforms.uSat.value; post.grade.uniforms.uSat.value = THREE.MathUtils.lerp(S.sat0, 0.92, k); }
    if (post.grade.uniforms.uMoon) post.grade.uniforms.uMoon.value = k * 0.95;
    ctx.audio.theme('et');
    const bike = ctx.avatar.userData.bmx, input = ctx.input || { x: 0, y: 0, boost: false };
    // brume
    if (!S.mistInit) { for (let i = 0; i < NM; i++) placeMist(i, ctx.car); S.mistInit = true; }
    for (let i = 0; i < NM; i++) { tmp3.set(mistPos[i * 3], mistPos[i * 3 + 1], mistPos[i * 3 + 2]); if (tmp3.distanceToSquared(ctx.car) > 30 * 30) placeMist(i, ctx.car); }
    mistGeo.attributes.position.needsUpdate = true; mistMat.opacity = 0.5 * k * (S.phase === 'fly' ? 0.55 : 1);
    // anneaux et vaisseau qui scintillent
    // les objets flottent, tournent lentement ; une fois attrapés, ils s'envolent en tournoyant et s'effacent
    rings.forEach((r, i) => {
      if (!r.g.visible) return;
      const U = tmp.copy(r.pos).normalize();
      if (!r.done) { r.g.position.copy(r.pos).addScaledVector(U, Math.sin(t * 1.3 + r.ph) * 0.18); r.body.rotateOnAxis(r.spin, dt * 0.6); r.h.material.opacity = (i === S.next ? 0.42 : 0.22) * (0.8 + 0.2 * Math.sin(t * 3 + i)); }
      else { r.gone += dt; r.g.position.addScaledVector(U, dt * 1.6); r.body.rotateOnAxis(r.spin, dt * 6); const k2 = Math.max(0.01, 1 - r.gone / 1.2); r.g.scale.setScalar(k2); r.h.material.opacity = 0.6 * k2; if (r.gone > 1.2) r.g.visible = false; }
    });
    ship.userData.lights.forEach((l, i) => { l.material.opacity = 0.5 + 0.5 * Math.sin(t * 6 + i); }); ship.rotateY(dt * 0.4);
    // projecteurs : ils balancent leur faisceau dans le plan du vol
    S.caught -= dt;
    for (const l of lights) {
      const a = 0.75 * Math.sin(t * 0.55 + l.ph * 2.3);
      l.head.quaternion.setFromAxisAngle(XA, a);   // le fourgon est orienté le long de l'arc : son axe x est perpendiculaire au plan du vol
      l.siren.material.opacity = Math.sin(t * 9 + l.ph) > 0 ? 0.95 : 0.15;
      if (S.phase !== 'fly' || S.caught > 0 || S.cine >= 0) continue;
      l.head.updateMatrixWorld(); const o = l.head.getWorldPosition(tmp2), ax = tmp3.set(0, 1, 0).transformDirection(l.head.matrixWorld);
      const rel = tmp.copy(ctx.avatar.position).sub(o); rel.addScaledVector(ARC.N, -rel.dot(ARC.N)); const along = rel.dot(ax); if (along < 0 || along > 22) continue;
      const radius = 0.15 + along / 22 * 1.45, off = rel.addScaledVector(ax, -along).length();
      if (off < radius) { S.caught = 2.5; S.slow = 1.6; ctx.audio.sfx('alarm'); toast('Repéré !', 1000); flash(); }
    }
    const up = cUp.copy(ctx.car).normalize();
    if (S.phase === 'ground') {
      // au sol : la lune, grande et basse, glisse doucement devant la caméra
      ctx.camera.getWorldDirection(cF); cF.addScaledVector(up, -cF.dot(up)).normalize(); cR.crossVectors(cF, up).normalize();
      const want = tmp.copy(cF).addScaledVector(up, 0.34).addScaledVector(cR, 0.42).normalize();
      if (moonDir.lengthSq() < 0.5) moonDir.copy(want); else moonDir.lerp(want, 1 - Math.exp(-dt * 0.8)).normalize();
    }
    const r = S.phase === 'ground' ? groundPhase(ctx, dt, t, bike, input, up) : S.cine >= 0 ? cinematic(ctx, dt, t, bike) : flyPhase(ctx, dt, t, bike, input);
    // Smarties : ils tournent sur eux-mêmes ; on les ramasse en passant (au sol avec le vélo, en vol avec le vélo volant)
    { const bc = tmp.copy(ctx.avatar.position).addScaledVector(tmp3.copy(ctx.avatar.position).normalize(), 0.45); let n = 0;
      for (const c of smarties) {
        if (!c.alive) continue;
        const rel = tmp2.copy(c.p).sub(bc); if (c.air && S.phase !== 'ground') rel.addScaledVector(ARC.N, -rel.dot(ARC.N));
        if (S.cine < 0 && rel.length() < (c.air ? 0.65 : 0.75)) { c.alive = false; S.sm++; smEl.textContent = '● ' + S.sm; ctx.audio.sfx('coin'); continue; }
        if (n >= SMAX) continue;
        const u = tmp3.copy(c.p).normalize(); smQ.setFromUnitVectors(Y, u).multiply(q2.setFromEuler(smE.set(0.5 * Math.sin(t + c.ph), t * 2.2 + c.ph, 1.2)));
        m4.compose(tmp2.copy(c.p).addScaledVector(u, Math.sin(t * 2 + c.ph) * 0.06), smQ, smS.setScalar(c.air ? 1.3 : 1)); smMesh.setMatrixAt(n, m4); smMesh.setColorAt(n, c.c); n++;
      }
      smMesh.count = n; smMesh.instanceMatrix.needsUpdate = true; if (smMesh.instanceColor) smMesh.instanceColor.needsUpdate = true; }
    moon.position.copy(ctx.camera.position).addScaledVector(moonDir, 400); moon.scale.setScalar(S.phase === 'ground' ? 190 : 150); moon.quaternion.copy(ctx.camera.quaternion);
    moon.material.opacity = k; moonHalo.material.opacity = 0.32 * k;
    return r;
  }
  /* au sol : on roule (conduite normale) jusqu'à la rampe ; arrivé dessus avec de l'élan, le vélo s'envole */
  function groundPhase(ctx, dt, t, bike, input, up) {
    bike.userData.anim({ spin: ctx.P.spin, steer: ctx.P.steer, speed: ctx.P.speed, t, dt, wet: ctx.wet, heart: Math.max(0.2, S.heart) });
    const to = tmp.copy(ramp.position).sub(ctx.car); to.addScaledVector(up, -to.dot(up)); const L = to.length();
    S.heart += (Math.pow(Math.max(0, ctx.fwd.dot(to.divideScalar(Math.max(L, 1e-4)))), 3) - S.heart) * (1 - Math.exp(-dt * 3));
    dsEl.textContent = Math.round(L) + ' m';
    if (L < 1.3 && ctx.P.speed > 1.5) {
      S.phase = 'fly'; S.lock = true; S.lift = 0; S.s = 0.3;
      S.h = ctx.car.length() - groundR(arcDir(S.s)) + 0.2; S.vh = 3.5;
      cam2.s = S.s + 0.3; cam2.h = S.h;
      hideTrees(true); if (planet.clouds) planet.clouds.visible = false;   // (les nuages ronds passeraient devant la lune)
      ctx.audio.sfx('fly'); toast('Il vole !', 1400); hint.textContent = '↑ ↓ monter / descendre · attrape les objets qui flottent jusqu\'au vaisseau';
    }
    return false;
  }
  /* en vol, de profil : haut / bas pour monter et descendre, droite pour accélérer, gauche pour freiner */
  function flyPhase(ctx, dt, t, bike, input) {
    S.lift = Math.min(1, S.lift + dt / 1.5);
    const climb = Math.max(-1, Math.min(1, input.y)), push = Math.max(-1, Math.min(1, input.x));
    S.slow = Math.max(0, S.slow - dt);
    const v = FLY_V * (1 + 0.35 * push) * (input.boost ? 1.4 : 1);
    S.s += v * dt;
    S.vh += ((climb * 1.6 + (S.lift < 1 ? 2.0 * (1 - S.lift) : 0)) - S.vh) * (1 - Math.exp(-dt * 2.2));
    S.h += S.vh * dt; if (S.h < FLY_MIN) { S.h += (FLY_MIN - S.h) * (1 - Math.exp(-dt * 6)); S.vh = Math.max(0, S.vh); } if (S.h > FLY_MAX) { S.h = FLY_MAX; S.vh = Math.min(0, S.vh); }
    S.pitch += (-Math.max(-0.4, Math.min(0.4, S.vh * 0.09)) - S.pitch) * (1 - Math.exp(-dt * 4));
    const U = arcDir(S.s), T = arcTan(S.s), pos = arcPt(S.s, S.h + 0.1 * Math.sin(t * 1.7), tmp2);
    const right = tmp3.crossVectors(U, T).normalize(); bm.makeBasis(right, U, T);
    ctx.avatar.quaternion.setFromRotationMatrix(bm).multiply(q2.setFromAxisAngle(XA, S.pitch));
    ctx.avatar.position.copy(pos);
    ctx.P.spin += v * dt / 0.24;
    bike.userData.anim({ spin: ctx.P.spin, steer: 0, speed: 0, t, dt, wet: false, heart: 1 });
    const P = ctx.P; P.dir.copy(U); P.fwd.copy(T); P.mv.copy(T); P.r = pos.length(); P.speed = v; P.ground = false; P.boost = input.boost ? 1 : 0; P.hover = 0;
    // anneaux : on passe dedans (vu de profil : à moins d'un rayon de leur centre)
    for (let i = 0; i < NR; i++) {
      const rg = rings[i]; if (rg.done) continue;
      const rel = tmp.copy(pos).sub(rg.pos); rel.addScaledVector(ARC.N, -rel.dot(ARC.N));
      if (rel.length() < 0.95) { rg.done = true; S.rings++; ctx.audio.sfx('pick'); rgEl.textContent = '✦ ' + S.rings + ' / ' + NR; if (S.rings === NR) toast('Tous les objets !', 1400); }
      else if (rg.s < S.s - 2) rg.passed = true;
    }
    while (S.next < NR && (rings[S.next].done || rings[S.next].s < S.s - 1.5)) S.next++;
    dsEl.textContent = 'vaisseau ' + Math.max(0, Math.round(ARC.sSite - S.s)) + ' m';
    // contre-jour : la lumière vient de derrière (de la lune), le vélo se découpe en silhouette
    const sun = ctx.sun; sun.target.position.copy(pos); sun.position.copy(pos).addScaledVector(ARC.N, -22).addScaledVector(U, 12); sun.target.updateMatrixWorld();
    // caméra de profil : en avance dans le sens du vol, elle suit la hauteur en douceur ; la lune derrière, centrée sur la bande où l'on vole
    const zoom = ctx.zoom || 1;
    cam2.s += (S.s + 0.3 - cam2.s) * (1 - Math.exp(-dt * 4)); cam2.h += (S.h - cam2.h) * (1 - Math.exp(-dt * 3));
    const CU = arcDir(cam2.s); camPos.copy(arcPt(cam2.s, cam2.h, tmp)).addScaledVector(ARC.N, CAM_D * zoom);
    camLook.copy(arcPt(cam2.s, cam2.h + 0.55, tmp3));
    ctx.camera.position.lerp(camPos, 1 - Math.exp(-dt * (S.lift < 1 ? 2.5 : 6))); ctx.camera.up.copy(CU); ctx.camera.lookAt(camLook);
    { const cam = ctx.camera, fw = tmp.set(0, 0, -1).applyQuaternion(cam.quaternion), rt = tmp3.set(1, 0, 0).applyQuaternion(cam.quaternion), upv = cUp.set(0, 1, 0).applyQuaternion(cam.quaternion);
      const ax = -Math.max(0, S.s - MOON_S) * 0.028, ay = Math.atan2(MOON_H - cam2.h - 0.55, CAM_D);   // elle glisse vers la gauche à mesure qu'on avance, à hauteur fixe
      moonDir.copy(fw).addScaledVector(rt, Math.tan(ax)).addScaledVector(upv, Math.tan(ay)).normalize(); }
    // arrivée au vaisseau
    if (S.s >= ARC.sSite - 1.2) { S.cine = 0; S.from = pos.clone(); ctx.audio.sfx('pick'); hint.textContent = 'Téléphone maison…'; toast(S.rings + ' / ' + NR + ' objets · ' + S.sm + ' Smarties', 1800); }
    return false;
  }
  /* la fin : le vélo monte dans la lumière du vaisseau, qui repart en laissant un arc-en-ciel */
  function cinematic(ctx, dt, t, bike) {
    S.cine += dt; const c = S.cine, U = arcDir(ARC.sSite), base = ship.position.clone();
    bike.userData.anim({ spin: ctx.P.spin += dt * 20, steer: 0, speed: 0, t, dt, wet: false, heart: 1 });
    if (c < 1.6) ctx.avatar.position.lerpVectors(S.from, base.clone().addScaledVector(U, -1.4), Math.min(1, c / 1.6));   // aspiré sous le vaisseau
    else ctx.avatar.visible = false;
    if (c > 1.8) { const s = c - 1.8; ship.position.copy(U).multiplyScalar(groundR(U) + 3.4 + s * s * 7); rainbow.visible = true; rainbow.material.uniforms.uK.value = Math.min(1, s * 1.5); ship.userData.cone.material.opacity = Math.max(0, 0.12 - s * 0.08); }
    const sun = ctx.sun; sun.target.position.copy(base); sun.position.copy(base).addScaledVector(ARC.N, -22).addScaledVector(U, 12); sun.target.updateMatrixWorld();
    cam2.s += (ARC.sSite - cam2.s) * (1 - Math.exp(-dt * 2)); cam2.h += (5 + Math.min(4, c) - cam2.h) * (1 - Math.exp(-dt * 1.5));
    camPos.copy(arcPt(cam2.s, cam2.h, tmp)).addScaledVector(ARC.N, CAM_D + 2);
    ctx.camera.position.lerp(camPos, 1 - Math.exp(-dt * 3)); ctx.camera.up.copy(arcDir(cam2.s)); ctx.camera.lookAt(arcPt(cam2.s, cam2.h - 0.4, tmp3));
    { const cam = ctx.camera, fw = tmp.set(0, 0, -1).applyQuaternion(cam.quaternion), rt = tmp2.set(1, 0, 0).applyQuaternion(cam.quaternion), upv = cUp.set(0, 1, 0).applyQuaternion(cam.quaternion);
      moonDir.copy(fw).addScaledVector(rt, Math.tan(-Math.max(0, ARC.sSite - MOON_S) * 0.028)).addScaledVector(upv, Math.tan(Math.atan2(MOON_H - cam2.h, CAM_D + 2))).normalize(); }
    if (c > 5.4) { S.lock = false; ctx.avatar.visible = true; return true; }
    return false;
  }
  function pins() {
    if (!S.on) return [{ dir: home.dir, icon: 'bmx' }];
    const out = S.phase === 'ground' ? [{ dir: ramp.position.clone().normalize(), color: '#bfe0ff', glyph: '▲' }] : [];
    const nr = rings[S.next]; if (S.phase === 'fly' && nr && !nr.done) out.push({ dir: nr.pos.clone().normalize(), color: '#cfe4ff', glyph: '✦' });
    out.push({ dir: site.dir, color: '#ffd8a0', glyph: '✦' });
    return out;
  }
  return {
    id: 'et', ride: 'bmx', prop, home, enter, reset, hit, update, pins, exitDir: site.dir, trees: 1, tilt: 0.25,
    box: { half: 0.25, front: 0.5, rear: 0.5 }, prompt: 'Enfourcher le BMX', music: 'et',
    get on() { return S.on; }, get k() { return S.k; }, get lock() { return S.lock; }, get state() { return S; },
    get ramp() { return ramp.position; }, get rings() { return rings; }, get ship() { return ship.position; },
  };
}
