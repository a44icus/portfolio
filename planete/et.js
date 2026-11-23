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

const FLY_V = 5.2, FLY_MIN = 2.3, FLY_MAX = 16, NR = 12;   // vitesse de vol, altitude mini / maxi au-dessus du sol, nombre d'anneaux

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
  const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 2.0, 2.6), transparent: true, opacity: 0.9, fog: false }), ringDone = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 1.0, 0.4), transparent: true, opacity: 0.25, fog: false });
  const rings = []; for (let i = 0; i < NR; i++) { const g = new THREE.Group(), t = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.07, 10, 40), ringMat); g.add(t); const h = glowSprite('#bfe8ff', 3.4, 0.25); g.add(h); g.visible = false; scene.add(g); rings.push({ g, t, h, pos: new THREE.Vector3(), n: new THREE.Vector3(), done: false }); }
  const site = { dir: new THREE.Vector3() };

  /* ---------- fourgons et projecteurs qui fouillent le ciel ---------- */
  const NS = low ? 3 : 5, lights = [];
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
    '<span style="color:#ff5a5a;font-size:1.05rem">♥</span><span class="ct rg">◯ 0 / ' + NR + '</span><span class="ct ds"></span><small>Prends de l\'élan vers la rampe lumineuse</small>');
  const rgEl = hud.querySelector('.rg'), dsEl = hud.querySelector('.ds'), hint = hud.querySelector('small');
  const flash = makeFlash('radial-gradient(circle, #fff 0%, #e8f0ff 50%, #9ab8ff 100%)');
  const toast = makeToast('color:#fff; text-shadow:0 0 18px rgba(140,180,255,.9), 0 3px 0 rgba(0,0,0,.35);');

  /* ---------- état ---------- */
  const S = { on: false, k: 0, phase: 'ground', h: 0, yaw: 0, bank: 0, pitch: 0, rings: 0, next: 0, caught: 0, cine: -1, lock: false, heart: 0, lift: 0 };
  const F = { dir: new THREE.Vector3(), fwd: new THREE.Vector3() };   // en vol : position (direction) et cap
  const C = { hemi: new THREE.Color('#3a5a9a'), gnd: new THREE.Color('#0e1830'), zen: new THREE.Color('#040a20'), hor: new THREE.Color('#1e3866'), fog: new THREE.Color('#1c3058'), moon: new THREE.Color('#c4d6ff'), sh: new THREE.Vector3(0.32, 0.42, 0.72), lit: new THREE.Vector3(0.82, 0.92, 1.12) };
  const ray = new THREE.Raycaster();

  function enter() {
    Object.assign(S, { on: true, k: 0, phase: 'ground', h: 0, bank: 0, pitch: 0, rings: 0, next: 0, caught: 0, cine: -1, lock: false, heart: 0, lift: 0 });
    // la rampe : droit devant, sur un passage dégagé
    let best = null, bs = -1;
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; let ok = 0; for (let d = 2; d <= 9; d += 1) { const p = offset(home.dir, a, d); if (K.dry(p, 0.9) && K.treesWithin(p, 0.9) === 0) ok++; else break; } if (ok > bs) { bs = ok; best = a; } }
    const rampDir = offset(home.dir, best, 7), toRamp = rampDir.clone().sub(home.dir).projectOnPlane(rampDir).normalize();
    placeOn(ramp, rampDir, toRamp); ramp.visible = true; S.rampFwd = toRamp.clone();
    // la clairière du vaisseau : loin, sur la terre ferme, sans arbre
    site.dir.copy(findSpot(d => K.dry(d, 0.5) && K.farFromZones(d, 0.3) && K.treesWithin(d, 2.5) === 0 && angDist(d, home.dir) > 55 && angDist(d, home.dir) < 85, { tries: 6000, r: Math.random }) || offset(home.dir, best, 60));
    // les anneaux : le long du grand cercle de la rampe à la clairière, qui serpentent et ondulent en hauteur
    const A = rampDir.clone(), axis = new THREE.Vector3().crossVectors(A, site.dir).normalize(), tot = Math.acos(Math.min(1, A.dot(site.dir)));
    rings.forEach((r, i) => {
      const k = (i + 1) / (NR + 1), d = A.clone().applyAxisAngle(axis, tot * k), side = new THREE.Vector3().crossVectors(axis, d).normalize();
      const fwd = new THREE.Vector3().crossVectors(axis, d).normalize();   // sens de la marche
      const lat = Math.sin(i * 1.3 + Math.random()) * 4.5, dd = d.clone().addScaledVector(axis, lat / R).normalize();
      const alt = 4 + Math.abs(Math.sin(i * 0.9 + 0.6)) * 6;
      r.pos.copy(dd).multiplyScalar(groundR(dd) + alt); r.n.copy(fwd); r.done = false; r.t.material = ringMat; r.g.visible = true;
      r.g.position.copy(r.pos); m4.lookAt(r.pos, tmp.copy(r.pos).add(fwd), dd); r.g.quaternion.setFromRotationMatrix(m4); r.h.material.opacity = 0.25;
      void side;
    });
    // fourgons à projecteurs, de part et d'autre du chemin
    lights.forEach((l, i) => {
      const k = (i + 0.7) / (NS + 0.5), d = A.clone().applyAxisAngle(axis, tot * k).addScaledVector(axis, (i % 2 ? 1 : -1) * (3 + Math.random() * 3) / R).normalize();
      placeOn(l.g, d, tangent(d, axis)); l.g.position.copy(d).multiplyScalar(groundR(d)); l.g.visible = true; l.dir.copy(d);
    });
    // le vaisseau attend, posé au-dessus de la clairière
    ship.visible = true; rainbow.visible = false; ship.position.copy(site.dir).multiplyScalar(groundR(site.dir) + 3.2); ship.quaternion.setFromUnitVectors(Y, site.dir);
    prop.visible = false; candyMesh.visible = false; moon.visible = true; moonHalo.material.opacity = 0; mist.visible = true; mistMat.opacity = 0; S.mistInit = false;
    rgEl.textContent = '◯ 0 / ' + NR; dsEl.textContent = ''; hint.textContent = "Prends de l'élan vers la rampe lumineuse";
    document.body.classList.add('egg'); hud.classList.add('on'); flash();
    return { dir: home.dir.clone(), fwd: toRamp.clone() };
  }
  let ctxRef = null;
  function reset(withFlash = true) {
    S.on = false; S.k = 0; S.cine = -1; S.lock = false;
    prop.visible = true; candyMesh.visible = true; moon.visible = false; ship.visible = false; rainbow.visible = false; ramp.visible = false; mist.visible = false;
    rings.forEach(r => { r.g.visible = false; }); lights.forEach(l => { l.g.visible = false; });
    if (ctxRef) {
      if (ctxRef.ambience) ctxRef.ambience.state.forceHour = null;
      if (S.sh0) { LOOK.uShadowTint.value.copy(S.sh0); LOOK.uLitTint.value.copy(S.lit0); } S.sh0 = null;
      if (S.sat0 !== undefined && ctxRef.post.grade.uniforms.uSat) ctxRef.post.grade.uniforms.uSat.value = S.sat0;
      if (ctxRef.post.grade.uniforms.uMoon) ctxRef.post.grade.uniforms.uMoon.value = 0;
      ctxRef.avatar.userData.bmx.userData.fork.rotation.y = 0;
    }
    document.body.classList.remove('egg'); hud.classList.remove('on');
    if (withFlash) flash();
  }
  function hit(ndc, camera) { if (S.on || !prop.visible) return false; ray.setFromCamera(ndc, camera); return ray.intersectObject(prop, true).length > 0; }

  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), cUp = new THREE.Vector3(), cF = new THREE.Vector3(), cR = new THREE.Vector3(), bm = new THREE.Matrix4(), q2 = new THREE.Quaternion(), XA = new THREE.Vector3(1, 0, 0), ZA = new THREE.Vector3(0, 0, 1);
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
    fog.near = THREE.MathUtils.lerp(fn, 3, k); fog.far = THREE.MathUtils.lerp(ff, S.phase === 'fly' ? 46 : 30, k);
    if (S.sh0 == null) { S.sh0 = LOOK.uShadowTint.value.clone(); S.lit0 = LOOK.uLitTint.value.clone(); }
    LOOK.uShadowTint.value.copy(S.sh0).lerp(C.sh, k); LOOK.uLitTint.value.copy(S.lit0).lerp(C.lit, k);
    if (post.grade.uniforms.uSat) { if (S.sat0 === undefined) S.sat0 = post.grade.uniforms.uSat.value; post.grade.uniforms.uSat.value = THREE.MathUtils.lerp(S.sat0, 0.92, k); }
    if (post.grade.uniforms.uMoon) post.grade.uniforms.uMoon.value = k * 0.95;
    ctx.audio.theme('et');
    const bike = ctx.avatar.userData.bmx, input = ctx.input || { x: 0, y: 0, boost: false };
    // brume
    if (!S.mistInit) { for (let i = 0; i < NM; i++) placeMist(i, ctx.car); S.mistInit = true; }
    for (let i = 0; i < NM; i++) { tmp3.set(mistPos[i * 3], mistPos[i * 3 + 1], mistPos[i * 3 + 2]); if (tmp3.distanceToSquared(ctx.car) > 30 * 30) placeMist(i, ctx.car); }
    mistGeo.attributes.position.needsUpdate = true; mistMat.opacity = 0.5 * k * (S.phase === 'fly' ? 0.7 : 1);
    // la lune : grande, basse, devant la caméra (elle glisse doucement quand on tourne)
    const up = cUp.copy(ctx.car).normalize();
    if (S.cine < 0) {
      ctx.camera.getWorldDirection(cF); cF.addScaledVector(up, -cF.dot(up)).normalize(); cR.crossVectors(cF, up).normalize();
      const want = tmp.copy(cF).addScaledVector(up, S.phase === 'fly' ? 0.42 : 0.34).addScaledVector(cR, S.phase === 'fly' ? 0.12 : 0.42).normalize();
      if (moonDir.lengthSq() < 0.5) moonDir.copy(want); else moonDir.lerp(want, 1 - Math.exp(-dt * 0.8)).normalize();
    }
    moon.position.copy(ctx.camera.position).addScaledVector(moonDir, 400); moon.scale.setScalar(190); moon.quaternion.copy(ctx.camera.quaternion);
    moon.material.opacity = k; moonHalo.material.opacity = 0.32 * k;
    // anneaux et vaisseau qui scintillent
    rings.forEach((r, i) => { if (!r.done) { r.h.material.opacity = (i === S.next ? 0.45 : 0.18) * (0.75 + 0.25 * Math.sin(t * 4 + i)); r.t.scale.setScalar(1 + (i === S.next ? 0.06 * Math.sin(t * 5) : 0)); } });
    ship.userData.lights.forEach((l, i) => { l.material.opacity = 0.5 + 0.5 * Math.sin(t * 6 + i); }); ship.rotateY(dt * 0.4);
    // projecteurs : ils fouillent le ciel en lents balancements
    S.caught -= dt;
    for (const l of lights) {
      l.head.rotation.set(0.5 * Math.sin(t * 0.37 + l.ph), t * 0.45 + l.ph, 0.45 * Math.cos(t * 0.29 + l.ph * 1.7));
      l.siren.material.opacity = Math.sin(t * 9 + l.ph) > 0 ? 0.95 : 0.15;
      if (S.phase !== 'fly' || S.caught > 0 || S.cine >= 0) continue;
      l.head.updateMatrixWorld(); const o = l.head.getWorldPosition(tmp2), ax = tmp3.set(0, 1, 0).transformDirection(l.head.matrixWorld);
      const rel = tmp.copy(ctx.avatar.position).sub(o), along = rel.dot(ax); if (along < 0 || along > 22) continue;
      const radius = 0.15 + along / 22 * 1.45, off = rel.addScaledVector(ax, -along).length();
      if (off < radius) { S.caught = 2.5; S.slow = 1.6; ctx.audio.sfx('alarm'); toast('Repéré !', 1000); flash(); }
    }
    if (S.phase === 'ground') return groundPhase(ctx, dt, t, bike, input, up);
    if (S.cine >= 0) return cinematic(ctx, dt, t, bike);
    return flyPhase(ctx, dt, t, bike, input);
  }
  /* au sol : on roule (conduite normale) jusqu'à la rampe ; arrivé dessus avec de l'élan, le vélo s'envole */
  function groundPhase(ctx, dt, t, bike, input, up) {
    bike.userData.anim({ spin: ctx.P.spin, steer: ctx.P.steer, speed: ctx.P.speed, t, dt, wet: ctx.wet, heart: Math.max(0.2, S.heart) });
    const to = tmp.copy(ramp.position).sub(ctx.car); to.addScaledVector(up, -to.dot(up)); const L = to.length();
    S.heart += (Math.pow(Math.max(0, ctx.fwd.dot(to.divideScalar(Math.max(L, 1e-4)))), 3) - S.heart) * (1 - Math.exp(-dt * 3));
    dsEl.textContent = Math.round(L) + ' m';
    if (L < 1.3 && ctx.P.speed > 1.5) {
      S.phase = 'fly'; S.lock = true; S.lift = 0;
      F.dir.copy(ctx.car).normalize(); F.fwd.copy(S.rampFwd).projectOnPlane(F.dir).normalize();
      S.h = ctx.car.length() - groundR(F.dir) + 0.3; S.vh = 3.5;
      ctx.audio.sfx('fly'); toast('Il vole !', 1400); hint.textContent = 'Passe dans les anneaux de lumière jusqu\'au vaisseau · ↑ ↓ monter / descendre';
    }
    return false;
  }
  /* en vol : gauche / droite pour virer, haut / bas pour monter et descendre ; le vélo penche et cabre */
  function flyPhase(ctx, dt, t, bike, input) {
    S.lift = Math.min(1, S.lift + dt / 1.5);
    const turn = Math.max(-1, Math.min(1, input.x)), climb = Math.max(-1, Math.min(1, input.y));
    S.slow = Math.max(0, (S.slow || 0) - dt);
    const v = FLY_V * (input.boost ? 1.55 : 1) * (S.slow > 0 ? 0.45 : 1);
    F.fwd.applyAxisAngle(F.dir, -turn * 1.25 * dt);
    const axis = tmp.crossVectors(F.dir, F.fwd).normalize(), r = groundR(F.dir) + S.h;
    F.dir.applyAxisAngle(axis, v * dt / r).normalize(); F.fwd.projectOnPlane(F.dir).normalize();
    // altitude : la commande, plus un petit élan au décollage ; jamais dans les arbres, jamais trop haut
    S.vh += ((climb * 3.2 + (S.lift < 1 ? 2.5 * (1 - S.lift) : 0)) - S.vh) * (1 - Math.exp(-dt * 3));
    S.h += S.vh * dt; const g = groundR(F.dir); if (S.h < FLY_MIN) { S.h += (FLY_MIN - S.h) * (1 - Math.exp(-dt * 6)); S.vh = Math.max(0, S.vh); } if (S.h > FLY_MAX) { S.h = FLY_MAX; S.vh = Math.min(0, S.vh); }
    S.bank += (-turn * 0.55 - S.bank) * (1 - Math.exp(-dt * 4)); S.pitch += (-climb * 0.32 - S.pitch) * (1 - Math.exp(-dt * 4));
    const U = F.dir, pos = tmp2.copy(U).multiplyScalar(g + S.h + 0.12 * Math.sin(t * 1.7));
    const right = tmp3.crossVectors(U, F.fwd).normalize(); bm.makeBasis(right, U, F.fwd);
    ctx.avatar.quaternion.setFromRotationMatrix(bm).multiply(q2.setFromAxisAngle(ZA, S.bank)).multiply(new THREE.Quaternion().setFromAxisAngle(XA, S.pitch));
    ctx.avatar.position.copy(pos);
    ctx.P.spin += v * dt / 0.24;
    bike.userData.anim({ spin: ctx.P.spin, steer: turn * 0.3, speed: 0, t, dt, wet: false, heart: 1 });
    // pour le reste du jeu
    const P = ctx.P; P.dir.copy(U); P.fwd.copy(F.fwd); P.mv.copy(F.fwd); P.r = g + S.h; P.speed = v; P.ground = false; P.boost = input.boost ? 1 : 0; P.hover = 0;
    // anneaux : on les traverse
    for (let i = 0; i < NR; i++) {
      const rg = rings[i]; if (rg.done) continue;
      const rel = tmp.copy(pos).sub(rg.pos), dn = rel.dot(rg.n);
      if (Math.abs(dn) < 0.7 && rel.addScaledVector(rg.n, -dn).length() < 1.45) {
        rg.done = true; rg.t.material = ringDone; rg.h.material.opacity = 0.05; S.rings++; ctx.audio.sfx('coin'); rgEl.textContent = '◯ ' + S.rings + ' / ' + NR;
        if (S.rings === NR) toast('Tous les anneaux !', 1400);
      }
    }
    while (S.next < NR && rings[S.next].done) S.next++;
    // le cœur guide vers l'anneau suivant (ou le vaisseau)
    const goal = S.next < NR ? rings[S.next].pos : ship.position, to = tmp.copy(goal).sub(pos), L = to.length();
    S.heart += (Math.max(0, F.fwd.dot(to.projectOnPlane(U).normalize())) - S.heart) * (1 - Math.exp(-dt * 3));
    dsEl.textContent = 'vaisseau ' + Math.round(pos.distanceTo(ship.position)) + ' m';
    // caméra : derrière et un peu en dessous, le vélo se découpe sur le ciel et la lune
    const zoom = ctx.zoom || 1;
    camPos.copy(pos).addScaledVector(F.fwd, -4.2 * zoom).addScaledVector(U, 0.25 * zoom);
    const cg = groundR(tmp.copy(camPos).normalize()) + 0.6; if (camPos.length() < cg) camPos.setLength(cg);
    camLook.copy(pos).addScaledVector(F.fwd, 3).addScaledVector(U, 0.9);
    ctx.camera.position.lerp(camPos, 1 - Math.exp(-dt * 4)); ctx.camera.up.copy(U); ctx.camera.lookAt(camLook);
    // arrivée au vaisseau
    if (pos.distanceTo(ship.position) < 3.6) { S.cine = 0; S.cf = F.fwd.clone(); S.from = pos.clone(); ctx.audio.sfx('pick'); hint.textContent = 'Téléphone maison…'; toast(S.rings + ' / ' + NR + ' anneaux', 1600); }
    return false;
  }
  /* la fin : le vélo monte dans la lumière du vaisseau, qui repart en laissant un arc-en-ciel */
  function cinematic(ctx, dt, t, bike) {
    S.cine += dt; const c = S.cine, U = tmp3.copy(site.dir), base = ship.position.clone();
    bike.userData.anim({ spin: ctx.P.spin += dt * 20, steer: 0, speed: 0, t, dt, wet: false, heart: 1 });
    if (c < 1.6) ctx.avatar.position.lerpVectors(S.from, base.clone().addScaledVector(U, -1.6), Math.min(1, c / 1.6));   // aspiré sous le vaisseau
    else ctx.avatar.visible = false;
    if (c > 1.8) { const s = c - 1.8; ship.position.copy(site.dir).multiplyScalar(groundR(site.dir) + 3.2 + s * s * 7); rainbow.visible = true; rainbow.material.uniforms.uK.value = Math.min(1, s * 1.5); ship.userData.cone.material.opacity = Math.max(0, 0.12 - s * 0.08); }
    camPos.copy(site.dir).multiplyScalar(groundR(site.dir) + 1.2).addScaledVector(S.cf, -9);
    ctx.camera.position.lerp(camPos, 1 - Math.exp(-dt * 2)); ctx.camera.up.copy(U); ctx.camera.lookAt(ship.position);
    if (c > 5.2) { S.lock = false; ctx.avatar.visible = true; return true; }
    return false;
  }
  function pins() {
    if (!S.on) return [{ dir: home.dir, icon: 'bmx' }];
    const out = S.phase === 'ground' ? [{ dir: ramp.position.clone().normalize(), color: '#bfe0ff', glyph: '▲' }] : [];
    const nr = rings[S.next]; if (S.phase === 'fly' && nr) out.push({ dir: nr.pos.clone().normalize(), color: '#bfe8ff', glyph: '◯' });
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
