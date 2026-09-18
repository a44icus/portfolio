/* ============================================================================
   Portfolio Stéphane Donchery — couche de données partagée
   Récupère UNE seule fois tout le contenu Supabase (photos + textes) et
   l'expose aux 4 variantes de style (aurora / glass / kinetic / warm).
   Aucune logique de rendu ici : uniquement la donnée, normalisée.
   ----------------------------------------------------------------------------
   Usage :
     const data = await loadPortfolio();
     data.settings.hero_line1   // "Des formes"
     data.projects[0].title     // "Rond Point Evasion"
     PF.img(url, {w:900})       // URL optimisée (transform Supabase)
   ============================================================================ */
(function (global) {
  'use strict';

  var SB_URL = 'https://iqnjgvhmeflczvftyter.supabase.co';
  var SB_KEY = 'sb_publishable_teWyLYgztv54ga9926jJcA_W62wBq0i';

  /* Optimisation d'image à la volée (uniquement pour les fichiers hébergés
     dans le Storage Supabase ; les autres URLs sont renvoyées telles quelles). */
  function img(url, opts) {
    if (!url || url.indexOf('/storage/v1/object/public/') === -1) return url || '';
    opts = opts || {};
    var w = opts.w || 1200,
        q = opts.q || 76,
        resize = opts.resize || 'contain';
    var out = url.replace('/object/public/', '/render/image/public/') +
              '?width=' + w + (opts.h ? '&height=' + opts.h : '') +
              '&resize=' + resize + '&quality=' + q;
    return out;
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
