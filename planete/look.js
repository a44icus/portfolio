/* ============================================================================
   Le « look » de la planète : ombres colorées (jamais noires), post-traitement
   (bloom sur les lumières, flou de maquette en haut et en bas de l'image) et
   feuilles qui volent autour de la voiture.
   ============================================================================ */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/* ---------- ombres colorées ---------- */
export const LOOK = {
  uShadowTint: { value: new THREE.Vector3(0.58, 0.3, 0.82) },  // ombres violet-magenta
  uLitTint: { value: new THREE.Vector3(1.12, 0.98, 0.82) },    // lumière chaude, orangée
  uStylize: { value: 1 },
};
const RAMP = /* glsl */ `
  {
    float al = max(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)), 0.025);
    float lit = dot(outgoingLight - totalEmissiveRadiance, vec3(0.299, 0.587, 0.114)) / al;
    float t = smoothstep(0.16, 1.0, lit);
    vec3 shade = diffuseColor.rgb * mix(uShadowTint, uLitTint, t) * mix(0.5, 1.14, t);
    outgoingLight = mix(outgoingLight, shade + totalEmissiveRadiance, uStylize);
  }
  #include <opaque_fragment>`;

/** Donne le rendu « illustration » à un matériau standard : la lumière choisit entre une teinte d'ombre et une teinte éclairée. */
export function stylize(m) {
  if (!m || !m.isMeshStandardMaterial || m.userData.styled) return;
  m.userData.styled = true;
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey.bind(m);
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    Object.assign(sh.uniforms, LOOK);
    sh.fragmentShader = 'uniform vec3 uShadowTint;\nuniform vec3 uLitTint;\nuniform float uStylize;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', RAMP);
  };
  m.customProgramCacheKey = () => prevKey() + '|look';
  m.needsUpdate = true;
}
export function stylizeTree(root, { cast, receive } = {}) {
  root.traverse(o => {
    if (!o.isMesh) return;
    (Array.isArray(o.material) ? o.material : [o.material]).forEach(stylize);
    if (cast !== undefined) o.castShadow = cast;
    if (receive !== undefined) o.receiveShadow = receive;
  });
}

