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
  // lampadaires, phare de la Jeep, faisceaux du phare : 0 quand tous sont éteints (app.js), et on saute leur calcul
  uLocalLights: { value: 1 },
  // monde à l'envers : progression (0 à 1), point de départ de la vague (direction), rayon atteint (radians), repère de la caméra
  uUpK: { value: 0 }, uUpO: { value: new THREE.Vector3(0, 1, 0) }, uUpR: { value: 0 }, uViewInv: { value: new THREE.Matrix4() },
};
/** Monde à l'envers : la vague part d'un point de la planète et gagne tout le décor (gris-bleu, lianes sombres, liseré rouge sur le front). */
export const UPSIDE_GLSL = /* glsl */ `
  vec3 upsideColor(vec3 col, vec3 wp) {
    if (uUpK < 0.001) return col;
    float dU = acos(clamp(dot(normalize(wp), uUpO), -1.0, 1.0));
    float kU = uUpK * (1.0 - smoothstep(uUpR - 0.3, uUpR, dU));
    if (kU > 0.001) {
      float lU = dot(col, vec3(0.299, 0.587, 0.114));
      vec3 cU = mix(vec3(lU), col, 0.45) * 0.62;   // les vraies couleurs, éteintes (l'étalonnage final fait le reste)
      vec3 q = wp * 2.3;   // lianes : fines veines sombres et rougeâtres qui courent sur tout
      float vn = abs(sin(q.x * 3.1 + sin(q.y * 2.7) * 1.7) + sin(q.z * 2.9 + sin(q.x * 3.3) * 1.5));
      cU = mix(cU, cU * 0.25, (1.0 - smoothstep(0.0, 0.1, vn)) * 0.8);
      col = mix(col, cU, kU);
    }
    float eU = uUpK * smoothstep(uUpR - 0.22, uUpR - 0.02, dU) * (1.0 - smoothstep(uUpR - 0.02, uUpR, dU)) * (1.0 - step(3.2, uUpR));
    return col + vec3(1.0, 0.15, 0.12) * eU * 0.5;
  }
`;
export const UPSIDE_UNIFORMS = 'uniform float uUpK;\nuniform vec3 uUpO;\nuniform float uUpR;\nuniform mat4 uViewInv;\n';
const RAMP = /* glsl */ `
  {
    float al = max(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)), 0.025);
    float lit = dot(outgoingLight - totalEmissiveRadiance, vec3(0.299, 0.587, 0.114)) / al;
    float t = smoothstep(0.16, 1.0, lit);
    vec3 shade = diffuseColor.rgb * mix(uShadowTint, uLitTint, t) * mix(0.5, 1.14, t);
    outgoingLight = mix(outgoingLight, shade + totalEmissiveRadiance, uStylize);
  }
  #include <opaque_fragment>`;
const RAMP_UP = RAMP.replace('#include <opaque_fragment>', 'outgoingLight = upsideColor(outgoingLight, (uViewInv * vec4(-vViewPosition, 1.0)).xyz);\n  #include <opaque_fragment>');

/**
 * Éclairage par pixel sans les lumières ponctuelles et projecteurs tant qu'ils sont tous éteints : three.js les calcule
 * pour chaque pixel même à intensité nulle (6 lampadaires, la Jeep, les 2 faisceaux du phare). L'image ne change pas
 * (une lumière éteinte n'ajoute rien) ; le test porte sur une valeur commune à toute l'image, donc il ne coûte presque rien.
 */
const GATED_LIGHTS = (() => {
  let src = THREE.ShaderChunk.lights_fragment_begin;
  for (const n of ['NUM_POINT_LIGHTS', 'NUM_SPOT_LIGHTS']) {
    const a = src.indexOf('\t#pragma unroll_loop_start\n\tfor ( int i = 0; i < ' + n);
    const e = '#pragma unroll_loop_end', b = src.indexOf(e, a) + e.length;
    if (a < 0 || b < e.length) return null;   // autre version de three.js : on garde le calcul d'origine
    src = src.slice(0, a) + '\tif ( uLocalLights > 0.5 ) {\n' + src.slice(a, b) + '\n\t}' + src.slice(b);
  }
  return src;
})();

