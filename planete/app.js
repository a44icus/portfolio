/* ============================================================================
   Portfolio « planète » : vue orbitale (on fait tourner la planète, une île par
   section) et promenade à pied (petit personnage en cubes, clavier ou joystick).
   Contenus : admin (styles/content.js) + données partagées (js/site-data.js).
   ============================================================================ */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildPlanet, SEA_R, PAV_R } from './world.js';

const $ = s => document.querySelector(s);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const touch = matchMedia('(pointer: coarse)').matches;
if (touch) document.body.classList.add('touch');
const E = (window.PF && PF.esc) || (s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
const IMG = (window.PF && PF.img) || (u => u);

/* ---------- sections = îles ---------- */
const SECTIONS = [
  { id: 'profil',   label: 'Profil',          title: 'Qui je suis',               color: '#ff5a3c' },
  { id: 'services', label: 'Services',        title: 'Ce que je fais',            color: '#3d5afe' },
  { id: 'travaux',  label: 'Travaux',         title: 'Travaux sélectionnés',      color: '#d9ff4a' },
  { id: 'perso',    label: 'Projets perso',   title: 'Mes terrains de jeu',       color: '#7c5cff' },
  { id: 'photos',   label: 'Photos',          title: 'Une passion pour la photo', color: '#ff6fae' },
  { id: 'parcours', label: 'Parcours',        title: 'Quinze ans, résumés',       color: '#06b6d4' },
  { id: 'contact',  label: 'Contact',         title: 'Un projet en tête ?',       color: '#ffb703' },
];
// les emplacements (en pleine terre) sont choisis par world.js

/* ---------- scène ---------- */
const canvas = $('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#070b18');
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1200);
camera.position.set(0, 9, 52);

// éclairage de la surface de Social World (ciel du biome océan)
scene.add(new THREE.HemisphereLight(new THREE.Color('#2f8ae8').lerp(new THREE.Color('#ffffff'), 0.35), new THREE.Color('#3f8a2a').multiplyScalar(0.8), 1.05));
scene.add(new THREE.AmbientLight('#ffffff', 0.18));
const sun = new THREE.DirectionalLight('#fff0dc', 2.6); sun.position.set(40, 30, 35); scene.add(sun);
const rim = new THREE.DirectionalLight('#8fb4ff', 0.35); rim.position.set(-40, -10, -30); scene.add(rim);

// ciel de la surface (dégradé du biome océan), visible quand on marche
const skyU = { uUp: { value: new THREE.Vector3(0, 1, 0) }, uMix: { value: 0 } };
const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, depthTest: false, uniforms: skyU,   // opaque : dessiné en premier, sous tout le reste
  vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'uniform vec3 uUp; uniform float uMix; varying vec3 vD; void main(){ float k = dot(normalize(vD), uUp); vec3 zen = vec3(0.184, 0.541, 0.910), hor = vec3(0.769, 0.902, 1.0); vec3 c = mix(hor, zen, smoothstep(-0.05, 0.55, k)); gl_FragColor = vec4(mix(vec3(0.027, 0.043, 0.094), c, uMix), 1.0); }',
}));
sky.renderOrder = -10; scene.add(sky);
const starMat = new THREE.PointsMaterial({ size: 1.6, vertexColors: true, sizeAttenuation: false, transparent: true });
// étoiles
{
  const g = new THREE.BufferGeometry(), p = [], c = [];
  for (let i = 0; i < 1800; i++) {
    const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(380 + Math.random() * 200);
    p.push(v.x, v.y, v.z); const k = 0.6 + Math.random() * 0.4; c.push(k, k, k * (0.9 + Math.random() * 0.2));
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  scene.add(new THREE.Points(g, starMat));
}
// halo d'atmosphère
{
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(SEA_R + 6.2, 64, 48), new THREE.ShaderMaterial({
    side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }',
    fragmentShader: 'varying vec3 vN; varying vec3 vV; void main(){ float f=pow(1.-abs(dot(vN,vV)),2.2); gl_FragColor=vec4(vec3(.35,.65,1.)*f*1.4, f); }',
  }));
  scene.add(atmo);
}

