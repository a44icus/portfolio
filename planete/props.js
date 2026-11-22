/* ============================================================================
   Décors des zones et petite voiture : grandes lettres en relief qu'on peut
   renverser, panneau en bois, caisses, lanternes, cercle lumineux au sol.
   Physique maison très simple : chaque objet glisse sur la sphère, frotte, et
   bascule à plat quand la voiture (ou un autre objet) le percute assez fort.
   ============================================================================ */
import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';

const FONT_URL = 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/fonts/helvetiker_bold.typeface.json';
const Y = new THREE.Vector3(0, 1, 0);
const WOOD = '#b07a48', WOOD_DARK = '#7a4f2c', CREAM = '#f4f1ea';

/** Les mots posés sur chaque zone (la police n'a pas d'accents : on ajoute celui de STÉPHANE). */
const WORDS = { profil: 'STEPHANE', services: 'SERVICES', travaux: 'TRAVAUX', perso: 'PERSO', photos: 'PHOTOS', parcours: 'PARCOURS', contact: 'CONTACT' };

function canvasTex(draw, w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

/* ---------- la voiture ---------- */
export function makeCar() {
  const car = new THREE.Group(), body = new THREE.Group(); car.add(body);
  const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, ...o });
  const lime = mat('#d9ff4a'), dark = mat('#1d1d2b', { roughness: 0.8 }), glass = mat('#9fd8ff', { roughness: 0.1, metalness: 0.2 });
  const box = (w, h, d, m, x, y, z, r = 0.06) => {
    const g = new THREE.BoxGeometry(w, h, d, 2, 2, 2);
    // coins arrondis : on pousse chaque sommet vers une boîte à bords ronds
    const p = g.attributes.position, v = new THREE.Vector3(), hw = w / 2 - r, hh = h / 2 - r, hd = d / 2 - r;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const c = new THREE.Vector3(Math.max(-hw, Math.min(hw, v.x)), Math.max(-hh, Math.min(hh, v.y)), Math.max(-hd, Math.min(hd, v.z)));
      v.sub(c).normalize().multiplyScalar(r).add(c); p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    const m2 = new THREE.Mesh(g, m); m2.position.set(x, y, z); body.add(m2); return m2;
  };
  box(0.62, 0.22, 1.0, lime, 0, 0.26, 0, 0.08);            // caisse
  box(0.5, 0.2, 0.48, glass, 0, 0.46, -0.06, 0.07);         // vitres
  box(0.52, 0.05, 0.5, lime, 0, 0.57, -0.06, 0.03);         // toit
  box(0.64, 0.08, 0.12, dark, 0, 0.2, 0.52, 0.03);          // pare-chocs
  box(0.64, 0.08, 0.12, dark, 0, 0.2, -0.52, 0.03);
  const lightMat = mat('#fff6c8', { emissive: '#fff2b0', emissiveIntensity: 2 });
  for (const x of [-0.2, 0.2]) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), lightMat); l.position.set(x, 0.29, 0.5); body.add(l); }
  const tail = mat('#ff5a3c', { emissive: '#ff3a1c', emissiveIntensity: 1.2 });
  for (const x of [-0.22, 0.22]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.02), tail); l.position.set(x, 0.3, -0.505); body.add(l); }
  const wheels = [];
  const tyre = new THREE.CylinderGeometry(0.15, 0.15, 0.12, 20).rotateZ(Math.PI / 2), hub = new THREE.CylinderGeometry(0.07, 0.07, 0.13, 12).rotateZ(Math.PI / 2);
  for (const [x, z] of [[-0.33, 0.32], [0.33, 0.32], [-0.33, -0.32], [0.33, -0.32]]) {
    const pivot = new THREE.Group(); pivot.position.set(x, 0.15, z); car.add(pivot);
    const w = new THREE.Group(); w.add(new THREE.Mesh(tyre, dark), new THREE.Mesh(hub, mat(CREAM))); pivot.add(w);
    wheels.push({ pivot, w, front: z > 0 });
  }
  car.userData = { body, wheels };
  return car;
}

