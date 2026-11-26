/* ============================================================================
   Placement manuel des gros objets (phare, food truck, cascade, mine, van,
   vélo d'E.T., tuyau de Mario).

   PLACES ci-dessous : les emplacements choisis à la main. Pour chaque objet :
   dir (direction sur la planète), cap (degrés autour de la verticale) et, au
   besoin, lift (hauteur en plus), pitch (tangage) et roll (roulis), en degrés,
   et scale (taille : multiplie la taille d'origine).
   Un objet absent de PLACES est placé tout seul.

   Outil (réservé au propriétaire, voir owner.js) : ajouter ?placer à l'adresse. On clique sur un objet pour le choisir
   (ailleurs : plus rien de choisi), on le fait glisser, ou on le déplace et le tourne sur
   les trois axes (gizmos ou boutons), on passe au besoin en caméra libre, puis on recharge pour tout
   recalculer (clairière, collisions, parcours…). « Copier » donne le texte à
   recopier dans PLACES pour le rendre définitif.
   ============================================================================ */
import * as THREE from 'three';
import { IS_OWNER } from './owner.js';

/** Emplacements définitifs : { clé: { dir: [x, y, z], cap, lift?, pitch?, roll?, scale? } }. */
export const PLACES = {
  phare: { dir: [0.15324, -0.97599, -0.15478], cap: 9.7, lift: -0.135 },
  truck: { dir: [0.28098, 0.85671, 0.43255], cap: 106.1, lift: -0.009, pitch: -4.2, scale: 1.46 },
  cascade: { dir: [0.95621, 0.11179, -0.2705], cap: 168.2, lift: -0.902, pitch: 3.3, scale: 1.051 },
  coffre: { dir: [0.95581, 0.16835, -0.241], cap: -179.4, lift: -0.026, pitch: -2.6, scale: 0.799 },
  mine: { dir: [-0.11971, -0.91027, -0.39633], cap: -62.1, lift: 0.142, scale: 0.737 },
  van: { dir: [0.36701, 0.92993, 0.02329], cap: 132.1, roll: -0.1 },
  velo: { dir: [-0.18714, 0.98232, 0.00521], cap: 129 },
  tuyau: { dir: [0.23988, 0.70168, -0.67089], cap: 85, lift: 0.111 },
  boutique: { dir: [0.34424, 0.76469, 0.54475], cap: -8.3, scale: 1.24 },
};

export const PLACING = IS_OWNER && (() => { try { return new URLSearchParams(location.search).has('placer'); } catch (e) { return false; } })();   // (réservé au propriétaire : voir owner.js)
const LS = 'planete-placer';
let saved = {};
if (PLACING) try {
  saved = JSON.parse(localStorage.getItem(LS) || 'null') || {};
  const old = JSON.parse(localStorage.getItem('planete-plage') || 'null');   // (ancien outil de la plage)
  if (old) { for (const k of Object.keys(old)) if (saved[k] === undefined) saved[k] = old[k]; localStorage.removeItem('planete-plage'); }
} catch (e) { saved = {}; }

/** Tangente de référence d'un point (le cap 0) : la direction du pôle nord, ramenée sur le sol. */
export const tangentOf = d => { const t = new THREE.Vector3(0, 1, 0).projectOnPlane(d); if (t.lengthSq() < 1e-6) t.set(1, 0, 0).projectOnPlane(d); return t.normalize(); };
/** Direction d'avancée pour un cap (degrés) en un point. */
export const fwdOfCap = (d, cap) => tangentOf(d).applyAxisAngle(d, cap * Math.PI / 180);
/** Cap (degrés) d'une direction d'avancée en un point. */
export const capOfFwd = (d, f) => { const t1 = tangentOf(d), t2 = new THREE.Vector3().crossVectors(d, t1); return +(Math.atan2(f.dot(t2), f.dot(t1)) * 180 / Math.PI).toFixed(1); };