/** Donne le rendu « illustration » à un matériau standard : la lumière choisit entre une teinte d'ombre et une teinte éclairée. */
export function stylize(m) {
  if (!m || !m.isMeshStandardMaterial || m.userData.styled) return;
  m.userData.styled = true;
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey.bind(m);
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    Object.assign(sh.uniforms, LOOK);
    const up = !m.userData.noUpside;   // (la voiture du joueur et le portail gardent leurs couleurs)
    sh.fragmentShader = 'uniform vec3 uShadowTint;\nuniform vec3 uLitTint;\nuniform float uStylize;\nuniform float uLocalLights;\n' + (up ? UPSIDE_UNIFORMS + UPSIDE_GLSL : '') + sh.fragmentShader.replace('#include <opaque_fragment>', up ? RAMP_UP : RAMP);
    if (GATED_LIGHTS) sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_begin>', GATED_LIGHTS);
  };
  m.customProgramCacheKey = () => prevKey() + (m.userData.noUpside ? '|look' : '|look-up');
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
  uniforms: { tDiffuse: { value: null }, uSat: { value: 1.18 }, uUp: { value: 0 }, uTime: { value: 0 }, uMoon: { value: 0 } },
  vertexShader: TiltShift.vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uSat; uniform float uUp; uniform float uTime; uniform float uMoon; varying vec2 vUv;
    float grainH(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, uSat);
      float sh = 1.0 - smoothstep(0.0, 0.35, l), hi = smoothstep(0.35, 1.2, l);
      c.rgb += vec3(0.035, -0.01, 0.05) * sh * (1.0 - uUp) + vec3(0.04, 0.012, -0.03) * hi * (1.0 - uUp);
      if (uUp > 0.001) {
        // monde à l'envers, étalonnage « cinéma » : les vraies couleurs, désaturées (surtout les lumières, qui virent au blanc),
        // posées sur un noir bleuté (#151a20) qui remonte vers un bleu nuit (#15263a) dans les tons moyens
        float lu = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
        float red = smoothstep(2.5, 6.0, c.r / max(max(c.g, c.b), 0.02)) * smoothstep(0.25, 0.9, c.r);   // les rouges vifs (néon, feux, portail) gardent leur couleur
        vec3 des = mix(vec3(lu), c.rgb, mix(0.45, 1.0, red));
        vec3 blk = vec3(0.0075, 0.0103, 0.0144), nav = vec3(0.0075, 0.019, 0.042);
        vec3 tint = mix(blk, nav, smoothstep(0.0, 0.25, lu));
        vec3 g = des * vec3(0.8, 0.92, 1.08) * 0.78 + tint * 2.1;
        // grain de film léger, plus visible dans les tons moyens ; vignette douce
        float n = grainH(floor(gl_FragCoord.xy) + fract(uTime * 7.31) * 113.0) - 0.5;
        g *= 1.0 + n * 0.22 * (1.0 - smoothstep(0.6, 1.6, lu));
        vec2 q = vUv - 0.5; g *= 1.0 - 0.55 * dot(q, q);
        c.rgb = mix(c.rgb, g, uUp);
      }
      if (uMoon > 0.001) {
        // nuit de pleine lune (E.T.) : tout bascule dans un bleu froid et brumeux ; les lumières vives gardent un peu de leur couleur
        float lu = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
        vec3 blue = lu * vec3(0.55, 0.8, 1.42) + vec3(0.006, 0.012, 0.03);
        float mx = max(c.r, max(c.g, c.b)), sat = (mx - min(c.r, min(c.g, c.b))) / max(mx, 0.001);
        float keep = 0.18 + 0.45 * smoothstep(0.9, 2.5, lu) + 0.75 * smoothstep(0.62, 0.9, sat) * smoothstep(0.45, 0.9, mx);   // les petites touches vives et lumineuses (bonbons) gardent leur couleur
        vec3 m = mix(blue, c.rgb, min(keep, 0.95));
        vec2 q = vUv - 0.5; m *= 1.0 - 0.45 * dot(q, q);
        c.rgb = mix(c.rgb, m, uMoon);
      }
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
  // three.js prend un écart-type égal au rayon du noyau : coupé à 1 sigma, ce flou est presque « en boîte » et donnait
  // des halos carrés autour des points très lumineux (lucioles, paillettes du sable). Coupé à 2 sigmas, le halo est rond.
  bloom.separableBlurMaterials.forEach(m => {
    const r = m.defines.KERNEL_RADIUS, s = Math.max(1, r / 2);
    m.uniforms.gaussianCoefficients.value = Array.from({ length: r }, (_, i) => 0.39894 * Math.exp(-0.5 * i * i / (s * s)) / s);
  });
  composer.addPass(bloom);
  const tiltH = new ShaderPass(TiltShift), tiltV = new ShaderPass(TiltShift), tiltH2 = new ShaderPass(TiltShift), tiltV2 = new ShaderPass(TiltShift);
  // 4 passes partout : avec 2 seulement (ancienne version téléphone), un point brillant (paillette du sable) était recopié en petits carrés
  const tilts = [tiltH, tiltV, tiltH2, tiltV2];
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
    bloom, grade, target: rt,   // la scène est dessinée dans ce tampon (linéaire, sans tone mapping) : sert à précompiler les bons shaders
    setBand(b) { tilts.forEach(p => { p.uniforms.uBand.value = b; }); },
    render() { composer.render(); },
    samples: rt.samples,
    /** Anticrénelage : nombre d'échantillons par pixel du rendu de la scène (0 : aucun). */
    setSamples(n) { for (const t of [composer.renderTarget1, composer.renderTarget2]) if (t.samples !== n) { t.samples = n; t.dispose(); } },
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
  // même forme que les feuilles des cartes du feuillage (LEAF_MASK) : un carré dont le flou arrondit à peine les coins
  g.filter = 'blur(4px)'; g.fillStyle = '#fff'; g.fillRect(8, 8, 48, 48);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; return t;
})();
/**
 * @param spot  fonction qui renvoie une direction où poser une feuille ; dir.tint = [famille, nuance] du feuillage de l'arbre d'où elle tombe
 */
