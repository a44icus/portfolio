/* ============================================================================
   Portfolio « planète » : vue orbitale (on fait tourner la planète, une île par
   section) et promenade à pied (petit personnage en cubes, clavier ou joystick).
   Contenus : admin (styles/content.js) + données partagées (js/site-data.js).
   ============================================================================ */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildPlanet, SEA_R, FADE } from './world.js';
import { makeCar, buildZones } from './props.js';
import { stylizeTree, makePost, makeGroundLeaves, makeSpray } from './look.js';

const $ = s => document.querySelector(s);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const touch = matchMedia('(pointer: coarse)').matches;
// qualité : réduite sur les téléphones et les petites machines
const quality = (touch && Math.min(innerWidth, innerHeight) < 820) || (navigator.deviceMemory && navigator.deviceMemory < 4) ? 'low' : 'high';
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
const PR = Math.min(devicePixelRatio, quality === 'low' ? 1.3 : 1.6);
renderer.setPixelRatio(PR);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#150b28');
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1200);
camera.position.set(0, 14, 100);

// éclairage de la surface de Social World (ciel du biome océan)
scene.add(new THREE.HemisphereLight('#ffc89a', '#6a3f8a', 1.0));
scene.add(new THREE.AmbientLight('#ffe2cc', 0.16));
const sun = new THREE.DirectionalLight('#ffcf94', 2.8); sun.position.set(40, 30, 35); scene.add(sun, sun.target);
sun.castShadow = true;
sun.shadow.mapSize.set(quality === 'low' ? 1024 : 2048, quality === 'low' ? 1024 : 2048);
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;
const rim = new THREE.DirectionalLight('#b48cff', 0.45); rim.position.set(-40, -10, -30); scene.add(rim);

// ciel de la surface (dégradé du biome océan), visible quand on marche
const skyU = { uUp: { value: new THREE.Vector3(0, 1, 0) }, uMix: { value: 0 }, uZen: { value: new THREE.Color('#ee9b7b') }, uHor: { value: new THREE.Color('#ffe0b8') }, uSpace: { value: new THREE.Color('#150b28') } };
const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, depthTest: false, uniforms: skyU,   // opaque : dessiné en premier, sous tout le reste
  vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'uniform vec3 uUp; uniform float uMix; uniform vec3 uZen; uniform vec3 uHor; uniform vec3 uSpace; varying vec3 vD; void main(){ float k = dot(normalize(vD), uUp); vec3 c = mix(uHor, uZen, smoothstep(-0.05, 0.55, k)); gl_FragColor = vec4(mix(uSpace, c, uMix), 1.0);\n#include <colorspace_fragment>\n}',
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
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(SEA_R + 8, 64, 48), new THREE.ShaderMaterial({
    side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }',
    fragmentShader: 'varying vec3 vN; varying vec3 vV; void main(){ float f=pow(1.-abs(dot(vN,vV)),2.2); gl_FragColor=vec4(vec3(1.,.6,.45)*f*1.3, f); }',
  }));
  scene.add(atmo);
}

performance.mark('planet-start');
const planet = buildPlanet(SECTIONS, quality);
performance.measure('planet-build', 'planet-start');
const world = new THREE.Group();
world.add(planet.groundMesh, planet.waterMesh, planet.decor, planet.clouds);
scene.add(world);
stylizeTree(planet.groundMesh, { cast: true, receive: true });
stylizeTree(planet.decor);
stylizeTree(planet.clouds);
const post = makePost(renderer, scene, camera, quality);
// feuilles mortes : sous les arbres et le long des routes
const groundLeaves = makeGroundLeaves(planet, quality === 'low' ? 2200 : 4500, () => {
  const v = new THREE.Vector3();
  if (Math.random() < 0.65 && planet.treeDirs.length) {
    const t = planet.treeDirs[Math.floor(Math.random() * planet.treeDirs.length)];
    v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar((0.3 + Math.random() * 1.7) / SEA_R);
    return v.add(t).normalize();
  }
  const e = planet.edges[Math.floor(Math.random() * planet.edges.length)];
  return e.point(Math.random() * e.len, (Math.random() - 0.5) * 2.6);
});
scene.add(groundLeaves.mesh); stylizeTree(groundLeaves.mesh);
const spray = makeSpray(quality === 'low' ? 70 : 140); scene.add(spray.mesh);
// la caméra part face au pavillon « Profil »
camera.position.copy(SECTIONS[0].dir).multiplyScalar(innerWidth / innerHeight < 0.8 ? 132 : 98).addScaledVector(new THREE.Vector3(0, 1, 0), 6);