/* ---------- post-traitement ---------- */
const TiltShift = {
  uniforms: { tDiffuse: { value: null }, uStep: { value: new THREE.Vector2() }, uAmount: { value: 0 }, uFocus: { value: 0.5 }, uBand: { value: 0.14 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform vec2 uStep; uniform float uAmount; uniform float uFocus; uniform float uBand; varying vec2 vUv;
    void main() {
      float k = uAmount * smoothstep(uBand, uBand + 0.32, abs(vUv.y - uFocus));
      vec4 c = texture2D(tDiffuse, vUv) * 0.2270270270;
      vec2 o1 = uStep * 1.3846153846 * k, o2 = uStep * 3.2307692308 * k;
      c += (texture2D(tDiffuse, vUv + o1) + texture2D(tDiffuse, vUv - o1)) * 0.3162162162;
      c += (texture2D(tDiffuse, vUv + o2) + texture2D(tDiffuse, vUv - o2)) * 0.0702702703;
      gl_FragColor = c;
    }`,
};
/** Étalonnage : couleurs plus franches, ombres poussées vers le violet, hautes lumières vers l'orangé. */
const Grade = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: TiltShift.vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, 1.18);
      float sh = 1.0 - smoothstep(0.0, 0.35, l), hi = smoothstep(0.35, 1.2, l);
      c.rgb += vec3(0.035, -0.01, 0.05) * sh + vec3(0.04, 0.012, -0.03) * hi;
      gl_FragColor = vec4(max(c.rgb, 0.0), c.a);
    }`,
};
export function makePost(renderer, scene, camera, quality) {
  // anticrénelage : rendu multi-échantillonné (MSAA), que le post-traitement conserve
  const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: quality === 'low' ? 2 : 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.4, 0.45, 1.05);
  composer.addPass(bloom);
  const tiltH = new ShaderPass(TiltShift), tiltV = new ShaderPass(TiltShift), tiltH2 = new ShaderPass(TiltShift), tiltV2 = new ShaderPass(TiltShift);
  const tilts = quality === 'low' ? [tiltH, tiltV] : [tiltH, tiltV, tiltH2, tiltV2];
  tilts.forEach(p => composer.addPass(p));
  composer.addPass(new ShaderPass(Grade));
  composer.addPass(new OutputPass());
  let amount = 0;
  return {
    setSize(w, h, pr) {
      composer.setPixelRatio(pr); composer.setSize(w, h);
      const W = w * pr, H = h * pr, scale = quality === 'low' ? 0.35 : 0.5;
      bloom.resolution.set(W * scale, H * scale); bloom.setSize(W * scale, H * scale);
      tiltH.uniforms.uStep.value.set(1 / W, 0); tiltV.uniforms.uStep.value.set(0, 1 / H);
      tiltH2.uniforms.uStep.value.set(2.2 / W, 0); tiltV2.uniforms.uStep.value.set(0, 2.2 / H);
    },
    /** Flou de maquette (0 : aucun) et zone nette au centre de l'image. */
    setTilt(k, focus = 0.5) {
      amount = k;
      tilts.forEach(p => { p.uniforms.uAmount.value = k; p.uniforms.uFocus.value = focus; p.enabled = k > 0.02; });
    },
    get tilt() { return amount; },
    bloom,
    render() { composer.render(); },
  };
}

/* ---------- embruns soulevés par l'aéroglisseur ---------- */
export function makeSpray(count) {
  const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.05, 0), new THREE.MeshStandardMaterial({ color: '#f4fbff', emissive: '#bfe9ff', emissiveIntensity: 0.35, roughness: 0.3 }), count);
  mesh.frustumCulled = false;
  const S = [], m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < count; i++) { S.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, max: 1 }); mesh.setMatrixAt(i, zero); }
  let next = 0, acc = 0;
  return {
    mesh,
    /** rate : gouttes par seconde ; emit(out) place une goutte (position, vitesse) */
    update(dt, rate, emit) {
      acc += rate * dt;
      while (acc >= 1) { acc -= 1; const s = S[next]; next = (next + 1) % count; emit(s.p, s.v); s.life = s.max = 0.45 + Math.random() * 0.4; }
      S.forEach((s, i) => {
        if (s.life <= 0) { mesh.setMatrixAt(i, zero); return; }
        s.life -= dt;
        const up = sc.copy(s.p).normalize();
        s.v.addScaledVector(up, -9 * dt); s.v.multiplyScalar(Math.exp(-dt * 1.5)); s.p.addScaledVector(s.v, dt);
        const k = Math.max(0, s.life / s.max), r = (0.5 + 0.9 * (1 - k)) * Math.min(1, k * 4);
        mesh.setMatrixAt(i, m4.compose(s.p, q, sc.setScalar(r)));
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}


/* ---------- feuilles mortes au sol : elles s'envolent au passage de la voiture ---------- */
const LEAF_SHAPE = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  g.translate(32, 32); g.rotate(0.5);
  g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, -29); g.quadraticCurveTo(24, -6, 0, 26); g.quadraticCurveTo(-24, -6, 0, -29); g.fill();
  g.fillRect(-1.5, 24, 3, 7);                                         // pétiole
  g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -24); g.lineTo(0, 26);
  for (let k = -16; k < 18; k += 8) { g.moveTo(0, k); g.lineTo(9, k - 7); g.moveTo(0, k); g.lineTo(-9, k - 7); }
  g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
/**
 * @param spot  fonction qui renvoie une direction où poser une feuille
 */
export function makeGroundLeaves(planet, count, spot) {
  const geo = new THREE.PlaneGeometry(0.17, 0.17).rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ map: LEAF_SHAPE, alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.8 });
  const mesh = new THREE.InstancedMesh(geo, mat, count); mesh.frustumCulled = false; mesh.receiveShadow = true;
  const palette = ['#e8893a', '#f2b33d', '#d9603a', '#c94a2e', '#e7c23a', '#b8a02a', '#ee6aa4'].map(c => new THREE.Color(c));
  const CELL = 1, cells = new Map(), L = [];
  const key = p => ((Math.floor(p.x / CELL) + 512) * 1024 + (Math.floor(p.y / CELL) + 512)) * 1024 + (Math.floor(p.z / CELL) + 512);
  const Y = new THREE.Vector3(0, 1, 0), m4 = new THREE.Matrix4(), dq = new THREE.Quaternion(), sc = new THREE.Vector3(), tmp = new THREE.Vector3(), ax = new THREE.Vector3();
  const rest = dir => Math.max(planet.heightDir(dir), planet.waterR) + (planet.onPlaza(dir, 0) ? 0.05 : 0.016);
  const lay = (l, dir) => {   // pose à plat, orientation au hasard
    l.p.copy(dir).multiplyScalar(rest(dir));
    l.q.setFromUnitVectors(Y, dir).multiply(dq.setFromAxisAngle(Y, Math.random() * Math.PI * 2));
    l.key = key(l.p); let c = cells.get(l.key); if (!c) cells.set(l.key, c = []); c.push(l.i);
  };
  for (let i = 0; i < count; i++) {
    const l = { i, p: new THREE.Vector3(), q: new THREE.Quaternion(), v: new THREE.Vector3(), w: new THREE.Vector3(), s: 0.7 + Math.random() * 0.7, fly: false, key: 0 };
    L.push(l); lay(l, spot());
    mesh.setMatrixAt(i, m4.compose(l.p, l.q, sc.setScalar(l.s))); mesh.setColorAt(i, palette[i % palette.length].clone().multiplyScalar(0.85 + Math.random() * 0.3));
  }
  mesh.instanceColor.needsUpdate = true;
  const active = new Set();
  return {
    mesh,
    /** car : position de la voiture ; speed : vitesse ; on : la voiture roule au sol */
    update(dt, car, speed, on) {
      let dirty = false;
      if (on && Math.abs(speed) > 0.8) {
        const reach = 0.5 + Math.abs(speed) * 0.07, cx = Math.floor(car.x / CELL), cy = Math.floor(car.y / CELL), cz = Math.floor(car.z / CELL);
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
          const k = ((cx + a + 512) * 1024 + (cy + b + 512)) * 1024 + (cz + c + 512), cell = cells.get(k); if (!cell) continue;
          for (let j = cell.length - 1; j >= 0; j--) {
            const l = L[cell[j]]; if (l.p.distanceTo(car) > reach) continue;
            const up = tmp.copy(l.p).normalize();
            ax.copy(l.p).sub(car).addScaledVector(up, -ax.copy(l.p).sub(car).dot(up));
            const away = ax.lengthSq() > 1e-6 ? ax.normalize() : ax.set(1, 0, 0);
            l.v.copy(away).multiplyScalar(0.5 + Math.abs(speed) * (0.12 + Math.random() * 0.15)).addScaledVector(up, 0.9 + Math.abs(speed) * (0.1 + Math.random() * 0.14));
            l.w.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(5 + Math.random() * 9);
            l.fly = true; active.add(l); cell.splice(j, 1);
          }
        }
      }
      for (const l of active) {
        const up = tmp.copy(l.p).normalize();
        l.v.addScaledVector(up, -3.2 * dt); l.v.multiplyScalar(Math.exp(-dt * 1.7));
        l.p.addScaledVector(l.v, dt);
        const sp = l.w.length(); if (sp > 0) l.q.premultiply(dq.setFromAxisAngle(ax.copy(l.w).divideScalar(sp), sp * dt));
        l.w.multiplyScalar(Math.exp(-dt * 0.8));
        const dir = up, g = rest(dir);
        if (l.p.length() <= g && l.v.dot(up) < 0) { l.fly = false; active.delete(l); lay(l, dir.clone()); }
        mesh.setMatrixAt(l.i, m4.compose(l.p, l.q, sc.setScalar(l.s))); dirty = true;
      }
      if (dirty) mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
