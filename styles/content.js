/* ============================================================================
   Portfolio Stéphane Donchery — couche de données partagée
   Récupère UNE seule fois tout le contenu Supabase (photos + textes) et
   l'expose à la version Liquid Glass (styles/glass.html).
   Aucune logique de rendu ici : uniquement la donnée, normalisée.
   ----------------------------------------------------------------------------
   Usage :
     const data = await loadPortfolio();
     data.settings.hero_line1   // "Des formes"
     data.projects[0].title     // "Rond Point Evasion"
     PF.img(url, {w:900})       // URL optimisée (redimensionnement Vercel)
   ============================================================================ */
(function (global) {
  'use strict';

  var SB_URL = 'https://iqnjgvhmeflczvftyter.supabase.co';
  var SB_KEY = 'sb_publishable_teWyLYgztv54ga9926jJcA_W62wBq0i';

  /* Optimisation d'image à la volée via Vercel (/_vercel/image), uniquement
     pour les fichiers du Storage (Supabase ou Firebase) ; les autres URLs
     sont renvoyées telles quelles. En local, l'original est servi. */
  function img(url, opts) {
    opts = opts || {};
    return vimg(url, opts.w || 1200, opts.q || 76);
  }
  function vimg(u, s, q) {
    if (!u || !/^https:\/\/(iqnjgvhmeflczvftyter\.supabase\.co\/storage\/v1\/object\/public\/|firebasestorage\.googleapis\.com\/)/.test(u)) return u || '';
    var h = location.hostname;
    if (location.protocol === 'file:' || h === 'localhost' || h === '127.0.0.1') return u;
    var S = [256, 640, 1080, 1600, 1920], w = 1920;
    for (var i = 0; i < S.length; i++) { if (S[i] >= s) { w = S[i]; break; } }
    return '/_vercel/image?url=' + encodeURIComponent(u) + '&w=' + w + '&q=' + q;
  }

  /* Échappement HTML (texte issu du CMS = donnée, jamais du code). */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  var _cache = null;

  function loadPortfolio() {
    if (_cache) return _cache;
    _cache = (async function () {
      var empty = {
        settings: {}, projects: [], services: [], testimonials: [],
        parcours: [], places: [], carousel: [], method: []
      };
      if (!global.supabase || !global.supabase.createClient) return empty;

      var sb = global.supabase.createClient(SB_URL, SB_KEY);
      var res;
      try {
        res = await Promise.all([
          sb.from('portfolio_settings').select('key,value'),
          sb.from('portfolio_projects').select('*').order('position'),
          sb.from('portfolio_services').select('*').order('position'),
          sb.from('portfolio_testimonials').select('*').order('position'),
          sb.from('portfolio_parcours').select('*').order('position'),
          sb.from('portfolio_places').select('*').order('position', { ascending: true }),
          sb.from('portfolio_place_photos').select('*').order('position', { ascending: true }),
          sb.from('portfolio_carousel').select('url,caption,position').order('position', { ascending: true })
        ]);
      } catch (e) { return empty; }

      function d(i) { return (res[i] && res[i].data) || []; }

      // settings : liste clé/valeur -> objet
      var settings = {};
      d(0).forEach(function (r) { settings[r.key] = r.value; });

      // lieux + leurs photos regroupées
      var places = d(5).map(function (p) { return Object.assign({}, p, { photos: [] }); });
      var byId = {};
      places.forEach(function (p) { byId[p.id] = p; });
      d(6).forEach(function (ph) {
        var p = byId[ph.place_id];
        if (p) p.photos.push(ph);
      });

      return {
        settings:     settings,
        projects:     d(1),
        services:     d(2),
        testimonials: d(3),
        parcours:     d(4),
        places:       places,
        carousel:     d(7),
        method:       [] // collages non requis par les variantes (réinterprétées)
      };
    })();
    return _cache;
  }

  var PF = { load: loadPortfolio, img: img, esc: esc, SB_URL: SB_URL, SB_KEY: SB_KEY };
  global.PF = PF;
  global.loadPortfolio = loadPortfolio;
})(window);
