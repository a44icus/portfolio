/**
 * Jauges de performance en direct (pour régler la planète) : images par seconde, temps de calcul du processeur et de la
 * carte graphique par image, appels de dessin, triangles, définition, mémoire.
 * Affichage : ?perf dans l'adresse, la touche F9, ou le bouton du panneau de réglages ; l'état est retenu (localStorage).
 * Coût quasi nul quand c'est caché ; affiché, une requête de minutage GPU par image (EXT_disjoint_timer_query_webgl2).
 */
const KEY = 'planete-perf';

export function makePerf(renderer) {
  const gl = renderer.getContext();
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  let on = false, el = null, cv = null, g = null, rows = null;
  const N = 150, hist = new Float32Array(N), ghist = new Float32Array(N); let hi = 0;
  let last = 0, cpu0 = 0, query = null, gpuLast = 0, lastShow = 0, lastTris = 0;
  const pend = [];
  const acc = { n: 0, gap: 0, cpu: 0, gpu: 0, gpuN: 0, calls: 0, tris: 0, worst: 0 };

  const css = `
    #perfHud { position: fixed; left: 12px; top: 62px; z-index: 60; pointer-events: none; font: 11px/1.35 ui-monospace, Consolas, monospace;
      color: #ece8ff; background: rgba(14, 10, 34, 0.82); border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; padding: 8px 10px 9px; width: 214px;
      backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
    #perfHud .r { display: flex; align-items: center; gap: 6px; height: 16px; }
    #perfHud .k { width: 58px; color: #a9a2cf; }
    #perfHud .v { width: 62px; text-align: right; font-variant-numeric: tabular-nums; }
    #perfHud .r.w .v { flex: 1; width: auto; }
    #perfHud .b { flex: 1; height: 5px; border-radius: 3px; background: rgba(255,255,255,0.1); overflow: hidden; }
    #perfHud .b i { display: block; height: 100%; width: 0; border-radius: 3px; background: #6be39a; transition: width .2s; }
    #perfHud canvas { display: block; width: 100%; height: 38px; margin: 4px 0 6px; }
    #perfHud .t { color: #a9a2cf; margin-bottom: 2px; display: flex; justify-content: space-between; }
    #perfHud .s { color: #8a83b3; font-size: 10px; margin-top: 3px; }
    #perfHud .tg { pointer-events: auto; margin-top: 8px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.12); max-height: 44vh; overflow-y: auto; }
    #perfHud .tg .h { color: #a9a2cf; margin: 4px 0 3px; display: flex; justify-content: space-between; }
    #perfHud .tg .h button { all: unset; cursor: pointer; color: #d9ff4a; font-size: 10px; }
    #perfHud .tg label { display: flex; align-items: center; gap: 6px; height: 17px; cursor: pointer; user-select: none; }
    #perfHud .tg label:hover { color: #fff; }
    #perfHud .tg input { margin: 0; accent-color: #b08cff; width: 12px; height: 12px; }
    #perfHud .tg label span:nth-of-type(1) { flex: 1; }
    #perfHud .tg label span:nth-of-type(2) { color: #8a83b3; font-variant-numeric: tabular-nums; }
    #perfHud .tg label.off { color: #6f6994; text-decoration: line-through; }`;

  function build() {
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    el = document.createElement('div'); el.id = 'perfHud';
    el.innerHTML = '<div class="t"><span>Performances</span><span>F9</span></div><canvas width="428" height="76"></canvas>' +
      ['fps', 'cpu', 'gpu', 'calls', 'tris', 'def', 'mem'].map(k => `<div class="r" data-k="${k}"><span class="k"></span><span class="v"></span><span class="b"><i></i></span></div>`).join('') +
      '<div class="s">courbe : temps entre images (blanc) et GPU (violet)</div><div class="tg"></div>';
    document.body.appendChild(el);
    cv = el.querySelector('canvas'); g = cv.getContext('2d');
    rows = {}; el.querySelectorAll('.r').forEach(r => { rows[r.dataset.k] = { k: r.children[0], v: r.children[1], b: r.children[2], i: r.children[2].firstChild }; });
    const lab = { fps: 'images/s', cpu: 'CPU', gpu: 'GPU', calls: 'dessins', tris: 'triangles', def: 'définition', mem: 'mémoire' };
    for (const k in rows) rows[k].k.textContent = lab[k];
    tg = el.querySelector('.tg');
    tg.addEventListener('wheel', e => e.stopPropagation(), { passive: true });   // la molette fait défiler la liste, pas la caméra
    for (const ev of ['pointerdown', 'pointerup', 'click']) tg.addEventListener(ev, e => e.stopPropagation());
    renderToggles();
  }

  /* ---------- interrupteurs : masquer les familles d'éléments une à une, pour voir ce que chacune coûte ---------- */
  let tg = null; const toggles = [];
  // triangles dessinés par une famille (ce qui est en vue : l'herbe et les lupins hors champ ne comptent pas)
  const trisOf = t => {
    if (!t.obj) return '';
    let n = 0;
    const walk = (o, root) => {
      if (!root && !o.visible) return;
      if (o.isMesh && o.geometry) { const g = o.geometry, c = g.index ? g.index.count : g.attributes.position ? g.attributes.position.count : 0; n += c / 3 * (o.isInstancedMesh ? o.count : 1); }
      for (const ch of o.children) walk(ch, false);
    };
    walk(t.obj, true);
    return n > 1e6 ? (n / 1e6).toFixed(2) + ' M' : n > 1e3 ? Math.round(n / 1e3) + ' k' : Math.round(n).toString();
  };
  function renderToggles() {
    if (!tg) return;
    const sec = (title, list, all) => list.length ? `<div class="h"><span>${title}</span>${all ? '<button data-all>tout</button>' : ''}</div>` +
      list.map(t => `<label class="${t.on ? '' : 'off'}" data-i="${toggles.indexOf(t)}"><input type="checkbox"${t.on ? ' checked' : ''}><span>${t.label}</span><span>${trisOf(t)}</span></label>`).join('') : '';
    tg.innerHTML = sec('Éléments · triangles', toggles.filter(t => t.obj), true) + sec('Rendu', toggles.filter(t => !t.obj), false);
    tg.querySelectorAll('label').forEach(l => l.querySelector('input').addEventListener('change', e => { setToggle(toggles[+l.dataset.i], e.target.checked); }));
    const all = tg.querySelector('[data-all]'); if (all) all.addEventListener('click', () => { toggles.forEach(t => { if (t.obj) setToggle(t, true, true); }); renderToggles(); });
  }
  function setToggle(t, v, quiet) {
    t.on = v;
    if (t.obj) t.obj.visible = v; else t.set(v);
    if (!quiet) { const l = tg && tg.querySelector(`label[data-i="${toggles.indexOf(t)}"]`); if (l) l.classList.toggle('off', !v); }
  }
  /** Ajoute un interrupteur : { label, obj } (un Object3D à masquer) ou { label, set(on) } (un réglage du rendu). */
  function addToggle(t) { toggles.push({ on: true, ...t }); renderToggles(); }
  const col = f => f < 0.7 ? '#6be39a' : f < 1 ? '#ffc65c' : '#ff6b7a';   // part du budget de l'image : vert, orange, rouge
  const row = (k, text, frac) => {
    const r = rows[k]; r.v.textContent = text;
    if (frac === null) { r.b.style.display = 'none'; r.b.parentNode.classList.add('w'); return; }
    r.b.style.display = ''; r.b.parentNode.classList.remove('w'); r.i.style.width = Math.min(100, frac * 100) + '%'; r.i.style.background = col(frac);
  };

  function draw(budget) {
    const W = cv.width, H = cv.height, top = budget * 2.2, y = ms => H - Math.min(1, ms / top) * H;
    g.clearRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,255,255,0.14)'; g.setLineDash([4, 4]); g.lineWidth = 1;
    for (const ms of [budget, budget * 2]) { g.beginPath(); g.moveTo(0, y(ms)); g.lineTo(W, y(ms)); g.stroke(); }
    g.setLineDash([]);
    const plot = (a, c) => { g.strokeStyle = c; g.lineWidth = 2; g.beginPath(); for (let i = 0; i < N; i++) { const v = a[(hi + i) % N], x = i / (N - 1) * W; i ? g.lineTo(x, y(v)) : g.moveTo(x, y(v)); } g.stroke(); };
    plot(ghist, 'rgba(176, 140, 255, 0.9)'); plot(hist, 'rgba(255, 255, 255, 0.9)');
  }

  function set(v) {
    on = v; if (on && !el) build();
    if (el) el.style.display = on ? '' : 'none';
    renderer.info.autoReset = !on;   // plusieurs rendus par image (ombres, post-traitement) : on cumule l'image entière
    last = 0; try { on ? localStorage.setItem(KEY, '1') : localStorage.removeItem(KEY); } catch (e) { /* rien */ }
  }
  const toggle = () => set(!on);

  function poll() {
    while (pend.length && gl.getQueryParameter(pend[0], gl.QUERY_RESULT_AVAILABLE)) {
      const q = pend.shift();
      if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) { gpuLast = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6; acc.gpu += gpuLast; acc.gpuN++; }
      gl.deleteQuery(q);
    }
  }

  /** Début d'une image dessinée (après le tri du rythme). */
  function begin(now) {
    if (!on) return;
    if (last) { const gap = now - last; if (gap < 1000) { acc.gap += gap; acc.n++; acc.worst = Math.max(acc.worst, gap); hist[hi] = gap; ghist[hi] = gpuLast; hi = (hi + 1) % N; } }
    last = now; cpu0 = performance.now();
    renderer.info.reset();
    if (ext) { poll(); if (pend.length < 6) { query = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, query); } }
  }
  /** Fin de l'image (juste après le rendu) ; fps : rythme visé à ce moment. */
  function end(fps) {
    if (!on) return;
    if (query) { gl.endQuery(ext.TIME_ELAPSED_EXT); pend.push(query); query = null; }
    acc.cpu += performance.now() - cpu0; acc.calls += renderer.info.render.calls; acc.tris += renderer.info.render.triangles;
    const now = performance.now();
    if (now - lastShow < 250 || !acc.n) return;
    lastShow = now;
    const budget = 1000 / fps, n = acc.n, gap = acc.gap / n, cpu = acc.cpu / n, real = 1000 / gap;
    row('fps', real.toFixed(0) + ' / ' + fps, Math.min(1.2, fps / Math.max(1, real)) - 0.3);
    row('cpu', (cpu).toFixed(1) + ' ms', cpu / budget);
    if (ext && acc.gpuN) { const gpu = acc.gpu / acc.gpuN; row('gpu', gpu.toFixed(1) + ' ms', gpu / budget); }
    else row('gpu', ext ? '…' : 'n/d', null);
    row('calls', Math.round(acc.calls / n).toString(), null);
    const tris = acc.tris / n; row('tris', tris > 1e6 ? (tris / 1e6).toFixed(2) + ' M' : (tris / 1e3).toFixed(0) + ' k', null);
    row('def', gl.drawingBufferWidth + '×' + gl.drawingBufferHeight + ' ×' + renderer.getPixelRatio().toFixed(2), null);
    const heap = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) + ' Mo · ' : '';
    row('mem', heap + renderer.info.memory.textures + ' tex', null);
    draw(budget);
    if (tg && now - lastTris > 1000) { lastTris = now; tg.querySelectorAll('label').forEach(l => { l.lastChild.textContent = trisOf(toggles[+l.dataset.i]); }); }
    acc.n = acc.gap = acc.cpu = acc.gpu = acc.gpuN = acc.calls = acc.tris = acc.worst = 0;
  }

  addEventListener('keydown', e => { if (e.key === 'F9') { e.preventDefault(); toggle(); } });
  let want = false;
  try { want = new URLSearchParams(location.search).has('perf') || localStorage.getItem(KEY) === '1'; } catch (e) { /* rien */ }
  if (want) set(true);
  return { begin, end, toggle, addToggle, get on() { return on; } };
}
