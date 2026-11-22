/* ============================================================================
   Ambiance : cycle jour / nuit et météo.
   - l'heure fait varier soleil, ciel, teintes d'ombre et de lumière, exposition,
     lampadaires (plus vifs la nuit, avec de vraies flaques de lumière autour de
     la voiture) et phares de la Jeep ;
   - la météo (beau, nuageux, pluie, orage) assombrit le ciel, ajoute une couche
     de nuages, de la brume, de la pluie, des éclairs et fait forcir le vent.
   Les deux suivent un cycle automatique, ou se règlent dans le menu « Ambiance ».
   ============================================================================ */
import * as THREE from 'three';
import { LOOK } from './look.js';
import { WIND } from './world.js';

const C = h => new THREE.Color(h), V = (x, y, z) => new THREE.Vector3(x, y, z);
const NIGHT = { sun: C('#8c96ff'), sunI: 0.45, sky: C('#5a5aa8'), gnd: C('#2a1a4a'), hemiI: 0.5, amb: 0.1, zen: C('#100a2c'), hor: C('#30245a'), sh: V(0.3, 0.26, 0.85), lit: V(0.8, 0.84, 1.2), lamp: 1, exp: 1.0, bloom: 0.8, water: C('#9fb0ff') };
const DAWN = { sun: C('#ff9a7a'), sunI: 1.5, sky: C('#ffa8a0'), gnd: C('#5a3a7a'), hemiI: 0.85, amb: 0.14, zen: C('#7a62b4'), hor: C('#ffb49a'), sh: V(0.5, 0.32, 0.85), lit: V(1.12, 0.9, 0.92), lamp: 0.35, exp: 1.02, bloom: 0.5, water: C('#ffb090') };
const DAY = { sun: C('#ffcf94'), sunI: 2.8, sky: C('#ffc89a'), gnd: C('#6a3f8a'), hemiI: 1.0, amb: 0.16, zen: C('#ee9b7b'), hor: C('#ffe0b8'), sh: V(0.58, 0.3, 0.82), lit: V(1.12, 0.98, 0.82), lamp: 0, exp: 1.05, bloom: 0.4, water: C('#fff2d8') };
const DUSK = { sun: C('#ff7444'), sunI: 2.2, sky: C('#ff9a6a'), gnd: C('#5a2f7a'), hemiI: 0.9, amb: 0.14, zen: C('#b4507a'), hor: C('#ffa860'), sh: V(0.55, 0.24, 0.8), lit: V(1.22, 0.84, 0.68), lamp: 0.55, exp: 1.03, bloom: 0.55, water: C('#ff9050') };
const KEYS = [[0, NIGHT], [5.2, NIGHT], [6.6, DAWN], [9, DAY], [16.5, DAY], [18.6, DUSK], [20.2, NIGHT], [24, NIGHT]];
const WEATHER = {
  clear: { cloud: 0, rain: 0, dark: 0, wind: 0.32, fog: 0, storm: 0 },
  cloudy: { cloud: 1, rain: 0, dark: 0.32, wind: 0.5, fog: 0.15, storm: 0 },
  rain: { cloud: 1, rain: 1, dark: 0.5, wind: 0.62, fog: 0.42, storm: 0 },
  storm: { cloud: 1, rain: 1.5, dark: 0.66, wind: 0.95, fog: 0.55, storm: 1 },
};
const TIMES = { dawn: 6.8, day: 12.5, dusk: 18.7, night: 23 };
const LABEL_W = { clear: 'Beau temps', cloudy: 'Nuageux', rain: 'Pluie', storm: 'Orage' };

const walk2 = m => m === 'walk';

