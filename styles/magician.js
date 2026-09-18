/* ============================================================================
   Le magicien, présent sur chaque variante.
   Peek (main + baguette qui dépasse du coin) → clic → magicien complet →
   « Oui » = annonce d'un AUTRE univers puis téléport (magicGoTo). « Non » = se replie.
   Ne change JAMAIS le style de la page courante : il ne fait que transporter.
   Auto-injecte son CSS ; dépend de transition.js (magicGoTo) ; à inclure sur les variantes.
   ============================================================================ */
(function (global) {
  'use strict';
  if (!('animate' in document.createElement('div'))) return;
  if (document.querySelector('.mg-prompt')) return;

  // Destinations = tous les univers sauf celui courant (+ retour à l'Original)
  var ALL = [
    { id: 'aurora',   label: 'Aurora',        href: 'aurora.html' },
    { id: 'glass',    label: 'Liquid Glass',  href: 'glass.html' },
    { id: 'kinetic',  label: 'Kinetic',       href: 'kinetic.html' },
    { id: 'warm',     label: 'Warm Luxe',     href: 'warm.html' },
    { id: 'original', label: "l'Original",    href: '../index.html' }
  ];
  var cur = document.documentElement.getAttribute('data-variant') || '';
  var DESTS = ALL.filter(function (v) { return v.id !== cur; });

  var css =
    '.mg-prompt{ position:fixed; right:0; bottom:0; z-index:1300; cursor:pointer; overflow:hidden; opacity:0; transition:opacity .5s ease;' +
    ' -webkit-tap-highlight-color:transparent; filter:drop-shadow(0 12px 22px rgba(0,0,0,.28)); }' +
    '.mg-prompt.in{ opacity:1; }' +
    '.mg-prompt svg{ display:block; width:100%; height:100%; }' +
    '.mg-toast{ position:fixed; left:50%; bottom:32px; transform:translateX(-50%) translateY(16px); z-index:1307;' +
    ' background:rgba(12,12,18,.92); color:#fff; font-family:system-ui,-apple-system,sans-serif; font-weight:700; font-size:.95rem;' +
    ' padding:.6rem 1.15rem; border-radius:100px; box-shadow:0 16px 38px rgba(0,0,0,.45); backdrop-filter:blur(8px);' +
    ' opacity:0; transition:opacity .35s ease, transform .35s ease; max-width:90vw; text-align:center; }' +
    '.mg-toast.on{ opacity:1; transform:translateX(-50%) translateY(0); }' +
    '@media (max-width:600px){ .mg-toast{ bottom:22px; font-size:.85rem; } }';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var svgUrl = (location.pathname.indexOf('/styles/') > -1) ? '../images/magician.svg' : 'images/magician.svg';

  var PEEK = { vb: [160, 92, 118, 180], w: 92, h: 140, r: 0, b: 0 };
  function openGeom() {
    var vw = innerWidth;
    var W = Math.max(210, Math.min(320, Math.round(vw * (vw < 600 ? 0.68 : 0.42))));
    return { vb: [0, 0, 575.38, 481.87], w: W, h: Math.round(W * 481.87 / 575.38), r: 18, b: 18 };
  }

  var prompt = null, svgEl = null, open = false, tweenId = 0, hitZones = [], hitResize = null;

  fetch(svgUrl).then(function (r) { return r.ok ? r.text() : null; }).then(function (svg) {
    if (!svg) return;
    prompt = document.createElement('div'); prompt.className = 'mg-prompt';
    prompt.setAttribute('role', 'button'); prompt.setAttribute('tabindex', '0'); prompt.setAttribute('aria-label', 'Un tour de magie ? Voyager vers un autre univers');
    prompt.innerHTML = svg;
    document.body.appendChild(prompt);
    svgEl = prompt.querySelector('svg');
    if (svgEl) svgEl.setAttribute('preserveAspectRatio', 'xMidYMax meet');
    applyGeom(PEEK);
    prompt.addEventListener('click', function () { if (!open) doOpen(); });
    prompt.addEventListener('keydown', function (e) { if (!open && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); doOpen(); } });
    var yes = prompt.querySelector('#bouton_oui'), no = prompt.querySelector('#bouton_non');
    if (yes) { yes.setAttribute('aria-label', 'Oui'); wire(yes, onYes); }
    if (no) { no.setAttribute('aria-label', 'Non'); wire(no, onNo); }
    void prompt.offsetWidth; prompt.classList.add('in');
  }).catch(function () {});

  function applyGeom(g) {
    if (!prompt) return;
    prompt.style.width = g.w + 'px'; prompt.style.height = g.h + 'px';
    prompt.style.right = g.r + 'px'; prompt.style.bottom = g.b + 'px';
    if (svgEl) svgEl.setAttribute('viewBox', g.vb.join(' '));
  }
  function tween(to, dur, done) {
    if (!prompt) return;
    if (reduce) { applyGeom(to); if (done) done(); return; }
    var from = { vb: (svgEl.getAttribute('viewBox') || '160 92 118 180').split(' ').map(Number),
                 w: prompt.offsetWidth, h: prompt.offsetHeight,
                 r: parseFloat(prompt.style.right) || 0, b: parseFloat(prompt.style.bottom) || 0 };
    var t0 = null, id = ++tweenId;
    function step(ts) {
      if (id !== tweenId) return;
      if (!t0) t0 = ts;
      var p = Math.min((ts - t0) / dur, 1), e = 1 - Math.pow(1 - p, 3);
      var vb = from.vb.map(function (v, i) { return v + (to.vb[i] - v) * e; });
      prompt.style.width = (from.w + (to.w - from.w) * e) + 'px';
      prompt.style.height = (from.h + (to.h - from.h) * e) + 'px';
      prompt.style.right = (from.r + (to.r - from.r) * e) + 'px';
      prompt.style.bottom = (from.b + (to.b - from.b) * e) + 'px';
      if (svgEl) svgEl.setAttribute('viewBox', vb.join(' '));
      if (p < 1) requestAnimationFrame(step); else if (done) done();
    }
    requestAnimationFrame(step);
    setTimeout(function () { if (id === tweenId) { applyGeom(to); if (done) done(); } }, dur + 160);
  }

  function doOpen() {
    if (open) return; open = true;
    prompt.removeAttribute('tabindex');
    tween(openGeom(), 540, function () { if (matchMedia('(pointer:coarse)').matches) placeHitZones(); });
  }
  function collapse() { open = false; removeHitZones(); prompt.setAttribute('tabindex', '0'); tween(PEEK, 420); }
  function onNo(e) { if (e && e.stopPropagation) e.stopPropagation(); collapse(); }
  function onYes(e) {
    if (e && e.stopPropagation) e.stopPropagation();
    removeHitZones();
    var d = DESTS[Math.floor(Math.random() * DESTS.length)];
    toast('✨ Le magicien t’emmène vers <strong>' + d.label + '</strong>');
    setTimeout(function () {
      if (typeof global.magicGoTo === 'function') global.magicGoTo(d.href); else location.href = d.href;
    }, 900);
  }

  function wire(el, handler) {
    el.style.cursor = 'pointer';
    el.addEventListener('click', function (e) { if (open) handler(e); });
  }

  /* zones de tap agrandies au-dessus de Oui/Non (tactile) */
  function mkHit(r, handler, label) {
    var pad = 20;
    var b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-label', label);
    b.style.cssText = 'position:fixed;left:' + (r.left - pad) + 'px;top:' + (r.top - pad) + 'px;width:' + (r.width + 2 * pad) + 'px;height:' + (r.height + 2 * pad) + 'px;background:transparent;border:0;padding:0;margin:0;z-index:1301;cursor:pointer;-webkit-tap-highlight-color:transparent;';
    b.addEventListener('click', function (e) { e.stopPropagation(); handler(e); });
    document.body.appendChild(b); hitZones.push(b);
  }
  function placeHitZones() {
    removeHitZones();
    var yes = prompt.querySelector('#bouton_oui'), no = prompt.querySelector('#bouton_non');
    try {
      if (yes) mkHit(yes.getBoundingClientRect(), onYes, 'Oui');
      if (no) mkHit(no.getBoundingClientRect(), onNo, 'Non');
    } catch (e) {}
    hitResize = function () { if (open) placeHitZones(); };
    addEventListener('resize', hitResize);
  }
  function removeHitZones() {
    hitZones.forEach(function (b) { if (b.parentNode) b.parentNode.removeChild(b); }); hitZones = [];
    if (hitResize) { removeEventListener('resize', hitResize); hitResize = null; }
  }

  var toastEl = null;
  function toast(html) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'mg-toast'; toastEl.setAttribute('role', 'status'); document.body.appendChild(toastEl); }
    toastEl.innerHTML = html; void toastEl.offsetWidth; toastEl.classList.add('on');
  }
})(window);
