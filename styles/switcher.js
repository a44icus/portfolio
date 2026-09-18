/* ============================================================================
   Sélecteur de style partagé entre les variantes (aurora / glass / kinetic / warm)
   + Original. Construit le dock (#switch) et le bouton flottant (#switchFab).
   Chaque variante est une page autonome ; on navigue simplement entre elles.
   ============================================================================ */
(function () {
  'use strict';
  var VARIANTS = [
    { id: 'original', label: 'Original',     href: '../index.html', ready: true },
    { id: 'aurora',   label: 'Aurora',       href: 'aurora.html',   ready: true },
    { id: 'glass',    label: 'Liquid Glass', href: 'glass.html',    ready: true },
    { id: 'kinetic',  label: 'Kinetic',      href: 'kinetic.html',  ready: true },
    { id: 'warm',     label: 'Warm Luxe',    href: 'warm.html',     ready: true }
  ];

  var cur = document.documentElement.getAttribute('data-variant') || '';
  var dock = document.getElementById('switch');
  var fab = document.getElementById('switchFab');
  if (!dock) return;

  dock.innerHTML = '<span class="sl">Style</span>' + VARIANTS.map(function (v) {
    if (v.id === cur) return '<a class="cur" aria-current="page">' + v.label + '</a>';
    if (!v.ready) return '<a aria-disabled="true" title="Bientôt">' + v.label + '</a>';
    return '<a href="' + v.href + '">' + v.label + '</a>';
  }).join('');

  // Navigation « magique » entre variantes si le module de transition est présent
  dock.addEventListener('click', function (e) {
    var a = e.target.closest('a[href]');
    if (a && !a.getAttribute('aria-disabled') && typeof window.magicGoTo === 'function') {
      e.preventDefault(); magicGoTo(a.getAttribute('href'));
    }
  });

  function open() { dock.classList.add('on'); }
  function close() { dock.classList.remove('on'); }
  function toggle() { dock.classList.contains('on') ? close() : open(); }

  if (fab) fab.addEventListener('click', toggle);
  // ferme si on clique ailleurs
  document.addEventListener('click', function (e) {
    if (dock.classList.contains('on') && !dock.contains(e.target) && e.target !== fab && !(fab && fab.contains(e.target))) close();
  });

  // Ouvre le dock automatiquement une fois (découverte), puis se souvient que c'est vu.
  try {
    if (!sessionStorage.getItem('pf-switch-seen')) {
      setTimeout(open, 1400);
      sessionStorage.setItem('pf-switch-seen', '1');
    }
  } catch (e) {}
})();