export function makeAmbience({ scene, renderer, sun, hemi, amb, skyU, waterUniforms, planet, post, quality, avatar, SEA_R }) {
  /* ---------- état ---------- */
  const now = new Date();
  const S = { hour: now.getHours() + now.getMinutes() / 60, timeMode: 'auto', target: null, weather: 'clear', weatherMode: 'auto', nextWeather: 60 + Math.random() * 60,
    W: { ...WEATHER.clear }, flash: 0, nextFlash: 5, night: 0 };
  const out = { sun: C('#fff'), sky: C('#fff'), gnd: C('#fff'), zen: C('#fff'), hor: C('#fff'), water: C('#fff'), sh: V(0, 0, 0), lit: V(0, 0, 0), sunI: 0, hemiI: 0, amb: 0, lamp: 0, exp: 1, bloom: 0.4 };
  function sample(h) {
    let i = 0; while (i < KEYS.length - 2 && h >= KEYS[i + 1][0]) i++;
    const [h0, a] = KEYS[i], [h1, b] = KEYS[i + 1], k0 = (h - h0) / (h1 - h0), k = k0 * k0 * (3 - 2 * k0);
    for (const n of ['sun', 'sky', 'gnd', 'zen', 'hor', 'water']) out[n].copy(a[n]).lerp(b[n], k);
    out.sh.copy(a.sh).lerp(b.sh, k); out.lit.copy(a.lit).lerp(b.lit, k);
    for (const n of ['sunI', 'hemiI', 'amb', 'lamp', 'exp', 'bloom']) out[n] = a[n] + (b[n] - a[n]) * k;
  }

  /* ---------- brume ---------- */
  scene.fog = new THREE.Fog('#ffe0b8', 1e4, 2e4);

  /* ---------- couche de nuages de mauvais temps ---------- */
  const storm = new THREE.Group(); scene.add(storm);
  const stormMat = new THREE.MeshStandardMaterial({ color: '#d8d4e4', roughness: 1, transparent: true, opacity: 0, depthWrite: false });
  {
    const puff = new THREE.IcosahedronGeometry(1, 2), list = [], m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), d = new THREE.Vector3(), t1 = new THREE.Vector3(), t2 = new THREE.Vector3(), Y = V(0, 1, 0);
    const alt0 = SEA_R + planet.maxRelief + 2.2;
    for (let c = 0; c < (quality === 'low' ? 70 : 120); c++) {
      d.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize(); q.setFromUnitVectors(Y, d);
      t1.set(1, 0, 0).applyQuaternion(q); t2.set(0, 0, 1).applyQuaternion(q);
      const alt = alt0 + Math.random() * 1.6;
      for (let p = 0, np = 4 + Math.floor(Math.random() * 4); p < np; p++) {
        const s = 0.8 + Math.random() * 0.9;
        m4.compose(d.clone().multiplyScalar(alt).addScaledVector(t1, (Math.random() - 0.5) * 4).addScaledVector(t2, (Math.random() - 0.5) * 2.4), q, V(s * 1.4, s * 0.55, s));
        list.push(m4.clone());
      }
    }
    const mesh = new THREE.InstancedMesh(puff, stormMat, list.length); list.forEach((m, i) => mesh.setMatrixAt(i, m)); mesh.frustumCulled = false; storm.add(mesh);
  }
  const cloudMat = planet.clouds.children[0] && planet.clouds.children[0].material;
  const cloudBase = cloudMat ? cloudMat.color.clone() : null;

  /* ---------- pluie : des traits qui tombent autour de la voiture (tout se calcule dans le shader) ---------- */
  const RN = quality === 'low' ? 1400 : 3200;
  const rainU = { uTime: { value: 0 }, uCenter: { value: V(0, 0, 0) }, uUp: { value: V(0, 1, 0) }, uRight: { value: V(1, 0, 0) }, uFwd: { value: V(0, 0, 1) }, uWindV: { value: V(0, 0, 0) }, uOpacity: { value: 0 }, uSize: { value: V(13, 8, 13) } };
  const rain = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.ShaderMaterial({
    uniforms: rainU, transparent: true, depthWrite: false,
    vertexShader: `
      attribute float aEnd; uniform float uTime; uniform vec3 uCenter, uUp, uRight, uFwd, uWindV, uSize; varying float vEnd;
      void main() {
        vec3 o = position; vEnd = aEnd;
        float sp = 15.0 * (0.85 + 0.3 * fract(o.x * 91.7 + o.z * 13.1));
        float y = mod(o.y * uSize.y - uTime * sp, 2.0 * uSize.y) - uSize.y;
        vec3 p = uCenter + uRight * o.x * uSize.x + uFwd * o.z * uSize.z + uUp * y - uWindV * y * 0.35;
        p += (uUp - uWindV * 0.35) * aEnd * 0.42;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: 'uniform float uOpacity; varying float vEnd; void main(){ gl_FragColor = vec4(0.78, 0.84, 1.0, uOpacity * (0.25 + 0.75 * vEnd)); }',
  }));
  {
    const pos = new Float32Array(RN * 6), end = new Float32Array(RN * 2);
    for (let i = 0; i < RN; i++) { const x = Math.random() * 2 - 1, y = Math.random(), z = Math.random() * 2 - 1; pos.set([x, y, z, x, y, z], i * 6); end[i * 2 + 1] = 1; }
    rain.geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3)); rain.geometry.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  }
  rain.frustumCulled = false; rain.visible = false; rain.renderOrder = 5; scene.add(rain);

  /* ---------- lampadaires : flaques de lumière autour de la voiture, phares de la Jeep ---------- */
  const NP = quality === 'low' ? 2 : 6, pools = [];
  for (let i = 0; i < NP; i++) { const l = new THREE.PointLight('#ffb35c', 0, 5.5, 1.6); scene.add(l); pools.push(l); }
  const head = new THREE.SpotLight('#fff0c8', 0, 14, 0.55, 0.55, 1.3); head.position.set(0, 0.5, 0.62);
  const headT = new THREE.Object3D(); headT.position.set(0, -0.6, 6); avatar.userData.body.add(head, headT); head.target = headT;
  let lamps = [], glows = [], poolTimer = 0;
  const lampPos = new THREE.Vector3();
  function collect(root) {
    root.traverse(o => {
      if (o.userData.lamp) lamps.push(o);
      if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m.userData.glow !== undefined && !glows.includes(m)) glows.push(m); });
    });
  }
  collect(avatar);

  /* ---------- menu « Ambiance » ---------- */
  const btn = document.getElementById('ambBtn'), menu = document.getElementById('ambMenu'), icon = document.getElementById('ambIcon'), clock = document.getElementById('ambTime');
  const hasMenu = !!(btn && menu && icon && clock);   // page en cache sans le menu : l'ambiance tourne quand même
  const syncMenu = () => hasMenu && menu.querySelectorAll('button[data-k]').forEach(b => b.classList.toggle('on', (b.dataset.k === 'time' ? S.timeMode : S.weatherMode) === b.dataset.v));
  if (hasMenu) {
  btn.addEventListener('click', e => { e.stopPropagation(); const on = !menu.classList.contains('on'); menu.classList.toggle('on', on); btn.setAttribute('aria-expanded', on); });
  addEventListener('click', e => { if (!menu.contains(e.target)) { menu.classList.remove('on'); btn.setAttribute('aria-expanded', false); } });
  menu.addEventListener('click', e => {
    const b = e.target.closest('button[data-k]'); if (!b) return;
    if (b.dataset.k === 'time') { S.timeMode = b.dataset.v; S.target = b.dataset.v === 'auto' ? null : TIMES[b.dataset.v]; }
    else { S.weatherMode = b.dataset.v; if (b.dataset.v !== 'auto') S.weather = b.dataset.v; else S.nextWeather = 40 + Math.random() * 60; }
    syncMenu();
  });
  }
  syncMenu();

  /* ---------- mise à jour ---------- */
  const tmpC = new THREE.Color(), grey = new THREE.Color(), flashC = new THREE.Color('#e8ecff'), up = new THREE.Vector3(), right = new THREE.Vector3(), fwd = new THREE.Vector3();
  let lastLabel = '';
  function update(dt, t, mode, car, camera) {
    // heure : cycle complet en 12 minutes ; un choix du menu y amène en douceur puis s'y tient
    if (S.target === null) S.hour = (S.hour + dt * 24 / 720) % 24;
    else { let d = S.target - S.hour; if (d > 12) d -= 24; if (d < -12) d += 24; S.hour = (S.hour + Math.sign(d) * Math.min(Math.abs(d), dt * 8) + 24) % 24; }
    // météo automatique : change toutes les 1 à 3 minutes
    if (S.weatherMode === 'auto' && (S.nextWeather -= dt) <= 0) {
      const r = Math.random(); S.weather = r < 0.45 ? 'clear' : r < 0.72 ? 'cloudy' : r < 0.92 ? 'rain' : 'storm'; S.nextWeather = 60 + Math.random() * 120;
    }
    const tw = WEATHER[S.weather], kw = 1 - Math.exp(-dt / 4);
    for (const n in tw) S.W[n] += (tw[n] - S.W[n]) * kw;
    const W = S.W;
    // éclairs
    if (W.storm > 0.5 && (S.nextFlash -= dt) <= 0) { S.flash = 1; S.nextFlash = 3 + Math.random() * 9; S.flash2 = 0.18; }
    if (S.flash2 > 0 && (S.flash2 -= dt) <= 0) S.flash = Math.max(S.flash, 0.8);
    S.flash *= Math.exp(-dt * 9);
    const fl = S.flash * W.storm;

    sample(S.hour);
    const dayK = Math.min(1, out.sunI / 2.8); S.night = Math.max(0, 1 - out.sunI / 1.2);
    const dark = W.dark;
    sun.color.copy(out.sun).lerp(grey.set('#b8b8d0'), dark * 0.5); sun.intensity = out.sunI * (1 - 0.7 * dark) + fl * 3;
    hemi.color.copy(out.sky).lerp(grey.set('#9a98b4').multiplyScalar(0.3 + 0.7 * dayK), dark * 0.6); hemi.groundColor.copy(out.gnd); hemi.intensity = out.hemiI * (1 - 0.2 * dark) + fl * 1.5;
    amb.intensity = out.amb + fl * 1.2;
    const gZ = grey.set('#6e6c86').multiplyScalar(0.25 + 0.75 * dayK);
    skyU.uZen.value.copy(out.zen).lerp(gZ, dark * 0.8).lerp(flashC, fl * 0.6);
    skyU.uHor.value.copy(out.hor).lerp(tmpC.set('#a8a4bc').multiplyScalar(0.3 + 0.7 * dayK), dark * 0.8).lerp(flashC, fl * 0.6);
    LOOK.uShadowTint.value.copy(out.sh); LOOK.uLitTint.value.copy(out.lit).multiplyScalar(1 - 0.12 * dark - 0.06 * W.rain);
    renderer.toneMappingExposure = out.exp * (1 - 0.06 * dark) + fl * 0.5;
    post.bloom.strength = out.bloom + 0.1 * Math.min(1, W.rain);
    waterUniforms.uSunColor.value.copy(out.water).multiplyScalar(1 - 0.75 * dark);
    if (cloudMat) { cloudMat.color.copy(cloudBase).lerp(grey.set('#76748c'), dark * 0.8).multiplyScalar(0.35 + 0.65 * dayK); }
    stormMat.opacity = W.cloud * 0.85; stormMat.color.set('#cfcbe0').lerp(grey.set('#5c5a72'), dark).multiplyScalar(0.3 + 0.7 * dayK); storm.visible = W.cloud > 0.02;
    storm.rotation.y += dt * 0.01; storm.scale.copy(planet.clouds.scale).multiplyScalar(walk2(mode) ? 1.06 : 1);   // au sol, la couche monte au-dessus de la caméra
    WIND.uWind.value = W.wind; WIND.uWindDir.value.set(Math.cos(t * 0.02), 0.25, Math.sin(t * 0.02)).normalize();
    // brume : seulement au sol (en orbite, la planète reste nette)
    const walk = mode === 'walk';
    scene.fog.color.copy(skyU.uHor.value).lerp(skyU.uZen.value, 0.3);
    const fog = walk ? W.fog : 0;
    scene.fog.near = fog > 0.01 ? THREE.MathUtils.lerp(120, 10, fog) : 1e4; scene.fog.far = fog > 0.01 ? THREE.MathUtils.lerp(260, 55, fog) : 2e4;
    // pluie autour de la voiture
    rain.visible = walk && W.rain > 0.02;
    if (rain.visible) {
      up.copy(car).normalize(); fwd.set(0, 0, -1).applyQuaternion(camera.quaternion); fwd.addScaledVector(up, -fwd.dot(up)).normalize(); right.crossVectors(fwd, up).normalize();
      rainU.uTime.value = t; rainU.uUp.value.copy(up); rainU.uRight.value.copy(right); rainU.uFwd.value.copy(fwd);
      rainU.uCenter.value.copy(car).lerp(camera.position, 0.35).addScaledVector(up, 1.5);
      rainU.uWindV.value.copy(WIND.uWindDir.value).addScaledVector(up, -WIND.uWindDir.value.dot(up)).multiplyScalar(W.wind);
      rainU.uOpacity.value = Math.min(1, W.rain) * 0.55 * (0.5 + 0.5 * dayK + 0.3);
    }
    // lampadaires, flaques de lumière, phares
    const lampK = Math.min(1.4, out.lamp + dark * 0.5);
    glows.forEach(m => { m.emissiveIntensity = m.userData.glow * (0.65 + lampK * 0.9); });
    if ((poolTimer -= dt) <= 0 && lamps.length) {
      poolTimer = 0.35;
      const ranked = lamps.map(o => { o.localToWorld(lampPos.set(0, 0.84, 0)); return [lampPos.distanceToSquared(car), lampPos.clone()]; }).sort((a, b) => a[0] - b[0]);
      pools.forEach((l, i) => { if (ranked[i]) l.position.copy(ranked[i][1]); });
    }
    pools.forEach(l => { l.intensity = walk ? lampK * 7 : 0; });
    head.intensity = walk ? lampK * 40 : 0;
    // menu : icône et heure
    const hh = Math.floor(S.hour), mm = Math.floor((S.hour - hh) * 60 / 10) * 10;
    const ic = W.storm > 0.5 ? '⛈' : W.rain > 0.5 ? '🌧' : W.cloud > 0.5 ? '☁' : S.night > 0.5 ? '☾' : '☀';
    const label = ic + '|' + String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
    if (hasMenu && label !== lastLabel) { lastLabel = label; icon.textContent = ic; clock.textContent = label.split('|')[1]; btn.title = 'Ambiance : ' + LABEL_W[S.weather]; }
  }
  return { update, collect, get night() { return S.night; }, state: S };
}