/** L'emplacement choisi pour un objet ({ dir, fwd, cap, lift, pitch, roll }), ou null s'il doit se placer tout seul. */
export function getPlace(key) {
  const src = saved[key] !== undefined ? saved[key] : PLACES[key];
  if (!src || !src.dir) return null;
  const dir = new THREE.Vector3().fromArray(src.dir).normalize(), cap = +src.cap || 0;
  return { dir, cap, fwd: fwdOfCap(dir, cap), lift: +src.lift || 0, pitch: +src.pitch || 0, roll: +src.roll || 0, scale: +src.scale || 1 };
}

const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), XA = new THREE.Vector3(1, 0, 0), ZA = new THREE.Vector3(0, 0, 1);
/** Pose un objet : debout au sol en `dir`, tourné du cap, monté de `lift`, penché (tangage, roulis), à sa taille. */
export function poseObject(planet, obj, s, baseLift = 0) {
  if (obj.userData.baseScale === undefined) obj.userData.baseScale = obj.scale.x;
  obj.scale.setScalar(obj.userData.baseScale * (s.scale || 1));
  const up = s.dir.clone().normalize(), f = fwdOfCap(up, s.cap), r = new THREE.Vector3().crossVectors(up, f);
  obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(r, up, f));
  obj.quaternion.multiply(qa.setFromAxisAngle(XA, (s.pitch || 0) * Math.PI / 180)).multiply(qb.setFromAxisAngle(ZA, (s.roll || 0) * Math.PI / 180));
  obj.position.copy(up).multiplyScalar(planet.heightDir(up) + baseLift + (s.lift || 0)); obj.updateMatrixWorld(true);
}
/** Au chargement : applique hauteur, inclinaison et taille choisies (la position et le cap, chaque objet les prend déjà de lui-même). */
export function applyPlaces(planet, items) {
  for (const it of items) { const p = getPlace(it.key); if (p && (p.lift || p.pitch || p.roll || p.scale !== 1)) poseObject(planet, it.obj, p, it.lift || 0); }
}

/**
 * Panneau de placement (seulement avec ?placer).
 * items : [{ key, label, obj, lift? }] — obj : l'objet déplacé en direct (aperçu) ; lift : sa hauteur de base.
 * Renvoie { free, stepCam(dt), update() } : quand `free` est vrai, la caméra libre remplace celle du jeu ; update() fait suivre le gizmo (à chaque image).
 */
