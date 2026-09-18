/* ============================================================================
   Transition « magique » entre les pages de style.
   - magicGoTo(url) : joue un flash qui envahit l'écran (depuis la baguette,
     coin bas-droite) puis navigue.
   - À l'arrivée (si on vient d'une transition magique), révèle la page depuis
     un flash qui s'estompe → l'ensemble donne un « téléport » continu.
   Auto-injecte son CSS ; à inclure sur le site de base et les 4 variantes.
   ============================================================================ */
(function (global) {
  'use strict';
  if (global.magicGoTo) return;

  var css =
    '.pt-flash{ position:fixed; inset:0; z-index:3000; pointer-events:none; opacity:0; will-change:opacity,transform;' +
    ' background:radial-gradient(circle at 86% 84%, #ffffff 0%, #ffffff 45%, #efeaff 100%); }' +
    '.pt-flash.leave{ animation:ptLeave .55s cubic-bezier(.4,0,.9,.5) forwards; }' +
    '.pt-flash.enter{ opacity:1; animation:ptEnter .8s cubic-bezier(.2,.7,.3,1) forwards; }' +
    '@keyframes ptLeave{ 0%{ opacity:0; transform:scale(.7);} 45%{ opacity:1;} 100%{ opacity:1; transform:scale(1.45);} }' +
    '@keyframes ptEnter{ 0%{ opacity:1; transform:scale(1.18);} 100%{ opacity:0; transform:scale(1);} }' +
    '@media (prefers-reduced-motion:reduce){ .pt-flash{ animation-duration:.01ms !important; } }';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  global.magicGoTo = function (url) {
    if (!url) return;
    try { sessionStorage.setItem('pf-magic-in', '1'); } catch (e) {}
    var el = document.createElement('div');
    el.className = 'pt-flash'; el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
    void el.offsetWidth;
    el.classList.add('leave');
    setTimeout(function () { location.href = url; }, reduce ? 10 : 520);
  };

  function enter() {
    if (!document.body) { addEventListener('DOMContentLoaded', enter); return; }
    var el = document.createElement('div');
    el.className = 'pt-flash enter'; el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 860);
  }
  try {
    if (sessionStorage.getItem('pf-magic-in')) { sessionStorage.removeItem('pf-magic-in'); enter(); }
  } catch (e) {}
})(window);