const planet = buildPlanet(SECTIONS);
const world = new THREE.Group();
world.add(planet.groundMesh, planet.waterMesh, planet.decor, planet.clouds);
scene.add(world);
// la caméra part face au pavillon « Profil »
camera.position.copy(SECTIONS[0].dir).multiplyScalar(innerWidth / innerHeight < 0.8 ? 72 : 52).addScaledVector(new THREE.Vector3(0, 1, 0), 6);

/* ---------- vue orbitale ---------- */
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.07; controls.enablePan = false;
controls.minDistance = 25; controls.maxDistance = 80; controls.rotateSpeed = 0.55;
controls.autoRotate = !reduce; controls.autoRotateSpeed = 0.35;
controls.addEventListener('start', () => { controls.autoRotate = false; camAnim = null; });

let mode = 'orbit';
let camAnim = null;
function flyTo(dir, dist = SEA_R + 19, dur = 1100) {
  const from = camera.position.clone(), fromLen = from.length(), toLen = dist;
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion().setFromUnitVectors(from.clone().normalize(), dir.clone().normalize());
  camAnim = { t0: performance.now(), dur: reduce ? 1 : dur, from, fromLen, toLen, qa, qb };
  controls.autoRotate = false;
}

/* ---------- étiquettes des îles ---------- */
const labelsEl = $('#labels');
SECTIONS.forEach(s => {
  const b = document.createElement('button');
  b.className = 'isl'; b.type = 'button'; b.innerHTML = '<i style="background:' + s.color + '"></i>' + E(s.label);
  b.addEventListener('click', () => openIsland(s.id));
  labelsEl.appendChild(b); s.el = b;
  s.pav = planet.pavilions.find(p => p.id === s.id);
});
const v3 = new THREE.Vector3(), camDir = new THREE.Vector3();
function updateLabels() {
  const w = innerWidth, h = innerHeight;
  camDir.copy(camera.position).normalize();
  SECTIONS.forEach(s => {
    const show = mode === 'orbit' && s.dir.dot(camDir) > 0.28;
    s.el.classList.toggle('hidden', !show);
    if (!show) return;
    v3.copy(s.pav.top).applyMatrix4(world.matrixWorld).project(camera);
    s.el.style.left = ((v3.x + 1) / 2 * w) + 'px';
    s.el.style.top = ((1 - v3.y) / 2 * h - 14) + 'px';
  });
}

/* clic direct sur une île */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let downAt = null;
canvas.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerup', e => {
  if (mode !== 'orbit' || !downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;
  ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects([planet.groundMesh, planet.decor], true)[0];
  if (!hit) return;
  const d = hit.point.clone().normalize();
  let best = null, bd = -1;
  SECTIONS.forEach(s => { const k = s.dir.dot(d); if (k > bd) { bd = k; best = s; } });
  if (best && bd > Math.cos(0.4)) openIsland(best.id);
});

/* ---------- menu des îles ---------- */
const menuBtn = $('#menuBtn');
const menu = document.createElement('div');
menu.className = 'chip'; menu.setAttribute('role', 'menu');
menu.style.cssText = 'position:fixed;top:64px;right:16px;z-index:25;flex-direction:column;align-items:stretch;padding:.5rem;border-radius:18px;display:none;gap:.1rem';
menu.innerHTML = SECTIONS.map(s => '<button type="button" role="menuitem" data-id="' + s.id + '" style="border:0;background:none;text-align:left;padding:.55rem .8rem;border-radius:10px;cursor:pointer;display:flex;gap:.6rem;align-items:center"><i style="width:10px;height:10px;border-radius:3px;background:' + s.color + '"></i>' + E(s.label) + '</button>').join('');
document.body.appendChild(menu);
const setMenu = open => { menu.style.display = open ? 'flex' : 'none'; menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false'); };
menuBtn.addEventListener('click', e => { e.stopPropagation(); setMenu(menu.style.display === 'none'); });
menu.addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (b) { setMenu(false); if (mode === 'walk') setWalk(false); openIsland(b.dataset.id); } });
document.addEventListener('click', e => { if (!menu.contains(e.target) && e.target !== menuBtn) setMenu(false); });