export function makePlacer({ planet, scene, camera, canvas, controls, focus, items }) {
  if (!PLACING || !canvas || !camera) return null;
  // l'état de départ : là où chaque objet s'est posé (choisi à la main ou automatique)
  const state = {}, auto = {};
  for (const it of items) {
    const p = getPlace(it.key);
    if (p) state[it.key] = { dir: p.dir, cap: p.cap, lift: p.lift, pitch: p.pitch, roll: p.roll, scale: p.scale };
    else {
      const d = it.obj.getWorldPosition(new THREE.Vector3()).normalize(), z = new THREE.Vector3(0, 0, 1).transformDirection(it.obj.matrixWorld);
      state[it.key] = { dir: d, cap: capOfFwd(d, z), lift: 0, pitch: 0, roll: 0, scale: 1 };
    }
    auto[it.key] = saved[it.key] === undefined ? !PLACES[it.key] : !saved[it.key];
  }
  let sel = items[0].key, picked = false, dirty = false, stepK = 1;   // picked : un objet est sélectionné (sinon ni gizmo ni réglages)
  const STEPS = [{ m: 0.05, a: 1, label: 'fin' }, { m: 0.25, a: 5, label: 'moyen' }, { m: 1, a: 15, label: 'gros' }];
  const byKey = k => items.find(it => it.key === k);
  const move = k => poseObject(planet, byKey(k).obj, state[k], byKey(k).lift || 0);
  const r2 = v => +v.toFixed(3);
  const entry = s => { const o = { dir: s.dir.toArray().map(v => +v.toFixed(5)), cap: r2(s.cap) }; for (const k of ['lift', 'pitch', 'roll']) if (s[k]) o[k] = r2(s[k]); if (s.scale !== 1) o.scale = r2(s.scale); return o; };
  const fmt = () => { const o = {}; for (const it of items) if (!auto[it.key]) o[it.key] = entry(state[it.key]); return JSON.stringify(o, null, 1).replace(/\n\s*/g, ' '); };
  const store = () => { const o = {}; for (const it of items) o[it.key] = auto[it.key] ? null : entry(state[it.key]); try { localStorage.setItem(LS, JSON.stringify(o)); } catch (e) { /* rien */ } };

  /* ---------- le panneau ---------- */
  const el = document.createElement('div');
  el.className = 'placer';
  el.style.cssText = 'position:fixed; left:16px; bottom:16px; z-index:60; width:min(350px, calc(100vw - 32px)); max-height:calc(100vh - 90px); overflow:auto; padding:.8rem .9rem; border-radius:16px; background:rgba(14,18,34,.92); border:1px solid rgba(255,255,255,.18); color:#f4f3ee; font:600 .8rem/1.35 Manrope, system-ui, sans-serif; backdrop-filter:blur(12px);';
  const AX = [['fwd', 'Avant / arrière'], ['side', 'Gauche / droite'], ['lift', 'Hauteur'], ['cap', 'Cap (lacet)'], ['pitch', 'Tangage'], ['roll', 'Roulis'], ['scale', 'Taille']];
  el.innerHTML = `<div style="display:flex; align-items:center; gap:.5rem; margin-bottom:.45rem"><b style="flex:1; font-weight:800">Placement des objets</b><button data-free>Caméra libre</button></div>
    <div data-list style="display:flex; flex-wrap:wrap; gap:.3rem; margin-bottom:.45rem"></div>
    <div style="display:flex; gap:.3rem; align-items:center; margin-bottom:.45rem"><span style="opacity:.75">Gizmo :</span><span data-modes style="display:flex; gap:.3rem"></span></div>
    <div data-info style="opacity:.8; margin-bottom:.45rem"></div>
    <div style="display:flex; gap:.3rem; align-items:center; margin-bottom:.35rem"><span style="opacity:.75">Pas :</span><span data-steps style="display:flex; gap:.3rem"></span></div>
    <div data-axes style="display:grid; grid-template-columns:1fr auto 4.2rem auto; gap:.25rem .35rem; align-items:center; margin-bottom:.5rem">
      ${AX.map(([k, l]) => `<span>${l}</span><button data-ax="${k}" data-sg="-1">−</button><span data-val="${k}" style="text-align:center; font:400 .72rem 'Space Mono', monospace; opacity:.85"></span><button data-ax="${k}" data-sg="1">+</button>`).join('')}
    </div>
    <div style="display:flex; gap:.3rem; flex-wrap:wrap; margin-bottom:.35rem"><button data-flat>Remettre droit</button><button data-size1>Taille d’origine</button><button data-auto>Automatique</button><button data-go>Aller voir</button></div>
    <button data-reload style="width:100%; margin-bottom:.35rem">Appliquer (recharger)</button>
    <button data-copy style="width:100%">Copier les emplacements</button>
    <textarea data-out readonly style="width:100%; height:4.4rem; margin-top:.45rem; font:400 .64rem/1.3 'Space Mono', monospace; background:rgba(0,0,0,.35); color:#d9ff4a; border:1px solid rgba(255,255,255,.15); border-radius:8px; padding:.35rem; resize:none"></textarea>
    <div data-help style="opacity:.7; margin-top:.4rem; font-weight:500"></div>`;
  const btn = (b, on) => { b.style.cssText = `border-radius:100px; padding:.3rem .6rem; font:700 .74rem Manrope, sans-serif; cursor:pointer; border:1px solid rgba(255,255,255,.2); ${on ? 'background:#d9ff4a; color:#141414' : 'background:rgba(255,255,255,.08); color:inherit'}`; };
  el.querySelectorAll('button').forEach(b => btn(b, b.dataset.copy !== undefined));
  const $ = s => el.querySelector(s), list = $('[data-list]'), info = $('[data-info]'), out = $('[data-out]'), reloadB = $('[data-reload]'), freeB = $('[data-free]'), steps = $('[data-steps]'), help = $('[data-help]'), modes = $('[data-modes]');
  const refresh = () => {
    list.innerHTML = '';
    for (const it of items) { const b = document.createElement('button'); b.textContent = it.label + (auto[it.key] ? ' ·auto' : ''); btn(b, picked && it.key === sel); b.onclick = e => { e.stopPropagation(); sel = it.key; picked = true; refresh(); const d = state[sel].dir; if (cam.free) cam.lookAtDir(d); else if (focus) focus(d); }; list.appendChild(b); }
    steps.innerHTML = ''; STEPS.forEach((st, i) => { const b = document.createElement('button'); b.textContent = st.label; btn(b, i === stepK); b.onclick = e => { e.stopPropagation(); stepK = i; refresh(); }; steps.appendChild(b); });
    modes.innerHTML = ''; [['move', 'Déplacer'], ['rotate', 'Tourner'], ['scale', 'Taille']].forEach(([m, l]) => { const b = document.createElement('button'); b.textContent = l; btn(b, m === gMode); b.onclick = e => { e.stopPropagation(); gMode = m; refresh(); }; modes.appendChild(b); });
    const s = state[sel];
    $('[data-val="fwd"]').textContent = '—'; $('[data-val="side"]').textContent = '—';
    $('[data-val="lift"]').textContent = s.lift.toFixed(2); $('[data-val="cap"]').textContent = s.cap.toFixed(0) + '°';
    $('[data-val="pitch"]').textContent = s.pitch.toFixed(0) + '°'; $('[data-val="roll"]').textContent = s.roll.toFixed(0) + '°'; $('[data-val="scale"]').textContent = '×' + s.scale.toFixed(2);
    $('[data-axes]').style.opacity = picked ? '' : '.35';
    info.textContent = !picked ? 'Aucun objet sélectionné : clique sur un objet (ou sur son nom).' + (dirty ? ' Recharger pour recalculer clairières et collisions.' : '') : `${byKey(sel).label} : attrape-le pour le faire glisser ; un clic ailleurs le désélectionne${auto[sel] ? ' (placé automatiquement pour l’instant)' : ''}.` + (dirty ? ' Recharger pour recalculer clairières et collisions.' : '');
    btn(reloadB, dirty); btn(freeB, cam.free); out.value = fmt(); store();
    help.textContent = cam.free ? 'Caméra libre : ZQSD / WASD ou flèches pour avancer, glisser pour regarder, Espace monter, C descendre, Maj plus vite.' : 'Flèches : déplacer sur un axe (pastille jaune : sur le sol). Anneaux : tourner (Ctrl : par crans). Cubes : taille.';
  };
  const nudge = (ax, sg) => {
    const s = state[sel], st = STEPS[stepK];
    if (ax === 'fwd' || ax === 'side') {
      const up = s.dir.clone(), f = fwdOfCap(up, s.cap), r = new THREE.Vector3().crossVectors(f, up);   // r : la droite de l'objet
      const v = (ax === 'fwd' ? f : r).multiplyScalar(sg * st.m / planet.heightDir(up));
      s.dir = up.clone().add(v).normalize(); s.cap = capOfFwd(s.dir, f.projectOnPlane(s.dir).normalize());   // (l'objet garde son orientation en glissant)
    } else if (ax === 'lift') s.lift = +(s.lift + sg * st.m * 0.4).toFixed(3);
    else if (ax === 'scale') s.scale = +Math.min(5, Math.max(0.1, s.scale + sg * [0.02, 0.1, 0.25][stepK])).toFixed(3);
    else { s[ax] = ((s[ax] + sg * st.a) % 360 + 540) % 360 - 180; }
    auto[sel] = false; dirty = true; move(sel); refresh();
  };
  el.addEventListener('pointerdown', e => e.stopPropagation());
  el.addEventListener('wheel', e => e.stopPropagation(), { passive: true });
  el.addEventListener('click', e => {
    e.stopPropagation(); const s = state[sel];
    if (!picked && e.target.closest('[data-ax], [data-flat], [data-size1], [data-auto], [data-go]')) return;   // (rien de sélectionné)
    const a = e.target.closest('[data-ax]'); if (a) nudge(a.dataset.ax, +a.dataset.sg);
    if (e.target.closest('[data-flat]')) { s.lift = 0; s.pitch = 0; s.roll = 0; auto[sel] = false; dirty = true; move(sel); refresh(); }
    if (e.target.closest('[data-size1]')) { s.scale = 1; auto[sel] = false; dirty = true; move(sel); refresh(); }
    if (e.target.closest('[data-auto]')) { auto[sel] = true; dirty = true; refresh(); }
    if (e.target.closest('[data-go]')) { if (cam.free) cam.lookAtDir(s.dir); else if (focus) focus(s.dir); }
    if (e.target.closest('[data-free]')) cam.toggle();
    if (e.target.closest('[data-reload]')) { store(); location.reload(); }
    if (e.target.closest('[data-copy]')) { out.select(); navigator.clipboard?.writeText(out.value).catch(() => document.execCommand('copy')); const b = e.target.closest('[data-copy]'); b.textContent = 'Copié !'; setTimeout(() => { b.textContent = 'Copier les emplacements'; }, 1200); }
  });

  /* ---------- caméra libre : on vole où l'on veut, la verticale suit la planète ---------- */
  const keys = new Set(), MOVE = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyZ', 'KeyQ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyC', 'ShiftLeft', 'ShiftRight'];
  const cam = {
    free: false, savedUp: new THREE.Vector3(),
    toggle() {
      this.free = !this.free; keys.clear();
      if (this.free) { this.savedUp.copy(camera.up); this.ctl = controls ? controls.enabled : false; if (controls) controls.enabled = false; }
      else { camera.up.copy(this.savedUp); if (controls && this.ctl) { controls.enabled = true; controls.target.set(0, 0, 0); camera.lookAt(0, 0, 0); controls.update(); } }   // (à pied, la caméra du jeu reprend toute seule)
      refresh();
    },
    lookAtDir(d, key = sel) {   // se place devant l'objet, en surplomb (assez haut pour passer au-dessus des arbres), à une distance faite pour sa taille
      const it = items.find(i => i.key === key), up = d.clone().normalize(), g = up.clone().multiplyScalar(planet.heightDir(up));
      const r = it ? Math.max(1.5, new THREE.Box3().setFromObject(it.obj).getSize(new THREE.Vector3()).length() / 2) : 3;
      const front = fwdOfCap(up, state[key] ? state[key].cap : 0), dist = Math.max(7, r * 2.6);
      camera.position.copy(g).addScaledVector(front, dist).addScaledVector(up, Math.max(7, dist * 0.75)); camera.up.copy(camera.position).normalize(); camera.lookAt(g);
    },
  };
  addEventListener('keydown', e => {
    if (!cam.free || !MOVE.includes(e.code) || e.target.closest?.('input, textarea')) return;
    keys.add(e.code); e.preventDefault(); e.stopImmediatePropagation();
  }, { capture: true });
  addEventListener('keyup', e => { if (keys.delete(e.code)) { e.preventDefault(); e.stopImmediatePropagation(); } }, { capture: true });
  addEventListener('blur', () => keys.clear());
  const vF = new THREE.Vector3(), vR = new THREE.Vector3(), vU = new THREE.Vector3(), mv = new THREE.Vector3(), qY = new THREE.Quaternion(), qP = new THREE.Quaternion();
  function stepCam(dt) {
    vU.copy(camera.position).normalize();
    // la verticale de la caméra suit le sol (sinon l'horizon penche quand on fait le tour de la planète)
    camera.up.copy(vU);
    const fast = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 4 : 1, sp = 7 * fast * dt;
    camera.getWorldDirection(vF); vR.crossVectors(vF, vU).normalize();
    mv.set(0, 0, 0);
    if (keys.has('KeyW') || keys.has('KeyZ') || keys.has('ArrowUp')) mv.add(vF);
    if (keys.has('KeyS') || keys.has('ArrowDown')) mv.sub(vF);
    if (keys.has('KeyD') || keys.has('ArrowRight')) mv.add(vR);
    if (keys.has('KeyA') || keys.has('KeyQ') || keys.has('ArrowLeft')) mv.sub(vR);
    if (keys.has('Space')) mv.add(vU);
    if (keys.has('KeyC')) mv.sub(vU);
    if (mv.lengthSq() > 0) camera.position.addScaledVector(mv.normalize(), sp);
    // jamais sous le sol
    const d = camera.position.clone().normalize(), floor = Math.max(planet.heightDir(d), planet.waterR) + 0.25;
    if (camera.position.length() < floor) camera.position.setLength(floor);
    // garde l'horizon droit : on retire le roulis
    camera.getWorldDirection(vF); camera.lookAt(mv.copy(camera.position).add(vF));
  }
  /* ---------- gizmos, comme dans les logiciels 3D : flèches pour déplacer, anneaux pour tourner, cubes pour la taille ----------
     Repère du gizmo : X (rouge) = gauche/droite, Y (vert) = hauteur, Z (bleu) = avant/arrière de l'objet.
     On peut aussi attraper l'objet lui-même et le faire glisser sur le sol. Ctrl en tournant : par crans. */
  let gMode = 'move', drag = null, hover = null;
  const gizmo = new THREE.Group(); gizmo.renderOrder = 999; if (scene) scene.add(gizmo);
  const COL = { side: 0xff4d5e, lift: 0x86ff4d, fwd: 0x4daaff, cap: 0x86ff4d, pitch: 0xff4d5e, roll: 0x4daaff, uni: 0xffffff, ground: 0xffd84d };
  const gmat = c => new THREE.MeshBasicMaterial({ color: c, depthTest: false, depthWrite: false, transparent: true, opacity: 0.92, toneMapped: false, fog: false });
  const pickMat = new THREE.MeshBasicMaterial({ visible: false });
  const pickers = [];
  const addH = (vis, pickGeo, kind, axis, mode) => {
    vis.renderOrder = 999; gizmo.add(vis);
    const pk = new THREE.Mesh(pickGeo, pickMat); pk.position.copy(vis.position); pk.quaternion.copy(vis.quaternion);
    pk.userData = { vis, kind, axis, mode, col: vis.material.color.getHex() }; gizmo.add(pk); pickers.push(pk);
  };
  const Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
  const AXL = { side: new THREE.Vector3(1, 0, 0), lift: new THREE.Vector3(0, 1, 0), fwd: new THREE.Vector3(0, 0, 1) };
  for (const [k, v] of Object.entries(AXL)) {
    const q = new THREE.Quaternion().setFromUnitVectors(Y, v);
    for (const mode of ['move', 'scale']) {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 8), gmat(COL[k])); shaft.quaternion.copy(q); shaft.position.copy(v).multiplyScalar(0.5);
      const end = mode === 'move' ? new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.28, 16), gmat(COL[k])) : new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.18), gmat(COL[k]));
      end.quaternion.copy(q); end.position.copy(v).multiplyScalar(1.1);
      addH(shaft, new THREE.CylinderGeometry(0.11, 0.11, 1, 8), mode === 'move' ? 'axis' : 'scale', k, mode);
      addH(end, new THREE.SphereGeometry(0.22, 8, 6), mode === 'move' ? 'axis' : 'scale', k, mode);
    }
  }
  { const pad = new THREE.Mesh(new THREE.CircleGeometry(0.2, 28), gmat(COL.ground)); pad.quaternion.setFromUnitVectors(Z, Y); addH(pad, new THREE.SphereGeometry(0.24, 10, 8), 'ground', null, 'move'); }
  { const ball = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), gmat(COL.uni)); addH(ball, new THREE.SphereGeometry(0.26, 10, 8), 'scale', 'uni', 'scale'); }
  for (const [k, v] of Object.entries({ cap: AXL.lift, pitch: AXL.side, roll: AXL.fwd })) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.025, 8, 72), gmat(COL[k])); ring.quaternion.setFromUnitVectors(Z, v);
    addH(ring, new THREE.TorusGeometry(1, 0.1, 6, 48), 'ring', k, 'rotate');
  }

  const frameOf = k => { const s = state[k], up = s.dir.clone().normalize(), f = fwdOfCap(up, s.cap); return { up, f, r: new THREE.Vector3().crossVectors(up, f) }; };
  const gM = new THREE.Matrix4();
  function update() {   // à chaque image : le gizmo suit l'objet choisi et garde la même taille à l'écran
    const it = byKey(sel), s = state[sel], { up, f, r } = frameOf(sel);
    gizmo.position.copy(up).multiplyScalar(planet.heightDir(up) + (it.lift || 0) + s.lift);
    gizmo.quaternion.setFromRotationMatrix(gM.makeBasis(r, up, f));
    gizmo.scale.setScalar(Math.max(0.5, camera.position.distanceTo(gizmo.position) * 0.13));
    for (const p of pickers) {
      const ud = p.userData; ud.vis.visible = ud.mode === gMode;
      ud.vis.material.color.setHex(drag ? (drag.pk === p ? 0xffffff : ud.col) : hover === p ? 0xfff27a : ud.col);
      ud.vis.material.opacity = drag && drag.pk !== p ? 0.35 : 0.92;
    }
    gizmo.visible = picked; gizmo.updateMatrixWorld(true);
  }

  const gray = new THREE.Raycaster(), gndc = new THREE.Vector2(), gq = new THREE.Quaternion(), gPlane = new THREE.Plane();
  const aim = e => { gndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); gray.setFromCamera(gndc, camera); return gray; };
  const pickGizmo = e => { const h = aim(e).intersectObjects(pickers.filter(p => p.userData.mode === gMode), false)[0]; return h ? h.object : null; };
  const shown = o => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
  const pickObject = e => {   // le gros objet sous la souris (le plus proche)
    let best = null; aim(e);
    for (const it of items) { const h = gray.intersectObject(it.obj, true).find(x => shown(x.object)); if (h && (!best || h.distance < best.d)) best = { key: it.key, d: h.distance }; }
    return best && best.key;
  };
  const groundAt = e => { const h = aim(e).intersectObject(planet.groundMesh, true)[0]; return h ? h.point.clone().normalize() : null; };
  const onPlane = (e, n, c) => { gPlane.setFromNormalAndCoplanarPoint(n, c); return aim(e).ray.intersectPlane(gPlane, new THREE.Vector3()); };
  const facing = (a, c) => { const v = camera.position.clone().sub(c), n = a.clone().cross(v).cross(a); return n.lengthSq() < 1e-8 ? v.normalize() : n.normalize(); };   // plan qui contient l'axe et regarde la caméra
  const AXW = (k, fr) => k === 'side' ? fr.r : k === 'lift' ? fr.up : fr.f;
  const ROTW = (k, fr) => k === 'cap' ? fr.up : k === 'pitch' ? fr.r : fr.f;

  addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target !== canvas) return;
    update();
    const pk = picked ? pickGizmo(e) : null; let d = null;
    if (pk) d = { pk, kind: pk.userData.kind, axis: pk.userData.axis };
    else { const k = pickObject(e); if (k) { if (k !== sel || !picked) { sel = k; picked = true; refresh(); update(); } d = { kind: 'ground' }; } }
    if (!d) return;
    const s = state[sel], fr = frameOf(sel);
    d.s0 = { ...s, dir: s.dir.clone() }; d.fr = fr; d.c = gizmo.position.clone(); d.x0 = e.clientX; d.y0 = e.clientY;
    if (d.kind === 'ground') { d.g0 = groundAt(e); if (!d.g0) return; }
    else if (d.kind === 'axis') { d.a = AXW(d.axis, fr).clone(); d.n = facing(d.a, d.c); d.p0 = onPlane(e, d.n, d.c); if (!d.p0) return; }
    else if (d.kind === 'ring') { d.a = ROTW(d.axis, fr).clone(); d.p0 = onPlane(e, d.a, d.c); if (!d.p0) return; }
    drag = d; canvas.style.cursor = 'grabbing';
    e.preventDefault(); e.stopImmediatePropagation();   // (ni la caméra ni le clic pour poser ne voient ce geste)
  }, { capture: true });

  addEventListener('pointermove', e => {
    if (!drag) {   // survol : la poignée sous la souris s'allume
      if (e.target !== canvas || e.buttons) { if (hover) { hover = null; canvas.style.cursor = ''; } return; }
      const pk = picked ? pickGizmo(e) : null; if (pk !== hover) { hover = pk; canvas.style.cursor = pk ? 'pointer' : ''; }
      return;
    }
    e.stopImmediatePropagation();
    const d = drag, s = state[sel], s0 = d.s0;
    if (d.kind === 'ground') {   // l'objet glisse sur le sol en gardant son orientation
      const g = groundAt(e); if (!g) return;
      gq.setFromUnitVectors(d.g0, g); s.dir = s0.dir.clone().applyQuaternion(gq).normalize();
      s.cap = capOfFwd(s.dir, fwdOfCap(s0.dir, s0.cap).applyQuaternion(gq).projectOnPlane(s.dir).normalize());
    } else if (d.kind === 'axis') {
      const p = onPlane(e, d.n, d.c); if (!p) return;
      const t = p.sub(d.p0).dot(d.a);
      if (d.axis === 'lift') s.lift = r2(s0.lift + t);
      else { s.dir = s0.dir.clone().multiplyScalar(planet.heightDir(s0.dir)).addScaledVector(d.a, t).normalize(); s.cap = capOfFwd(s.dir, d.fr.f.clone().projectOnPlane(s.dir).normalize()); }
    } else if (d.kind === 'ring') {
      const p = onPlane(e, d.a, d.c); if (!p) return;
      const v0 = d.p0.clone().sub(d.c), v1 = p.sub(d.c);
      const ang = Math.atan2(d.a.dot(new THREE.Vector3().crossVectors(v0, v1)), v0.dot(v1)) * 180 / Math.PI;
      let v = s0[d.axis] + ang; if (e.ctrlKey) { const st = STEPS[stepK].a; v = Math.round(v / st) * st; }
      s[d.axis] = +(((v % 360) + 540) % 360 - 180).toFixed(1);
    } else if (d.kind === 'scale') {   // vers la droite ou vers le haut : plus grand
      const k = Math.exp(((e.clientX - d.x0) - (e.clientY - d.y0)) * 0.005);
      s.scale = +Math.min(5, Math.max(0.1, s0.scale * k)).toFixed(3);
    }
    auto[sel] = false; dirty = true; move(sel); refresh();
  }, { capture: true });

  addEventListener('pointerup', e => {
    if (!drag) return;
    drag = null; canvas.style.cursor = ''; e.placed = true; e.stopImmediatePropagation(); refresh();
  }, { capture: true });

  // glisser pour regarder (le clic simple, lui, pose l'objet)
  let look = null;
  canvas.addEventListener('pointerdown', e => { if (cam.free) look = { x: e.clientX, y: e.clientY }; }, { capture: true });
  addEventListener('pointermove', e => {
    if (!cam.free || !look || !(e.buttons & 1)) return;
    const dx = e.clientX - look.x, dy = e.clientY - look.y; look = { x: e.clientX, y: e.clientY };
    const up = camera.position.clone().normalize();
    camera.quaternion.premultiply(qY.setFromAxisAngle(up, -dx * 0.004));
    camera.getWorldDirection(vF); vR.crossVectors(vF, up).normalize();
    const pitchNow = Math.asin(Math.max(-1, Math.min(1, vF.dot(up)))), dp = Math.max(-1.5 - pitchNow, Math.min(1.5 - pitchNow, -dy * 0.004));
    camera.quaternion.premultiply(qP.setFromAxisAngle(vR, dp));
  }, { capture: true });
  addEventListener('pointerup', () => { look = null; });

  document.body.appendChild(el); document.body.classList.add('placing');   // en édition : ni bouton « Atterrir » ni aide en bas
  const css = document.createElement('style'); css.textContent = 'body.placing #walkBtn, body.placing .hint { display:none !important; }'; document.head.appendChild(css);
  refresh();

  // un clic (sans glisser) ailleurs que sur un objet : plus rien de sélectionné
  let down = null;
  addEventListener('pointerdown', e => { down = e.target === canvas ? [e.clientX, e.clientY] : null; }, { capture: true });
  addEventListener('pointerup', e => {
    if (!down || e.target !== canvas || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
    e.placed = true; down = null;   // (l'événement continue : les commandes de la caméra doivent voir le bouton relâché)
    if (picked) { picked = false; hover = null; canvas.style.cursor = ''; refresh(); }
  }, { capture: true });
  return { get free() { return cam.free; }, stepCam, update, state };
}
