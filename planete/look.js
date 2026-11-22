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
  uniforms: { tDiffuse: { value: null }, uSat: { value: 1.18 } },
  vertexShader: TiltShift.vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uSat; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, uSat);
      float sh = 1.0 - smoothstep(0.0, 0.35, l), hi = smoothstep(0.35, 1.2, l);
      c.rgb += vec3(0.035, -0.01, 0.05) * sh + vec3(0.04, 0.012, -0.03) * hi;
      gl_FragColor = vec4(max(c.rgb, 0.0), c.a);
    }`,
};
export function makePost(renderer, scene, camera, quality) {
  // anticrénelage : rendu multi-échantillonné (MSAA), que le post-traitement conserve
  // les téléphones sans rendu en flottant passent en 8 bits (sinon écran noir)
  const ext = renderer.extensions, flt = ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float');
  const rt = new THREE.WebGLRenderTarget(4, 4, { type: flt ? THREE.HalfFloatType : THREE.UnsignedByteType, samples: quality === 'low' ? 2 : 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.4, 0.45, 1.05);
  composer.addPass(bloom);
  const tiltH = new ShaderPass(TiltShift), tiltV = new ShaderPass(TiltShift), tiltH2 = new ShaderPass(TiltShift), tiltV2 = new ShaderPass(TiltShift);
  const tilts = quality === 'low' ? [tiltH, tiltV] : [tiltH, tiltV, tiltH2, tiltV2];
  tilts.forEach(p => composer.addPass(p));
  const grade = new ShaderPass(Grade); composer.addPass(grade);
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
    bloom, grade,
    setBand(b) { tilts.forEach(p => { p.uniforms.uBand.value = b; }); },
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
export const GLEAF = { uLeafS: { value: 1 } };
const LEAF_SHAPE = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  g.translate(32, 32); g.rotate(0.5);
  g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, -29); g.quadraticCurveTo(24, -6, 0, 26); g.quadraticCurveTo(-24, -6, 0, -29); g.fill();
  g.fillRect(-1.5, 24, 3, 7);                                         // pétiole
  g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -24); g.lineTo(0, 26);
  for (let k = -16; k < 18; k += 8) { g.moveTo(0, k); g.lineTo(9, k - 7); g.moveTo(0, k); g.lineTo(-9, k - 7); }
  g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; return t;
})();
/**
 * @param spot  fonction qui renvoie une direction où poser une feuille
 */
export function makeGroundLeaves(planet, count, spot) {
  const geo = new THREE.PlaneGeometry(0.26, 0.26).rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ map: LEAF_SHAPE, alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.8 });
  mat.onBeforeCompile = sh => { sh.uniforms.uLeafS = GLEAF.uLeafS; sh.vertexShader = 'uniform float uLeafS;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed *= uLeafS;'); };
  mat.customProgramCacheKey = () => 'ground-leaf';
  const mesh = new THREE.InstancedMesh(geo, mat, count); mesh.frustumCulled = false; mesh.receiveShadow = true;
  const palette = ['#f07a32', '#e8502e', '#d93a2a', '#f2a23a', '#c94a2e', '#ee6aa4', '#e2b83a'].map(c => new THREE.Color(c));
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
    mesh, max: count,
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

/* ---------- traînées lumineuses du turbo : deux rubans au sol, jaune-blanc puis rose, qui s'effacent ---------- */
/* ---------- traces de pneus dans le sable : petits rubans sombres qui s'effacent ---------- */
export function makeTireTracks(N = 1400, life = 28) {
  const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5);
  const born = new Float32Array(N).fill(-1e4), str = new Float32Array(N), len = new Float32Array(N);
  geo.setAttribute('aBorn', new THREE.InstancedBufferAttribute(born, 1));
  geo.setAttribute('aStr', new THREE.InstancedBufferAttribute(str, 1));
  geo.setAttribute('aLen', new THREE.InstancedBufferAttribute(len, 1));
  const U = { uTime: { value: 0 }, uLife: { value: life } };
  const mat = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    // multiplication : le sable s'assombrit là où la roue est passée, quelle que soit sa couleur
    blending: THREE.CustomBlending, blendSrc: THREE.DstColorFactor, blendDst: THREE.ZeroFactor,
    vertexShader: `
      attribute float aBorn, aStr, aLen; uniform float uTime, uLife; varying vec2 vUv; varying float vA, vL;
      void main() {
        vUv = uv; vL = aLen;
        float age = uTime - aBorn; vA = aStr * (1.0 - smoothstep(uLife * 0.6, uLife, age)) * step(0.0, age);
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec2 vUv; varying float vA, vL;
      void main() {
        float edge = smoothstep(0.0, 0.22, vUv.x) * smoothstep(1.0, 0.78, vUv.x);
        float tread = 0.7 + 0.3 * step(0.5, fract(vUv.y * vL / 0.075 + step(0.5, vUv.x) * 0.5));   // crampons décalés
        float k = vA * edge * tread * 0.42;
        gl_FragColor = vec4(vec3(1.0 - k), 1.0);
      }`,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, N); mesh.frustumCulled = false; mesh.renderOrder = 1;
  const zero = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < N; i++) mesh.setMatrixAt(i, zero);
  const m4 = new THREE.Matrix4(), seg = new THREE.Vector3(), side = new THREE.Vector3(), up = new THREE.Vector3();
  let next = 0;
  return {
    mesh, uniforms: U,
    /** Un tronçon de trace de a à b (positions du monde, déjà posées sur le sol), d'intensité k. */
    add(a, b, width, k, t) {
      seg.subVectors(b, a); const L = seg.length(); if (L < 1e-3) return;
      up.copy(a).normalize(); side.crossVectors(up, seg).normalize().multiplyScalar(width);
      m4.makeBasis(side, up, seg).setPosition(a);
      mesh.setMatrixAt(next, m4); born[next] = t; str[next] = k; len[next] = L;
      next = (next + 1) % N;
      mesh.instanceMatrix.needsUpdate = true; ['aBorn', 'aStr', 'aLen'].forEach(n => { geo.attributes[n].needsUpdate = true; });
    },
  };
}

export function makeTrails(N = 90, life0 = 1.7, width0 = 0.09) {
  const cfg = { life: life0, width: width0 };
  const U = { uC1: { value: new THREE.Color('#ffd159') }, uC2: { value: new THREE.Color('#ff6168') }, uC3: { value: new THREE.Color('#e629b8') }, uI: { value: 1 }, uMid: { value: 0.15 } };
  const group = new THREE.Group();
  const mat = new THREE.ShaderMaterial({
    // mélange normal (pas additif) et valeurs bornées : les couleurs restent pures, sans virer au blanc
    transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: U,
    vertexShader: 'attribute float aT; attribute float aA; varying float vT; varying float vA; void main(){ vT = aT; vA = aA; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3; uniform float uI; uniform float uMid; varying float vT; varying float vA;
      vec3 rgb2hsv(vec3 c) {
        vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
        vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
        vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
        float d = q.x - min(q.w, q.y);
        return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
      }
      vec3 hsv2rgb(vec3 c) { vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0); return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y); }
      // dégradé qui tourne sur la roue des couleurs (jaune → orange → rouge → magenta → violet), sans passer par le gris ou le blanc
      vec3 hmix(vec3 a, vec3 b, float t) {
        vec3 A = rgb2hsv(pow(a, vec3(1.0 / 2.2))), B = rgb2hsv(pow(b, vec3(1.0 / 2.2)));
        if (A.y < 0.05) A.x = B.x; if (B.y < 0.05) B.x = A.x;
        float dh = B.x - A.x; if (dh > 0.5) dh -= 1.0; if (dh < -0.5) dh += 1.0;
        return pow(hsv2rgb(vec3(fract(A.x + dh * t), mix(A.y, B.y, t), mix(A.z, B.z, t))), vec3(2.2));
      }
      void main(){
        vec3 c = vT < uMid ? hmix(uC1, uC2, vT / max(uMid, 1e-3)) : hmix(uC2, uC3, min(1.0, (vT - uMid) / max(1.0 - uMid, 1e-3) * 1.4));
        c *= 0.6 + 0.22 * min(uI, 2.0);                       // éclat : un peu de lumière en plus, sans saturer
        gl_FragColor = vec4(c, vA * clamp(0.35 + 0.4 * uI, 0.0, 1.0));
      }`,
  });
  const trails = [0, 1].map(() => {
    const pos = new Float32Array(N * 2 * 3), aT = new Float32Array(N * 2), aA = new Float32Array(N * 2), idx = [];
    for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aT', new THREE.BufferAttribute(aT, 1)); g.setAttribute('aA', new THREE.BufferAttribute(aA, 1)); g.setIndex(idx);
    const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.renderOrder = 3; group.add(m);
    return { g, pts: [] };   // pts : { p, side, age, k }
  });
  const v = new THREE.Vector3();
  return {
    group, cfg, uniforms: U,
    /** heads : positions des deux échappements au sol ; side : vecteur latéral ; k : force (0 = pas de turbo) */
    update(dt, heads, side, k) {
      trails.forEach((tr, j) => {
        tr.pts.forEach(p => { p.age += dt; });
        while (tr.pts.length && tr.pts[tr.pts.length - 1].age > cfg.life) tr.pts.pop();
        const head = heads[j], last = tr.pts[0];
        if (k > 0.02 && (!last || last.p.distanceTo(head) > 0.1)) { tr.pts.unshift({ p: head.clone(), side: side.clone(), age: 0, k }); if (tr.pts.length > N) tr.pts.pop(); }
        else if (last && k > 0.02) { last.p.copy(head); last.side.copy(side); last.age = 0; last.k = k; }
        const pos = tr.g.attributes.position.array, aT = tr.g.attributes.aT.array, aA = tr.g.attributes.aA.array;
        for (let i = 0; i < N; i++) {
          const p = tr.pts[Math.min(i, tr.pts.length - 1)];
          if (!p) { aA[i * 2] = aA[i * 2 + 1] = 0; continue; }
          const t = Math.min(1, p.age / cfg.life), w = cfg.width * (1 - 0.5 * t);
          v.copy(p.p).addScaledVector(p.side, w / 2); pos.set([v.x, v.y, v.z], i * 6);
          v.copy(p.p).addScaledVector(p.side, -w / 2); pos.set([v.x, v.y, v.z], i * 6 + 3);
          const a = i < tr.pts.length ? p.k * (1 - t) : 0;
          aT[i * 2] = aT[i * 2 + 1] = t; aA[i * 2] = aA[i * 2 + 1] = a;
        }
        tr.g.attributes.position.needsUpdate = tr.g.attributes.aT.needsUpdate = tr.g.attributes.aA.needsUpdate = true;
      });
    },
  };
}