/* ---------- objets renversables ---------- */
class Bodies {
  constructor(planet) { this.planet = planet; this.list = []; this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._a = new THREE.Vector3(); }
  /**
   * @param mesh   origine à la base de l'objet
   * @param opts   r : rayon de collision, lie : décalage quand il est couché, topple : peut basculer
   */
  add(mesh, dir, yaw, opts) {
    const b = { mesh, dir: dir.clone().normalize(), vel: new THREE.Vector3(), local: new THREE.Quaternion().setFromAxisAngle(Y, yaw), fall: null, down: false,
      r: opts.r, lie: opts.lie || 0, topple: opts.topple !== false, hop: 0, vh: 0, awake: false };
    this.list.push(b); this.place(b); return b;
  }
  frame(dir) { return this._q.setFromUnitVectors(Y, dir); }
  place(b) {
    const g = Math.max(this.planet.heightDir(b.dir), this.planet.seaR + 0.12);
    let off = 0, rot = b.local;
    if (b.fall) {
      const k = Math.min(1, b.fall.t), e = k * k;
      rot = this._tmpQ = (this._tmpQ || new THREE.Quaternion()).setFromAxisAngle(b.fall.axis, e * Math.PI / 2).multiply(b.local);
      off = b.lie * Math.sin(e * Math.PI / 2);
    } else if (b.down) off = b.lie;
    b.mesh.position.copy(b.dir).multiplyScalar(g + off + b.hop);
    b.mesh.quaternion.copy(this.frame(b.dir)).multiply(rot);
  }
  /** Pousse un objet (vitesse tangente) ; s'il est debout et que le choc est fort, il bascule dans le sens du choc. */
  hit(b, push, strength) {
    b.vel.add(push); b.awake = true;
    if (b.topple && !b.down && !b.fall && strength > 1.6) {
      // axe de bascule dans le repère local de la zone de l'objet
      const n = this._v.copy(push).normalize();
      const axisW = this._a.crossVectors(b.dir, n).normalize();
      const axis = axisW.applyQuaternion(this.frame(b.dir).invert()).normalize();
      b.fall = { axis: axis.clone(), t: 0 }; b.vh = Math.min(3, strength * 0.5);
    } else if (!b.topple) { b.local.premultiply(new THREE.Quaternion().setFromAxisAngle(Y, (Math.random() - 0.5) * strength * 0.6)); b.vh = Math.max(b.vh, Math.min(2.5, strength * 0.4)); }
  }
  step(dt, car) {
    const P = this.planet, tmp = new THREE.Vector3(), axis = new THREE.Vector3(), d = new THREE.Vector3();
    // collisions avec la voiture
    if (car) for (const b of this.list) {
      d.copy(b.mesh.position).sub(car.pos);
      const dist = d.length(), min = b.r + car.r;
      if (dist > min || dist < 1e-4) continue;
      d.addScaledVector(b.dir, -d.dot(b.dir)).normalize();               // poussée horizontale
      const rel = Math.max(0, car.vel.dot(d));
      if (rel < 0.15 && dist > min * 0.7) continue;
      this.hit(b, tmp.copy(d).multiplyScalar(rel * 1.15 + 0.8), rel);
      b.dir.addScaledVector(d, (min - dist) / P.groundRadius(b.dir)).normalize();
      car.bump(rel);
    }
    // collisions entre objets réveillés (effet domino)
    const L = this.list;
    for (let i = 0; i < L.length; i++) {
      const a = L[i]; if (!a.awake) continue;
      for (let j = 0; j < L.length; j++) {
        if (i === j) continue; const b = L[j];
        d.copy(b.mesh.position).sub(a.mesh.position);
        const dist = d.length(), min = (a.r + b.r) * 0.9;
        if (dist > min || dist < 1e-4) continue;
        d.addScaledVector(b.dir, -d.dot(b.dir)).normalize();
        const rel = a.vel.dot(d) - b.vel.dot(d);
        if (rel > 0.05) { const imp = rel * 0.6; this.hit(b, tmp.copy(d).multiplyScalar(imp), rel); a.vel.addScaledVector(d, -imp * 0.5); }
        b.dir.addScaledVector(d, (min - dist) * 0.5 / 16).normalize();
      }
    }
    // mouvement, frottement, chute, petit rebond
    for (const b of L) {
      if (!b.awake) continue;
      b.vel.addScaledVector(b.dir, -b.vel.dot(b.dir));
      const sp = b.vel.length();
      if (sp > 1e-4) {
        axis.crossVectors(b.dir, b.vel).normalize();
        const next = tmp.copy(b.dir).applyAxisAngle(axis, sp * dt / 16).normalize();
        if (P.heightDir(next) - P.heightDir(b.dir) > 0.35) b.vel.multiplyScalar(-0.3);   // ne grimpe pas les falaises
        else b.dir.copy(next);
      }
      b.vel.multiplyScalar(Math.exp(-dt * (b.down ? 4 : 2.2)));
      if (b.fall) { b.fall.t += dt * 2.6; if (b.fall.t >= 1) { b.local.premultiply(new THREE.Quaternion().setFromAxisAngle(b.fall.axis, Math.PI / 2)); b.fall = null; b.down = true; } }
      if (b.hop > 0 || b.vh > 0) { b.vh -= 18 * dt; b.hop = Math.max(0, b.hop + b.vh * dt); if (b.hop === 0 && b.vh < 0) b.vh = b.vh < -2 ? -b.vh * 0.3 : 0; }
      this.place(b);
      if (sp < 0.03 && !b.fall && b.hop === 0 && b.vh === 0) b.awake = false;
    }
  }
}

