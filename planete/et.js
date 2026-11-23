/* ============================================================================
   Clin d'œil : un BMX rouge est appuyé à la lisière d'un bois, une piste de
   bonbons y mène. On l'enfourche : la nuit tombe d'un coup, une lune immense se
   lève. Il faut retrouver les quatre pièces du communicateur (parapluie, disque,
   lame de scie, lampe) sans se faire repérer par les agents et leurs lampes
   torches, puis le monter en haut de la colline. Le vélo s'envole devant la
   lune, le vaisseau descend puis repart : on retrouve la Jeep.
   ============================================================================ */
import * as THREE from 'three';
import { makeKit, makeHud, makeFlash, makeToast } from './eggkit.js';
import { makeBMX, glowSprite } from './rides.js';

export function makeET({ planet, scene, sections, quality, R }) {
  const low = quality === 'low';
  const K = makeKit({ planet, sections, R, seed: 424243 });
  const { rnd, tangent, placeOn, offset, findSpot, angDist } = K;
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), tmp3 = new THREE.Vector3();

  /* ---------- le vélo garé, à l'orée d'un bois ---------- */
  const home = { dir: new THREE.Vector3(1, 0, 0), fwd: new THREE.Vector3(0, 1, 0) };
  { const d = findSpot(d => K.dry(d) && K.farFromZones(d, 0.45) && K.treesWithin(d, 1.3) === 0 && K.flat(d), { tries: 2500, score: d => { const n = K.treesWithin(d, 3.4); return n < 14 ? n : -1; } });
    if (d) home.dir.copy(d); home.fwd.copy(tangent(home.dir, new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5))); }
  const prop = new THREE.Group(); scene.add(prop);
  const parked = makeBMX({ rider: false }); parked.rotation.z = 0.2; parked.position.y = -0.02; prop.add(parked);   // posé sur sa béquille
  { const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 4), new THREE.MeshStandardMaterial({ color: '#c9ccd4', metalness: 0.9, roughness: 0.2 })); stand.position.set(0.1, 0.13, -0.05); stand.rotation.z = 0.5; prop.add(stand); }
  placeOn(prop, home.dir, home.fwd);
  // piste de bonbons multicolores qui mène au vélo
  const candies = [];
  { let d = home.dir.clone(), a = rnd() * Math.PI * 2;
    for (let i = 0; i < 16; i++) { a += (rnd() - 0.5) * 0.5; d = offset(d, a, 0.9 + rnd() * 0.3); if (K.dry(d, 0.6)) candies.push(d.clone()); } }
  const candyMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 10, 8).scale(1.5, 0.7, 1), new THREE.MeshStandardMaterial({ roughness: 0.25 }), Math.max(1, candies.length));
  { const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color(), cols = ['#ff7a12', '#ffcf1a', '#7a3a12', '#ff7a12', '#ffd84a'];
    candies.forEach((d, i) => { q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6)); m.compose(d.clone().multiplyScalar(planet.heightDir(d) + 0.04), q, new THREE.Vector3(1, 1, 1)); candyMesh.setMatrixAt(i, m); candyMesh.setColorAt(i, c.set(cols[i % cols.length])); }); }
  candyMesh.count = candies.length; candyMesh.castShadow = true; scene.add(candyMesh);

  /* ---------- la lune, immense, toujours bien en vue derrière le vélo ---------- */
  const moonTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
    const g = x.createRadialGradient(118, 112, 10, 128, 128, 126); g.addColorStop(0, '#fffbea'); g.addColorStop(0.8, '#efe6c8'); g.addColorStop(1, '#d9cfae');
    x.fillStyle = g; x.beginPath(); x.arc(128, 128, 126, 0, Math.PI * 2); x.fill();
    let sd = 7; const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 40; i++) { const cx = 30 + r() * 196, cy = 30 + r() * 196, rr = 4 + r() * (i < 6 ? 26 : 10); if (Math.hypot(cx - 128, cy - 128) + rr > 124) continue; x.fillStyle = `rgba(150,140,110,${0.12 + r() * 0.18})`; x.beginPath(); x.arc(cx, cy, rr, 0, Math.PI * 2); x.fill(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const moon = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: moonTex, color: new THREE.Color(1.25, 1.2, 1.05), transparent: true, fog: false, depthWrite: false }));
  moon.renderOrder = -1; moon.visible = false; scene.add(moon);
  const moonHalo = glowSprite('#cfe0ff', 1, 0); moonHalo.material.fog = false; moonHalo.renderOrder = -1; moon.add(moonHalo); moonHalo.scale.setScalar(2.6); moonHalo.position.z = -0.01;
  const moonDir = new THREE.Vector3();

  /* ---------- les quatre pièces du communicateur ---------- */
  const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, ...o });
  function pieceMesh(kind) {
    const g = new THREE.Group();
    if (kind === 0) {   // parapluie ouvert, retourné comme une parabole
      const can = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.22, 8, 1, true), std('#2b3a8a', { side: THREE.DoubleSide })); can.position.y = 0.55; can.rotation.x = Math.PI; g.add(can);
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 6), std('#c9ccd4', { metalness: 0.9, roughness: 0.2 })); st.position.y = 0.3; g.add(st);
    } else if (kind === 1) {   // disque vinyle
      const d = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.012, 32), std('#111', { roughness: 0.2 })); d.rotation.x = Math.PI / 2; d.position.y = 0.3; g.add(d);
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.016, 20), std('#e8402a')); l.rotation.x = Math.PI / 2; l.position.y = 0.3; g.add(l);
    } else if (kind === 2) {   // lame de scie circulaire
      const sh = new THREE.Shape(); for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2, r = i % 2 ? 0.2 : 0.235; i ? sh.lineTo(Math.cos(a) * r, Math.sin(a) * r) : sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
      const hole = new THREE.Path(); hole.absarc(0, 0, 0.03, 0, Math.PI * 2, true); sh.holes.push(hole);
      const d = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.01, bevelEnabled: false }), std('#d8dbe2', { metalness: 0.95, roughness: 0.25 })); d.position.y = 0.3; g.add(d);
    } else {   // lampe torche
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.3, 12), std('#e8c020', { roughness: 0.3 })); b.rotation.z = Math.PI / 2; b.position.y = 0.3; g.add(b);
      const lm = std('#fff4c8', { emissive: '#fff0b0', emissiveIntensity: 3 }); const l = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.02, 12), lm); l.rotation.z = Math.PI / 2; l.position.set(0.16, 0.3, 0); g.add(l);
    }
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return g;
  }
  const NAMES = ['le parapluie', 'le disque', 'la lame de scie', 'la lampe'];
  const beamMat = new THREE.MeshBasicMaterial({ color: '#ffe6b0', transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const pieces = [0, 1, 2, 3].map(kind => {
    const g = new THREE.Group(); g.visible = false; scene.add(g);
    const m = pieceMesh(kind); g.add(m);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.5, 9, 14, 1, true).translate(0, 4.5, 0), beamMat); g.add(beam);
    const glow = glowSprite('#ffd890', 1.6, 0.55); glow.position.y = 0.35; g.add(glow);
    return { kind, g, m, dir: new THREE.Vector3(), got: false };
  });
  const site = { dir: new THREE.Vector3() };   // le haut de la colline, où l'on monte le communicateur
  const siteG = new THREE.Group(); siteG.visible = false; scene.add(siteG);
  const siteBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.9, 30, 16, 1, true).translate(0, 15, 0), new THREE.MeshBasicMaterial({ color: '#9fd0ff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
  siteG.add(siteBeam);
  const comm = new THREE.Group(); comm.visible = false; siteG.add(comm);   // le communicateur monté
  { const u = pieceMesh(0); u.scale.setScalar(1.3); comm.add(u); const d = pieceMesh(1); d.position.set(0.25, 0, 0.1); comm.add(d); const s2 = pieceMesh(2); s2.position.set(-0.25, 0, 0); comm.add(s2); const l = pieceMesh(3); l.position.set(0, -0.15, 0.25); comm.add(l); }

  /* ---------- les agents et leurs lampes torches ---------- */
  const NA = low ? 4 : 7, agents = [];
  const suitM = std('#e8ece4', { roughness: 0.8 }), visorM = std('#1a2430', { roughness: 0.1, metalness: 0.6 }), coneM = new THREE.MeshBasicMaterial({ color: '#fff2c4', transparent: true, opacity: 0.13, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const CONE_L = 6, CONE_A = 0.32;
  for (let i = 0; i < NA; i++) {
    const g = new THREE.Group(); g.visible = false; scene.add(g);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.5, 4, 10), suitM); body.position.y = 0.55; g.add(body);
    const hd = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), suitM); hd.position.y = 1.05; g.add(hd);
    const vs = new THREE.Mesh(new THREE.SphereGeometry(0.162, 14, 8, -0.9, 1.8, 1.0, 0.9), visorM); vs.position.y = 1.05; g.add(vs);
    const arm = new THREE.Group(); arm.position.set(0.18, 0.78, 0.08); g.add(arm);
    const torch = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.2, 8).rotateX(Math.PI / 2), std('#333')); arm.add(torch);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(Math.tan(CONE_A) * CONE_L, CONE_L, 20, 1, true).translate(0, -CONE_L / 2, 0).rotateX(-Math.PI / 2), coneM); cone.position.z = 0.1; arm.add(cone);
    const lens = glowSprite('#fff4d0', 0.5, 0.9); lens.position.z = 0.11; arm.add(lens);
    g.traverse(o => { if (o.isMesh && o !== cone) o.castShadow = true; });
    agents.push({ g, arm, center: new THREE.Vector3(), rad: 3, ang: rnd() * 6.28, spd: 0.25, sweep: rnd() * 6 });
  }

  /* ---------- le vaisseau ---------- */
  const ship = new THREE.Group(); ship.visible = false; scene.add(ship);
  { const hull = new THREE.Mesh(new THREE.SphereGeometry(1.6, 28, 18), std('#8a8f9a', { metalness: 0.7, roughness: 0.35 })); hull.scale.set(1, 0.72, 1); ship.add(hull);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.62, 0.12, 8, 40).rotateX(Math.PI / 2), std('#5c616c', { metalness: 0.8, roughness: 0.3 })); ship.add(ring);
    const cols = ['#ff4a3a', '#ffd23a', '#3aff8a', '#3a9aff', '#ff3ad0'], lights = [];
    for (let i = 0; i < 20; i++) { const a = i / 20 * Math.PI * 2, s = glowSprite(cols[i % 5], 0.7, 0.9); s.position.set(Math.cos(a) * 1.75, 0, Math.sin(a) * 1.75); ship.add(s); lights.push(s); }
    const under = glowSprite('#ffb070', 4, 0.8); under.position.y = -1.1; ship.add(under);
    ship.userData = { lights, under }; }
  const rainbow = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.4, 40, 24, 1, true).translate(0, -20, 0), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uK: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float uK; varying vec2 vUv; vec3 hue(float h){ return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); } void main(){ float a = smoothstep(0.0, 0.25, vUv.y) * (1.0 - smoothstep(0.85, 1.0, vUv.y)); gl_FragColor = vec4(hue(vUv.x * 2.0 + vUv.y) * 1.6, a * uK * 0.7); }',
  })); rainbow.visible = false; ship.add(rainbow);

  /* ---------- panneau et effets ---------- */
  const hud = makeHud('etHud', 'background:rgba(8,12,30,.72); border:1px solid rgba(160,200,255,.35); color:#eef3ff;',
    '<span style="color:#ff5a5a;font-size:1.05rem">♥</span><span class="slots">' + [0, 1, 2, 3].map(() => '<i style="display:inline-block;width:12px;height:12px;border-radius:50%;margin:0 2px;border:2px solid rgba(255,255,255,.5)"></i>').join('') + '</span><span class="ct">0 / 4</span><small>Suis la lueur du cœur, évite les lampes torches</small>');
  const slots = [...hud.querySelectorAll('.slots i')], ctEl = hud.querySelector('.ct'), hint = hud.querySelector('small');
  const flash = makeFlash('radial-gradient(circle, #fff 0%, #e8f0ff 50%, #9ab8ff 100%)');
  const toast = makeToast('color:#fff; text-shadow:0 0 18px rgba(140,180,255,.9), 0 3px 0 rgba(0,0,0,.35);');

  /* ---------- état ---------- */
  const S = { on: false, k: 0, got: 0, caught: 0, cine: -1, heart: 0 };
  const C = { hemi: new THREE.Color('#2a3a66'), gnd: new THREE.Color('#0c1020'), zen: new THREE.Color('#050a1e'), hor: new THREE.Color('#1c2e5a'), fog: new THREE.Color('#14203e'), moon: new THREE.Color('#bcd0ff') };
  const ray = new THREE.Raycaster();

  function enter() {
    S.on = true; S.k = 0; S.got = 0; S.caught = 0; S.cine = -1; S.heart = 0;
    // pièces : loin les unes des autres, entre 14 et 45 unités du vélo, sur la terre ferme
    const used = [home.dir];
    for (const p of pieces) {
      const d = findSpot(d => K.dry(d, 0.5) && K.farFromZones(d, 0.25) && K.treesWithin(d, 0.8) === 0 && angDist(d, home.dir) > 14 && angDist(d, home.dir) < 45 && used.every(u => angDist(d, u) > 11), { tries: 4000, r: Math.random })
        || findSpot(d => K.dry(d) && angDist(d, home.dir) > 8 && angDist(d, home.dir) < 50, { tries: 4000, r: Math.random });
      p.dir.copy(d); used.push(d); p.got = false; p.g.visible = true; placeOn(p.g, d, tangent(d)); p.g.scale.setScalar(1);
    }
    // le haut de la colline : le point sec le plus haut, assez loin
    site.dir.copy(findSpot(d => K.dry(d, 0.4) && K.farFromZones(d, 0.3) && K.treesWithin(d, 1.4) === 0 && K.flat(d, 0.25, 0.8) && angDist(d, home.dir) > 18 && angDist(d, home.dir) < 60, { tries: 5000, score: d => planet.heightDir(d), r: Math.random }) || home.dir);
    placeOn(siteG, site.dir, tangent(site.dir)); siteG.visible = true; comm.visible = false; siteBeam.material.opacity = 0;
    // agents : chacun garde une pièce (ou le chemin), et tourne autour en balayant de sa lampe
    agents.forEach((a, i) => {
      const c = i < pieces.length ? offset(pieces[i].dir, Math.random() * 6.28, 2.5) : findSpot(d => K.dry(d) && angDist(d, home.dir) > 8 && angDist(d, home.dir) < 40, { r: Math.random }) || home.dir;
      a.center.copy(c); a.rad = 2.5 + Math.random() * 2.5; a.ang = Math.random() * 6.28; a.spd = (0.18 + Math.random() * 0.12) * (Math.random() < 0.5 ? -1 : 1); a.g.visible = true;
    });
    prop.visible = false; candyMesh.visible = false; moon.visible = true; moonHalo.material.opacity = 0;
    slots.forEach(s => { s.style.background = ''; }); ctEl.textContent = '0 / 4'; hint.textContent = 'Suis la lueur du cœur, évite les lampes torches';
    document.body.classList.add('egg'); hud.classList.add('on'); flash();
    return { dir: home.dir.clone(), fwd: home.fwd.clone() };
  }
  function reset(withFlash = true) {
    S.on = false; S.k = 0; S.cine = -1;
    prop.visible = true; candyMesh.visible = true; moon.visible = false; ship.visible = false; rainbow.visible = false; siteG.visible = false;
    pieces.forEach(p => { p.g.visible = false; }); agents.forEach(a => { a.g.visible = false; });
    if (ambRef) { ambRef.state.forceHour = null; }
    document.body.classList.remove('egg'); hud.classList.remove('on');
    if (withFlash) flash();
  }
  function hit(ndc, camera) { if (S.on || !prop.visible) return false; ray.setFromCamera(ndc, camera); return ray.intersectObject(prop, true).length > 0; }

  let ambRef = null;
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), cUp = new THREE.Vector3(), cF = new THREE.Vector3(), cR = new THREE.Vector3(), q = new THREE.Quaternion(), mtx = new THREE.Matrix4();
  /** À chaque image. Retourne true quand l'histoire est finie (on rentre). */
  function update(ctx) {
    const { dt, t } = ctx;
    if (!S.on) {   // le cœur bat faiblement sous le drap, comme un appel
      parked.userData.anim({ t, dt, heart: 0.35 + 0.25 * Math.sin(t * 0.7) }); return false;
    }
    ambRef = ctx.ambience;
    S.k = Math.min(1, S.k + dt / 2.5); const k = S.k * S.k * (3 - 2 * S.k);
    ctx.ambience.state.forceHour = 23.3;   // la nuit tombe
    const up = cUp.copy(ctx.car).normalize();
    // nuit bleue de pleine lune
    const { hemi, skyU, fog, sun } = ctx;
    hemi.color.lerp(C.hemi, k * 0.6); hemi.groundColor.lerp(C.gnd, k * 0.6); hemi.intensity = Math.max(hemi.intensity, 0.55 * k);
    sun.color.lerp(C.moon, k); sun.intensity = Math.max(sun.intensity, 0.55 * k);
    skyU.uZen.value.lerp(C.zen, k); skyU.uHor.value.lerp(C.hor, k); fog.color.lerp(C.fog, k * 0.7);
    // la lune : grande, basse sur l'horizon, devant la caméra (elle glisse doucement quand on tourne)
    if (S.cine < 0) {
      ctx.camera.getWorldDirection(cF); cF.addScaledVector(up, -cF.dot(up)).normalize(); cR.crossVectors(cF, up).normalize();
      const want = tmp.copy(cF).addScaledVector(up, 0.34).addScaledVector(cR, 0.42).normalize();
      if (moonDir.lengthSq() < 0.5) moonDir.copy(want); else moonDir.lerp(want, 1 - Math.exp(-dt * 0.6)).normalize();
    }
    moon.position.copy(ctx.camera.position).addScaledVector(moonDir, 400); moon.scale.setScalar(150); moon.quaternion.copy(ctx.camera.quaternion);
    moon.material.opacity = k; moonHalo.material.opacity = 0.35 * k;
    // les pièces flottent et tournent ; on les ramasse en passant
    let nearest = null, nd = 1e9;
    for (const p of pieces) {
      if (p.got) continue;
      p.m.rotation.y = t * 1.2; p.m.position.y = 0.15 + Math.sin(t * 2 + p.kind) * 0.08;
      const d = ctx.car.distanceTo(p.g.position);
      if (d < 1.1 && S.cine < 0) {
        p.got = true; p.g.visible = false; S.got++; slots[S.got - 1].style.background = '#ffd890'; ctEl.textContent = S.got + ' / 4';
        ctx.audio.sfx('pick'); toast(S.got < 4 ? 'Tu as trouvé ' + NAMES[p.kind] + ' !' : 'Communicateur complet !');
        if (S.got === 4) hint.textContent = 'Monte en haut de la colline : téléphone maison';
        continue;
      }
      if (d < nd) { nd = d; nearest = p; }
    }
    // le cœur guide : il s'éclaire quand on roule vers la pièce la plus proche (ou vers la colline)
    const goal = S.got >= 4 ? siteG.position : nearest ? nearest.g.position : null;
    if (goal) {
      const to = tmp.copy(goal).sub(ctx.car); to.addScaledVector(up, -to.dot(up)); const L = to.length();
      const facing = L > 1e-4 ? Math.max(0, ctx.fwd.dot(to.divideScalar(L))) : 1;
      S.heart += (Math.pow(facing, 3) * (0.5 + 0.5 * (1 - Math.min(1, L / 40))) - S.heart) * (1 - Math.exp(-dt * 3));
    }
    siteBeam.material.opacity = S.got >= 4 ? 0.22 + 0.06 * Math.sin(t * 3) : 0.04;
    // agents : ronde autour de leur poste, la lampe balaie ; si elle nous attrape, on est repéré
    S.caught -= dt;
    for (const a of agents) {
      a.ang += a.spd * dt; const d = offset(a.center, a.ang, a.rad), ahead = offset(a.center, a.ang + Math.sign(a.spd) * 0.2, a.rad);
      const r0 = Math.max(planet.heightDir(d), planet.waterR);
      placeOn(a.g, d, ahead.sub(d)); a.g.position.copy(d).multiplyScalar(r0);
      const sw = Math.sin(t * 0.9 + a.sweep) * 0.7; a.arm.rotation.set(0.28, sw, 0);
      if (S.cine >= 0 || S.caught > 0) continue;
      a.arm.getWorldPosition(tmp2); const rel = tmp3.copy(ctx.car).sub(tmp2), dist = rel.length();
      if (dist > CONE_L) continue;
      a.arm.getWorldDirection(tmp); if (rel.normalize().dot(tmp) > Math.cos(CONE_A * 0.9)) {
        S.caught = 3; ctx.P.speed *= 0.2; ctx.audio.sfx('alarm'); toast('Repéré !', 1100); flash();
      }
    }
    // arrivée en haut de la colline avec les quatre pièces : la scène finale
    if (S.got >= 4 && S.cine < 0 && ctx.car.distanceTo(siteG.position) < 2.4) { S.cine = 0; S.lock = true; comm.visible = true; ctx.audio.sfx('pick'); hint.textContent = 'Téléphone maison…'; S.cf = cF.copy(ctx.fwd).addScaledVector(up, -ctx.fwd.dot(up)).normalize().clone(); }
    const bike = ctx.avatar.userData.bmx;
    bike.userData.anim({ spin: ctx.P.spin, steer: ctx.P.steer, speed: ctx.P.speed, t, dt, wet: ctx.wet, heart: S.cine >= 0 ? 1 : Math.max(0.15, S.heart) });
    if (S.cine >= 0) return cinematic(ctx, dt, t);
    return false;
  }
  /* ---------- la fin : le communicateur, l'envol devant la lune, le vaisseau ---------- */
  function cinematic(ctx, dt, t) {
    S.cine += dt; const c = S.cine, U = tmp2.copy(site.dir), base = siteG.position, F = S.cf, Rt = tmp3.crossVectors(F, U).normalize();
    comm.rotation.y = c * 0.8; comm.children[0].rotation.y = c * 3;
    const cam = ctx.camera;
    if (c < 1.4) {   // on monte le communicateur, la caméra recule
      camPos.copy(base).addScaledVector(F, -4.5).addScaledVector(U, 1.6).addScaledVector(Rt, 1.2); camLook.copy(base).addScaledVector(U, 0.5);
    } else if (c < 6) {   // le vélo s'envole et passe devant la lune
      if (!S.flew) { S.flew = true; ctx.audio.sfx('fly'); moonDir.copy(F).multiplyScalar(Math.cos(0.27)).addScaledVector(U, Math.sin(0.27)).normalize(); }
      const u = (c - 1.4) / 4.6, e = u * u * (3 - 2 * u);
      const pos = tmp.copy(base).addScaledVector(F, 1 + 18 * e).addScaledVector(U, 0.3 + 6.4 * e);
      mtx.makeBasis(tmp3.crossVectors(U, F).normalize(), U, F); ctx.avatar.quaternion.setFromRotationMatrix(mtx).multiply(q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.28 * Math.sin(Math.PI * Math.min(1, u * 1.5))));
      ctx.avatar.position.copy(pos);
      ctx.P.spin += dt * 30;
      camPos.copy(base).addScaledVector(F, -5).addScaledVector(U, 0.7); camLook.copy(pos);
    } else {   // le vaisseau descend, s'allume, puis repart en laissant un arc-en-ciel
      if (!ship.visible) { ship.visible = true; S.shipT = 0; ctx.audio.sfx('power'); }
      S.shipT += dt; const s = S.shipT;
      const h = s < 2.2 ? 14 - 10 * (1 - Math.pow(1 - s / 2.2, 3)) : 4 + Math.pow(s - 2.2, 2) * 9;
      ship.position.copy(base).addScaledVector(U, h).addScaledVector(F, 3); ship.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), U); ship.rotateY(t * 0.6);
      ship.userData.lights.forEach((l, i) => { l.material.opacity = 0.5 + 0.5 * Math.sin(t * 6 + i); });
      ship.userData.under.material.opacity = s < 2.2 ? 0.8 : 0.4;
      rainbow.visible = s > 2.2; rainbow.material.uniforms.uK.value = Math.min(1, (s - 2.2) * 1.5);
      ctx.avatar.position.copy(base).addScaledVector(U, 0.2);
      camPos.copy(base).addScaledVector(F, -6).addScaledVector(U, 1.2); camLook.copy(ship.position).lerp(base, 0.3);
      if (s > 4.2) { S.lock = false; S.flew = false; return true; }
    }
    cam.position.lerp(camPos, 1 - Math.exp(-dt * 3)); cam.up.copy(U); cam.lookAt(camLook);
    return false;
  }
  /** Dessin sur la mini-carte : le vélo (avant), puis les pièces et la colline (pendant). */
  function pins() {
    if (!S.on) return [{ dir: home.dir, icon: 'bmx' }];
    return pieces.filter(p => !p.got).map(p => ({ dir: p.dir, color: '#ffd890', glyph: '✦' })).concat(S.got >= 4 ? [{ dir: site.dir, color: '#9fd0ff', glyph: '▲' }] : []);
  }
  return {
    id: 'et', ride: 'bmx', prop, home, enter, reset, hit, update, pins, exitDir: site.dir, trees: 1,
    box: { half: 0.25, front: 0.5, rear: 0.5 }, prompt: 'Enfourcher le BMX', music: 'et',
    get on() { return S.on; }, get k() { return S.k; }, get lock() { return !!S.lock; },
    skip(n = 4) { for (const p of pieces) if (!p.got && n-- > 0) { p.got = true; p.g.visible = false; S.got++; } ctEl.textContent = S.got + ' / 4'; },   // (essais)
    get site() { return siteG.position; }, get pieces() { return pieces; },
  };
}