/* ---------- panneau de contenu ---------- */
const panel = $('#panel'), pTag = $('#pTag'), pTitle = $('#pTitle'), pBody = $('#pBody');
let DATA = { settings: {}, projects: [], services: [], parcours: [], places: [], carousel: [] };
let openId = null;
function openIsland(id) {
  const s = SECTIONS.find(x => x.id === id); if (!s) return;
  if (mode === 'orbit') flyTo(s.dir);
  openId = id;
  pTag.textContent = 'Île ' + String(SECTIONS.indexOf(s) + 1).padStart(2, '0') + ' · ' + s.label;
  pTag.style.color = s.color;
  pTitle.textContent = s.title;
  pBody.innerHTML = RENDER[id](DATA);
  pBody.scrollTop = 0;
  panel.classList.add('on'); panel.setAttribute('aria-hidden', 'false');
  $('#pClose').focus({ preventScroll: true });
  wireGallery();
}
function closePanel() { panel.classList.remove('on'); panel.setAttribute('aria-hidden', 'true'); openId = null; }
$('#pClose').addEventListener('click', closePanel);
addEventListener('keydown', e => { if (e.key === 'Escape') { if ($('#lb').classList.contains('on')) $('#lb').classList.remove('on'); else closePanel(); } });

const fmt = v => String(parseInt(String(v || '').replace(/\D/g, ''), 10) || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const RENDER = {
  profil(D) {
    const S = D.settings;
    const facts = [1, 2, 3, 4].map(n => [S['fact' + n + '_label'], S['fact' + n + '_text']]).filter(f => f[0]);
    const stats = [1, 2, 3, 4].map(n => [S['stat' + n + '_num'], S['stat' + n + '_label']]).filter(s => s[0]);
    return '<p class="lead">' + E(S.profil_p1 || 'Graphiste depuis quinze ans, j’ai fait mes armes en agence de communication.') + '</p>' +
      (S.profil_p2 ? '<p>' + E(S.profil_p2) + '</p>' : '') +
      (stats.length ? '<div class="stats">' + stats.map((s, i) => '<div class="stat"><b>' + fmt(s[0]) + (i < 2 ? '+' : '') + '</b><span>' + E(s[1]) + '</span></div>').join('') + '</div>' : '') +
      '<ul class="facts">' + facts.map(f => '<li><strong>' + E(f[0]) + '</strong>' + E(f[1]) + '</li>').join('') +
      '<li><strong>En dehors de l’écran</strong>photographie &amp; guitare</li></ul>';
  },
  services(D) {
    const DEF = window.SVC_DETAILS || {};
    return '<p>Ouvre un service pour voir ce que je livre et comment on avance.</p>' + (D.services || []).map((s, i) => {
      const d = DEF[String(s.name || '').trim().toLowerCase()] || {};
      const lead = (s.description && String(s.description).trim()) || d.lead || '';
      return '<details class="svc"><summary><small>' + String(i + 1).padStart(2, '0') + '</small>' + E(s.name) + '</summary><div class="in">' +
        (lead ? '<p>' + E(lead) + '</p>' : '') +
        (d.livrables ? '<ul>' + d.livrables.map(x => '<li>' + E(x) + '</li>').join('') + '</ul>' : '') +
        (d.pour ? '<p style="margin-top:.8rem;color:var(--muted);font-size:.88rem"><b style="color:var(--ink)">Idéal pour :</b> ' + E(d.pour) + '</p>' : '') +
        '</div></details>';
    }).join('');
  },
  travaux(D) {
    return '<div class="cards">' + (D.projects || []).map((p, i) => {
      const href = (p.slug && (p.intro_body || p.approach_body || p.lede)) ? '../projets/projet.html?p=' + encodeURIComponent(p.slug) : (p.link && p.link !== '#' ? p.link : '');
      const tag = href ? 'a' : 'div';
      return '<' + tag + ' class="card"' + (href ? ' href="' + E(href) + '"' : '') + '><div class="im" style="background-image:url(\'' + E(IMG(p.image_url, { w: 640 })) + '\')"></div>' +
        '<div class="tx"><small>' + String(i + 1).padStart(2, '0') + ' · ' + E(p.category) + '</small><b>' + E(p.title) + '</b><span>' + E(p.meta || p.year) + '</span></div></' + tag + '>';
    }).join('') + '</div>';
  },
  perso() {
    return '<div class="cards">' + (window.PERSO_PROJECTS || []).map((p, i) =>
      '<a class="card" href="' + E(p.url) + '" target="_blank" rel="noopener"><div class="im" style="background-image:url(\'' + E(p.image) + '\')"></div>' +
      '<div class="tx"><small>' + String(i + 1).padStart(2, '0') + ' · ' + E(p.tag) + '</small><b>' + E(p.title) + ' ↗</b><span>' + E(p.meta) + '</span></div></a>').join('') + '</div>';
  },
  photos(D) {
    const gal = D.carousel || [];
    let h = gal.length ? '<div class="gal">' + gal.map(g => '<button type="button" data-full="' + E(IMG(g.url, { w: 1600 })) + '" style="background-image:url(\'' + E(IMG(g.url, { w: 640 })) + '\')" aria-label="Agrandir : ' + E(g.caption || 'photo') + '"></button>').join('') + '</div>' : '<p>Les photos arrivent bientôt.</p>';
    const places = (D.places || []).filter(p => p.photos && p.photos.length);
    if (places.length) h += '<div class="cv"><h3>Carnet de voyage</h3></div>' + places.map(p =>
      '<p style="margin:1.2rem 0 .5rem;font-weight:800;color:var(--ink)">' + E(p.name) + '</p><div class="gal">' +
      p.photos.map(ph => '<button type="button" data-full="' + E(IMG(ph.url, { w: 1600 })) + '" style="background-image:url(\'' + E(IMG(ph.url, { w: 640 })) + '\')" aria-label="Agrandir : ' + E(p.name) + '"></button>').join('') + '</div>').join('');
    return h;
  },
  parcours(D) {
    const item = r => '<li><em>' + E(r.period) + '</em><b>' + E(r.title) + '</b>' + (r.detail ? '<p>' + E(r.detail) + '</p>' : '') + '</li>';
    const exp = (D.parcours || []).filter(r => r.kind !== 'formation'), form = (D.parcours || []).filter(r => r.kind === 'formation');
    return '<div class="cv"><h3>Expérience</h3><ul>' + exp.map(item).join('') + '</ul><h3>Formation</h3><ul>' + form.map(item).join('') + '</ul></div>';
  },
  contact(D) {
    const S = D.settings, mail = S.contact_email || 'stephane.donchery@gmail.com', phone = S.contact_phone || '';
    let tel = phone.replace(/[^0-9+]/g, ''); if (tel && tel[0] !== '+') tel = '+33' + tel.replace(/^0/, '');
    const soc = [['Instagram', S.social_instagram], ['Flickr', S.social_flickr], ['LinkedIn', S.social_linkedin], ['Behance', S.social_behance]].filter(s => s[1]);
    return '<p class="lead">' + E(S.contact_title_2 || 'Écrivez-moi.') + '</p><a class="mail" href="mailto:' + E(mail) + '">' + E(mail) + '</a>' +
      '<ul class="facts">' + (phone ? '<li><strong>Téléphone</strong><a href="tel:' + E(tel) + '">' + E(phone) + '</a></li>' : '') +
      (S.contact_location ? '<li><strong>Où</strong>' + E(S.contact_location) + '</li>' : '') +
      (S.contact_availability ? '<li><strong>Disponibilité</strong>' + E(S.contact_availability) + '</li>' : '') + '</ul>' +
      '<div class="links">' + soc.map(s => '<a href="' + E(s[1]) + '" target="_blank" rel="noopener">' + s[0] + ' ↗</a>').join('') + '<a href="../mentions-legales.html">Mentions légales</a></div>';
  },
};
function wireGallery() {
  pBody.querySelectorAll('[data-full]').forEach(b => b.addEventListener('click', () => { $('#lbImg').src = b.dataset.full; $('#lb').classList.add('on'); }));
}
$('#lb').addEventListener('click', () => $('#lb').classList.remove('on'));

/* ---------- mode à pied ---------- */
const avatar = new THREE.Group();
{
  const mat = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 });
  const part = (geo, c, y, x = 0, z = 0) => { const m = new THREE.Mesh(geo, mat(c)); m.position.set(x, y, z); avatar.add(m); return m; };
  const leg = () => new THREE.CapsuleGeometry(0.075, 0.2, 4, 10).translate(0, -0.13, 0);
  avatar.userData.legL = part(leg(), '#2b2b40', 0.3, -0.09);
  avatar.userData.legR = part(leg(), '#2b2b40', 0.3, 0.09);
  part(new THREE.CapsuleGeometry(0.19, 0.24, 6, 16), '#ff5a3c', 0.56);
  part(new THREE.SphereGeometry(0.19, 24, 16), '#f2c9a0', 0.98);
  const hair = part(new THREE.SphereGeometry(0.2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), '#3a2a22', 1.0); hair.scale.y = 0.75;
  part(new THREE.SphereGeometry(0.028, 10, 8), '#1a1a1a', 1.0, -0.07, 0.17);
  part(new THREE.SphereGeometry(0.028, 10, 8), '#1a1a1a', 1.0, 0.07, 0.17);
  avatar.scale.setScalar(0.72); avatar.visible = false; scene.add(avatar);
}
const P = { dir: new THREE.Vector3(), fwd: new THREE.Vector3(), r: 0, vr: 0, ground: true, walkT: 0 };
const keys = new Set();
const joy = { x: 0, y: 0 };
let near = null;
const hintEl = $('#hint'), walkBtn = $('#walkBtn'), promptEl = $('#prompt');
function setHint() {
  hintEl.textContent = mode === 'orbit'
    ? (touch ? 'Glisse pour tourner · pince pour zoomer · touche une île' : 'Glisser pour tourner · molette pour zoomer · clic sur une île')
    : (touch ? 'Joystick pour marcher · bouton Saut · approche-toi d’un pavillon' : 'ZQSD / WASD ou flèches · Espace : sauter · E : ouvrir le pavillon');
}
function setWalk(on) {
  if (on) {
    // atterrit sur l'île la plus proche du regard, à quelques pas de son pavillon
    camDir.copy(camera.position).normalize();
    let s = SECTIONS[0], bd = -2; SECTIONS.forEach(x => { const k = x.dir.dot(camDir); if (k > bd) { bd = k; s = x; } });
    const side = new THREE.Vector3().crossVectors(s.dir, new THREE.Vector3(0, 1, 0)); if (side.lengthSq() < 1e-4) side.set(1, 0, 0); side.normalize();
    P.dir.copy(s.dir).applyAxisAngle(side, -0.2).normalize();
    P.fwd.copy(s.dir).sub(P.dir.clone().multiplyScalar(P.dir.dot(s.dir))).normalize();
    P.r = planet.groundRadius(P.dir) + 2; P.vr = 0; P.ground = false;
    mode = 'walk'; controls.enabled = false; controls.autoRotate = false; camAnim = null; avatar.visible = true;
    walkBtn.textContent = 'Décoller'; document.body.classList.add('walking'); closePanel();
  } else {
    mode = 'orbit'; avatar.visible = false; controls.enabled = true;
    camera.up.set(0, 1, 0);
    const d = P.dir.clone(); camera.position.copy(d.multiplyScalar(SEA_R + 30)); controls.update();
    walkBtn.textContent = 'Atterrir'; document.body.classList.remove('walking'); promptEl.classList.remove('on'); near = null;
  }
  setHint();
}
walkBtn.addEventListener('click', () => setWalk(mode !== 'walk'));
promptEl.addEventListener('click', () => { if (near) openIsland(near.id); });

