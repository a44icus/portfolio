/* ============================================================================
   Portfolio « planète » : vue orbitale (on fait tourner la planète, une île par
   section) et promenade à pied (petit personnage en cubes, clavier ou joystick).
   Contenus : admin (styles/content.js) + données partagées (js/site-data.js).
   ============================================================================ */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildPlanet, SEA_R, FADE } from './world.js';
import { makeCar, makeBiplane, buildZones, PAINT } from './props.js';
import { makeUpside } from './upside.js';
import { makeET } from './et.js';
import { makeMario } from './mario.js';
import { VAN_LEN } from './van.js';
import { stylizeTree, makePost, makeGroundLeaves, makeSpray, makeTrails, makeTireTracks, GLEAF } from './look.js';
import { makeAmbience } from './ambience.js';
import { makeFauna } from './fauna.js';
import { makeAudio } from './audio.js';
import { TUNE, toggleTunePanel } from './tune.js';
import { makeToast } from './eggkit.js';
import { SAND, GRASS, TREE, BUSH, LUPIN, WIND, TILT } from './world.js';

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
// l'anticrénelage est fait par le post-traitement (MSAA) : inutile de le payer deux fois
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); window.__planetFail && window.__planetFail('Le processeur graphique a lâché (mémoire). Recharge la page.'); });
const PR = Math.min(devicePixelRatio, quality === 'low' ? 1.1 : 1.6);   // téléphone : définition modérée (il chauffait vite)
renderer.setPixelRatio(PR);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = quality === 'low' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;   // ombres douces trop coûteuses sur téléphone
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#150b28');
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1200);
camera.position.set(0, 14, 100);

// éclairage de la surface de Social World (ciel du biome océan)
const hemi = new THREE.HemisphereLight('#ffc89a', '#6a3f8a', 1.0); scene.add(hemi);
const ambL = new THREE.AmbientLight('#ffe2cc', 0.16); scene.add(ambL);
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
// halo d'atmosphère : retiré (la planète se détache directement sur l'espace)
{
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(SEA_R + 8, 64, 48), new THREE.ShaderMaterial({
    side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }',
    fragmentShader: 'varying vec3 vN; varying vec3 vV; void main(){ float f=pow(1.-abs(dot(vN,vV)),2.2); gl_FragColor=vec4(vec3(1.,.6,.45)*f*1.3, f); }',
  }));
  void atmo;
}

// étapes affichées sur l'écran de chargement ; la pause laisse le navigateur afficher le texte avant le calcul suivant
const step = async name => { if (window.__planetStep) window.__planetStep(name); await new Promise(r => { requestAnimationFrame(() => setTimeout(r, 0)); setTimeout(r, 120); }); };   // (rAF ne vient pas si l'onglet est caché)
await step('Génération du relief, des routes et de la végétation');
performance.mark('planet-start');
const planet = buildPlanet(SECTIONS, quality);
performance.measure('planet-build', 'planet-start');
await step('Mise en place de la scène');
const world = new THREE.Group();
world.add(planet.groundMesh, planet.waterMesh, planet.decor, planet.clouds);
scene.add(world);
stylizeTree(planet.groundMesh, { cast: true, receive: true });
stylizeTree(planet.decor);
stylizeTree(planet.clouds);
let post;
// essai du post-traitement sans la planète : un rendu complet ici compilerait tous les shaders
// avant que l'ambiance n'ajoute brouillard et lumières, et tout serait recompilé juste après (fatal sur téléphone)
try { post = makePost(renderer, scene, camera, quality); world.visible = false; post.render(); world.visible = true; }
catch (e) {   // sans post-traitement : rendu direct
  console.warn('post-traitement indisponible', e);
  post = { setSize() {}, setTilt() {}, tilt: 0, bloom: {}, grade: { uniforms: { uSat: {} } }, setBand() {}, render() { renderer.render(scene, camera); } };
}
// feuilles mortes : sous les arbres et le long des routes
const groundLeaves = makeGroundLeaves(planet, quality === 'low' ? 7000 : 16000, () => {
  const v = new THREE.Vector3();
  const roll = Math.random();
  if (roll < 0.5 && planet.treeDirs.length) {
    const t = planet.treeDirs[Math.floor(Math.random() * planet.treeDirs.length)];
    v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar((0.3 + Math.random() * 1.7) / SEA_R);
    return v.add(t).normalize();
  }
  const e = planet.edges[Math.floor(Math.random() * planet.edges.length)];
  if (roll < 0.8) return e.point(Math.random() * e.len, (Math.random() - 0.5) * 2.6);
  // le reste : semé un peu partout sur la terre ferme
  for (let k = 0; k < 30; k++) { v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(); if (!planet.isWet(v)) return v; }
  return e.point(Math.random() * e.len, 0);
});
scene.add(groundLeaves.mesh); stylizeTree(groundLeaves.mesh);
const trails = makeTrails(); scene.add(trails.group);
const tracks = makeTireTracks(quality === 'low' ? 700 : 1400); scene.add(tracks.mesh);
const trackLast = [new THREE.Vector3(), new THREE.Vector3()], trackOn = [false, false], trackPt = new THREE.Vector3(), trackDir = new THREE.Vector3();
const trailHeads = [new THREE.Vector3(), new THREE.Vector3()], trailSide = new THREE.Vector3();
const spray = makeSpray(quality === 'low' ? 70 : 140); scene.add(spray.mesh);
// faune discrète (lapins, crabes, papillons, martins-pêcheurs, tortues, poissons) : visible et animée seulement en conduite
const fauna = makeFauna(planet, quality); scene.add(fauna.group); stylizeTree(fauna.group, { cast: quality !== 'low', receive: true });
fauna.group.traverse(o => { if (o.userData.fur) o.castShadow = false; });   // les couches de fourrure ne projettent pas d'ombre
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
  const upFrom = camera.up.clone();
  if (PL.cam) endPlaneCam();
  const from = camera.position.clone(), fromLen = from.length(), toLen = dist;
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion().setFromUnitVectors(from.clone().normalize(), dir.clone().normalize());
  camAnim = { t0: performance.now(), dur: reduce ? 1 : dur, from, fromLen, toLen, qa, qb, up: upFrom.y > 0.9999 ? null : upFrom };   // l'horizon se redresse pendant le trajet
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
canvas.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; if (aim) { aim.ptrX = e.clientX; aim.angle0 = aim.angle; chargeAim(); } });
canvas.addEventListener('pointerleave', () => tipOn(false));
// bulle qui suit la souris au-dessus d'un objet cliquable
const hoverTip = document.createElement('div');
hoverTip.style.cssText = 'position:fixed;left:0;top:0;z-index:24;pointer-events:none;padding:.35rem .6rem;border-radius:999px;background:rgba(20,20,40,.82);color:#fff;font:700 12px/1 Manrope, Arial, sans-serif;white-space:nowrap;opacity:0;transition:opacity .15s';
document.body.appendChild(hoverTip);
const tipOn = on => { hoverTip.style.opacity = on ? '1' : '0'; };
canvas.addEventListener('pointermove', e => {
  if (PL.follow && downAt && e.buttons && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) stopFollow();
  if (aim) {   // visée : glisser à gauche / à droite tourne le tir
    if (e.pointerType === 'mouse' && !e.buttons) aim.angle = Math.max(-0.6, Math.min(0.6, (e.clientX / innerWidth - 0.5) * 1.6 * aim.sign));
    else if (e.buttons && aim.ptrX != null) aim.angle = Math.max(-0.6, Math.min(0.6, aim.angle0 + (e.clientX - aim.ptrX) / innerWidth * 1.6 * aim.sign));
    canvas.style.cursor = 'crosshair'; tipOn(false); return;
  }
  if (!e.buttons && e.pointerType === 'mouse') {   // la main signale ce qu'on peut cliquer (l'avion, les panneaux, les objets des zones)
    const walk = mode === 'walk' && !upside.on && !egg; ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    const it = walk ? interactiveAt(ndc) : null;
    canvas.style.cursor = (mode === 'orbit' && !PL.follow && overPlane(e)) || it || (walk && signpostAt(ndc)) ? 'pointer' : '';
    if (it) { hoverTip.textContent = it.prompt; hoverTip.style.transform = `translate(${e.clientX + 16}px, ${e.clientY + 14}px)`; tipOn(true); } else tipOn(false);
  }
});
/** La molette sert à faire défiler un panneau (fiche de zone, réglages) : elle ne touche alors pas à la caméra. */
const wheelOnUI = e => !!(e.target && e.target.closest && e.target.closest('aside, .lil-gui'));
addEventListener('wheel', e => { if (!wheelOnUI(e)) stopFollow(); }, { passive: true });
addEventListener('keydown', e => { if (e.key === 'Escape') stopFollow(); });
const plScr = new THREE.Vector3();
function overPlane(e) {   // l'avion est petit à l'écran : on accepte un clic tout près
  if (!PL.on || !plane.visible) return false;
  plScr.copy(plane.position).project(camera);
  const sx = (plScr.x + 1) / 2 * innerWidth, sy = (1 - plScr.y) / 2 * innerHeight;
  return plScr.z < 1 && plane.position.dot(camera.position) > 0 && Math.hypot(e.clientX - sx, e.clientY - sy) < 44;
}
canvas.addEventListener('pointerup', e => {
  if (aim) { releaseAim(); downAt = null; canvas.style.cursor = ''; return; }
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;
  // clic sur le van caché : on en prend le volant, et le monde bascule
  ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  // en balade : clic sur un panneau fléché → la caméra se met en face ; nouveau clic → retour derrière la voiture
  if (mode === 'walk' && !upside.on && !egg) {
    if (signView) { exitSign(); return; }
    const it = interactiveAt(ndc); if (it) { useIt(it); tipOn(false); canvas.style.cursor = ''; return; }
    const sp = signpostAt(ndc); if (sp) { signView = { post: sp, side: 0 }; return; }
  }
  if (!upside.on && !egg && upside.hitVan(ndc, camera)) { enterUpside(); return; }
  if (!upside.on && !egg) for (const e of eggs) if (e.hit(ndc, camera)) { enterEgg(e); return; }
  if (mode !== 'orbit') return;
  if (PL.follow) { stopFollow(); return; }
  // clic sur l'avion (ou tout près : il est petit à l'écran) : on le suit
  if (overPlane(e)) { startFollow(); canvas.style.cursor = ''; return; }
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
  panel.classList.add('on'); panel.setAttribute('aria-hidden', 'false'); panelOpenedAt = performance.now();
  $('#pClose').focus({ preventScroll: true });
  wireGallery();
}
function closePanel() { panel.classList.remove('on'); panel.setAttribute('aria-hidden', 'true'); openId = null; }
let panelOpenedAt = 0;
// fermer la fiche : la croix, Échap, un clic à l'extérieur (pas un glisser, ni le clic qui vient de l'ouvrir), ou la voiture qui repart
{
  let downPt = null;
  addEventListener('pointerdown', e => { downPt = [e.clientX, e.clientY]; }, { capture: true, passive: true });
  addEventListener('click', e => {
    if (!panel.classList.contains('on') || panel.contains(e.target) || e.target.closest('#lb')) return;
    if (performance.now() - panelOpenedAt < 400) return;
    if (downPt && Math.hypot(e.clientX - downPt[0], e.clientY - downPt[1]) > 6) return;
    closePanel();
  });
}
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
avatar.traverse(o => { if (o.isMesh) [].concat(o.material).forEach(m => { m.userData.noUpside = true; }); });   // la voiture garde ses couleurs dans le monde à l'envers
stylizeTree(avatar, { cast: true, receive: true });
// clin d'œil : le van WSQK caché dans la nature, porte du monde à l'envers
const upside = makeUpside({ planet, scene, sections: SECTIONS, quality, R: SEA_R });
stylizeTree(upside.van, { cast: true, receive: true }); stylizeTree(upside.fence);
let nearVan = false, upHour = 12;
// autres clins d'œil : le BMX au panier (E.T.) et le tuyau vert (Mario)
const et = makeET({ planet, scene, sections: SECTIONS, quality, R: SEA_R });
const mario = makeMario({ planet, scene, sections: SECTIONS, quality, R: SEA_R });
const eggs = [et, mario];
scene.children.slice(-40).forEach(o => { if (o !== avatar && o !== upside.van && o !== upside.fence) stylizeTree(o); });
let egg = null, eggHour = 12, nearProp = null;
const ambience = makeAmbience({ scene, renderer, sun, hemi, amb: ambL, skyU, waterUniforms: planet.waterUniforms, planet, post, quality, avatar, SEA_R });
/* ---------- objets interactifs des zones : messages, son, photo souvenir ---------- */
const zoneToast = makeToast('top:38%; color:#fff; font-size:clamp(1.1rem, 3.6vw, 2rem); white-space:normal; width:min(86vw, 620px); line-height:1.15; -webkit-text-stroke:1.5px #1a1a40; text-shadow:0 3px 0 #1a1a40;');
let wantShot = false;
function showPhoto(url) {
  const fl = document.createElement('div'); fl.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:45;pointer-events:none;opacity:1;transition:opacity .7s ease';
  document.body.appendChild(fl); requestAnimationFrame(() => requestAnimationFrame(() => { fl.style.opacity = '0'; })); setTimeout(() => fl.remove(), 900);
  document.querySelectorAll('.polaroid').forEach(e => e.remove());
  const d = new Date(), a = document.createElement('a');
  a.className = 'polaroid'; a.href = url; a.download = 'planete-' + d.toISOString().slice(0, 10) + '.jpg'; a.title = 'Télécharger la photo';
  a.style.cssText = 'position:fixed;left:max(14px, env(safe-area-inset-left));bottom:calc(max(14px, env(safe-area-inset-bottom)) + 70px);z-index:30;background:#fffdf8;padding:8px 8px 30px;box-shadow:0 10px 30px rgba(0,0,0,.35);transform:translateY(40px) rotate(-12deg) scale(.6);opacity:0;transition:transform .6s cubic-bezier(.2,1.4,.4,1),opacity .4s;color:#2b2b40;text-decoration:none;font:700 12px/1 Manrope, Arial, sans-serif;text-align:center';
  a.innerHTML = '<img alt="" style="display:block;width:min(42vw,220px);aspect-ratio:4/3;object-fit:cover;filter:saturate(1.1) contrast(1.05)"><span style="position:absolute;left:0;right:0;bottom:10px">Souvenir de la planète · ' + d.toLocaleDateString('fr-FR') + ' ⤓</span>';
  a.querySelector('img').src = url; document.body.appendChild(a);
  requestAnimationFrame(() => requestAnimationFrame(() => { a.style.opacity = '1'; a.style.transform = 'rotate(-4deg)'; }));
  setTimeout(() => { a.style.opacity = '0'; a.style.transform = 'translateY(30px) rotate(-8deg) scale(.8)'; setTimeout(() => a.remove(), 700); }, 8000);
  audio.started && audio.impact(1.2, 0, 'bois');
}
/* bulle au-dessus d'un objet : choix (retardateur…) ou compte à rebours */
const bubble = document.createElement('div');
bubble.style.cssText = 'position:fixed;left:0;top:0;z-index:26;display:none;gap:6px;padding:6px;border-radius:14px;background:rgba(20,20,40,.88);box-shadow:0 8px 24px rgba(0,0,0,.3);font:800 13px/1 Manrope, Arial, sans-serif;color:#fff;white-space:nowrap;transform:translate(-50%,-100%)';
document.body.appendChild(bubble);
let bubbleIt = null, bubbleMode = '';
function openChoices(it) {
  bubbleIt = it; bubbleMode = 'choices'; bubble.innerHTML = '';
  if (it.choicesTitle !== false) { const t = document.createElement('span'); t.textContent = 'Retardateur'; t.style.cssText = 'align-self:center;padding:0 6px 0 4px;opacity:.75;font-weight:700'; bubble.appendChild(t); }
  it.choices.forEach((c, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = c.label; b.title = (touch ? '' : 'Touche ' + (i + 1));
    b.style.cssText = 'border:0;border-radius:10px;padding:8px 12px;background:#fff;color:#1a1a40;font:inherit;cursor:pointer';
    b.addEventListener('click', e => { e.stopPropagation(); closeBubble(); audio.start(); c.go(); });
    bubble.appendChild(b);
  });
  bubble.style.display = 'flex';
}
function closeBubble() { bubbleIt = null; bubbleMode = ''; bubble.style.display = 'none'; }
const bubbleV = new THREE.Vector3();
function updateBubble() {
  if (!zones || mode !== 'walk') { if (bubbleIt) closeBubble(); return; }
  if (bubbleMode === 'choices') {
    const it = bubbleIt;
    if ((it.ready && !it.ready()) || it.body.mesh.position.distanceTo(avatar.position) > it.r + 2.5) { closeBubble(); return; }
  } else {   // un objet qui décompte (retardateur) montre son état
    const it = zones.interactives.find(i => i.status && i.body.mesh.position.distanceTo(avatar.position) < 25);
    if (!it) { if (bubbleMode === 'status') closeBubble(); return; }
    if (bubbleIt !== it || bubble.textContent !== it.status) { bubbleIt = it; bubbleMode = 'status'; bubble.textContent = it.status; bubble.style.display = 'flex'; bubble.style.padding = '8px 12px'; }
  }
  const it = bubbleIt; if (!it) return;
  bubbleV.copy(it.body.mesh.position).addScaledVector(it.body.dir, 1.25).project(camera);
  if (bubbleV.z > 1) { bubble.style.visibility = 'hidden'; return; }
  bubble.style.visibility = ''; if (bubbleMode === 'choices') bubble.style.padding = '6px';
  bubble.style.left = ((bubbleV.x + 1) / 2 * innerWidth) + 'px'; bubble.style.top = ((1 - bubbleV.y) / 2 * innerHeight - 8) + 'px';
}

/* visée au marteau : angle à la souris (ou ←/→), puissance en maintenant le clic (ou Espace / E) */
const aimUI = document.createElement('div');
aimUI.style.cssText = 'position:fixed;left:50%;bottom:calc(max(18px, env(safe-area-inset-bottom)) + 150px);transform:translateX(-50%);z-index:26;display:none;flex-direction:column;align-items:center;gap:8px;pointer-events:none;font:700 12px/1.3 Manrope, Arial, sans-serif;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.6);text-align:center';
aimUI.innerHTML = '<div style="width:min(70vw,320px);height:16px;border-radius:999px;background:rgba(20,20,40,.75);box-shadow:0 0 0 2px rgba(255,255,255,.8);overflow:hidden"><i style="display:block;height:100%;width:0;border-radius:999px;background:linear-gradient(90deg,#ffd23a,#ff8a3a,#ff3a3a)"></i></div><span></span>';
document.body.appendChild(aimUI);
const aimBar = aimUI.querySelector('i'), aimHelp = aimUI.querySelector('span');
let aim = null;
function startAim(it) {
  if (aim) return;
  aim = { it, angle: 0, power: 0, charging: false, t: 0, sign: 1 };
  it.aimStart(); closeBubble();
  aimHelp.innerHTML = touch ? 'Glissez pour viser · maintenez le doigt pour doser la puissance, relâchez pour frapper' : 'Souris ou ←/→ : viser · maintenir clic, Espace ou E : puissance · relâcher : frapper · Échap : annuler';
  aimUI.style.display = 'flex'; promptEl.classList.remove('on');
}
function endAim(fire) {
  if (!aim) return;
  if (fire) aim.it.aimFire(); else aim.it.aimCancel();
  aim = null; aimUI.style.display = 'none';
}
function chargeAim() { if (aim && !aim.charging) { aim.charging = true; aim.t = 0; } }
function releaseAim() { if (aim && aim.charging) endAim(true); }
function stepAim(dt) {
  if (!aim) return;
  if (mode !== 'walk' || upside.on || egg || aim.it.body.mesh.position.distanceTo(avatar.position) > 6) { endAim(false); return; }
  const kk = c => keys.has(c);
  aim.sign = aim.it.aimScreenSign(camera);
  const turn = (kk('ArrowRight') || kk('KeyD') ? 1 : 0) - (kk('ArrowLeft') || kk('KeyA') ? 1 : 0);
  if (turn) aim.angle = Math.max(-0.6, Math.min(0.6, aim.angle + turn * aim.sign * dt * 0.8));
  if (aim.charging) { aim.t += dt; aim.power = 0.5 - 0.5 * Math.cos(aim.t * 2.6); }   // la jauge va et vient : on relâche au bon moment
  else aim.power = 0;
  aimBar.style.width = (aim.power * 100).toFixed(1) + '%';
  aim.it.aimSet(aim.angle, aim.power);
}
/** Se servir d'un objet : bulle de choix, visée, ou action directe. */
function useIt(it) {
  audio.start();
  if (it.choices) { if (bubbleIt === it && bubbleMode === 'choices') closeBubble(); else openChoices(it); return; }
  if (it.aimStart && (!it.aimReady || it.aimReady())) { startAim(it); return; }
  it.go();
}
addEventListener('keydown', e => {
  if (bubbleMode === 'choices' && bubbleIt) { const n = +e.key; if (n >= 1 && n <= bubbleIt.choices.length) { const c = bubbleIt.choices[n - 1]; closeBubble(); audio.start(); c.go(); } if (e.key === 'Escape') closeBubble(); }
}, true);
const zonesReady = buildZones(planet, SECTIONS).then(z => { zones = z;
  Object.assign(z.hooks, { toast: (t, ms) => zoneToast(t, ms), sfx: k => { if (audio.started) audio.sfx(k); }, open: id => openIsland(id), data: () => DATA, img: (u, o) => IMG(u, o), photo: () => { wantShot = true; }, flash: k => {
    const fl = document.createElement('div'); fl.style.cssText = 'position:fixed;inset:0;z-index:44;pointer-events:none;background:radial-gradient(circle,rgba(200,235,255,.9),rgba(120,180,255,.35));opacity:' + (0.25 + k * 0.6) + ';transition:opacity .45s ease';
    document.body.appendChild(fl); requestAnimationFrame(() => requestAnimationFrame(() => { fl.style.opacity = '0'; })); setTimeout(() => fl.remove(), 600);
  } }); z.bodies.onHit = (b, s) => audio.impact(s, b.mesh.position.distanceTo(camera.position), 'bois'); world.add(z.group); stylizeTree(z.group, { cast: quality !== 'low', receive: true });   /* sur téléphone, les petits objets ne projettent pas d'ombre */ ambience.collect(z.group); });
const P = { dir: new THREE.Vector3(), fwd: new THREE.Vector3(), mv: new THREE.Vector3(), r: 0, vr: 0, ground: true, speed: 0, steer: 0, spin: 0, hover: 0, fan: 0, t: 0, odo: 0, airT: 0, ax: 0, az: 0, wx: 0, wz: 0, sfRate: 0, srRate: 0, tumble: false, flipped: false, recover: null, lastSpeed: 0, acc: 0, boost: 0, sf: 0, sr: 0, rv: 0,
  sus: { wy: [0, 0, 0, 0], wv: [0, 0, 0, 0], y: 0, vy: 0, pitch: 0, vp: 0, roll: 0, vr: 0 } };
/** Ressort amorti intégré en petits pas (stable même quand une image dure longtemps). */
function spring(xo, xk, vo, vk, target, k, c, dt) { for (let n = Math.ceil(dt * 120), h = dt / n; n > 0; n--) { vo[vk] += ((target - xo[xk]) * k - vo[vk] * c) * h; xo[xk] += vo[vk] * h; } }
// sur l'eau, on glisse à la surface (en aéroglisseur) ; sur terre, on roule sur le sol
const WATER_R = planet.waterR + 0.02;
const driveR = dir => Math.max(planet.heightDir(dir), WATER_R, planet.bridgeR(dir, P.r));   // sous un pont, l'aéroglisseur passe dessous
const RAIL = 0.63, CAR = TUNE.voiture;   // écart max du centre de la voiture sur un pont (garde-corps à 1,05)
let boostTouch = false;
const crushPts = [0, 1, 2, 3].map(() => new THREE.Vector3());
const lupPts = [0, 1, 2, 3, 4].map(() => new THREE.Vector3());
// la voiture vue par les objets : position, vitesse, rayon, et un choc qui la ralentit
const carBody = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), r: 0.42, bump(rel) { P.speed *= rel > 2 ? 0.86 : 0.95; },
  // obstacle fixe (panneau planté) : la voiture est repoussée hors de lui et s'arrête, comme contre un tronc
  push(n, depth, rel) { P.dir.addScaledVector(n, -depth / P.r).normalize(); P.fwd.addScaledVector(P.dir, -P.fwd.dot(P.dir)).normalize(); P.mv.addScaledVector(P.dir, -P.mv.dot(P.dir)).normalize(); if (rel > 0.2) P.speed *= -0.25; } };