/* ---------- les zones ---------- */
export async function buildZones(planet, sections) {
  const group = new THREE.Group(), bodies = new Bodies(planet), glows = [];
  let font = null;
  try { font = await new FontLoader().loadAsync(FONT_URL); } catch (e) { /* sans police : pas de lettres */ }

  const woodM = new THREE.MeshStandardMaterial({ color: WOOD, roughness: 0.85 }), woodD = new THREE.MeshStandardMaterial({ color: WOOD_DARK, roughness: 0.9 });
  const crateGeo = new THREE.BoxGeometry(0.42, 0.42, 0.42).translate(0, 0.21, 0);
  const crateTex = canvasTex((g, w, h) => {
    g.fillStyle = WOOD; g.fillRect(0, 0, w, h);
    g.strokeStyle = WOOD_DARK; g.lineWidth = 14; g.strokeRect(7, 7, w - 14, h - 14);
    g.lineWidth = 10; g.beginPath(); g.moveTo(10, 10); g.lineTo(w - 10, h - 10); g.stroke();
    g.globalAlpha = 0.18; for (let y = 24; y < h; y += 22) { g.fillStyle = '#000'; g.fillRect(0, y, w, 2); }
  }, 128, 128);
  const crateM = new THREE.MeshStandardMaterial({ map: crateTex, roughness: 0.85 });
  const postGeo = new THREE.CylinderGeometry(0.05, 0.06, 1.1, 8).translate(0, 0.55, 0);

  const at = (z, x, y) => z.dir.clone().addScaledVector(z.t1, x / 16).addScaledVector(z.t2, y / 16).normalize();   // point (x, y) de la zone

  for (const s of sections) {
    const z = planet.pavilions.find(p => p.id === s.id); if (!z) continue;
    const color = new THREE.Color(s.color);

    // cercle lumineux au sol et nom de la zone imprimé devant (chacun orienté selon le sol sous lui)
    const lay = (mesh, x, y, lift) => {
      const dir = at(z, x, y);
      mesh.position.copy(dir).multiplyScalar(planet.heightDir(dir) + lift);
      mesh.quaternion.setFromUnitVectors(Y, dir).multiply(new THREE.Quaternion().setFromAxisAngle(Y, yawToFace(dir, z)));
      group.add(mesh); return mesh;
    };
    const ring = lay(new THREE.Mesh(new THREE.RingGeometry(1.0, 1.18, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 })), 0, 0, 0.1);
    glows.push(ring);
    lay(new THREE.Mesh(new THREE.CircleGeometry(1.0, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 })), 0, 0, 0.1);
    const label = canvasTex((g, w, h) => {
      g.clearRect(0, 0, w, h); g.fillStyle = 'rgba(255,255,255,0.92)'; g.font = '800 92px Manrope, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(s.label.toUpperCase(), w / 2, h / 2 + 4);
    }, 1024, 160);
    lay(new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.375).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: label, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 })), 0, 1.55, 0.1);

    // grandes lettres en relief, alignées derrière le cercle
    if (font) {
      const word = WORDS[s.id] || s.label.toUpperCase(), size = 0.62, depth = 0.28;
      const geos = [...word].map(ch => {
        const g = new TextGeometry(ch, { font, size, depth, curveSegments: 6, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.02, bevelSegments: 2 });
        g.computeBoundingBox(); const bb = g.boundingBox;
        g.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
        g.computeBoundingBox(); return g;
      });
      const widths = geos.map(g => g.boundingBox.max.x - g.boundingBox.min.x), gap = 0.1;
      const total = widths.reduce((a, b) => a + b, 0) + gap * (geos.length - 1);
      const letterM = new THREE.MeshStandardMaterial({ color: CREAM, roughness: 0.5 });
      const accentM = new THREE.MeshStandardMaterial({ color, roughness: 0.45 });
      let x = -total / 2;
      geos.forEach((g, i) => {
        const cx = x + widths[i] / 2; x += widths[i] + gap;
        const m = new THREE.Mesh(g, i === 0 ? accentM : letterM);
        // accent aigu sur le E de STÉPHANE
        if (s.id === 'profil' && i === 5) { const acc = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, depth), letterM); acc.position.set(0.04, size + 0.18, 0); acc.rotation.z = -0.75; m.add(acc); }
        group.add(m);
        // l'arc des lettres suit l'esplanade : chacune est posée dans son propre repère
        const dir = at(z, -cx, -1.75);
        bodies.add(m, dir, yawToFace(dir, z), { r: Math.max(0.22, widths[i] * 0.5), lie: depth / 2 + 0.03 });
      });
    }

    // panneau en bois avec le titre de la section
    {
      const sign = new THREE.Group();
      sign.add(new THREE.Mesh(postGeo, woodD));
      const tex = canvasTex((g, w, h) => {
        g.fillStyle = WOOD; g.fillRect(0, 0, w, h);
        g.globalAlpha = 0.15; for (let y = 18; y < h; y += 26) { g.fillStyle = '#000'; g.fillRect(0, y, w, 3); } g.globalAlpha = 1;
        g.fillStyle = '#fff8ea'; g.font = '800 46px Manrope, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(s.title, w / 2, h / 2 + 2, w - 30);
      }, 512, 128);
      const board = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 0.05), [woodM, woodM, woodM, woodM, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }), woodM]);
      board.position.set(0, 0.95, 0.04); sign.add(board);
      group.add(sign);
      const dir = at(z, 3.3, -0.2);
      bodies.add(sign, dir, yawToFace(dir, z) - 0.4, { r: 0.3, lie: 0.06 });
    }

    // caisses et lanternes
    for (const [cx, cy] of [[-2.9, 0.2], [-3.3, 0.65], [-2.7, 0.75]]) {
      const c = new THREE.Mesh(crateGeo, crateM); group.add(c);
      bodies.add(c, at(z, cx, cy), Math.random() * 6, { r: 0.24, topple: false });
    }
    const lampTop = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.8, roughness: 0.3 });
    for (const [lx, ly] of [[-1.25, 1.35], [1.25, 1.35]]) {
      const lamp = new THREE.Group();
      lamp.add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.75, 8).translate(0, 0.375, 0), woodD));
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.16), lampTop); head.position.y = 0.84; lamp.add(head);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.1, 4).rotateY(Math.PI / 4), woodD); cap.position.y = 0.99; lamp.add(cap);
      group.add(lamp);
      bodies.add(lamp, at(z, lx, ly), 0, { r: 0.16, lie: 0.08 });
    }
  }

  /** Lacet (dans le repère de l'objet) pour que sa face avant regarde l'avant de la zone (+t2). */
  function yawToFace(dir, z) {
    const f = new THREE.Quaternion().setFromUnitVectors(Y, dir);
    const localFwd = z.t2.clone().addScaledVector(dir, -z.t2.dot(dir)).normalize().applyQuaternion(f.invert());
    return Math.atan2(localFwd.x, localFwd.z);
  }

  function update(dt, t, car) {
    bodies.step(dt, car);
    glows.forEach((g, i) => { g.material.opacity = 0.65 + 0.3 * Math.sin(t * 2.2 + i); });
  }
  return { group, update, bodies };
}