addEventListener('keydown', e => {
  if (mode !== 'walk' || panel.classList.contains('on')) return;
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (e.code === 'KeyE' && near) { openIsland(near.id); return; }
  keys.add(e.code);
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

// joystick tactile
{
  const pad = $('#pad'), knob = pad.querySelector('i'); let id = null;
  const move = e => { const r = pad.getBoundingClientRect(); let x = (e.clientX - r.left) / r.width * 2 - 1, y = (e.clientY - r.top) / r.height * 2 - 1; const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } joy.x = x; joy.y = -y; knob.style.transform = 'translate(' + x * 34 + 'px,' + y * 34 + 'px)'; };
  pad.addEventListener('pointerdown', e => { id = e.pointerId; pad.setPointerCapture(id); move(e); });
  pad.addEventListener('pointermove', e => { if (e.pointerId === id) move(e); });
  const end = () => { id = null; joy.x = joy.y = 0; knob.style.transform = ''; };
  pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
  $('#jumpBtn').addEventListener('pointerdown', e => { e.preventDefault(); if (P.ground) { P.vr = 7.5; P.ground = false; } });
}

const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), up = new THREE.Vector3(), right = new THREE.Vector3(), basis = new THREE.Matrix4();
const PAV_COS = Math.cos((PAV_R + 0.25) / SEA_R);   // emprise d'un pavillon vue depuis le centre
function stepWalk(dt) {
  const k = c => keys.has(c);
  const busy = panel.classList.contains('on');
  const fwdIn = busy ? 0 : (k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0) + joy.y;
  const turnIn = busy ? 0 : (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0) + joy.x;
  if (!busy && k('Space') && P.ground) { P.vr = 7.5; P.ground = false; }

  up.copy(P.dir);
  if (turnIn) P.fwd.applyAxisAngle(up, -turnIn * 2.4 * dt);
  const inWater = planet.isWet(P.dir);
  const speed = (inWater ? 2.2 : 4.2) * Math.max(-1, Math.min(1, fwdIn));
  if (speed) {
    const axis = tmpA.crossVectors(P.dir, P.fwd).normalize();
    const next = tmpB.copy(P.dir).applyAxisAngle(axis, speed * dt / P.r).normalize();
    const gNext = planet.groundRadius(next);
    const inPavilion = SECTIONS.some(s => next.dot(s.dir) > PAV_COS);   // les pavillons sont solides
    if (!inPavilion && gNext - P.r <= 0.42) {   // les pentes douces passent, une falaise non
      P.dir.copy(next);
      P.fwd.sub(tmpA.copy(P.dir).multiplyScalar(P.fwd.dot(P.dir))).normalize();
      if (P.ground && gNext > P.r) P.r = gNext;
    }
    P.walkT += dt * 9;
  } else P.walkT = 0;
  const g = planet.groundRadius(P.dir);
  if (!P.ground || P.r > g + 0.001) { P.vr -= 24 * dt; P.r += P.vr * dt; P.ground = false; }
  if (P.r <= g) { P.r = g; P.vr = 0; P.ground = true; }

  // personnage
  up.copy(P.dir); right.crossVectors(up, P.fwd).normalize();
  basis.makeBasis(right, up, P.fwd); avatar.quaternion.setFromRotationMatrix(basis);
  avatar.position.copy(P.dir).multiplyScalar(P.r);
  const sw = Math.sin(P.walkT) * 0.6; avatar.userData.legL.rotation.x = sw; avatar.userData.legR.rotation.x = -sw;

  // caméra à la troisième personne
  const target = tmpA.copy(avatar.position).addScaledVector(P.fwd, -3.7).addScaledVector(up, 3.9);
  SECTIONS.forEach(s => { if (target.clone().normalize().dot(s.dir) > Math.cos((PAV_R + 1.2) / SEA_R)) { const l = target.length(), m = planet.heightDir(s.dir) + 4.4; if (l < m) target.setLength(m); } });
  const clear = Math.max(planet.groundRadius(tmpB.copy(target).normalize()), P.r) + 1.2;   // la caméra reste au-dessus du relief
  if (target.length() < clear) target.setLength(clear);
  camera.position.lerp(target, 1 - Math.exp(-dt * 6));
  camera.up.copy(up);
  camera.lookAt(tmpB.copy(avatar.position).addScaledVector(up, 0.65).addScaledVector(P.fwd, 1.8));

  // pavillon à proximité
  let best = null, bd = -1; SECTIONS.forEach(s => { const d = s.dir.dot(P.dir); if (d > bd) { bd = d; best = s; } });
  const close = bd > Math.cos((PAV_R + 1.6) / SEA_R) ? best : null;
  if (close !== near) {
    near = close;
    promptEl.classList.toggle('on', !!near);
    if (near) promptEl.textContent = (touch ? 'Ouvrir · ' : 'E · Ouvrir ') + near.label;
  }
}