const keys = new Set();
let camZoom = 1;
const setZoom = z => { camZoom = Math.max(0.55, Math.min(2.6, z)); zoomAuto = null; };   // un zoom choisi à la main annule le zoom automatique sur les zones
let zoomAuto = null, zoneStill = 0;   // zoom d'avant l'arrêt sur une zone (pour y revenir en repartant)
addEventListener('wheel', e => { if (mode === 'walk' && !wheelOnUI(e)) setZoom(camZoom * Math.exp(Math.sign(e.deltaY) * 0.12)); }, { passive: true });
{ // pincer à deux doigts sur l'écran
  let d0 = 0, z0 = 1;
  const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  canvas.addEventListener('touchstart', e => { if (mode === 'walk' && e.touches.length === 2) { d0 = dist(e.touches); z0 = camZoom; } }, { passive: true });
  canvas.addEventListener('touchmove', e => { if (mode === 'walk' && e.touches.length === 2 && d0) setZoom(z0 * d0 / dist(e.touches)); }, { passive: true });
  canvas.addEventListener('touchend', () => { d0 = 0; }, { passive: true });
}
const joy = { x: 0, y: 0 };
let padUsed = false, padHintT = 0;   // a-t-on déjà touché au joystick ?
// manette (API Gamepad) : stick gauche ou gâchettes pour conduire, A sauter, B/RB turbo, Y redresser, X ouvrir la zone, Start atterrir/décoller
const gpad = { x: 0, y: 0, boost: false, jump: false, on: false, prev: [] };
let near = null;
const hintEl = $('#hint'), walkBtn = $('#walkBtn'), promptEl = $('#prompt');
/** Aide des commandes : chaque touche en pastille, suivie de son action. */
function setHint() {
  const H = mode === 'orbit'
    ? gpad.on ? [['Stick G', 'tourner la planète'], ['Stick D', 'zoomer'], ['A', 'ouvrir la zone visée'], ['Start', 'atterrir']]
      : touch ? [['Glisser', 'tourner'], ['Pincer', 'zoomer'], ['Toucher', 'ouvrir une zone']] : [['Glisser', 'tourner'], ['Molette', 'zoomer'], ['Clic', 'ouvrir une zone']]
    : gpad.on ? [['Stick / gâchettes', 'conduire'], ['A', 'sauter'], ['B / RB', 'turbo'], ['Y', 'redresser'], ['X', 'ouvrir la zone'], ['Start', 'décoller']]
      : touch ? [['Joystick', 'conduire'], ['Turbo', 'accélérer'], ['Cercle', 'roule dedans pour ouvrir la zone']]
        : [['ZQSD / ↑↓←→', 'conduire'], ['Maj', 'turbo'], ['Espace', 'sauter'], ['R', 'redresser'], ['Molette', 'recul'], ['E', 'ouvrir la zone']];
  let closed = false; try { closed = localStorage.getItem('planete-aide-fermee') === '1'; } catch (e) { /* rien */ }
  hintEl.innerHTML = closed ? '' : H.map(([k, t]) => `<span class="it"><span class="k">${k}</span>${t}</span>`).join('')
    + (touch ? '' : '<span class="it"><span class="k">H</span>masquer</span>') + '<button class="x" type="button" aria-label="Fermer l’aide des commandes" title="Fermer (H pour la rouvrir)">×</button>';
  // sur écran tactile, l'aide s'efface après quelques secondes (elle masquerait la scène)
  hintEl.classList.remove('fade'); clearTimeout(setHint.t);
  if (touch) setHint.t = setTimeout(() => hintEl.classList.add('fade'), 8000);
}
// fermer l'aide (croix) ; la touche H la rouvre ou la referme
const toggleHint = close => { try { if (close) localStorage.setItem('planete-aide-fermee', '1'); else localStorage.removeItem('planete-aide-fermee'); } catch (e) { /* rien */ } setHint(); };
hintEl.addEventListener('click', e => { if (e.target.closest('.x')) { e.stopPropagation(); toggleHint(true); } });
addEventListener('keydown', e => { if ((e.key === 'h' || e.key === 'H') && !(e.target.closest && e.target.closest('input, textarea'))) toggleHint(hintEl.innerHTML !== ''); });
let hasLanded = false;
/** Au bout de 15 s sans avoir atterri, le bouton « Atterrir » vient au centre de l'écran. */
function nudgeLanding() { if (!hasLanded && mode === 'orbit') { document.body.classList.add('nudge'); walkBtn.textContent = 'Atterrir et prendre le volant'; } }
/* ---------- monde à l'envers ---------- */
// les objets renversables s'envolent lentement et flottent à des hauteurs variées, en tournant doucement sur eux-mêmes ;
// le van peut les percuter : ils partent en flottant, tournoient, puis reviennent lentement à leur place
let lev = null; const levQ = new THREE.Quaternion(), levU = new THREE.Vector3(), levR = new THREE.Vector3(), levD = new THREE.Vector3();
function levitate(t, dt) {
  if (!zones) return;
  if (upside.on) {
    if (!lev) lev = zones.bodies.list.map(b => ({ b, p: b.mesh.position.clone(), q: b.mesh.quaternion.clone(), h: 0.35 + Math.random() * 1.9, d: Math.random() * 5, r: 6 + Math.random() * 6,
      ph: Math.random() * 6.28, ax: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(), w: (0.06 + Math.random() * 0.16) * (Math.random() < 0.5 ? -1 : 1), t0: t,
      off: new THREE.Vector3(), vel: new THREE.Vector3(), rq: new THREE.Quaternion(), av: new THREE.Vector3(), cool: 0 }));
    const van = avatar.userData.vanOn && mode === 'walk', sp = Math.abs(P.speed), vUp = levD.copy(avatar.position).normalize().clone();
    for (const o of lev) {
      const k = Math.max(0, Math.min(1, (t - o.t0 - o.d) / o.r)), e = k * k * (3 - 2 * k);
      levU.copy(o.p).normalize();
      // dérive après un choc : un ressort très doux ramène l'objet
      if (o.vel.lengthSq() > 1e-6 || o.off.lengthSq() > 1e-6) {
        o.vel.addScaledVector(o.off, -0.35 * dt).multiplyScalar(Math.exp(-dt * 0.7)); o.off.addScaledVector(o.vel, dt);
        const lift = e * o.h + o.off.dot(levU); if (lift < 0.15) o.off.addScaledVector(levU, 0.15 - lift);   // jamais sous le sol
      }
      if (o.av.lengthSq() > 1e-6) { const a = o.av.length(); o.rq.premultiply(levQ.setFromAxisAngle(levR.copy(o.av).divideScalar(a), a * dt)); o.av.multiplyScalar(Math.exp(-dt * 0.45)); }
      o.b.mesh.position.copy(o.p).addScaledVector(levU, e * (o.h + Math.sin(t * 0.55 + o.ph) * 0.12)).add(o.off);
      o.b.mesh.quaternion.copy(o.rq).multiply(o.q).multiply(levQ.setFromAxisAngle(o.ax, e * ((t - o.t0 - o.d) * o.w + Math.sin(t * 0.4 + o.ph) * 0.25)));
      // choc avec le van (une capsule le long de la caisse, à hauteur de la carrosserie)
      if ((o.cool -= dt) > 0 || !van || sp < 0.4) continue;
      const rel = levR.copy(o.b.mesh.position).sub(avatar.position), hgt = rel.dot(vUp);
      if (hgt < -0.3 || hgt > 1.25) continue;
      rel.addScaledVector(vUp, -hgt); const along = Math.max(-0.8, Math.min(0.8, rel.dot(P.fwd))); rel.addScaledVector(P.fwd, -along);
      const dist = rel.length(); if (dist > o.b.r + 0.42) continue;
      if (dist > 1e-4) rel.divideScalar(dist); else rel.copy(P.mv);
      rel.addScaledVector(P.mv, Math.sign(P.speed) * 0.8).normalize();
      o.vel.addScaledVector(rel, sp * 0.95).addScaledVector(vUp, sp * 0.35);
      o.av.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(1 + sp * 0.7);
      o.cool = 0.4; P.speed *= 0.85; audio.impact(Math.min(4, sp * 0.6), 0, 'bois');
    }
  } else if (lev) { for (const o of lev) { o.b.mesh.position.copy(o.p); o.b.mesh.quaternion.copy(o.q); } lev = null; }
}
// les trois quarts des arbres disparaissent dans le monde à l'envers
const setTreeShare = k => planet.treeMeshes.forEach(([w, l, n]) => { w.count = l.count = Math.floor(n * TUNE.arbres.densite * k); });
/** Entrer dans un clin d'œil (E.T., Mario) : on change de véhicule, le monde change autour. */
function enterEgg(e) {
  if (upside.on) exitUpside(false);
  if (egg) exitEgg(false);
  if (mode !== 'walk') setWalk(true);
  if (PL.on) stopPlane();
  eggHour = ambience.state.hour;
  const s = e.enter(); egg = e;
  avatar.userData.setRide(e.ride); setTreeShare(e.trees ?? 1);
  P.dir.copy(s.dir); P.fwd.copy(s.fwd); P.mv.copy(s.fwd); camF.copy(s.fwd);
  P.r = driveR(P.dir); P.vr = 0; P.speed = 0; P.ground = true; P.ax = P.az = P.wx = P.wz = 0; P.recover = null;
  nearProp = null; promptEl.classList.remove('on');
  audio.start(); audio.sfx(e.id === 'mario' ? 'pipe' : 'pick'); audio.theme(e.music);
}
/** Fin du clin d'œil : la Jeep revient, l'heure aussi ; on la pose à l'arrivée (sauf en quittant le sol). */
function exitEgg(here = true) {
  if (!egg) return;
  const e = egg; egg = null;
  e.reset(here);
  avatar.userData.setRide('jeep'); avatar.scale.setScalar(1); setTreeShare(1);
  P.jumpV = 0; P.eggSpeed = 1; carBody.r = 0.42;
  ambience.state.hour = eggHour; ambience.state.target = null;
  audio.theme(null);
  if (here) { P.dir.copy(e.exitDir).addScaledVector(P.fwd, 1.8 / SEA_R).normalize(); P.r = driveR(P.dir); P.speed = 0; P.vr = 0; P.ground = true; camF.copy(P.fwd); }
}
function enterUpside() {
  if (egg) exitEgg(false);
  if (mode !== 'walk') setWalk(true);
  if (PL.on) stopPlane();
  upHour = ambience.state.hour;
  const s = upside.enter();
  avatar.userData.setVan(true); setTreeShare(0.25);
  P.dir.copy(s.dir); P.fwd.copy(s.fwd); P.mv.copy(s.fwd); camF.copy(s.fwd);
  P.r = driveR(P.dir); P.vr = 0; P.speed = 0; P.ground = true; P.ax = P.az = P.wx = P.wz = 0; P.recover = null;
  nearVan = false; promptEl.classList.remove('on');
  audio.start(); audio.impact(1.5, 0, 'lourd');
}
/** Retour à la réalité : la Jeep revient, l'heure aussi ; on ressort juste derrière le portail (sauf en quittant le sol). */
function exitUpside(here = true) {
  if (!upside.on) return;
  upside.reset(here);
  avatar.userData.setVan(false); setTreeShare(1);
  ambience.state.hour = upHour; ambience.state.target = null;
  audio.radio(0.016, false, 0);
  if (here) { P.dir.copy(upside.gateDir).addScaledVector(P.fwd, 1.4 / SEA_R).normalize(); P.r = driveR(P.dir); P.speed = Math.min(Math.abs(P.speed), 2); P.vr = 0; }
}
function setWalk(on) {
  if (!on && upside.on) exitUpside(false);
  if (!on && egg) exitEgg(false);   // décoller ou ouvrir le menu des zones fait aussi revenir à la réalité
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
    stopPlane(); sunT.set(0, 0, 0);   // le soleil sera replacé de trois quarts derrière la voiture
    mode = 'walk'; controls.enabled = false; controls.autoRotate = false; camAnim = null; avatar.visible = true;
    hasLanded = true; document.body.classList.remove('nudge');
    // téléphone : si le joystick n'a pas servi au bout de 5 s, on montre comment s'en servir
    clearTimeout(padHintT); if (touch && !padUsed) padHintT = setTimeout(() => { if (mode === 'walk' && !padUsed) document.body.classList.add('pad-hint'); }, 5000);
    walkBtn.textContent = 'Décoller'; document.body.classList.add('walking'); closePanel();
  } else {
    mode = 'orbit';
    startPlane();   // la voiture devient biplan et s'envole ; la caméra la suit puis prend du recul
    if (reduce) { endPlaneCam(); camera.position.copy(P.dir).multiplyScalar(SEA_R + 50); controls.update(); }
    clearTimeout(padHintT); document.body.classList.remove('pad-hint');
    walkBtn.textContent = 'Atterrir'; document.body.classList.remove('walking'); promptEl.classList.remove('on'); near = null;
  }
  setHint();
}
walkBtn.addEventListener('click', () => setWalk(mode !== 'walk'));
/** Quitter un clin d'œil à tout moment (bouton ou Échap) : on retrouve la Jeep, posée au sol là où l'on est. */
function quitEgg() {
  if (!upside.on && !egg) return;
  if (upside.on) exitUpside(false); if (egg) exitEgg(false);
  avatar.visible = true; avatar.scale.setScalar(1);
  P.fwd.addScaledVector(P.dir, -P.fwd.dot(P.dir)).normalize(); P.mv.copy(P.fwd); camF.copy(P.fwd);
  P.r = driveR(P.dir); P.vr = 0; P.speed = 0; P.ground = true; P.ax = P.az = P.wx = P.wz = 0; P.recover = null;
}
$('#quitBtn')?.addEventListener('click', e => { e.stopPropagation(); quitEgg(); });
addEventListener('keydown', e => { if (e.key === 'Escape' && (upside.on || egg)) quitEgg(); });
promptEl.addEventListener('click', () => { if (nearProp) useIt(nearProp); else if (near) openIsland(near.id); });

const DRIVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
addEventListener('keydown', e => {
  if (mode === 'walk' && panel.classList.contains('on') && DRIVE_KEYS.includes(e.code)) closePanel();   // la voiture repart : la fiche se ferme
  if (mode !== 'walk' || panel.classList.contains('on')) return;
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (aim) { if (e.code === 'Escape') endAim(false); else if ((e.code === 'Space' || e.code === 'KeyE') && !e.repeat) chargeAim(); else keys.add(e.code); return; }
  if (e.code === 'KeyE' && nearProp) { useIt(nearProp); return; }
  if (e.code === 'KeyE' && near) { openIsland(near.id); return; }
  if (e.code === 'KeyR') { recoverCar(); return; }
  keys.add(e.code);
});
addEventListener('keyup', e => { keys.delete(e.code); if (aim && (e.code === 'Space' || e.code === 'KeyE')) releaseAim(); });
addEventListener('blur', () => keys.clear());

// joystick tactile
{
  const pad = $('#pad'), knob = pad.querySelector('i'); let id = null;
  const move = e => { const r = pad.getBoundingClientRect(); let x = (e.clientX - r.left) / r.width * 2 - 1, y = (e.clientY - r.top) / r.height * 2 - 1; const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } joy.x = x; joy.y = -y; knob.style.transform = 'translate(' + x * 34 + 'px,' + y * 34 + 'px)'; };
  pad.addEventListener('pointerdown', e => { padUsed = true; if (panel.classList.contains('on')) closePanel(); document.body.classList.remove('pad-hint'); id = e.pointerId; try { pad.setPointerCapture(id); } catch (er) { /* rien */ } move(e); });
  pad.addEventListener('pointermove', e => { if (e.pointerId === id) move(e); });
  const end = () => { id = null; joy.x = joy.y = 0; knob.style.transform = ''; };
  pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
  const jb = $('#jumpBtn');
  jb?.addEventListener('pointerdown', e => { e.preventDefault(); keys.add('Space'); jb.setPointerCapture(e.pointerId); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => jb?.addEventListener(ev, () => keys.delete('Space')));
  const bb = $('#boostBtn');
  bb?.addEventListener('pointerdown', e => { e.preventDefault(); boostTouch = true; bb.setPointerCapture(e.pointerId); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => bb?.addEventListener(ev, () => { boostTouch = false; }));
}

const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3(), fq = new THREE.Vector3(), up = new THREE.Vector3(), right = new THREE.Vector3(), basis = new THREE.Matrix4();
const camF = new THREE.Vector3(), nUp = new THREE.Vector3(), tiltQ = new THREE.Quaternion(), ZONE_COS = Math.cos(1.15 / SEA_R);
function groundAt(dir, along, side) { return driveR(tmpB.copy(dir).addScaledVector(P.fwd, along / P.r).addScaledVector(right, side / P.r).normalize()); }
function stepWalk(dt) {
  const k = c => keys.has(c);
  const busy = panel.classList.contains('on') || !!aim || (P.tumble && P.ground) || P.flipped || !!P.recover;   // en l'air on garde la main ; couchée au sol, non   // sur le toit : on ne conduit plus
  const throttle = busy ? 0 : Math.max(-1, Math.min(1, (k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0) + joy.y + gpad.y));
  P.throttle = throttle;
  const steerIn = busy ? 0 : Math.max(-1, Math.min(1, (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0) + joy.x + gpad.x));
  if (!busy && (k('Space') || gpad.jump) && P.ground) { P.vr = Math.max(P.vr, 0) + (P.jumpV || CAR.saut); P.ground = false; takeoff(); }   // le kart saute pour de bon
  const boostOn = !busy && (k('ShiftLeft') || k('ShiftRight') || boostTouch || gpad.boost) && throttle > 0;

  // sur l'eau la voiture devient aéroglisseur : elle file, dérive dans les virages et tourne sur place
  // le van WSQK ne se transforme pas : dans le monde à l'envers l'eau est une nappe noire figée, il roule dessus et glisse comme sur la glace
  // le BMX survole l'eau (comme par magie), le kart glisse dessus
  const wet = planet.heightDir(P.dir) < WATER_R - 0.03 && P.r < WATER_R + 0.2, vanOn = avatar.userData.ride !== 'jeep'; P.wet = wet;
  const onWater = wet && !vanOn, onIce = wet && vanOn;
  P.hover = Math.max(0, Math.min(1, P.hover + (onWater ? 1 : -1) * dt / (vanOn ? 0.15 : 0.55)));
  P.t += dt;
  const hv = P.hover;
  P.boost += ((boostOn ? 1 : 0) - P.boost) * (1 - Math.exp(-dt * 6));   // turbo : plus vite, plus nerveux
  const vmax = (CAR.vitesse - 0.7 * hv) * (1 + CAR.turbo * P.boost) * (onIce ? 0.8 : 1) * (P.eggSpeed || 1);
  if (throttle && !(throttle > 0 && P.speed >= vmax)) P.speed += throttle * (Math.sign(throttle) !== Math.sign(P.speed) && Math.abs(P.speed) > 0.2 ? 16 - 9 * hv : (CAR.acceleration - 2 * hv) * (1 + 0.9 * P.boost)) * dt * (P.ground ? 1 : 0.5);
  else if (!throttle) P.speed *= Math.exp(-dt * (P.ground ? (onIce ? 0.5 : 2.2 - 1.6 * hv) : 0.15));   // en l'air, l'élan se conserve
  if (P.speed > vmax) P.speed -= (P.speed - vmax) * (1 - Math.exp(-dt * 3));   // le turbo relâché : on ralentit en douceur
  P.speed = Math.max(-vmax * 0.5, P.speed);
  P.steer += (steerIn - P.steer) * (1 - Math.exp(-dt * 10));
  up.copy(P.dir);
  const grip = Math.min(1, Math.abs(P.speed) / 2) * Math.sign(P.speed || 1);
  const turn = !P.ground ? 0.4 : hv > 0.5 ? (Math.abs(P.speed) > 0.3 ? grip : 0.7) * 1.15 : grip;   // en l'air, on braque librement   // l'aéroglisseur pivote même à l'arrêt
  if (Math.abs(P.speed) > 0.05 || hv > 0.5 || !P.ground) P.fwd.applyAxisAngle(up, -P.steer * CAR.braquage * dt * turn * (1 - 0.3 * P.boost));
  right.crossVectors(up, P.fwd).normalize();
  // direction du mouvement : collée au capot sur terre, en retard sur l'eau (dérive)
  P.mv.lerp(P.fwd, 1 - Math.exp(-dt * (onIce ? 2.2 : 30 - 28.6 * hv))); P.mv.addScaledVector(up, -P.mv.dot(up)).normalize();
  const rPrev = P.r;
  if (P.speed) {
    const axis = tmpA.crossVectors(P.dir, P.mv).normalize();
    const next = tmpB.copy(P.dir).applyAxisAngle(axis, P.speed * dt / P.r).normalize();
    // garde-corps des ponts : on glisse le long, on ne passe pas au travers
    const cb = planet.bridgeAt(P.dir), latCur = cb && P.r > cb.top - 0.3 ? cb.lat : 9;
    const nb = planet.bridgeAt(next);
    if (nb && P.r > nb.top - 0.3 && nb.th > nb.b.t0 + 0.3 / SEA_R && nb.th < nb.b.t1 - 0.3 / SEA_R) {
      if (Math.abs(latCur) <= 1.05 && Math.abs(nb.lat) > RAIL) {
        const e = nb.b.e, th = nb.th, sd = Math.sign(nb.lat);
        const tg = e.point(th + 0.3 / SEA_R).sub(e.point(th - 0.3 / SEA_R)).normalize(); if (tg.dot(P.fwd) * Math.sign(P.speed || 1) < 0) tg.negate();
        next.copy(e.point(th, sd * RAIL));
        P.fwd.lerp(tg.multiplyScalar(Math.sign(P.speed || 1)), 0.2).normalize(); P.mv.copy(P.fwd);
        P.speed *= 0.97;
      } else if (Math.abs(latCur) > 1.05 && Math.abs(nb.lat) <= 1.05) { next.copy(P.dir); P.speed *= -0.3; }
    }
    // le van WSQK ne va pas sur l'eau : des barrières en bois entourent les berges (les ponts restent ouverts)
    if (avatar.userData.vanOn) {
      // le bout du van (avant ou arrière selon le sens) et ses deux coins : contre une barrière, ou au bord de l'eau là où il n'y en a pas
      const sg = Math.sign(P.speed), sideV = tmpC.crossVectors(next, P.mv).normalize();
      let hit = false;
      for (const lat of [0, -0.38, 0.38]) {
        const q = fq.copy(next).addScaledVector(P.mv, sg * (sg > 0 ? VAN_LEN.front : VAN_LEN.rear) / SEA_R).addScaledVector(sideV, lat / SEA_R).normalize();
        if (upside.fenceHit(q.multiplyScalar(planet.heightDir(q) + 0.2), 0.1)) { hit = true; break; }   // le pare-chocs vient au contact de la clôture (sans marge : sinon on croit à un mur invisible)
      }
      const nose = fq.copy(next).addScaledVector(P.mv, sg * 1.25 / SEA_R).normalize();
      if (!hit && planet.heightDir(nose) < WATER_R + 0.02 && upside.bigWater(nose)) { const nbv = planet.bridgeAt(nose); hit = !(nbv && Math.abs(nbv.lat) < 1.1 && P.r > nbv.top - 0.5); }   // (les flaques se traversent)
      if (hit) { next.copy(P.dir); if (Math.abs(P.speed) > 1.5) audio.impact(Math.abs(P.speed) * 0.5, 0, 'bois'); P.speed *= -0.25; }
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
  hitTrunks(dt);
  const g = driveR(P.dir);
  if (P.ground) {
    // au sol : on suit le relief tant qu'il ne se dérobe pas plus vite que la gravité ; sinon la voiture décolle (bosses, crêtes, rampes)
    const free = rPrev + P.vr * dt - 0.5 * CAR.gravite * dt * dt;
    if (g >= free - 0.012) { const v = (g - rPrev) / Math.max(dt, 1e-3); P.vr += (Math.max(-12, Math.min(12, v)) - P.vr) * 0.6; P.r = g; }
    else { P.ground = false; P.r = free; P.vr -= CAR.gravite * dt; takeoff(); }
  } else { P.vr -= CAR.gravite * dt; P.r += P.vr * dt; }
  P.airT = P.ground ? 0 : P.airT + dt;
  // en l'air : la voiture garde sa rotation de décollage ; on peut la corriger (avant/arrière, gauche/droite)
  if (!P.ground && !P.recover) {
    const kk = c => keys.has(c);
    const ap = (kk('KeyW') || kk('ArrowUp') ? 1 : 0) - (kk('KeyS') || kk('ArrowDown') ? 1 : 0) + joy.y + gpad.y, ar = (kk('KeyD') || kk('ArrowRight') ? 1 : 0) - (kk('KeyA') || kk('ArrowLeft') ? 1 : 0) + joy.x + gpad.x;
    P.wx += ap * 5.5 * dt; P.wz -= ar * 5.5 * dt;   // en l'air : avant/arrière = tangage, gauche/droite = roulis   // avant/arrière : piquer ou cabrer ; gauche/droite : on tourne (et un soupçon de roulis)
    P.ax += P.wx * dt; P.az += P.wz * dt;
  }
  if (!P.ground && P.r <= g) { land(hv); if (P.vr < -1.5) { P.sus.vy += P.vr * 0.07; P.sus.vp += P.vr * 0.05 * Math.sign(P.speed || 1); } P.r = g; P.vr = 0; P.ground = true; }   // atterrissage : la caisse s'écrase sur ses ressorts

  // la voiture épouse le relief (tangage et roulis)
  up.copy(P.dir); right.crossVectors(up, P.fwd).normalize();
  const hf = groundAt(P.dir, 0.45, 0), hb = groundAt(P.dir, -0.45, 0), hr = groundAt(P.dir, 0, 0.37), hl = groundAt(P.dir, 0, -0.37);
  const clampS = v => Math.max(-0.45, Math.min(0.45, v));   // au bord d'un pont, une roue au-dessus du vide ne retourne pas la voiture
  // pentes lissées : pas d'à-coups quand le sol change brusquement (bord de route, entrée de pont)
  const sf0 = P.sf, sr0 = P.sr;
  P.sf += (clampS((hf - hb) / 0.9) - P.sf) * (1 - Math.exp(-dt * 14)); P.sr += (clampS((hr - hl) / 0.74) - P.sr) * (1 - Math.exp(-dt * 14));
  if (P.ground) { P.sfRate += ((P.sf - sf0) / Math.max(dt, 1e-3) - P.sfRate) * 0.5; P.srRate += ((P.sr - sr0) / Math.max(dt, 1e-3) - P.srRate) * 0.5; }
  updateFlip(dt);
  nUp.copy(up).addScaledVector(P.fwd, -P.sf).addScaledVector(right, -P.sr).normalize();
  if (Math.abs(P.r - P.rv) > 0.6) P.rv = P.r; else P.rv += (P.r - P.rv) * (1 - Math.exp(-dt * 28));
  basis.makeBasis(right, up, P.fwd); avatar.quaternion.setFromRotationMatrix(basis);
  tiltQ.setFromUnitVectors(up, P.ground ? nUp : up); avatar.quaternion.premultiply(tiltQ);
  // rotation propre (vol, tonneaux, voiture sur le flanc ou le toit), autour du centre de la caisse
  flipQ.setFromEuler(flipE.set(P.ax, 0, P.az)); avatar.quaternion.multiply(flipQ);
  avatar.position.copy(P.dir).multiplyScalar(P.rv);
  { const dev = 1 - flipV.set(0, 1, 0).applyQuaternion(flipQ).y, L = 0.42;   // 0 debout, 2 sur le toit
    if (dev > 0.01) avatar.position.sub(flipV.set(0, L, 0).applyQuaternion(avatar.quaternion).sub(tmpB.copy(up).multiplyScalar(L)).multiplyScalar(Math.min(1, dev * 1.4)));
    if (P.recover) avatar.position.addScaledVector(up, Math.sin(Math.PI * Math.min(1, P.recover.t)) * 0.9); }
  P.spin += P.speed * dt / 0.2; P.odo += Math.abs(P.speed) * dt;
  avatar.userData.wheels.forEach(w => { w.w.rotation.x = P.spin; if (w.front) w.pivot.rotation.y = -P.steer * 0.45; });
  // suspensions : chaque roue suit le sol sous elle, la caisse flotte sur ses ressorts
  const S2 = P.sus, slopeF = P.sf, slopeR = P.sr;
  const rough = P.ground ? Math.min(1, Math.abs(P.speed) / 3) * (planet.pathDir(P.dir) > 0.5 ? 0.45 : 1) : 0;
  avatar.userData.wheels.forEach((w, i) => {
    const gw = groundAt(P.dir, w.along, w.side * 0.37), plane = P.rv + slopeF * w.along + slopeR * w.side * 0.37;
    let tgt = P.ground || P.airT < 0.12 ? Math.max(-0.1, Math.min(0.1, gw - plane)) : -0.08;   // en l'air, les roues pendent
    tgt += rough * 0.02 * Math.sin(P.odo * 9 + i * 1.7) * Math.sin(P.odo * 3.1 + i * 2.3);   // cahots
    spring(S2.wy, i, S2.wv, i, tgt, 900 * CAR.raideur, 42 * Math.sqrt(CAR.raideur), dt);
  });
  P.acc += ((P.speed - P.lastSpeed) / Math.max(dt, 1e-3) - P.acc) * (1 - Math.exp(-dt * 8)); P.lastSpeed = P.speed;
  {
    const wy = S2.wy, front = (wy[0] + wy[1]) / 2, rear = (wy[2] + wy[3]) / 2, left = (wy[0] + wy[2]) / 2, rgt = (wy[1] + wy[3]) / 2, spd = Math.min(1, Math.abs(P.speed) / 5);
    spring(S2, 'y', S2, 'vy', (front + rear) / 2 * 0.7 - (P.ground || P.airT < 0.12 ? 0 : 0.03), 170 * CAR.raideur, 9 * Math.sqrt(CAR.raideur), dt);
    spring(S2, 'pitch', S2, 'vp', -(front - rear) / 0.76 * 0.6 - Math.max(-0.12, Math.min(0.12, P.acc * 0.011)), 150, 8, dt);   // le nez se cabre à l'accélération, plonge au freinage
    spring(S2, 'roll', S2, 'vr', (rgt - left) / 0.74 * 0.6 - P.steer * spd * 0.09, 150, 8, dt);                              // la caisse penche dans les virages
  }
  // ventilateur : tourne vite quand on accélère ; la coque tangue doucement sur la houle
  P.fan += dt * (10 + Math.abs(throttle) * 26 + Math.abs(P.speed) * 2) * hv;
  const bob = hv * (P.ground ? 1 : 0);
  avatar.position.addScaledVector(up, bob * 0.035 * Math.sin(P.t * 2.6));
  const pitch = S2.pitch * (1 - hv) + bob * (0.03 * Math.sin(P.t * 2.3 + 1) - 0.05 * Math.max(0, throttle) * Math.min(1, Math.abs(P.speed) / 3));
  const roll = S2.roll * (1 - hv) + bob * (0.04 * Math.sin(P.t * 1.9) - P.steer * Math.min(1, Math.abs(P.speed) / 5) * 0.16);
  const bmx = avatar.userData.ride === 'bmx', boostFx = bmx ? 0 : P.boost;   // le vélo n'a ni flammes ni traînée de turbo, ni traces de pneus
  avatar.userData.pose(hv, P.fan, S2.wy, S2.y, pitch, roll, boostFx, P.t);
  // traînées du turbo : elles partent de la sortie des échappements, dans l'axe des flammes (suspensions, tangage et roulis compris)
  avatar.updateMatrixWorld(true);
  const fl = avatar.userData.flames;
  fl[0].localToWorld(trailHeads[0].set(0, 0, 0)); fl[1].localToWorld(trailHeads[1].set(0, 0, 0));
  trailSide.subVectors(trailHeads[1], trailHeads[0]).normalize();
  trails.update(dt, trailHeads, trailSide, boostFx * (1 - hv) * (P.ground || P.airT < 0.2 ? 1 : 0.5));
  // nénuphars bousculés par la vague du véhicule
  planet.updatePads(dt, avatar.position, P.speed);
  // l'herbe se couche sous les pneus
  if (P.ground && hv < 0.5 && Math.abs(P.speed) > 0.05) {
    avatar.updateMatrixWorld(true);
    avatar.userData.wheels.forEach((w, i) => avatar.localToWorld(crushPts[i].set(w.side * 0.37, 0, w.along)));
    planet.crushGrass(crushPts, 0.2, planet.waterUniforms.uTime.value + 0.001);
  }
  // les lupins se couchent au passage du véhicule (voiture ou aéroglisseur), à l'opposé de lui
  if (P.ground && Math.abs(P.speed) > 0.3) {
    avatar.updateMatrixWorld(true);
    avatar.userData.wheels.forEach((w, i) => avatar.localToWorld(crushPts[i].set(w.side * 0.37, 0, w.along)));
    lupPts[4].copy(avatar.position);
    for (let i = 0; i < 4; i++) lupPts[i].copy(crushPts[i]);
    planet.crushLupins(lupPts, 0.38 * TUNE.voiture.taille, planet.waterUniforms.uTime.value + 0.001, avatar.position);
  }
  // traces de pneus dans le sable (roues arrière), qui s'effacent doucement
  const tNow = planet.waterUniforms.uTime.value; tracks.uniforms.uTime.value = tNow;
  {
    const onBridge = (() => { const bi = planet.bridgeAt(P.dir); return !!(bi && P.r > bi.top - 0.3); })();
    const rear = avatar.userData.wheels.filter(w => w.along < 0);
    rear.forEach((w, i) => {
      if (i > 1) return;
      avatar.localToWorld(trackPt.set(w.side * 0.37, 0, w.along));
      trackDir.copy(trackPt).normalize();
      const sand = !bmx && P.ground && hv < 0.5 && !onBridge && Math.abs(P.ax) < 0.4 && Math.abs(P.az) < 0.4 ? planet.sandAt(trackDir) : 0;
      if (sand < 0.25) { trackOn[i] = false; return; }
      trackPt.copy(trackDir).multiplyScalar(Math.max(planet.heightDir(trackDir), WATER_R) + 0.025);
      if (!trackOn[i]) { trackLast[i].copy(trackPt); trackOn[i] = true; return; }
      const d = trackPt.distanceTo(trackLast[i]);
      if (d > 0.6) { trackLast[i].copy(trackPt); return; }   // téléportation, saut
      if (d > 0.14) { tracks.add(trackLast[i], trackPt, 0.15, Math.min(1, sand * 1.4), tNow); trackLast[i].copy(trackPt); }
    });
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
  const target = tmpA.copy(avatar.position).addScaledVector(camF, -TUNE.camera.distance * camZoom - 1.4 * P.boost).addScaledVector(up, TUNE.camera.hauteur * camZoom);
  const clear = Math.max(planet.groundRadius(tmpB.copy(target).normalize()), P.r) + 1.2;
  if (target.length() < clear) target.setLength(clear);
  camera.position.lerp(target, 1 - Math.exp(-dt * 5));
  camera.up.copy(up);
  camera.lookAt(tmpB.copy(avatar.position).addScaledVector(up, 0.3).addScaledVector(camF, 0.6));

  // dans un cercle de zone ?
  let best = null, bd = -1; SECTIONS.forEach(s => { const d = s.dir.dot(P.dir); if (d > bd) { bd = d; best = s; } });
  const close = bd > ZONE_COS ? best : null;
  // arrêté sur une zone : la caméra se rapproche au plus près ; en repartant, elle revient au zoom d'avant
  zoneStill = close && Math.abs(P.speed) < 0.35 && P.ground ? zoneStill + dt : 0;
  if (zoneStill > 0.6 && camZoom > 0.56) { if (zoomAuto === null) zoomAuto = camZoom; camZoom += (0.55 - camZoom) * (1 - Math.exp(-dt * 2)); }
  else if (zoomAuto !== null && (!close || Math.abs(P.speed) > 1.2)) { camZoom += (zoomAuto - camZoom) * (1 - Math.exp(-dt * 2.5)); if (Math.abs(camZoom - zoomAuto) < 0.01) { camZoom = zoomAuto; zoomAuto = null; } }
  if (close !== near) {
    near = close;
    promptEl.classList.toggle('on', !!near);
    if (near) promptEl.textContent = (touch ? 'Ouvrir · ' : 'E · Ouvrir ') + near.label;
  }
}

/* ---------- tonneaux : décollage, atterrissage raté, retournement, redressement ---------- */
const flipQ = new THREE.Quaternion(), flipE = new THREE.Euler(), flipV = new THREE.Vector3();
const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));
const clampW = v => Math.max(-7, Math.min(7, v));
/** Au décollage, la voiture garde son inclinaison et la vitesse de rotation du relief (atténuée), rien de plus. */
/* troncs d'arbres : des poteaux solides, la voiture rebondit ou glisse le long */
const TC = 2 / SEA_R, tcells = new Map(), tkey = (x, y, z) => ((Math.floor(x / TC) + 256) * 512 + Math.floor(y / TC) + 256) * 512 + Math.floor(z / TC) + 256;
planet.trunkSpots.forEach(t => { const k = tkey(t.d.x, t.d.y, t.d.z); if (!tcells.has(k)) tcells.set(k, []); tcells.get(k).push(t); });
let trunkCd = 0;
const tOff = new THREE.Vector3(), tVel = new THREE.Vector3();
function hitTrunks(dt) {
  trunkCd -= dt;
  const ts = TREE.uTreeS.value, cx = Math.floor(P.dir.x / TC), cy = Math.floor(P.dir.y / TC), cz = Math.floor(P.dir.z / TC);
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
    const cell = tcells.get(((cx + a + 256) * 512 + cy + b + 256) * 512 + cz + c + 256); if (!cell) continue;
    for (const t of cell) {
      if (t.i >= planet.treeMeshes[t.m][0].count) continue;     // arbre retiré par le réglage de densité
      if (P.r - t.base > t.h * ts) continue;                    // on passe par-dessus
      tOff.copy(P.dir).sub(t.d).multiplyScalar(P.r); tOff.addScaledVector(P.dir, -tOff.dot(P.dir));
      const dist = tOff.length(), min = 0.07 * t.s * ts + 0.4;
      if (dist >= min || dist < 1e-5) continue;
      const n = tOff.divideScalar(dist);
      P.dir.addScaledVector(n, (min - dist) / P.r).normalize();   // on ressort la voiture du tronc
      P.fwd.addScaledVector(P.dir, -P.fwd.dot(P.dir)).normalize(); P.mv.addScaledVector(P.dir, -P.mv.dot(P.dir)).normalize();
      tVel.copy(P.mv).multiplyScalar(P.speed);
      const vn = tVel.dot(n);
      if (vn < 0) {                                              // on fonçait dessus : rebond amorti, on garde la part qui glisse
        tVel.addScaledVector(n, -1.35 * vn);
        P.speed = tVel.dot(P.fwd);
        if (-vn > 1.2 && trunkCd <= 0) {
          trunkCd = 0.3; audio.impact(-vn * 0.9, 0, 'bois');
          if (-vn > 4 && P.ground) { P.vr = Math.min(4, -vn * 0.35); P.ground = false; takeoff(); P.wx += (Math.random() - 0.5) * -vn * 0.4; P.wz += (Math.random() - 0.5) * -vn * 0.4; }   // gros choc : la voiture se soulève
        }
      }
    }
  }
}
/* ---------- biplan : au décollage la voiture se transforme, monte dans le ciel puis fait le tour de la planète ---------- */
const plane = makeBiplane(); plane.visible = false; scene.add(plane);
const PL = { on: false, t: 0, dir: new THREE.Vector3(), fwd: new THREE.Vector3(), r: 0, r0: 0, speed: 0, bank: 0, pitch: 0, cam: 0, roll: 0, follow: false };
const PL_ALT = SEA_R + 9, PL_CAM_T = 4.6, AX = new THREE.Vector3(1, 0, 0), AZ = new THREE.Vector3(0, 0, 1), WY = new THREE.Vector3(0, 1, 0);
const plM = new THREE.Matrix4(), plX = new THREE.Vector3(), plQ = new THREE.Quaternion(), plA = new THREE.Vector3(), plB = new THREE.Vector3(), plFrom = new THREE.Vector3(), plUp = new THREE.Vector3();
const smooth01 = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
function startPlane() {
  PL.on = true; PL.t = 0; PL.dir.copy(P.dir); PL.fwd.copy(P.fwd); PL.r = PL.r0 = P.r + 0.35; PL.speed = Math.max(2.5, Math.abs(P.speed)); PL.bank = PL.pitch = PL.roll = 0;
  PL.cam = 1; controls.enabled = false; controls.autoRotate = false; camAnim = null;
  plFrom.copy(camera.position); plUp.copy(camera.up);
  plane.visible = true; plane.scale.setScalar(0.01);
  audio.impact(2.2, 0, 'sol');
}
function stopPlane() { if (PL.follow) { PL.follow = false; controls.enabled = true; camera.up.set(0, 1, 0); } PL.on = false; PL.cam = 0; plane.visible = false; avatar.scale.setScalar(TUNE.voiture.taille); }
/** Clic sur l'avion : la caméra le prend en chasse ; un glisser, la molette, Échap ou un nouveau clic la rendent. */
function startFollow() { PL.follow = true; PL.cam = 1; camAnim = null; controls.enabled = false; controls.autoRotate = false; }
function stopFollow() {
  if (!PL.follow) return;
  PL.follow = false; PL.cam = 0; controls.enabled = true;
  flyTo(camera.position.clone().normalize(), SEA_R + 40, 1300);   // recule en douceur jusqu'à la vue de la planète
}
function followCamera(dt) {
  const k = 1 - Math.exp(-dt * 3);
  plA.copy(plane.position).addScaledVector(PL.fwd, -6).addScaledVector(PL.dir, 2.4);
  camera.position.lerp(plA, k);
  camera.up.lerp(PL.dir, k).normalize();
  camera.lookAt(plB.copy(plane.position).addScaledVector(PL.fwd, 2));
}
function endPlaneCam() { PL.cam = 0; controls.enabled = true; camera.up.set(0, 1, 0); controls.update(); }
function updatePlane(dt) {
  if (!PL.on) return;
  const T = (PL.t += dt);
  // altitude : quelques mètres de roulage, montée jusqu'à l'orbite, puis de lentes ondulations
  const rise = smooth01((T - 0.5) / 3.6);
  const target = PL.r0 + (PL_ALT - PL.r0) * rise + Math.sin(T * 0.55) * 1.1 * smooth01((T - 4.5) / 3);
  const vr = (target - PL.r) / Math.max(dt, 1e-3); PL.r = target;
  PL.speed += ((T < 4 ? 9 : 7) - PL.speed) * (1 - Math.exp(-dt * 1.1));
  // cap : de larges virages qui changent sans cesse
  const turn = (Math.sin(T * 0.17) * 0.24 + Math.sin(T * 0.41 + 1) * 0.12) * smooth01((T - 3) / 2);
  PL.fwd.applyAxisAngle(PL.dir, turn * dt);
  const axis = plA.crossVectors(PL.dir, PL.fwd).normalize(), ang = PL.speed * dt / PL.r;
  PL.dir.applyAxisAngle(axis, ang).normalize(); PL.fwd.applyAxisAngle(axis, ang); PL.fwd.addScaledVector(PL.dir, -PL.fwd.dot(PL.dir)).normalize();
  PL.bank += (-turn * 2.4 - PL.bank) * (1 - Math.exp(-dt * 2));
  PL.pitch += (Math.atan2(vr, PL.speed) - PL.pitch) * (1 - Math.exp(-dt * 4));
  // un tonneau de joie une fois en haut
  PL.roll = T > 5 && T < 6.6 ? smooth01((T - 5) / 1.6) * Math.PI * 2 : 0;
  plX.crossVectors(PL.dir, PL.fwd).normalize();
  plM.makeBasis(plX, PL.dir, PL.fwd); plane.quaternion.setFromRotationMatrix(plM);
  plane.quaternion.multiply(plQ.setFromAxisAngle(AX, -PL.pitch)).multiply(plQ.setFromAxisAngle(AZ, PL.bank + PL.roll));
  plane.position.copy(PL.dir).multiplyScalar(PL.r).addScaledVector(PL.dir, Math.sin(T * 2.3) * 0.05 * rise);
  // transformation : la voiture rapetisse en tournant, l'avion grandit (et grossit un peu en altitude, pour rester lisible de loin)
  const k = smooth01(T / 0.5);
  avatar.visible = k < 1; avatar.scale.setScalar(Math.max(0.001, 1 - k) * TUNE.voiture.taille); avatar.rotateY(dt * 9 * (1 - k));
  plane.scale.setScalar(Math.max(0.01, k) * (1 + 1.1 * rise));
  plane.userData.prop.rotation.z += dt * (20 + 30 * k);
}
/** Caméra du décollage : de la poursuite derrière l'avion jusqu'à la vue de la planète entière. */
function planeCamera() {
  const T = PL.t, a = smooth01(T / 1.1), b = smooth01((T - 1.4) / (PL_CAM_T - 1.4));
  const chase = plA.copy(plane.position).addScaledVector(PL.fwd, -6).addScaledVector(PL.dir, 2.6);
  chase.lerpVectors(plFrom, chase, a);
  const far = plB.copy(PL.dir).multiplyScalar(SEA_R + 50);
  camera.position.lerpVectors(chase, far, b);
  camera.up.copy(plUp).lerp(PL.dir, a).lerp(WY, b); if (camera.up.lengthSq() < 1e-4) camera.up.copy(WY); camera.up.normalize();
  camera.lookAt(plA.copy(plane.position).multiplyScalar(1 - b));
  if (T >= PL_CAM_T) endPlaneCam();
}
function takeoff() {
  P.ax = wrapA(P.ax - Math.atan(P.sf)); P.az = wrapA(P.az + Math.atan(P.sr));
  P.wx = clampW(P.wx - P.sfRate * 0.6); P.wz = clampW(P.wz + P.srRate * 0.6);
}
/** À l'atterrissage : on repasse dans le repère du sol ; c'est ensuite la gravité qui décide (elle se redresse ou elle bascule). */
function land(hv) {
  if (P.vr < -2) audio.impact(-P.vr * 0.9, 0, hv > 0.5 ? 'sol' : 'lourd');   // la caisse retombe
  P.ax = wrapA(P.ax + Math.atan(P.sf)); P.az = wrapA(P.az - Math.atan(P.sr));
  if (hv > 0.5 || P.recover) { P.wx = P.wz = 0; }
}
// faces stables : roulis 0 (roues), ±90° (flanc), 180° (toit) ; tangage 0 ou 180°. Basculement : 41° de côté, 52° d'avant en arrière.
const TIP_R = 0.72, TIP_R2 = Math.PI / 2 + 0.85, TIP_P = 0.9;
const restRoll = t => { const a = Math.abs(t), s = Math.sign(t) || 1; return a < TIP_R ? 0 : a < TIP_R2 ? s * Math.PI / 2 : s * Math.PI; };
const restPitch = t => (Math.abs(t) < TIP_P ? 0 : (Math.sign(t) || 1) * Math.PI);
const flipBtn = $('#flipBtn');
function updateFlip(dt) {
  if (P.recover) {
    // on la remet sur ses roues : petit saut, elle pivote et retombe droite
    const R2 = P.recover; R2.t += dt / 0.9; const k = Math.min(1, R2.t), e = k * k * (3 - 2 * k);
    P.ax = R2.ax0 * (1 - e); P.az = R2.az0 * (1 - e);
    if (R2.t >= 1) { P.recover = null; P.ax = P.az = P.wx = P.wz = 0; }
  } else if (!P.ground) {
    P.wx *= Math.exp(-dt * 1.1); P.wz *= Math.exp(-dt * 1.1);   // la rotation ralentit quand on lâche les touches
  } else if (P.hover > 0.5) {
    P.ax *= Math.exp(-dt * 6); P.az *= Math.exp(-dt * 6); P.wx = P.wz = 0;   // sur l'eau, la jupe la garde à plat
  } else {
    // au sol : la gravité ramène vers la face stable la plus proche ; le contact freine la rotation
    P.ax = wrapA(P.ax); P.az = wrapA(P.az);
    const K = CAR.gravite * 2.2, c = 2 * Math.sqrt(K) * 0.45, sx = restPitch(P.ax), sz = restRoll(P.az);
    const dz0 = P.az - sz, dx0 = P.ax - sx;
    P.wx += (-K * Math.sin(dx0) - c * P.wx) * dt; P.wz += (-K * Math.sin(dz0) - c * P.wz) * dt;
    P.ax += P.wx * dt; P.az += P.wz * dt;
    // en roulant, chaque face qui tape le sol coûte de l'énergie et fait rebondir la caisse
    if (Math.sign(P.az - sz) !== Math.sign(dz0) && Math.abs(P.wz) > 2.5) { audio.impact(Math.abs(P.wz) * 1.4, 0, 'lourd'); P.wz *= 0.6; P.vr = Math.min(3, Math.abs(P.wz) * 0.2); P.ground = false; }
    if (Math.sign(P.ax - sx) !== Math.sign(dx0) && Math.abs(P.wx) > 2.5) { audio.impact(Math.abs(P.wx) * 1.4, 0, 'lourd'); P.wx *= 0.6; P.vr = Math.min(3, Math.abs(P.wx) * 0.2); P.ground = false; }
    if (Math.abs(P.ax) > 0.5 || Math.abs(P.az) > 0.5) P.speed *= Math.exp(-dt * 2.5);   // couchée, elle glisse et s'arrête
  }
  const off = Math.abs(wrapA(P.ax)) > 0.5 || Math.abs(wrapA(P.az)) > 0.5;
  P.flipped = P.ground && !P.recover && off && Math.abs(P.wx) < 0.4 && Math.abs(P.wz) < 0.4;
  P.tumble = off && !P.flipped && !P.recover;
  flipBtn?.classList.toggle('on', P.flipped);
}
/** Touche R (ou bouton) : remet la voiture sur ses roues. */
function pollGamepad(dt) {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  let g = null; for (const p of pads) if (p && p.connected) { g = p; break; }
  if (!g) { if (gpad.on) { gpad.on = false; gpad.x = gpad.y = 0; gpad.boost = gpad.jump = false; setHint(); } return; }
  if (!gpad.on) { gpad.on = true; setHint(); }
  const dz = v => Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85;
  const b = i => !!(g.buttons[i] && g.buttons[i].pressed), bv = i => (g.buttons[i] ? g.buttons[i].value : 0);
  const press = i => b(i) && !gpad.prev[i];
  const lx = dz(g.axes[0] || 0), ly = dz(g.axes[1] || 0), ry = dz(g.axes[3] || 0);
  const dpx = (b(15) ? 1 : 0) - (b(14) ? 1 : 0), dpy = (b(12) ? 1 : 0) - (b(13) ? 1 : 0);
  const intro = $('#intro');
  if (intro && !intro.classList.contains('out')) { if (press(0) || press(9)) introBtn.click(); }
  else if (panel.classList.contains('on')) { if (press(1) || press(0) || (mode === 'walk' && Math.hypot(lx, ly) > 0.4)) closePanel(); gpad.x = gpad.y = 0; }
  else if (mode === 'walk') {
    gpad.x = Math.max(-1, Math.min(1, lx + dpx));
    gpad.y = Math.max(-1, Math.min(1, -ly + dpy + bv(7) - bv(6)));   // stick, croix, ou gâchettes RT / LT
    gpad.boost = b(1) || b(5); gpad.jump = b(0);
    if (press(3)) recoverCar();
    if (press(2) && near) openIsland(near.id);
    if (ry) setZoom(camZoom * Math.exp(ry * dt * 1.6));
    if (press(9)) setWalk(false);
  } else {
    gpad.x = gpad.y = 0; gpad.boost = gpad.jump = false;
    // vue planète : le stick gauche fait tourner la caméra autour de la planète, le droit zoome
    if ((lx || ly) && !PL.cam) {
      controls.autoRotate = false; camAnim = null;
      const right = tmpA.crossVectors(camera.up, camera.position).normalize();
      camera.position.applyAxisAngle(camera.up, lx * dt * 1.6);
      const pol = camera.position.clone().normalize().dot(camera.up);
      if (!((pol > 0.95 && ly < 0) || (pol < -0.95 && ly > 0))) camera.position.applyAxisAngle(right, -ly * dt * 1.4);
    }
    if (ry && !PL.cam) camera.position.setLength(Math.max(controls.minDistance, Math.min(controls.maxDistance, camera.position.length() * Math.exp(ry * dt * 1.4))));
    if (press(0)) { camDir.copy(camera.position).normalize(); let s = null, bd = 0.6; SECTIONS.forEach(x => { const k = x.dir.dot(camDir); if (k > bd) { bd = k; s = x; } }); if (s) openIsland(s.id); }
    if (press(9)) setWalk(true);
  }
  gpad.prev = g.buttons.map(x => x.pressed);
}
function recoverCar() {
  if (mode !== 'walk' || P.recover) return;
  if (!P.flipped && !P.tumble && Math.abs(wrapA(P.ax)) < 0.3 && Math.abs(wrapA(P.az)) < 0.3) return;
  P.recover = { t: 0, ax0: wrapA(P.ax), az0: wrapA(P.az) }; P.tumble = false; P.flipped = false; P.speed = 0; P.wx = P.wz = 0;
}
flipBtn?.addEventListener('click', recoverCar);

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
  // le van WSQK : petit van bleu avec son antenne (absent dans le monde à l'envers, où c'est la radio qui guide)
  if (!upside.on && !egg) pin(upside.home.dir, (x, y) => {
    const s = DPR2;
    c.fillStyle = '#fff'; c.beginPath(); c.roundRect(x - 8.5 * s, y - 6 * s, 17 * s, 11 * s, 3 * s); c.fill();
    c.fillStyle = '#2d6fd6'; c.beginPath(); c.roundRect(x - 7 * s, y - 4.5 * s, 14 * s, 8 * s, 2 * s); c.fill();
    c.fillStyle = '#e7dcc0'; c.fillRect(x + 3 * s, y - 4.5 * s, 4 * s, 8 * s);
    c.fillStyle = '#d9303f'; c.fillRect(x - 6 * s, y - 1 * s, 8.5 * s, 1.6 * s);
    c.strokeStyle = '#fff'; c.lineWidth = 1.4 * s; c.beginPath(); c.moveTo(x - 2 * s, y - 6 * s); c.lineTo(x - 2 * s, y - 10 * s); c.moveTo(x - 5 * s, y - 10 * s); c.lineTo(x + 1 * s, y - 10 * s); c.stroke();
    c.fillStyle = '#1a1d26'; for (const dx of [-4, 4]) { c.beginPath(); c.arc(x + dx * s, y + 4 * s, 2 * s, 0, Math.PI * 2); c.fill(); }
  });
  // les autres clins d'œil : leur repère tant qu'on n'y est pas, puis leurs objectifs
  if (!upside.on) for (const e of eggs) if (!egg || e === egg) for (const q of e.pins()) pin(q.dir, (x, y) => drawEggPin(c, q, x, y, DPR2));
  // nord
  { const a = Math.atan2(POLE.dot(mmRt), POLE.dot(mmF)), x = half + Math.sin(a) * edge, y = half - Math.cos(a) * edge;
    c.fillStyle = 'rgba(20,10,36,.85)'; c.beginPath(); c.arc(x, y, 7 * DPR2, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fff'; c.font = '800 ' + Math.round(8 * DPR2) + 'px Manrope, Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('N', x, y + 0.5 * DPR2); }
  // la voiture : flèche au centre, dans le sens du capot
  c.save(); c.translate(half, half); c.rotate(Math.atan2(P.fwd.dot(mmRt), P.fwd.dot(mmF)));
  c.beginPath(); c.moveTo(0, -9 * DPR2); c.lineTo(6.5 * DPR2, 7 * DPR2); c.lineTo(0, 3.5 * DPR2); c.lineTo(-6.5 * DPR2, 7 * DPR2); c.closePath();
  c.fillStyle = '#fff'; c.fill(); c.lineWidth = 2 * DPR2; c.strokeStyle = '#140a24'; c.stroke(); c.restore();
}

/* ---------- barre de réglages ---------- */
const leafMats = new Set(); planet.decor.children.forEach(m => { if (m.material.map) leafMats.add(m.material); });
const audio = makeAudio(); let waterProbe = 0, nearWater = 0;
ambience.state.onFlash = far => audio.thunder(far);
addEventListener('pointerdown', () => audio.start(), { once: true });
$('#soundBtn')?.addEventListener('click', e => { e.stopPropagation(); audio.start(); TUNE.son.actif = !TUNE.son.actif; try { localStorage.setItem('planete-reglages', JSON.stringify(TUNE)); } catch (er) { /* rien */ } audio.applyVolumes(); syncSoundBtn(); });
// icône du haut-parleur (fournie) ; coupé : les ondes laissent place à une croix
const SPK = '<path d="M2 13.8571V10.1429C2 9.03829 2.89543 8.14286 4 8.14286H6.9C7.09569 8.14286 7.28708 8.08544 7.45046 7.97772L13.4495 4.02228C14.1144 3.5839 15 4.06075 15 4.85714V19.1429C15 19.9392 14.1144 20.4161 13.4495 19.9777L7.45046 16.0223C7.28708 15.9146 7.09569 15.8571 6.9 15.8571H4C2.89543 15.8571 2 14.9617 2 13.8571Z" stroke="currentColor" stroke-width="1.5"/>';
const SND_ON = `<svg class="ico" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M19.5 7.5C19.5 7.5 21 9 21 11.5C21 14 19.5 15.5 19.5 15.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>${SPK}</svg>`;
const SND_OFF = `<svg class="ico" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 9.5L22 13.5M22 9.5L18 13.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>${SPK}</svg>`;
function syncSoundBtn() { const b = $('#soundBtn'); if (b) { b.innerHTML = TUNE.son.actif ? SND_ON : SND_OFF; b.title = TUNE.son.actif ? 'Couper le son' : 'Activer le son'; b.setAttribute('aria-pressed', TUNE.son.actif ? 'false' : 'true'); } }
syncSoundBtn();
/** Va voir un animal : la voiture se pose à côté, face à lui (chaque appel passe à l'individu suivant de l'espèce). */
const locateIdx = {};
function locateAnimal(kind) {
  const r0 = fauna.locate(kind, 0); if (!r0) return 'Aucun animal de cette espèce';
  locateIdx[kind] = ((locateIdx[kind] ?? -1) + 1) % r0.n;
  const r = fauna.locate(kind, locateIdx[kind]), T = r.pos.clone().normalize();
  if (mode !== 'walk') setWalk(true);
  if (PL.on) stopPlane();
  // une place au sec, à 1,8 à 3,5 unités, d'où regarder l'animal (sinon sur l'eau, en aéroglisseur)
  const t1 = new THREE.Vector3(0, 1, 0).projectOnPlane(T); if (t1.lengthSq() < 1e-6) t1.set(1, 0, 0).projectOnPlane(T); t1.normalize();
  let spot = null, wet = false;
  for (const dist of [1.8, 2.5, 3.5]) { for (let k = 0; k < 8 && !spot; k++) { const d = T.clone().addScaledVector(t1.clone().applyAxisAngle(T, k / 8 * Math.PI * 2), dist / SEA_R).normalize(); if (!planet.isWet(d)) spot = d; } if (spot) break; }
  if (!spot) { spot = T.clone().addScaledVector(t1, 2 / SEA_R).normalize(); wet = true; }
  P.dir.copy(spot); P.fwd.copy(T).sub(spot).projectOnPlane(spot).normalize(); P.mv.copy(P.fwd);
  P.r = driveR(P.dir); P.ground = true; P.speed = 0; P.hover = wet ? 1 : 0; P.vr = 0; camF.copy(P.fwd);
  return `📍 ${kind} ${locateIdx[kind] + 1} / ${r.n}`;
}
const cloudQ = new THREE.Quaternion(), cloudAxis = new THREE.Vector3(0, 1, 0);
const tuneHooks = {
  locate: locateAnimal,
  clouds: planet.clouds.userData.volume,
  apply() {
    const W = planet.waterUniforms, T = TUNE;
    W.uShallow.value.set(T.eau.bord); W.uTeal.value.set(T.eau.milieu); W.uDeep.value.set(T.eau.large);
    W.uFoam.value = T.eau.ecume; W.uGlitW.value = T.eau.paillettes; W.uGlitWI.value = T.eau.eclatPaillettes;
    SAND.uGlitS.value = T.sable.paillettes; SAND.uGlitSI.value = T.sable.eclatPaillettes; SAND.uSand.value.set(T.sable.couleur); SAND.uSandMix.value = T.sable.forceCouleur;
    post.grade.uniforms.uSat.value = T.post.saturation; post.bloom.radius = T.post.bloomRayon; post.bloom.threshold = T.post.bloomSeuil; post.setBand(T.post.zoneNette); TILT.uTiltB.value = T.post.zoneNette;
    W.uFoamEdge.value = T.eau.largeurLisere; W.uFoamLine.value = T.eau.epaisseurTraits; W.uFoamGap.value = T.eau.espacementTraits; W.uFoamLen.value = T.eau.longueurTraits;
    GRASS.uGrassH.value = T.herbe.hauteur; GRASS.uGrassW.value = T.herbe.largeur;
    LUPIN.uLupS.value = T.lupins.taille; LUPIN.uLupH.value = T.lupins.hauteur; LUPIN.uLupWind.value = T.lupins.vent; LUPIN.uFlorD.value = T.lupins.fleurs; LUPIN.uFlorS.value = T.lupins.tailleFleurs; planet.setLupinDensity(T.lupins.densite);
    planet.setGrassDensity(T.herbe.densite);
    planet.setPathSoft(T.chemins.adoucissement || 0);
    TREE.uTreeS.value = T.arbres.taille; TREE.uCrownW.value = T.arbres.largeurHouppier; BUSH.uBushS.value = T.arbres.buissons;
    planet.treeMeshes.forEach(([w, l, n]) => { w.count = l.count = Math.floor(n * T.arbres.densite); });
    GLEAF.uLeafS.value = T.feuilles.taille; groundLeaves.mesh.count = Math.floor(groundLeaves.max * T.feuilles.quantite);
    avatar.scale.setScalar(T.voiture.taille); PAINT.uFlakeD.value = T.voiture.paillettes; PAINT.uFlakeI.value = T.voiture.eclatPaillettes;
    trails.cfg.width = T.turbo.largeur; trails.cfg.life = T.turbo.duree;
    const TU = trails.uniforms; TU.uC1.value.set(T.turbo.couleurDebut); TU.uC2.value.set(T.turbo.couleurMilieu); TU.uC3.value.set(T.turbo.couleurFin); TU.uMid.value = T.turbo.milieu; TU.uI.value = T.turbo.eclat;
    audio.applyVolumes(); syncSoundBtn();
    planet.barkM.color.set(T.arbres.tronc); leafMats.forEach(m => m.color.set(T.arbres.feuillage));
    const S = ambience.state;
    if (T.ambiance.meteo === 'auto') { if (S.weatherMode !== 'auto') { S.weatherMode = 'auto'; S.nextWeather = 30; } }
    else { S.weatherMode = T.ambiance.meteo; S.weather = T.ambiance.meteo; }
  },
  recolorGrass() { planet.recolorGrass(TUNE.herbe.base, TUNE.herbe.pointe); },
  recolorPaths() { planet.recolorPaths(TUNE.chemins.couleur, TUNE.chemins.bord); },
  previewPaths() { planet.previewPaths(TUNE.chemins.largeur, TUNE.chemins.courbure); },
  recolorTrees() { const A = TUNE.arbres; planet.recolorTrees([A.jaune, A.olive, A.orange, A.rouge, A.rose, A.sapin]); },
  recolorLupins() { const L = TUNE.lupins; planet.recolorLupins([L.violet, L.mauve, L.rose, L.bleu, L.blanc]); },
};
tuneHooks.apply();
tuneHooks.recolorGrass(); tuneHooks.recolorTrees(); tuneHooks.recolorLupins();
$('#tuneBtn')?.addEventListener('click', e => { e.stopPropagation(); toggleTunePanel(tuneHooks); });
// réglages cachés : taper « stephane » les fait apparaître (et les ouvre) ; le retaper les cache
{
  const SECRET = 'stephane'; let typed = '';
  const setAdmin = on => { document.body.classList.toggle('tune-on', on); try { if (on) localStorage.setItem('planete-admin', '1'); else localStorage.removeItem('planete-admin'); } catch (e) { /* rien */ } };
  try { if (localStorage.getItem('planete-admin') === '1') document.body.classList.add('tune-on'); } catch (e) { /* rien */ }
  addEventListener('keydown', e => {
    if (e.key.length !== 1 || (e.target.closest && e.target.closest('input, textarea'))) return;
    typed = (typed + e.key.toLowerCase()).slice(-SECRET.length);
    if (typed !== SECRET) return;
    typed = '';
    const on = !document.body.classList.contains('tune-on'); setAdmin(on);
    if (on || document.querySelector('.lil-gui')) toggleTunePanel(tuneHooks);
  });
}   // page en cache sans le bouton : on s'en passe

/* ---------- boucle ---------- */
/* Ménager la carte graphique :
   - 60 images/s au plus (inutile de suivre un écran à 144 Hz), 30 quand c'est calme (intro, fiche ouverte, vue planète sans geste) ;
   - en vue planète, ombres recalculées une image sur deux (le soleil est loin, le décalage ne se voit pas) ;
   - si la machine n'arrive pas à suivre, la définition baisse un peu, puis remonte quand ça va mieux. */
let pxScale = 1;
const PR_MIN = Math.min(PR, quality === 'low' ? 0.75 : 0.85);
function resize() { const w = innerWidth, h = innerHeight, pr = Math.max(PR_MIN, PR * pxScale); renderer.setPixelRatio(pr); renderer.setSize(w, h, false); post.setSize(w, h, pr); TILT.uScrH.value = Math.max(1, Math.round(h * pr)); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
let lastInput = 0;
for (const ev of ['pointerdown', 'wheel', 'keydown', 'touchstart']) addEventListener(ev, () => { lastInput = performance.now(); }, { passive: true });
addEventListener('pointermove', e => { if (e.buttons) lastInput = performance.now(); }, { passive: true });
renderer.shadowMap.autoUpdate = false;
const pace = { next: 0, ema: 1000 / 60, slow: 0, fast: 0, n: 0 };
// téléphone : 30 images/s en action, 15 au calme (moins de chauffe, batterie ménagée)
const FPS_ACTIVE = quality === 'low' ? 30 : 60, FPS_CALM = quality === 'low' ? 15 : 30;
function targetFps(now) {
  if (document.getElementById('intro') && !$('#intro').classList.contains('out')) return FPS_CALM;
  if (mode === 'walk' || PL.cam) return FPS_ACTIVE;   // (le biplan qui tourne seul autour de la planète se contente du rythme calme)
  if (panel.classList.contains('on')) return FPS_CALM;
  return camAnim || now - lastInput < 2500 ? FPS_ACTIVE : FPS_CALM;   // la caméra garde de l'élan un moment après le geste
}
/** true s'il faut dessiner cette image ; ajuste aussi la définition selon le rythme réellement tenu. */
function paceFrame(now) {
  const iv = 1000 / targetFps(now);
  if (now < pace.next - 3) return false;
  const gap = now - (pace.last || now); pace.last = now;
  pace.next = Math.max(pace.next + iv, now - iv);   // rythme moyen tenu même quand l'écran tique à 144 Hz
  if (gap > 0 && gap < 250) {
    pace.ema += (gap - pace.ema) * 0.08;
    if (pace.ema > iv * 1.3) { pace.fast = 0; if (++pace.slow > 90 && PR * pxScale > PR_MIN + 0.01) { pxScale = Math.max(PR_MIN / PR, pxScale * 0.85); pace.slow = 0; resize(); } }
    else if (pace.ema < iv * 1.08) { pace.slow = 0; if (++pace.fast > 300 && pxScale < 1) { pxScale = Math.min(1, pxScale * 1.12); pace.fast = 0; resize(); } }
  }
  renderer.shadowMap.needsUpdate = mode === 'walk' || (++pace.n & 1) === 0;
  return true;
}
const clock = new THREE.Clock();
const sunOff = new THREE.Vector3(), sunDir = new THREE.Vector3(), camR = new THREE.Vector3(), camFw = new THREE.Vector3();
const sunT = new THREE.Vector3(), sunM = new THREE.Matrix4(), sunX = new THREE.Vector3(), sunY = new THREE.Vector3(), sunZ = new THREE.Vector3(), shadowC = new THREE.Vector3(); let sunHour = 0;
let shadowBox = 0;
function setShadowBox(half, near, far) {
  const c = sun.shadow.camera;
  if (shadowBox === half && c.near === near && c.far === far) return;
  shadowBox = half; c.left = c.bottom = -half; c.right = c.top = half; c.near = near; c.far = far; c.updateProjectionMatrix();
}
// les objets garés qu'on ne traverse pas et qui proposent d'embarquer
const PARKED = [{ obj: upside.van, half: VAN_LEN.half, front: VAN_LEN.front, rear: VAN_LEN.rear, prompt: 'Monter dans le van', go: () => enterUpside() },
  ...eggs.map(e => ({ obj: e.prop, ...e.box, prompt: e.prompt, go: () => enterEgg(e) }))];
/** Repères des clins d'œil sur la mini-carte. */
function drawEggPin(c, q, x, y, s) {
  if (q.icon === 'bmx') {   // petit vélo rouge
    c.fillStyle = '#fff'; c.beginPath(); c.arc(x, y, 9 * s, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#d8202c'; c.lineWidth = 1.6 * s;
    for (const dx of [-4, 4]) { c.beginPath(); c.arc(x + dx * s, y + 2 * s, 2.8 * s, 0, Math.PI * 2); c.stroke(); }
    c.beginPath(); c.moveTo(x - 4 * s, y + 2 * s); c.lineTo(x - 1 * s, y - 2.5 * s); c.lineTo(x + 3 * s, y - 2.5 * s); c.lineTo(x + 4 * s, y + 2 * s); c.moveTo(x - 1 * s, y - 2.5 * s); c.lineTo(x, y + 2 * s); c.lineTo(x + 3 * s, y - 2.5 * s); c.moveTo(x + 2.5 * s, y - 4.5 * s); c.lineTo(x + 3 * s, y - 2.5 * s); c.stroke();
    return;
  }
  if (q.icon === 'pipe') {   // tuyau vert
    c.fillStyle = '#fff'; c.beginPath(); c.arc(x, y, 9 * s, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#1fb83a'; c.fillRect(x - 3.5 * s, y - 2 * s, 7 * s, 7 * s); c.fillRect(x - 5 * s, y - 5.5 * s, 10 * s, 3.8 * s);
    c.fillStyle = '#8af09a'; c.fillRect(x - 2.5 * s, y - 1.5 * s, 1.4 * s, 6 * s);
    return;
  }
  c.beginPath(); c.arc(x, y, 7 * s, 0, Math.PI * 2); c.fillStyle = q.color || '#fff'; c.fill(); c.lineWidth = 2 * s; c.strokeStyle = '#140a24'; c.stroke();
  c.fillStyle = q.fg || '#140a24'; c.font = '800 ' + Math.round(9 * s) + 'px Manrope, Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(q.glyph || '', x, y + 0.5 * s);
}
/* ---------- panneaux fléchés : un clic met la caméra en face (lisible), un autre clic ou la voiture qui repart la ramène ---------- */
let signView = null;
const signRay = new THREE.Raycaster(), sgU = new THREE.Vector3(), sgZ = new THREE.Vector3(), sgP = new THREE.Vector3(), sgL = new THREE.Vector3();
function signposts() { return zones ? zones.bodies.list.filter(b => b.mesh.userData.signpost).map(b => b.mesh) : []; }
/** Objet de zone sous la souris (prêt à servir, pas trop loin de la voiture). */
const itBox = new THREE.Box3(), itHit = new THREE.Vector3();
function interactiveAt(ndcV) {
  if (!zones) return null;
  signRay.setFromCamera(ndcV, camera);
  let best = null, bd = 1e9;
  for (const it of zones.interactives) {
    if ((it.ready && !it.ready()) || it.body.mesh.position.distanceTo(avatar.position) > 16) continue;
    for (const m of [it.body.mesh, ...(it.extra || [])]) {   // boîte englobante un peu élargie : les objets fins (chevalet, poteau) restent faciles à viser
      if (!signRay.ray.intersectBox(itBox.setFromObject(m).expandByScalar(0.08), itHit)) continue;
      const d = itHit.distanceTo(signRay.ray.origin); if (d < bd) { bd = d; best = it; }
    }
  }
  return best;
}
function signpostAt(ndcV) { const list = signposts(); if (!list.length) return null; signRay.setFromCamera(ndcV, camera); const h = signRay.intersectObjects(list, true)[0]; if (!h) return null; let o = h.object; while (o && !o.userData.signpost) o = o.parent; return o; }
/** Quitte la vue du panneau : la caméra repart en douceur depuis là où elle est vers sa place derrière la voiture. */
function exitSign() { if (!signView) return; signBlend = { pos: camera.position.clone(), quat: camera.quaternion.clone(), t: 0 }; signView = null; }
let signBlend = null;
const sgM = new THREE.Matrix4(), sgQ = new THREE.Quaternion(), sgPos = new THREE.Vector3();
const easeIO = x => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
function signCamera(dt) {
  const k = c => keys.has(c);
  const driving = k('KeyW') || k('KeyS') || k('KeyA') || k('KeyD') || k('ArrowUp') || k('ArrowDown') || k('ArrowLeft') || k('ArrowRight') || Math.abs(joy.x) + Math.abs(joy.y) > 0.15 || Math.abs(gpad.x) + Math.abs(gpad.y) > 0.15 || Math.abs(P.speed) > 0.6;
  if (driving || !signView.post.parent) { exitSign(); return; }
  const post = signView.post; post.updateMatrixWorld();
  post.getWorldPosition(sgP); sgU.copy(sgP).normalize(); sgZ.set(0, 0, 1).transformDirection(post.matrixWorld);
  // départ : la pose actuelle de la caméra (derrière la voiture) ; du côté où elle se trouve (les deux faces sont lisibles)
  if (!signView.from) { signView.from = { pos: (signBlend ? camera.position : camera.position).clone(), quat: camera.quaternion.clone() }; signView.t = 0; signBlend = null; }
  if (!signView.side) signView.side = Math.sign(sgZ.dot(sgL.copy(signView.from.pos).sub(sgP))) || 1;
  const look = sgL.copy(sgP).addScaledVector(sgU, 1.15);
  const want = sgPos.copy(look).addScaledVector(sgZ, 3.7 * signView.side).addScaledVector(sgU, 0.3);
  sgM.lookAt(want, look, sgU); sgQ.setFromRotationMatrix(sgM);   // orientation finale : face au panneau
  // un vrai mouvement de caméra : position et orientation glissent ensemble, en accélérant puis en ralentissant (1,4 s)
  signView.t = Math.min(1, signView.t + dt / 1.4); const e = easeIO(signView.t);
  camera.position.lerpVectors(signView.from.pos, want, e); camera.quaternion.slerpQuaternions(signView.from.quat, sgQ, e); camera.up.copy(sgU);
}
/** Retour depuis le panneau : on part de la pose figée et on rejoint en douceur la caméra de la voiture (1,2 s). */
function signReturn(dt) {
  signBlend.t = Math.min(1, signBlend.t + dt / 1.2); const e = easeIO(signBlend.t);
  sgPos.copy(camera.position); sgQ.copy(camera.quaternion);   // pose voulue par la caméra de la voiture à cette image
  camera.position.lerpVectors(signBlend.pos, sgPos, e); camera.quaternion.slerpQuaternions(signBlend.quat, sgQ, e);
  if (signBlend.t >= 1) signBlend = null;
}
function frame(now) {
  if (!paceFrame(now || performance.now())) { requestAnimationFrame(frame); return; }
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  planet.waterUniforms.uTime.value = t;
  if (!reduce) {
    // les nuages tournent autour de la planète, chacun à sa vitesse : le réglage « rotation » est la vitesse du plus rapide
    const CV = planet.clouds.userData.volume, rot = CV ? CV.params.rotation ?? 0.025 : 0.025;
    for (const m of planet.clouds.children) { cloudQ.setFromAxisAngle(cloudAxis, dt * rot * (m.userData.v ?? 1)); m.position.applyQuaternion(cloudQ); m.quaternion.premultiply(cloudQ); }
    planet.animate(t);
  }
  // à pied : ciel bleu autour de la caméra, étoiles effacées
  skyU.uMix.value = THREE.MathUtils.lerp(skyU.uMix.value, mode === 'walk' ? 1 : 0, 1 - Math.exp(-dt * 2.5));
  sky.position.copy(camera.position); skyU.uUp.value.copy(camera.position).normalize(); sky.visible = skyU.uMix.value > 0.01;
  starMat.opacity = Math.max(1 - skyU.uMix.value, ambience.night * 0.9 * (1 - ambience.state.W.cloud * 0.85));
  // à pied, les nuages montent au-dessus de la caméra
  planet.clouds.scale.setScalar(THREE.MathUtils.lerp(planet.clouds.scale.x, mode === 'walk' ? 1.3 : 1, 1 - Math.exp(-dt * 3)));
  if (mode === 'orbit') {
    if (camAnim) {
      const k = Math.min(1, (performance.now() - camAnim.t0) / camAnim.dur), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      const q = camAnim.qa.clone().slerp(camAnim.qb, e);
      camera.position.copy(camAnim.from).normalize().applyQuaternion(q).multiplyScalar(camAnim.fromLen + (camAnim.toLen - camAnim.fromLen) * e);
      if (camAnim.up) camera.up.copy(camAnim.up).lerp(WY, e).normalize();
      if (k >= 1) { if (camAnim.up) camera.up.copy(WY); camAnim = null; }
    }
    if (PL.follow) followCamera(dt); else if (PL.cam) planeCamera(); else controls.update();
  } else if (!(egg && egg.lock)) { stepWalk(dt); if (signView) signCamera(dt); else if (signBlend) signReturn(dt); }
  updatePlane(dt);
  if (zones) zones.update(dt, t, mode === 'walk' && !upside.on ? carBody : null);
  levitate(t, dt);
  fauna.update(dt, t, mode === 'walk', avatar.position, Math.abs(P.speed), ambience.night);
  // le soleil suit le regard : la face observée est toujours éclairée, de trois quarts
  if (mode === 'walk') {
    // le soleil est accroché au monde (et non plus à la caméra) : les ombres restent en place quand on tourne autour de la voiture.
    // Sa direction au sol est transportée de proche en proche quand on roule, et tourne lentement avec l'heure de la journée.
    up.copy(avatar.position).normalize();
    if (sunT.lengthSq() < 1e-6) {   // à l'atterrissage : de trois quarts, venu du haut à gauche de l'image
      camR.crossVectors(P.fwd, up).normalize();
      sunT.copy(camR).multiplyScalar(-0.75).addScaledVector(P.fwd, 0.55); sunHour = ambience.state.hour;
    }
    let dh = ambience.state.hour - sunHour; if (dh > 12) dh -= 24; if (dh < -12) dh += 24; sunHour = ambience.state.hour;
    sunT.addScaledVector(up, -sunT.dot(up)).normalize().applyAxisAngle(up, -dh / 24 * Math.PI * 2);
    sunDir.copy(up).multiplyScalar(1.05).addScaledVector(sunT, 0.93).normalize();
    // boîte d'ombre calée sur la grille de ses texels : sinon les bords des ombres frémissent quand elle suit la voiture
    const SB = 10, texel = 2 * SB / sun.shadow.mapSize.x;
    sunM.lookAt(sunDir, sunZ.set(0, 0, 0), sun.shadow.camera.up); sunX.setFromMatrixColumn(sunM, 0); sunY.setFromMatrixColumn(sunM, 1);   // axes de l'image d'ombre
    const px = avatar.position.dot(sunX), py = avatar.position.dot(sunY);
    shadowC.copy(avatar.position).addScaledVector(sunX, Math.round(px / texel) * texel - px).addScaledVector(sunY, Math.round(py / texel) * texel - py);
    sun.target.position.copy(shadowC);
    sun.position.copy(shadowC).addScaledVector(sunDir, 26);
    setShadowBox(SB, 1, 60);
    planet.waterUniforms.uSun.value.copy(sunDir);
  } else {
    sun.position.copy(camera.position).add(sunOff.set(22, 26, 4).applyQuaternion(camera.quaternion));
    sun.target.position.set(0, 0, 0);
    sun.position.setLength(110);
    setShadowBox(40, 50, 175);
    planet.waterUniforms.uSun.value.copy(sun.position).normalize();
  }
  // nuages volumétriques : le soleil du jeu (direction, couleur, force) et la face à dessiner selon la caméra
  { const V = planet.clouds.userData.volume;
    if (V && planet.clouds.visible) {
      if (!V.sunBase) V.sunBase = V.u.uSunCol.value.clone();
      V.u.uTime.value = t;
      V.u.uSunWorld.value.copy(planet.waterUniforms.uSun.value);
      V.u.uSunCol.value.copy(V.sunBase).lerp(sun.color, 0.5).multiplyScalar(Math.min(1.4, sun.intensity / 2.8));
      for (const m of planet.clouds.children) V.pickSide(m, camera);
    } }
  groundLeaves.update(dt, avatar.position, P.speed, mode === 'walk' && P.ground && P.hover < 0.5, mode === 'walk' && P.hover > 0.5);   // l'aéroglisseur chasse les feuilles sur l'eau
  if (mode === 'walk' && (++mmTick & 1)) drawMinimap();
  spray.mesh.visible = mode === 'walk';
  trails.group.visible = mode === 'walk';
  ambience.update(dt, t, mode, avatar.position, camera);
  // van caché : on ne le traverse pas, et tout près une invite propose d'y monter
  const wasNear = nearProp; nearProp = null;
  if (mode === 'walk' && !upside.on && !egg) for (const it of PARKED) {
    // boîte de l'objet (dans son repère), élargie de la demi-taille de la voiture
    const v = it.obj, loc = v.worldToLocal(tmpA.copy(avatar.position)), HX = it.half + 0.42, Z0 = -it.rear - 0.6, Z1 = it.front + 0.6;
    if (Math.abs(loc.y) > 3) continue;   // (sans ce test, l'axe vertical de l'objet traverse la planète : de l'autre côté du globe, on butait sur un mur invisible)
    if (Math.abs(loc.x) < HX + 1.0 && loc.z > Z0 - 1.0 && loc.z < Z1 + 1.0) { nearProp = it; promptEl.classList.add('on'); promptEl.textContent = (touch ? '' : 'E · ') + it.prompt; }
    if (Math.abs(loc.x) < HX && loc.z > Z0 && loc.z < Z1) {
      const px = HX - Math.abs(loc.x), pz = Math.min(loc.z - Z0, Z1 - loc.z);
      if (px < pz) loc.x = Math.sign(loc.x || 1) * HX; else loc.z = loc.z - Z0 < Z1 - loc.z ? Z0 : Z1;
      P.dir.copy(v.localToWorld(loc)).normalize(); P.speed *= 0.3;
    }
  }
  // objets des zones : la boule, la fusée, l'appareil photo… tout près, une invite propose de s'en servir
  stepAim(dt); updateBubble();
  if (mode === 'walk' && !upside.on && !egg && !nearProp && zones && !aim) {
    let bd = 1e9;
    for (const it of zones.interactives) {
      const dd = it.body.mesh.position.distanceTo(avatar.position);
      if (dd < it.r && dd < bd && (!it.ready || it.ready())) { bd = dd; nearProp = it; }
    }
    if (nearProp) { promptEl.classList.add('on'); promptEl.textContent = (touch ? '' : 'E · ') + nearProp.prompt; }
  }
  if (aim) promptEl.classList.remove('on');
  else if (wasNear && !nearProp) { if (near) promptEl.textContent = (touch ? 'Ouvrir · ' : 'E · Ouvrir ') + near.label; else promptEl.classList.remove('on'); }
  nearVan = nearProp === PARKED[0];
  if (upside.update({ dt, t, car: avatar.position, fwd: P.fwd, avatar, camera, sun, hemi, amb: ambL, skyU, fog: scene.fog, renderer, post, waterUniforms: planet.waterUniforms, audio, trails: trails.uniforms, ambience })) exitUpside(true);
  { const kd = c => keys.has(c);   // commandes brutes (le parcours de profil fait sa propre conduite)
    const input = { x: (kd('KeyD') || kd('ArrowRight') ? 1 : 0) - (kd('KeyA') || kd('ArrowLeft') ? 1 : 0) + joy.x + gpad.x, y: (kd('KeyW') || kd('ArrowUp') ? 1 : 0) - (kd('KeyS') || kd('ArrowDown') ? 1 : 0) + joy.y + gpad.y, jump: kd('Space') || kd('KeyW') || kd('ArrowUp') || gpad.jump, boost: kd('ShiftLeft') || kd('ShiftRight') || boostTouch || gpad.boost };
    const ectx = { dt, t, car: avatar.position, fwd: P.fwd, avatar, camera, sun, hemi, amb: ambL, skyU, fog: scene.fog, renderer, post, audio, ambience, P, wet: !!P.wet, carBody, input, zoom: camZoom };
    for (const e of eggs) if (e.update(ectx) && e === egg) exitEgg(true); }
  fauna.group.visible = !(upside.on && upside.k > 0.3);   // les animaux se cachent
  // son : voiture, aéroglisseur, ambiance
  if (audio.started) {
    if ((waterProbe -= dt) <= 0) {   // de l'eau à proximité ? (pour les vagues)
      waterProbe = 0.5; let wet = 0; const c = mode === 'walk' ? P.dir : tmpA.copy(camera.position).normalize();
      const t1 = tmpB.set(0, 1, 0).cross(c).normalize(), t2 = new THREE.Vector3().crossVectors(c, t1);
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; if (planet.isWet(new THREE.Vector3().copy(c).addScaledVector(t1, Math.cos(a) * 3 / SEA_R).addScaledVector(t2, Math.sin(a) * 3 / SEA_R).normalize())) wet++; }
      nearWater = mode === 'walk' ? wet / 8 : 0.35;
    }
    const bi = mode === 'walk' ? planet.bridgeAt(P.dir) : null;
    audio.update(dt,
      { walk: mode === 'walk', bike: avatar.userData.ride === 'bmx', speed: P.speed, throttle: P.throttle || 0, boost: P.boost, hover: P.hover, ground: P.ground, road: planet.pathDir(P.dir) > 0.5, bridge: !!(bi && P.r > bi.top - 0.3) },
      { walk: mode === 'walk', night: ambience.night, rain: ambience.state.W.rain, wind: WIND.uWind.value, water: nearWater });
  }
  FADE.uFadeOn.value = mode === 'walk' ? 1 : 0; FADE.uFadeTarget.value.copy(avatar.position).addScaledVector(avatar.position.clone().normalize(), 0.35);
  // en voiture : focale longue et flou de maquette ; en orbite : vue normale
  const wantFov = mode === 'walk' ? TUNE.camera.focale + 7 * P.boost : 42;
  if (Math.abs(camera.fov - wantFov) > 0.05) { camera.fov += (wantFov - camera.fov) * (1 - Math.exp(-dt * 3)); camera.updateProjectionMatrix(); }
  post.setTilt(THREE.MathUtils.lerp(post.tilt, mode === 'walk' ? TUNE.post.flou * (upside.on ? 0.3 : egg && egg.tilt !== undefined ? egg.tilt : signView ? 0.15 : 1) : 0, 1 - Math.exp(-dt * 3)), 0.5);   // monde à l'envers : peu de flou, pour voir les éclairs
  TILT.uTiltA.value = post.tilt > 0.02 ? post.tilt : 0;
  rim.position.copy(camera.position).multiplyScalar(-1).add(sunOff.set(0, -10, 0));
  pollGamepad(dt);
  updateLabels();
  planet.cullDecor(camera.position, mode === 'walk' ? 30 : 0);   // herbe et lupins : seulement les tuiles en vue
  post.render();
  if (wantShot) { wantShot = false; try { showPhoto(renderer.domElement.toDataURL('image/jpeg', 0.88)); } catch (e) { console.warn('photo impossible', e); } }   // juste après le rendu : l'image est encore là
  requestAnimationFrame(frame);
}
setHint();

/* ---------- démarrage ---------- */
const loadTxt = $('#loadTxt'), wait = ms => new Promise(r => setTimeout(r, ms));
// les zones (texte 3D, police téléchargée) : on les attend un peu pour compiler leurs shaders avec le reste
await step('Construction des zones');
await Promise.race([zonesReady.catch(() => {}), wait(8000)]);
// shaders compilés en parallèle (KHR_parallel_shader_compile) avant la première image, sans figer la page
await step('Préparation des shaders (' + (renderer.extensions.has('KHR_parallel_shader_compile') ? 'parallèle' : 'séquentiel') + ')');
try {
  if (renderer.compileAsync) {
    // même destination que le vrai rendu (sinon three compile la variante « écran » : sRGB + tone mapping, inutile)
    renderer.setRenderTarget(post.target || null);
    const done = renderer.compileAsync(scene, camera);   // les shaders sont lancés ici, de façon synchrone
    renderer.setRenderTarget(null);
    await Promise.race([done, wait(30000)]);
  }
} catch (e) { renderer.setRenderTarget(null); console.warn('précompilation des shaders', e); }
await step('Première image');
requestAnimationFrame(frame);
// puis, en tâche de fond pendant l'intro : les objets encore cachés (voiture, biplan, pluie…), pour ne pas figer l'atterrissage
setTimeout(() => {
  if (!renderer.compileAsync) return;
  const hidden = []; scene.traverse(o => { if (!o.visible) { hidden.push(o); o.visible = true; } });
  try { renderer.setRenderTarget(post.target || null); renderer.compileAsync(scene, camera).catch(() => {}); }
  catch (e) { console.warn('précompilation (objets cachés)', e); }
  finally { renderer.setRenderTarget(null); hidden.forEach(o => { o.visible = false; }); }
}, 300);
const introBtn = $('#introBtn');
introBtn.disabled = false; introBtn.textContent = 'Explorer la planète'; window.__planetReady = true;
/* ---------- téléphone : plein écran et paysage verrouillé (là où le navigateur le permet, comme sur Android) ---------- */
async function goLandscape() {
  if (!touch) return;
  try { if (!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); } catch (e) { /* refusé : on garde la page telle quelle */ }
  try { if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape'); } catch (e) { /* non pris en charge (iPhone) : l'invitation à tourner le téléphone prend le relais */ }
}
$('#rotateOk')?.addEventListener('click', () => document.body.classList.add('portrait-ok'));
walkBtn.addEventListener('click', () => { if (mode === 'walk') goLandscape(); });
introBtn.addEventListener('click', () => { goLandscape(); audio.start(); document.body.classList.add('started'); setTimeout(nudgeLanding, 15000); $('#intro').classList.add('out'); setTimeout(() => $('#intro').remove(), 700); });
// Supabase arrive en asynchrone : on l'attend au plus 10 s avant de lire les contenus
const sbReady = new Promise(r => { const t0 = Date.now(); (function chk() { if (window.supabase || Date.now() - t0 > 10000) r(); else setTimeout(chk, 150); })(); });
const clearLoad = () => { const e = $('#loadTxt'); if (e) e.textContent = ''; };   // l'écran d'accueil a pu disparaître entre-temps
sbReady.then(() => (window.loadPortfolio ? window.loadPortfolio() : DATA)).then(d => { DATA = d || DATA; clearLoad(); if (openId) openIsland(openId); })
  .catch(clearLoad);
window.__planet = { open: openIsland, walk: setWalk, state: () => ({ mode, near: near && near.id, r: P.r, dir: P.dir.toArray(), hover: P.hover, speed: P.speed }),
  // tests : pose la voiture sur la côte la plus proche, face à la mer
  bridges: () => planet.bridges.length,
  dbg: { P, avatar, setZoom, planet, driveR, keys, ambience, scene, renderer, tracks, PL, plane, fauna, camera, upside, enterUpside, exitUpside, et, mario, enterEgg, exitEgg, get egg() { return egg; }, get signView() { return signView; }, get zones() { return zones; } },
  toBridge(i = 0) { const b = planet.bridges[i]; if (!b) return false; const th = Math.max(0, b.t0 - 2 / SEA_R); P.dir.copy(b.e.point(th)); P.fwd.copy(b.e.point(th + 0.5 / SEA_R)).sub(P.dir).normalize(); P.fwd.addScaledVector(P.dir, -P.fwd.dot(P.dir)).normalize(); P.mv.copy(P.fwd); P.r = driveR(P.dir); P.ground = true; P.speed = 0; P.hover = 0; camF.copy(P.fwd); return b.len; },
  toSea() { const d = new THREE.Vector3(); let best = null, bk = 1e9; for (let i = 0; i < 6000; i++) { const y = 1 - (i + 0.5) / 3000, r = Math.sqrt(Math.max(0, 1 - y * y)), a = i * 2.39996; d.set(Math.cos(a) * r, y, Math.sin(a) * r); const h = planet.heightDir(d); if (h < bk) { bk = h; best = d.clone(); } } P.dir.copy(best); P.fwd.crossVectors(best, new THREE.Vector3(0, 1, 0)).normalize(); P.mv.copy(P.fwd); P.r = driveR(P.dir); P.ground = true; P.speed = 0; P.hover = 1; camF.copy(P.fwd); },
  toShore() { const d = new THREE.Vector3(), best = { k: -2 }; for (let i = 0; i < 4000; i++) { const y = 1 - (i + 0.5) / 2000, r = Math.sqrt(Math.max(0, 1 - y * y)), a = i * 2.39996; d.set(Math.cos(a) * r, y, Math.sin(a) * r); if (planet.isWet(d)) continue; const k = d.dot(P.dir); const o = d.clone().addScaledVector(P.fwd, 0).normalize(); if (k > best.k) { const t1 = new THREE.Vector3().crossVectors(d, new THREE.Vector3(0, 1, 0)).normalize(); for (let j = 0; j < 8; j++) { const f = t1.clone().applyAxisAngle(d, j * Math.PI / 4); if (planet.isWet(d.clone().addScaledVector(f, 1.2 / SEA_R).normalize())) { best.k = k; best.d = d.clone(); best.f = f; break; } } } } P.dir.copy(best.d); P.fwd.copy(best.f); P.mv.copy(best.f); P.r = driveR(P.dir); P.ground = true; P.speed = 0; camF.copy(P.fwd); },
  // simulation hors temps réel (tests) : conduit `sec` secondes avec les touches données
  sim(sec, codes = []) { codes.forEach(c => keys.add(c)); for (let i = 0; i < sec * 60; i++) { stepWalk(1 / 60); if (zones) zones.update(1 / 60, i / 60, carBody); } codes.forEach(c => keys.delete(c)); return zones ? zones.bodies.list.filter(b => b.down || b.fall).length : -1; } };