export function makeGroundLeaves(planet, count, spot) {
  // carré de 0,048 (les 3/4 du plan) : une feuille des cartes du feuillage (9 à 16 % d'une carte de 0,39) ; uLeafS y ajoute la taille des arbres
  const geo = new THREE.PlaneGeometry(0.064, 0.064).rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ map: LEAF_SHAPE, alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.8 });
  mat.onBeforeCompile = sh => { sh.uniforms.uLeafS = GLEAF.uLeafS; sh.vertexShader = 'uniform float uLeafS;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed *= uLeafS;'); };
  mat.customProgramCacheKey = () => 'ground-leaf';
  const mesh = new THREE.InstancedMesh(geo, mat, count); mesh.frustumCulled = false; mesh.receiveShadow = true;
  const tints = [];   // [famille, nuance r g b] : la couleur du feuillage de l'arbre (repeinte avec les arbres)
  const CELL = 1, cells = new Map(), L = [];
  const key = p => ((Math.floor(p.x / CELL) + 512) * 1024 + (Math.floor(p.y / CELL) + 512)) * 1024 + (Math.floor(p.z / CELL) + 512);
  const Y = new THREE.Vector3(0, 1, 0), m4 = new THREE.Matrix4(), dq = new THREE.Quaternion(), sc = new THREE.Vector3(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), ax = new THREE.Vector3();
  const rest = dir => Math.max(planet.heightDir(dir), planet.waterR) + (planet.onPlaza(dir, 0) ? 0.05 : 0.016);
  const lay = (l, dir) => {   // pose à plat, orientation au hasard
    l.p.copy(dir).multiplyScalar(rest(dir));
    l.q.setFromUnitVectors(Y, dir).multiply(dq.setFromAxisAngle(Y, Math.random() * Math.PI * 2));
    l.key = key(l.p); let c = cells.get(l.key); if (!c) cells.set(l.key, c = []); c.push(l.i);
  };
  for (let i = 0; i < count; i++) {
    const l = { i, p: new THREE.Vector3(), q: new THREE.Quaternion(), v: new THREE.Vector3(), w: new THREE.Vector3(), r: Math.random() - 0.5, s: 1, fly: false, key: 0 };
    l.s = 1 + l.r * 0.6; const dir = spot(); L.push(l); lay(l, dir);
    const t = dir.tint || [0, [1, 1, 1]], f = 0.78 + Math.random() * 0.2;   // un peu plus sombre qu'au houppier : posée à plat, sans l'ombre interne du feuillage
    tints.push([t[0], t[1].map(v => v * f)]);
    mesh.setMatrixAt(i, m4.compose(l.p, l.q, sc.setScalar(l.s)));
  }
  /** Repeint les feuilles comme les arbres : hexes = couleur de chaque famille (jaune, olive, orange, rouge, rose, sapin). */
  const recolor = hexes => {
    const G = hexes.map(h => new THREE.Color(h)), c = new THREE.Color();
    tints.forEach(([g, k], i) => { const b = G[g] || G[0]; mesh.setColorAt(i, c.setRGB(b.r * k[0], b.g * k[1], b.b * k[2])); });
    mesh.instanceColor.needsUpdate = true;
  };
  recolor(['#c9b52e', '#b0a52a', '#ec7a2e', '#e0502e', '#ee6aa4', '#6e6a20']);
  const active = new Set(); let spread = 1;
  const out = {
    mesh, max: count, recolor,
    /** force de l'envol au passage du véhicule (1 = normale) */
    lift: 1,
    /** écart de tailles entre les feuilles (0 : toutes pareilles, 1 : normal, 2 : très varié) */
    setSpread(v) {
      if (v === spread) return; spread = v;
      for (const l of L) { l.s = Math.max(0.15, 1 + l.r * 0.6 * v); if (!l.fly) mesh.setMatrixAt(l.i, m4.compose(l.p, l.q, sc.setScalar(l.s))); }
      mesh.instanceMatrix.needsUpdate = true;
    },
    /** car : position de la voiture ; speed : vitesse ; on : la voiture roule au sol ; hover : l'aéroglisseur glisse (il chasse les feuilles posées sur l'eau) */
    update(dt, car, speed, on, hover = false) {
      let dirty = false;
      if ((on || hover) && out.lift > 0 && Math.abs(speed) > (on ? 0.8 : 0.4)) {
        const reach = (on ? 0.5 : 0.75) + Math.abs(speed) * (on ? 0.07 : 0.09), cx = Math.floor(car.x / CELL), cy = Math.floor(car.y / CELL), cz = Math.floor(car.z / CELL);
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
          const k = ((cx + a + 512) * 1024 + (cy + b + 512)) * 1024 + (cz + c + 512), cell = cells.get(k); if (!cell) continue;
          for (let j = cell.length - 1; j >= 0; j--) {
            const l = L[cell[j]]; if (l.p.distanceTo(car) > reach) continue;
            const up = tmp.copy(l.p).normalize();
            const onWater = l.p.length() < planet.waterR + 0.03;
            if (hover && !on && !onWater) continue;   // l'aéroglisseur ne soulève que les feuilles sur l'eau
            ax.copy(l.p).sub(car).addScaledVector(up, -ax.copy(l.p).sub(car).dot(up));
            const away = ax.lengthSq() > 1e-6 ? ax.normalize() : ax.set(1, 0, 0);
            if (onWater && !on) {   // sur l'eau : poussées de côté par le souffle, en rasant la surface et en tournoyant
              l.v.copy(away).multiplyScalar(0.7 + Math.abs(speed) * (0.16 + Math.random() * 0.12)).addScaledVector(up, 0.35 + Math.random() * 0.45).multiplyScalar(out.lift);
              l.w.copy(up).multiplyScalar((Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 7)).add(tmp2.set(Math.random() - 0.5, 0, Math.random() - 0.5).multiplyScalar(3));
            } else {
              l.v.copy(away).multiplyScalar(0.5 + Math.abs(speed) * (0.12 + Math.random() * 0.15)).addScaledVector(up, 0.9 + Math.abs(speed) * (0.1 + Math.random() * 0.14)).multiplyScalar(out.lift);
              l.w.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(5 + Math.random() * 9);
            }
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
  return out;
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

/* ---------- sillage d'écume de l'aéroglisseur ----------
   Même dessin que l'écume du rivage (world.js) : des traits blancs nets et fins, effilés aux bouts, qui ondulent.
   Un ruban continu suit la trajectoire (les traits restent d'un seul tenant dans les virages) ; il s'ouvre en V
   avec le temps, et ses traits se fragmentent jusqu'à disparaître. */
export function makeWake(N = 360, life = 7) {
  const V = N * 2;
  const center = new Float32Array(V * 3), side = new Float32Array(V * 3), uu = new Float32Array(V), born = new Float32Array(V).fill(-1e4), str = new Float32Array(V), w0 = new Float32Array(V);
  for (let i = 0; i < N; i++) { uu[i * 2] = -1; uu[i * 2 + 1] = 1; }
  const geo = new THREE.BufferGeometry();
  const attr = (n, a, k) => { const b = new THREE.BufferAttribute(a, k); b.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(n, b); return b; };
  const A = { position: attr('position', center, 3), aSide: attr('aSide', side, 3), aU: attr('aU', uu, 1), aBorn: attr('aBorn', born, 1), aStr: attr('aStr', str, 1), aW0: attr('aW0', w0, 1) };
  const index = new Uint16Array(N * 6); geo.setIndex(new THREE.BufferAttribute(index, 1)); geo.index.setUsage(THREE.DynamicDrawUsage); geo.setDrawRange(0, 0);
  const U = { uTime: { value: 0 }, uLife: { value: life }, uSpread: { value: 0.3 }, uColor: { value: new THREE.Color(1.0, 0.98, 0.95) }, uLight: { value: 1 } };
  const mat = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    vertexShader: `
      attribute vec3 aSide; attribute float aU, aBorn, aStr, aW0; uniform float uTime, uLife, uSpread;
      varying float vX, vAge, vS, vWid; varying vec3 vW;
      void main() {
        vAge = (uTime - aBorn) / uLife; vS = aStr * step(0.0, vAge); vX = aU;
        vWid = aW0 + uSpread * max(uTime - aBorn, 0.0);                       // le sillage s'ouvre avec le temps
        vec4 w = modelMatrix * vec4(position + aSide * aU * 0.5 * vWid, 1.0); vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `
      uniform float uTime; uniform vec3 uColor; uniform float uLight; varying float vX, vAge, vS, vWid; varying vec3 vW;
      float h(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float n3(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z); }
      // un trait d'écume à la distance « at » de l'axe (unités du monde) : fin, net, effilé aux bouts, morcelé avec l'âge
      float stroke(float d, float at, float seed, float w, float th) {
        float seg = n3(vW * (1.1 + seed * 0.17) + vec3(seed * 7.3, 3.1 - uTime * 0.05, seed * 2.9));
        float on = smoothstep(th, th + 0.14, seg);                             // 0 → 1 : les bouts du trait s'amincissent
        float ww = w * on, dist = abs(d - at), fw = fwidth(d) * 0.8;
        return on * (1.0 - smoothstep(ww, ww + fw, dist));
      }
      void main() {
        if (vAge > 1.0 || vS <= 0.0) discard;
        float halfW = 0.5 * vWid;
        // distance à l'axe, en unités du monde, qui ondule doucement
        float d = abs(vX) * halfW + (n3(vW * 1.6 + vec3(0.0, uTime * 0.15, 0.0)) - 0.5) * 0.08;
        float lw = 0.02 * (0.6 + 0.4 * vS), th = 0.28 + 0.6 * vAge;          // de plus en plus de trous en vieillissant
        float foam = stroke(d, halfW * 0.88, 1.0, lw * 1.3, th);              // les deux bords du V, plus marqués
        foam = max(foam, stroke(d, halfW * 0.62, 2.0, lw, th + 0.05));
        foam = max(foam, stroke(d, halfW * 0.34, 3.0, lw * 0.9, th + 0.1));
        foam = max(foam, stroke(d, halfW * 0.1, 4.0, lw * 1.6, 0.25 + 3.0 * vAge));   // remous au centre, juste derrière la jupe
        foam *= step(d, halfW) * vS;
        if (foam < 0.02) discard;
        gl_FragColor = vec4(uColor * uLight, clamp(foam, 0.0, 1.0));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 3;
  const link = new Uint8Array(N), up = new THREE.Vector3(), sd = new THREE.Vector3();
  let next = 0, hasPrev = false;
  function rebuild() {
    let n = 0;
    for (let i = 0; i < N; i++) {
      if (!link[i]) continue;
      const p = (i - 1 + N) % N, a = p * 2, b = a + 1, c = i * 2, e = c + 1;
      index[n++] = a; index[n++] = b; index[n++] = c; index[n++] = b; index[n++] = e; index[n++] = c;
    }
    geo.index.needsUpdate = true; geo.setDrawRange(0, n);
  }
  return {
    mesh, uniforms: U,
    /** Ajoute un point au ruban (à la surface de l'eau), cap fwd, largeur de départ w, intensité k. */
    push(pt, fwd, w, k, t) {
      const i = next; next = (next + 1) % N;
      up.copy(pt).normalize(); sd.crossVectors(up, fwd).normalize();
      for (let v = i * 2; v < i * 2 + 2; v++) { center.set([pt.x, pt.y, pt.z], v * 3); side.set([sd.x, sd.y, sd.z], v * 3); born[v] = t; str[v] = k; w0[v] = w; }
      link[i] = hasPrev ? 1 : 0; link[next] = 0; hasPrev = true;   // (le point suivant du tampon va être réécrit : on coupe son lien)
      for (const b of Object.values(A)) b.needsUpdate = true;
      rebuild();
    },
    /** Interrompt le ruban (on quitte l'eau, saut, téléportation). */
    cut() { hasPrev = false; },
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