/* ---------- boucle ---------- */
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
const clock = new THREE.Clock();
const sunOff = new THREE.Vector3();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  planet.waterUniforms.uTime.value = t;
  if (!reduce) { planet.clouds.rotation.y += dt * 0.025; planet.animate(t); }
  // à pied : ciel bleu autour de la caméra, étoiles effacées
  skyU.uMix.value = THREE.MathUtils.lerp(skyU.uMix.value, mode === 'walk' ? 1 : 0, 1 - Math.exp(-dt * 2.5));
  sky.position.copy(camera.position); skyU.uUp.value.copy(camera.position).normalize(); sky.visible = skyU.uMix.value > 0.01;
  starMat.opacity = 1 - skyU.uMix.value;
  // à pied, les nuages montent au-dessus de la caméra
  planet.clouds.scale.setScalar(THREE.MathUtils.lerp(planet.clouds.scale.x, mode === 'walk' ? 1.3 : 1, 1 - Math.exp(-dt * 3)));
  if (mode === 'orbit') {
    if (camAnim) {
      const k = Math.min(1, (performance.now() - camAnim.t0) / camAnim.dur), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      const q = camAnim.qa.clone().slerp(camAnim.qb, e);
      camera.position.copy(camAnim.from).normalize().applyQuaternion(q).multiplyScalar(camAnim.fromLen + (camAnim.toLen - camAnim.fromLen) * e);
      if (k >= 1) camAnim = null;
    }
    controls.update();
  } else stepWalk(dt);
  // le soleil suit le regard : la face observée est toujours éclairée, de trois quarts
  sun.position.copy(camera.position).add(sunOff.set(22, 26, 4).applyQuaternion(camera.quaternion));
  planet.waterUniforms.uSun.value.copy(sun.position).normalize();
  rim.position.copy(camera.position).multiplyScalar(-1).add(sunOff.set(0, -10, 0));
  updateLabels();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
setHint();
requestAnimationFrame(frame);

/* ---------- démarrage ---------- */
const introBtn = $('#introBtn');
introBtn.disabled = false; introBtn.textContent = 'Explorer la planète';
introBtn.addEventListener('click', () => { $('#intro').classList.add('out'); setTimeout(() => $('#intro').remove(), 700); });
(window.loadPortfolio ? window.loadPortfolio() : Promise.resolve(DATA)).then(d => { DATA = d || DATA; $('#loadTxt').textContent = ''; if (openId) openIsland(openId); })
  .catch(() => { $('#loadTxt').textContent = ''; });
window.__planet = { open: openIsland, walk: setWalk, state: () => ({ mode, near: near && near.id, r: P.r, dir: P.dir.toArray() }) };
