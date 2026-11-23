/* ============================================================================
   Boîte à outils des clins d'œil (E.T., Mario…) : tirages, emplacements sur la
   planète, pose d'un objet au sol, petit panneau en haut de l'écran, flash.
   ============================================================================ */
import * as THREE from 'three';

export function makeKit({ planet, sections, R, seed = 1 }) {
  let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const randDir = (v = new THREE.Vector3(), r = rnd) => { do v.set(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1); while (v.lengthSq() > 1 || v.lengthSq() < 0.01); return v.normalize(); };
  const tangent = (d, ref = new THREE.Vector3(0, 1, 0)) => { const t = ref.clone().projectOnPlane(d); if (t.lengthSq() < 1e-6) t.set(1, 0, 0).projectOnPlane(d); return t.normalize(); };
  const farFromZones = (d, a) => sections.every(z => z.dir.dot(d) < Math.cos(a));
  const treesWithin = (d, r) => { const c = Math.cos(r / R); let n = 0; for (const t of planet.treeDirs) if (t.dot(d) > c) n++; return n; };
  const flat = (d, tol = 0.1, rad = 0.5) => {
    const h0 = planet.heightDir(d), t1 = tangent(d), t2 = new THREE.Vector3().crossVectors(d, t1);
    let m = 0; for (const t of [t1, t2]) for (const sg of [-1, 1]) m = Math.max(m, Math.abs(planet.heightDir(d.clone().addScaledVector(t, sg * rad / R).normalize()) - h0));
    return m < tol;
  };
  const dry = (d, road = 0.2) => !planet.isWet(d) && !planet.onPlaza(d, 0.8 / R) && planet.pathDir(d) < road && !planet.bridgeAt(d);
  const ground = d => planet.heightDir(d);
  /** Pose un objet debout sur la planète (y : la verticale du lieu, z : le cap). */
  const placeOn = (obj, dir, fwd, lift = 0) => {
    const up = dir.clone().normalize(), f = fwd.clone().projectOnPlane(up).normalize(), r = new THREE.Vector3().crossVectors(up, f);
    obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(r, up, f));
    obj.position.copy(up).multiplyScalar(planet.heightDir(up) + lift);
  };
  /** Un point à `dist` unités de `from`, dans une direction donnée (angle autour de la verticale). */
  const offset = (from, ang, dist) => { const t1 = tangent(from), t2 = new THREE.Vector3().crossVectors(from, t1); return from.clone().addScaledVector(t1, Math.cos(ang) * dist / R).addScaledVector(t2, Math.sin(ang) * dist / R).normalize(); };
  /** Cherche un emplacement : `ok(d)` doit être vrai ; `score(d)` le plus grand gagne (sinon le premier trouvé). */
  function findSpot(ok, { tries = 3000, score = null, r = rnd } = {}) {
    let best = null, bs = -Infinity; const d = new THREE.Vector3();
    for (let i = 0; i < tries; i++) {
      randDir(d, r); if (!ok(d)) continue;
      if (!score) return d.clone();
      const sc = score(d); if (sc > bs) { bs = sc; best = d.clone(); }
    }
    return best;
  }
  const angDist = (a, b) => Math.acos(Math.max(-1, Math.min(1, a.dot(b)))) * R;
  return { rnd, randDir, tangent, farFromZones, treesWithin, flat, dry, ground, placeOn, offset, findSpot, angDist };
}

/* ---------- panneau en haut de l'écran et flash plein écran (communs) ---------- */
let cssDone = false;
function css() {
  if (cssDone) return; cssDone = true;
  const st = document.createElement('style');
  st.textContent = `
    .eggHud{ position:fixed; left:50%; top:74px; transform:translate(-50%,-8px); z-index:22; display:flex; align-items:center; gap:.7rem; padding:.55rem 1rem;
      border-radius:16px; backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px); font:700 .85rem/1.2 Manrope, Arial, sans-serif;
      opacity:0; pointer-events:none; transition:opacity .5s, transform .5s; white-space:nowrap; }
    .eggHud.on{ opacity:1; transform:translate(-50%,0); }
    .eggHud small{ font-weight:500; opacity:.8; font-size:.74rem; }
    .eggHud .ct{ font-variant-numeric:tabular-nums; }
    .eggFlash{ position:fixed; inset:0; z-index:40; pointer-events:none; opacity:0; transition:opacity .9s ease; }
    .eggFlash.on{ opacity:1; transition:opacity .12s ease; }
    .eggToast{ position:fixed; left:50%; top:42%; transform:translate(-50%,-50%) scale(.6); z-index:23; pointer-events:none; opacity:0;
      font:900 clamp(1.6rem, 6vw, 3.4rem)/1 "Arial Black", Impact, sans-serif; letter-spacing:.02em; transition:opacity .25s, transform .35s cubic-bezier(.2,1.6,.4,1); text-align:center; }
    .eggToast.on{ opacity:1; transform:translate(-50%,-50%) scale(1); }
    body.egg #walkBtn{ display:none !important; }
    @media (orientation: landscape) and (max-height: 540px){ .eggHud{ top:calc(max(8px, env(safe-area-inset-top)) + 44px); left:auto; right:max(12px, env(safe-area-inset-right)); transform:translateY(-8px); padding:.35rem .7rem; gap:.5rem; font-size:.74rem; } .eggHud.on{ transform:none; } .eggHud small{ display:none; } }
    @media (max-width: 640px){ .eggHud small{ display:none; } .eggHud{ top:70px; left:auto; right:10px; transform:translateY(-8px); gap:.5rem; padding:.5rem .75rem; } .eggHud.on{ transform:none; } }`;
  document.head.appendChild(st);
}
export function makeHud(id, style, html) {
  css();
  const el = document.createElement('div'); el.className = 'eggHud'; el.id = id; el.style.cssText = style; el.innerHTML = html; document.body.appendChild(el);
  return el;
}
export function makeFlash(bg) {
  css();
  const el = document.createElement('div'); el.className = 'eggFlash'; el.style.background = bg; document.body.appendChild(el);
  return () => { el.classList.add('on'); setTimeout(() => el.classList.remove('on'), 160); };
}
export function makeToast(style) {
  css();
  const el = document.createElement('div'); el.className = 'eggToast'; el.style.cssText = style; document.body.appendChild(el);
  let tm = 0;
  return (txt, ms = 1400) => { el.textContent = txt; el.classList.add('on'); clearTimeout(tm); tm = setTimeout(() => el.classList.remove('on'), ms); };
}
