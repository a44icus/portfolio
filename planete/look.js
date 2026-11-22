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
  uShadowTint: { value: new THREE.Vector3(0.5, 0.4, 0.86) },   // ombres bleu-violet
  uLitTint: { value: new THREE.Vector3(1.07, 1.0, 0.88) },     // lumière chaude
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
export function makePost(renderer, scene, camera, quality) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.4, 0.45, 1.05);
  composer.addPass(bloom);
  const tiltH = new ShaderPass(TiltShift), tiltV = new ShaderPass(TiltShift), tiltH2 = new ShaderPass(TiltShift), tiltV2 = new ShaderPass(TiltShift);
  const tilts = quality === 'low' ? [tiltH, tiltV] : [tiltH, tiltV, tiltH2, tiltV2];
  tilts.forEach(p => composer.addPass(p));
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
    render() { composer.render(); },
  };
}

/* ---------- feuilles qui volent ---------- */
export function makeLeaves(planet, count) {
  const geo = new THREE.PlaneGeometry(0.09, 0.06);
  const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.8 });
  const mesh = new THREE.InstancedMesh(geo, mat, count); mesh.frustumCulled = false;
  const palette = ['#e8893a', '#f2b33d', '#d9603a', '#9fc24a', '#7fb03a'].map(c => new THREE.Color(c));
  const L = [], m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1);
  const tmp = new THREE.Vector3(), t1 = new THREE.Vector3(), t2 = new THREE.Vector3();
  for (let i = 0; i < count; i++) { L.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), rot: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6), spin: new THREE.Vector3(Math.random() * 3, Math.random() * 3, Math.random() * 3), live: false }); mesh.setColorAt(i, palette[i % palette.length]); }
  mesh.instanceColor.needsUpdate = true;
  function spawn(l, center, up, top) {
    t1.set(1, 0, 0); if (Math.abs(up.x) > 0.9) t1.set(0, 1, 0); t1.addScaledVector(up, -t1.dot(up)).normalize(); t2.crossVectors(up, t1);
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 7;
    l.p.copy(center).addScaledVector(t1, Math.cos(a) * r).addScaledVector(t2, Math.sin(a) * r).addScaledVector(up, top ? 1.2 + Math.random() * 0.8 : 0.2 + Math.random() * 1.8);
    l.v.copy(t1).multiplyScalar(0.5 + Math.random() * 0.4).addScaledVector(t2, 0.25).addScaledVector(up, -(0.35 + Math.random() * 0.3));
    l.live = true;
  }
  return {
    mesh,
    update(dt, t, center, on) {
      mesh.visible = on; if (!on) { L.forEach(l => { l.live = false; }); return; }
      const up = tmp.copy(center).normalize().clone();
      L.forEach((l, i) => {
        if (!l.live) spawn(l, center, up, false);
        l.p.addScaledVector(l.v, dt); l.p.addScaledVector(up, Math.sin(t * 2 + i) * 0.15 * dt);
        l.rot.addScaledVector(l.spin, dt);
        const g = planet.groundRadius(tmp.copy(l.p).normalize());
        if (l.p.length() < g + 0.03 || l.p.distanceTo(center) > 9) spawn(l, center, up, true);
        q.setFromEuler(e.set(l.rot.x, l.rot.y, l.rot.z)); mesh.setMatrixAt(i, m4.compose(l.p, q, one));
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