/* ---------- vue orbitale ---------- */
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.07; controls.enablePan = false;
controls.minDistance = 46; controls.maxDistance = 150; controls.rotateSpeed = 0.55;
controls.autoRotate = !reduce; controls.autoRotateSpeed = 0.35;
controls.addEventListener('start', () => { controls.autoRotate = false; camAnim = null; });

let mode = 'orbit';
let camAnim = null;
function flyTo(dir, dist = SEA_R + 34, dur = 1100) {
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
  pTag.textContent = 'Zone ' + String(SECTIONS.indexOf(s) + 1).padStart(2, '0') + ' · ' + s.label;
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
const avatar = makeCar();
avatar.visible = false; scene.add(avatar);
let zones = null;
stylizeTree(avatar, { cast: true, receive: true });
buildZones(planet, SECTIONS).then(z => { zones = z; world.add(z.group); stylizeTree(z.group, { cast: true, receive: true }); });
const P = { dir: new THREE.Vector3(), fwd: new THREE.Vector3(), mv: new THREE.Vector3(), r: 0, vr: 0, ground: true, speed: 0, steer: 0, spin: 0, hover: 0, fan: 0, t: 0, odo: 0, lastSpeed: 0, acc: 0, boost: 0, sf: 0, sr: 0, rv: 0,
  sus: { wy: [0, 0, 0, 0], wv: [0, 0, 0, 0], y: 0, vy: 0, pitch: 0, vp: 0, roll: 0, vr: 0 } };
/** Ressort amorti intégré en petits pas (stable même quand une image dure longtemps). */
function spring(xo, xk, vo, vk, target, k, c, dt) { for (let n = Math.ceil(dt * 120), h = dt / n; n > 0; n--) { vo[vk] += ((target - xo[xk]) * k - vo[vk] * c) * h; xo[xk] += vo[vk] * h; } }
// sur l'eau, on glisse à la surface (en aéroglisseur) ; sur terre, on roule sur le sol
const WATER_R = planet.waterR + 0.02;
const driveR = dir => Math.max(planet.heightDir(dir), WATER_R, planet.bridgeR(dir, P.r));   // sous un pont, l'aéroglisseur passe dessous
const GRAV = 17, JUMP = 5.6, RAIL = 0.42;
let boostTouch = false;
const crushPts = [0, 1, 2, 3].map(() => new THREE.Vector3());
// la voiture vue par les objets : position, vitesse, rayon, et un choc qui la ralentit
const carBody = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), r: 0.42, bump(rel) { P.speed *= rel > 2 ? 0.86 : 0.95; } };
const keys = new Set();
const joy = { x: 0, y: 0 };
let near = null;
const hintEl = $('#hint'), walkBtn = $('#walkBtn'), promptEl = $('#prompt');
function setHint() {
  hintEl.textContent = mode === 'orbit'
    ? (touch ? 'Glisse pour tourner · pince pour zoomer · touche une zone' : 'Glisser pour tourner · molette pour zoomer · clic sur une zone')
    : (touch ? 'Joystick pour conduire · Turbo · Saut · roule dans un cercle pour l’ouvrir' : 'ZQSD / WASD ou flèches pour conduire · Maj : turbo · Espace : sauter · E : ouvrir la zone');
}
function setWalk(on) {
  if (on) {
    // atterrit devant la zone la plus proche du regard
    camDir.copy(camera.position).normalize();
    let s = SECTIONS[0], bd = -2; SECTIONS.forEach(x => { const k = x.dir.dot(camDir); if (k > bd) { bd = k; s = x; } });
    // on se pose devant la zone, face aux grandes lettres
    const z = planet.pavilions.find(p => p.id === s.id);
    P.dir.copy(s.dir).addScaledVector(z.t2, 5.2 / SEA_R).normalize();
    P.fwd.copy(s.dir).sub(P.dir.clone().multiplyScalar(P.dir.dot(s.dir))).normalize();
    P.r = planet.groundRadius(P.dir) + 2; P.vr = 0; P.ground = false; P.speed = 0;
    camF.copy(P.fwd); P.mv.copy(P.fwd);
    mode = 'walk'; controls.enabled = false; controls.autoRotate = false; camAnim = null; avatar.visible = true;
    walkBtn.textContent = 'Décoller'; document.body.classList.add('walking'); closePanel();
  } else {
    mode = 'orbit'; avatar.visible = false; controls.enabled = true;
    camera.up.set(0, 1, 0);
    const d = P.dir.clone(); camera.position.copy(d.multiplyScalar(SEA_R + 50)); controls.update();
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
  $('#jumpBtn').addEventListener('pointerdown', e => { e.preventDefault(); if (P.ground) { P.vr = JUMP; P.ground = false; } });
  const bb = $('#boostBtn');
  bb.addEventListener('pointerdown', e => { e.preventDefault(); boostTouch = true; bb.setPointerCapture(e.pointerId); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => bb.addEventListener(ev, () => { boostTouch = false; }));
}

const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), up = new THREE.Vector3(), right = new THREE.Vector3(), basis = new THREE.Matrix4();
const camF = new THREE.Vector3(), nUp = new THREE.Vector3(), tiltQ = new THREE.Quaternion(), ZONE_COS = Math.cos(1.15 / SEA_R);
function groundAt(dir, along, side) { return driveR(tmpB.copy(dir).addScaledVector(P.fwd, along / P.r).addScaledVector(right, side / P.r).normalize()); }
function stepWalk(dt) {
  const k = c => keys.has(c);
  const busy = panel.classList.contains('on');
  const throttle = busy ? 0 : Math.max(-1, Math.min(1, (k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0) + joy.y));
  const steerIn = busy ? 0 : Math.max(-1, Math.min(1, (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0) + joy.x));
  if (!busy && k('Space') && P.ground) { P.vr = JUMP; P.ground = false; }
  const boostOn = !busy && (k('ShiftLeft') || k('ShiftRight') || boostTouch) && throttle > 0;

  // sur l'eau la voiture devient aéroglisseur : elle file, dérive dans les virages et tourne sur place
  const onWater = planet.heightDir(P.dir) < WATER_R - 0.03 && P.r < WATER_R + 0.2;
  P.hover = Math.max(0, Math.min(1, P.hover + (onWater ? 1 : -1) * dt / 0.55));
  P.t += dt;
  const hv = P.hover;
  P.boost += ((boostOn ? 1 : 0) - P.boost) * (1 - Math.exp(-dt * 6));   // turbo : plus vite, plus nerveux
  const vmax = (6.5 - 0.7 * hv) * (1 + 0.7 * P.boost);
  if (throttle && !(throttle > 0 && P.speed >= vmax)) P.speed += throttle * (Math.sign(throttle) !== Math.sign(P.speed) && Math.abs(P.speed) > 0.2 ? 16 - 9 * hv : (9 - 2 * hv) * (1 + 0.9 * P.boost)) * dt;
  else if (!throttle) P.speed *= Math.exp(-dt * (2.2 - 1.6 * hv));
  if (P.speed > vmax) P.speed -= (P.speed - vmax) * (1 - Math.exp(-dt * 3));   // le turbo relâché : on ralentit en douceur
  P.speed = Math.max(-vmax * 0.5, P.speed);
  P.steer += (steerIn - P.steer) * (1 - Math.exp(-dt * 10));
  up.copy(P.dir);
  const grip = Math.min(1, Math.abs(P.speed) / 2) * Math.sign(P.speed || 1);
  const turn = hv > 0.5 ? (Math.abs(P.speed) > 0.3 ? grip : 0.7) * 1.15 : grip;   // l'aéroglisseur pivote même à l'arrêt
  if (Math.abs(P.speed) > 0.05 || hv > 0.5) P.fwd.applyAxisAngle(up, -P.steer * 2.3 * dt * turn * (1 - 0.3 * P.boost));
  right.crossVectors(up, P.fwd).normalize();
  // direction du mouvement : collée au capot sur terre, en retard sur l'eau (dérive)
  P.mv.lerp(P.fwd, 1 - Math.exp(-dt * (30 - 28.6 * hv))); P.mv.addScaledVector(up, -P.mv.dot(up)).normalize();
  if (P.speed) {
    const axis = tmpA.crossVectors(P.dir, P.mv).normalize();
    const next = tmpB.copy(P.dir).applyAxisAngle(axis, P.speed * dt / P.r).normalize();
    // garde-corps des ponts : on glisse le long, on ne passe pas au travers
    const cb = planet.bridgeAt(P.dir), latCur = cb && P.r > cb.top - 0.3 ? cb.lat : 9;
    const nb = planet.bridgeAt(next);
    if (nb && P.r > nb.top - 0.3 && nb.th > nb.b.t0 + 0.3 / SEA_R && nb.th < nb.b.t1 - 0.3 / SEA_R) {
      if (Math.abs(latCur) <= 0.84 && Math.abs(nb.lat) > RAIL) {
        const e = nb.b.e, th = nb.th, sd = Math.sign(nb.lat);
        const tg = e.point(th + 0.3 / SEA_R).sub(e.point(th - 0.3 / SEA_R)).normalize(); if (tg.dot(P.fwd) * Math.sign(P.speed || 1) < 0) tg.negate();
        next.copy(e.point(th, sd * RAIL));
        P.fwd.lerp(tg.multiplyScalar(Math.sign(P.speed || 1)), 0.2).normalize(); P.mv.copy(P.fwd);
        P.speed *= 0.97;
      } else if (Math.abs(latCur) > 0.84 && Math.abs(nb.lat) <= 0.84) { next.copy(P.dir); P.speed *= -0.3; }
    }
    const gNext = driveR(next);
    if (gNext - P.r <= 0.42) {   // les pentes passent, une falaise non
      const q0 = tmpA.copy(P.dir);
      P.fwd.applyQuaternion(tiltQ.setFromUnitVectors(q0, next)); P.mv.applyQuaternion(tiltQ);
      P.dir.copy(next);
      P.fwd.sub(tmpA.copy(P.dir).multiplyScalar(P.fwd.dot(P.dir))).normalize();
      P.mv.sub(tmpA.copy(P.dir).multiplyScalar(P.mv.dot(P.dir))).normalize();
      if (P.ground && gNext > P.r) P.r = gNext;
    } else P.speed *= -0.25;
  }
  const g = driveR(P.dir);
  // au sol, la voiture suit les descentes (pas de micro-sauts) ; elle ne décolle que sur une vraie bosse
  if (P.ground && P.vr <= 0 && P.r - g < 0.05 + Math.abs(P.speed) * dt * 1.3) P.r = g;
  else { P.vr -= GRAV * dt; P.r += P.vr * dt; P.ground = false; }
  if (P.r <= g) { if (!P.ground && P.vr < -1.5) { P.sus.vy += P.vr * 0.07; P.sus.vp += P.vr * 0.05 * Math.sign(P.speed || 1); } P.r = g; P.vr = 0; P.ground = true; }   // atterrissage : la caisse s'écrase sur ses ressorts

  // la voiture épouse le relief (tangage et roulis)
  up.copy(P.dir); right.crossVectors(up, P.fwd).normalize();
  const hf = groundAt(P.dir, 0.45, 0), hb = groundAt(P.dir, -0.45, 0), hr = groundAt(P.dir, 0, 0.37), hl = groundAt(P.dir, 0, -0.37);
  const clampS = v => Math.max(-0.45, Math.min(0.45, v));   // au bord d'un pont, une roue au-dessus du vide ne retourne pas la voiture
  // pentes lissées : pas d'à-coups quand le sol change brusquement (bord de route, entrée de pont)
  P.sf += (clampS((hf - hb) / 0.9) - P.sf) * (1 - Math.exp(-dt * 14)); P.sr += (clampS((hr - hl) / 0.74) - P.sr) * (1 - Math.exp(-dt * 14));
  nUp.copy(up).addScaledVector(P.fwd, -P.sf).addScaledVector(right, -P.sr).normalize();
  if (Math.abs(P.r - P.rv) > 0.6) P.rv = P.r; else P.rv += (P.r - P.rv) * (1 - Math.exp(-dt * 28));
  basis.makeBasis(right, up, P.fwd); avatar.quaternion.setFromRotationMatrix(basis);
  tiltQ.setFromUnitVectors(up, P.ground ? nUp : up); avatar.quaternion.premultiply(tiltQ);
  avatar.position.copy(P.dir).multiplyScalar(P.rv);
  P.spin += P.speed * dt / 0.2; P.odo += Math.abs(P.speed) * dt;
  avatar.userData.wheels.forEach(w => { w.w.rotation.x = P.spin; if (w.front) w.pivot.rotation.y = -P.steer * 0.45; });
  // suspensions : chaque roue suit le sol sous elle, la caisse flotte sur ses ressorts
  const S2 = P.sus, slopeF = P.sf, slopeR = P.sr;
  const rough = P.ground ? Math.min(1, Math.abs(P.speed) / 3) * (planet.pathDir(P.dir) > 0.5 ? 0.45 : 1) : 0;
  avatar.userData.wheels.forEach((w, i) => {
    const gw = groundAt(P.dir, w.along, w.side * 0.37), plane = P.rv + slopeF * w.along + slopeR * w.side * 0.37;
    let tgt = P.ground ? Math.max(-0.1, Math.min(0.1, gw - plane)) : -0.08;   // en l'air, les roues pendent
    tgt += rough * 0.02 * Math.sin(P.odo * 9 + i * 1.7) * Math.sin(P.odo * 3.1 + i * 2.3);   // cahots
    spring(S2.wy, i, S2.wv, i, tgt, 900, 42, dt);
  });
  P.acc += ((P.speed - P.lastSpeed) / Math.max(dt, 1e-3) - P.acc) * (1 - Math.exp(-dt * 8)); P.lastSpeed = P.speed;
  {
    const wy = S2.wy, front = (wy[0] + wy[1]) / 2, rear = (wy[2] + wy[3]) / 2, left = (wy[0] + wy[2]) / 2, rgt = (wy[1] + wy[3]) / 2, spd = Math.min(1, Math.abs(P.speed) / 5);
    spring(S2, 'y', S2, 'vy', (front + rear) / 2 * 0.7 - (P.ground ? 0 : 0.03), 170, 9, dt);
    spring(S2, 'pitch', S2, 'vp', -(front - rear) / 0.76 * 0.6 - Math.max(-0.12, Math.min(0.12, P.acc * 0.011)), 150, 8, dt);   // le nez se cabre à l'accélération, plonge au freinage
    spring(S2, 'roll', S2, 'vr', (rgt - left) / 0.74 * 0.6 - P.steer * spd * 0.09, 150, 8, dt);                              // la caisse penche dans les virages
  }
  // ventilateur : tourne vite quand on accélère ; la coque tangue doucement sur la houle
  P.fan += dt * (10 + Math.abs(throttle) * 26 + Math.abs(P.speed) * 2) * hv;
  const bob = hv * (P.ground ? 1 : 0);
  avatar.position.addScaledVector(up, bob * 0.035 * Math.sin(P.t * 2.6));
  const pitch = S2.pitch * (1 - hv) + bob * (0.03 * Math.sin(P.t * 2.3 + 1) - 0.05 * Math.max(0, throttle) * Math.min(1, Math.abs(P.speed) / 3));
  const roll = S2.roll * (1 - hv) + bob * (0.04 * Math.sin(P.t * 1.9) - P.steer * Math.min(1, Math.abs(P.speed) / 5) * 0.16);
  avatar.userData.pose(hv, P.fan, S2.wy, S2.y, pitch, roll, P.boost, P.t);
  // l'herbe se couche sous les pneus
  if (P.ground && hv < 0.5 && Math.abs(P.speed) > 0.05) {
    avatar.updateMatrixWorld(true);
    avatar.userData.wheels.forEach((w, i) => avatar.localToWorld(crushPts[i].set(w.side * 0.37, 0, w.along)));
    planet.crushGrass(crushPts, 0.2, planet.waterUniforms.uTime.value + 0.001);
  }
  // embruns : autour de la jupe, surtout à l'arrière et en vitesse
  if (!reduce) spray.update(dt, bob > 0.5 ? 14 + Math.abs(P.speed) * 9 + Math.abs(throttle) * 12 : 0, (p, v) => {
    const a = Math.random() * Math.PI * 2, back = Math.random() < 0.6;
    const along = back ? -0.6 : Math.sin(a) * 0.6, side = back ? (Math.random() - 0.5) * 0.7 : Math.cos(a) * 0.45;
    p.copy(avatar.position).addScaledVector(P.fwd, along).addScaledVector(right, side).addScaledVector(up, 0.05);
    v.copy(P.fwd).multiplyScalar(back ? -1.2 - Math.abs(P.speed) * 0.35 : along * 1.2).addScaledVector(right, side * 2.2).addScaledVector(up, 1.4 + Math.random() * 1.4);
  });
  carBody.pos.copy(avatar.position).addScaledVector(up, 0.25); carBody.vel.copy(P.fwd).multiplyScalar(P.speed);

  // caméra à la troisième personne, un peu en hauteur
  camF.addScaledVector(camF, 0).lerp(P.fwd, 1 - Math.exp(-dt * 1.8)); camF.addScaledVector(up, -camF.dot(up)).normalize();
  const target = tmpA.copy(avatar.position).addScaledVector(camF, -8.4 - 1.4 * P.boost).addScaledVector(up, 5.9);
  const clear = Math.max(planet.groundRadius(tmpB.copy(target).normalize()), P.r) + 1.2;
  if (target.length() < clear) target.setLength(clear);
  camera.position.lerp(target, 1 - Math.exp(-dt * 5));
  camera.up.copy(up);
  camera.lookAt(tmpB.copy(avatar.position).addScaledVector(up, 0.3).addScaledVector(camF, 0.6));

  // dans un cercle de zone ?
  let best = null, bd = -1; SECTIONS.forEach(s => { const d = s.dir.dot(P.dir); if (d > bd) { bd = d; best = s; } });
  const close = bd > ZONE_COS ? best : null;
  if (close !== near) {
    near = close;
    promptEl.classList.toggle('on', !!near);
    if (near) promptEl.textContent = (touch ? 'Ouvrir · ' : 'E · Ouvrir ') + near.label;
  }
}

/* ---------- mini-carte (en bas à gauche, tournée dans le sens de la caméra) ---------- */
const mmEl = $('#minimap'), mmCtx = mmEl.getContext('2d');
const MM_CSS = touch ? 118 : 190, MD = Math.round(MM_CSS * Math.min(devicePixelRatio || 1, 2)), DPR2 = MD / MM_CSS, MMR = touch ? 96 : 128, VIEW = 24;
mmEl.width = mmEl.height = MD;
const mmOff = document.createElement('canvas'); mmOff.width = mmOff.height = MMR;
const mmOffCtx = mmOff.getContext('2d'), mmImg = mmOffCtx.createImageData(MMR, MMR);
const mmU = new THREE.Vector3(), mmF = new THREE.Vector3(), mmRt = new THREE.Vector3(), POLE = new THREE.Vector3(0, 1, 0);
let mmTick = 0;
function drawMinimap() {
  mmU.copy(P.dir); mmF.copy(camF).addScaledVector(mmU, -camF.dot(mmU)).normalize(); mmRt.crossVectors(mmF, mmU).normalize();
  const M = planet.map, W = M.w, H = M.h, src = M.data, dst = mmImg.data, sc = VIEW * 2 / MMR / SEA_R;
  for (let y = 0; y < MMR; y++) for (let x = 0; x < MMR; x++) {
    const u = (x - MMR / 2 + 0.5) * sc, v = (MMR / 2 - y - 0.5) * sc;
    const dx = mmU.x + mmRt.x * u + mmF.x * v, dy = mmU.y + mmRt.y * u + mmF.y * v, dz = mmU.z + mmRt.z * u + mmF.z * v, l = Math.hypot(dx, dy, dz);
    const px = Math.floor((Math.atan2(dz, dx) / (Math.PI * 2) + 0.5) * W) % W, py = Math.min(H - 1, Math.floor((0.5 - Math.asin(dy / l) / Math.PI) * H));
    const si = (py * W + px) * 4, di = (y * MMR + x) * 4;
    if (src[si + 3]) { dst[di] = src[si]; dst[di + 1] = src[si + 1]; dst[di + 2] = src[si + 2]; } else { dst[di] = 60; dst[di + 1] = 40; dst[di + 2] = 80; }
    dst[di + 3] = 255;
  }
  mmOffCtx.putImageData(mmImg, 0, 0);
  const c = mmCtx, half = MD / 2, k = MD / (VIEW * 2);
  c.imageSmoothingEnabled = true; c.drawImage(mmOff, 0, 0, MD, MD);
  const proj = q => { const h = q.dot(mmU); return h < 0.3 ? null : [half + q.dot(mmRt) / h * SEA_R * k, half - q.dot(mmF) / h * SEA_R * k]; };
  // ponts
  for (const b of planet.bridges) {
    c.beginPath(); let first = true;
    for (let th = b.t0; th <= b.t1 + 1e-6; th += 0.8 / SEA_R) { const p = proj(b.e.point(th)); if (!p) continue; if (first) { c.moveTo(p[0], p[1]); first = false; } else c.lineTo(p[0], p[1]); }
    c.strokeStyle = '#7a3c22'; c.lineWidth = 1.9 * k; c.stroke(); c.strokeStyle = '#f0a060'; c.lineWidth = 1.2 * k; c.stroke();
  }
  // léger assombrissement des bords
  const gr = c.createRadialGradient(half, half, half * 0.55, half, half, half * 1.45); gr.addColorStop(0, 'rgba(20,10,40,0)'); gr.addColorStop(1, 'rgba(20,10,40,.55)');
  c.fillStyle = gr; c.fillRect(0, 0, MD, MD);
  // zones : pastilles colorées, épinglées au bord quand elles sont loin
  const edge = half - 11 * DPR2;
  const pin = (q, draw) => {
    let p = proj(q);
    if (!p || Math.hypot(p[0] - half, p[1] - half) > edge) {
      const a = Math.atan2(q.dot(mmRt), q.dot(mmF)); p = [half + Math.sin(a) * edge, half - Math.cos(a) * edge];
    }
    draw(p[0], p[1]);
  };
  SECTIONS.forEach(z => pin(z.dir, (x, y) => {
    c.beginPath(); c.arc(x, y, 6.5 * DPR2, 0, Math.PI * 2); c.fillStyle = z.color; c.fill(); c.lineWidth = 2 * DPR2; c.strokeStyle = '#fff'; c.stroke();
    c.fillStyle = '#140a24'; c.font = '800 ' + Math.round(7.5 * DPR2) + 'px Manrope, Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(z.label[0], x, y + 0.5 * DPR2);
  }));
  // nord
  { const a = Math.atan2(POLE.dot(mmRt), POLE.dot(mmF)), x = half + Math.sin(a) * edge, y = half - Math.cos(a) * edge;
    c.fillStyle = 'rgba(20,10,36,.85)'; c.beginPath(); c.arc(x, y, 7 * DPR2, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fff'; c.font = '800 ' + Math.round(8 * DPR2) + 'px Manrope, Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('N', x, y + 0.5 * DPR2); }
  // la voiture : flèche au centre, dans le sens du capot
  c.save(); c.translate(half, half); c.rotate(Math.atan2(P.fwd.dot(mmRt), P.fwd.dot(mmF)));
  c.beginPath(); c.moveTo(0, -9 * DPR2); c.lineTo(6.5 * DPR2, 7 * DPR2); c.lineTo(0, 3.5 * DPR2); c.lineTo(-6.5 * DPR2, 7 * DPR2); c.closePath();
  c.fillStyle = '#fff'; c.fill(); c.lineWidth = 2 * DPR2; c.strokeStyle = '#140a24'; c.stroke(); c.restore();
}

/* ---------- boucle ---------- */
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); post.setSize(w, h, PR); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
const clock = new THREE.Clock();
const sunOff = new THREE.Vector3(), sunDir = new THREE.Vector3(), camR = new THREE.Vector3(), camFw = new THREE.Vector3();
let shadowBox = 0;
function setShadowBox(half, near, far) {
  const c = sun.shadow.camera;
  if (shadowBox === half && c.near === near && c.far === far) return;
  shadowBox = half; c.left = c.bottom = -half; c.right = c.top = half; c.near = near; c.far = far; c.updateProjectionMatrix();
}
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
  if (zones) zones.update(dt, t, mode === 'walk' ? carBody : null);
  // le soleil suit le regard : la face observée est toujours éclairée, de trois quarts
  if (mode === 'walk') {
    // lumière rasante venue du haut à gauche de l'image : de longues ombres vers le bas à droite
    camR.set(1, 0, 0).applyQuaternion(camera.quaternion); camFw.set(0, 0, -1).applyQuaternion(camera.quaternion);
    sunDir.copy(up).multiplyScalar(1.05).addScaledVector(camR, -0.75).addScaledVector(camFw, 0.55);
    sunDir.addScaledVector(up, 0).normalize();
    sun.target.position.copy(avatar.position);
    sun.position.copy(avatar.position).addScaledVector(sunDir, 26);
    setShadowBox(10, 1, 60);
    planet.waterUniforms.uSun.value.copy(sunDir);
  } else {
    sun.position.copy(camera.position).add(sunOff.set(22, 26, 4).applyQuaternion(camera.quaternion));
    sun.target.position.set(0, 0, 0);
    sun.position.setLength(110);
    setShadowBox(40, 50, 175);
    planet.waterUniforms.uSun.value.copy(sun.position).normalize();
  }
  groundLeaves.update(dt, avatar.position, P.speed, mode === 'walk' && P.ground && P.hover < 0.5);
  if (mode === 'walk' && (++mmTick & 1)) drawMinimap();
  spray.mesh.visible = mode === 'walk';
  FADE.uFadeOn.value = mode === 'walk' ? 1 : 0; FADE.uFadeTarget.value.copy(avatar.position).addScaledVector(avatar.position.clone().normalize(), 0.35);
  // en voiture : focale longue et flou de maquette ; en orbite : vue normale
  const wantFov = mode === 'walk' ? 30 + 7 * P.boost : 42;
  if (Math.abs(camera.fov - wantFov) > 0.05) { camera.fov += (wantFov - camera.fov) * (1 - Math.exp(-dt * 3)); camera.updateProjectionMatrix(); }
  post.setTilt(THREE.MathUtils.lerp(post.tilt, mode === 'walk' ? 1 : 0, 1 - Math.exp(-dt * 3)), 0.5);
  rim.position.copy(camera.position).multiplyScalar(-1).add(sunOff.set(0, -10, 0));
  updateLabels();
  post.render();
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
window.__planet = { open: openIsland, walk: setWalk, state: () => ({ mode, near: near && near.id, r: P.r, dir: P.dir.toArray(), hover: P.hover, speed: P.speed }),
  // tests : pose la voiture sur la côte la plus proche, face à la mer
  bridges: () => planet.bridges.length,
  dbg: { P, planet, driveR, keys },
  toBridge(i = 0) { const b = planet.bridges[i]; if (!b) return false; const th = Math.max(0, b.t0 - 2 / SEA_R); P.dir.copy(b.e.point(th)); P.fwd.copy(b.e.point(th + 0.5 / SEA_R)).sub(P.dir).normalize(); P.fwd.addScaledVector(P.dir, -P.fwd.dot(P.dir)).normalize(); P.mv.copy(P.fwd); P.r = driveR(P.dir); P.ground = true; P.speed = 0; P.hover = 0; camF.copy(P.fwd); return b.len; },
  toSea() { const d = new THREE.Vector3(); let best = null, bk = 1e9; for (let i = 0; i < 6000; i++) { const y = 1 - (i + 0.5) / 3000, r = Math.sqrt(Math.max(0, 1 - y * y)), a = i * 2.39996; d.set(Math.cos(a) * r, y, Math.sin(a) * r); const h = planet.heightDir(d); if (h < bk) { bk = h; best = d.clone(); } } P.dir.copy(best); P.fwd.crossVectors(best, new THREE.Vector3(0, 1, 0)).normalize(); P.mv.copy(P.fwd); P.r = driveR(P.dir); P.ground = true; P.speed = 0; P.hover = 1; camF.copy(P.fwd); },
  toShore() { const d = new THREE.Vector3(), best = { k: -2 }; for (let i = 0; i < 4000; i++) { const y = 1 - (i + 0.5) / 2000, r = Math.sqrt(Math.max(0, 1 - y * y)), a = i * 2.39996; d.set(Math.cos(a) * r, y, Math.sin(a) * r); if (planet.isWet(d)) continue; const k = d.dot(P.dir); const o = d.clone().addScaledVector(P.fwd, 0).normalize(); if (k > best.k) { const t1 = new THREE.Vector3().crossVectors(d, new THREE.Vector3(0, 1, 0)).normalize(); for (let j = 0; j < 8; j++) { const f = t1.clone().applyAxisAngle(d, j * Math.PI / 4); if (planet.isWet(d.clone().addScaledVector(f, 1.2 / SEA_R).normalize())) { best.k = k; best.d = d.clone(); best.f = f; break; } } } } P.dir.copy(best.d); P.fwd.copy(best.f); P.mv.copy(best.f); P.r = driveR(P.dir); P.ground = true; P.speed = 0; camF.copy(P.fwd); },
  // simulation hors temps réel (tests) : conduit `sec` secondes avec les touches données
  sim(sec, codes = []) { codes.forEach(c => keys.add(c)); for (let i = 0; i < sec * 60; i++) { stepWalk(1 / 60); if (zones) zones.update(1 / 60, i / 60, carBody); } codes.forEach(c => keys.delete(c)); return zones ? zones.bodies.list.filter(b => b.down || b.fall).length : -1; } };
