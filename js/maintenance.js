/* ============================================================================
   Mode maintenance (piloté depuis l'admin → réglage `maintenance` = on/off).
   Vérifie tôt le réglage ; si activé, remplace la page par un écran de maintenance.
   L'admin (admin.html) n'inclut PAS ce script → il reste toujours accessible.
   Bypass propriétaire : ajouter ?preview à l'URL (mémorisé) ; ?preview=0 pour l'oublier.
   ============================================================================ */
(function () {
  'use strict';
  var URL = 'https://iqnjgvhmeflczvftyter.supabase.co';
  var KEY = 'sb_publishable_teWyLYgztv54ga9926jJcA_W62wBq0i';

  // ---- bypass propriétaire ----
  try {
    if (/[?&]preview=0(&|$)/.test(location.search)) { localStorage.removeItem('pf-preview'); }
    else if (/[?&]preview(=1)?(&|$)/.test(location.search)) { localStorage.setItem('pf-preview', '1'); }
  } catch (e) {}
  var bypass = false;
  try { bypass = localStorage.getItem('pf-preview') === '1'; } catch (e) {}
  if (bypass) return;

  fetch(URL + '/rest/v1/portfolio_settings?select=key,value&key=in.(maintenance,maintenance_message)', {
    headers: { apikey: KEY, Authorization: 'Bearer ' + KEY }
  })
    .then(function (r) { return r.ok ? r.json() : []; })
    .then(function (rows) {
      var m = {};
      (rows || []).forEach(function (x) { m[x.key] = x.value; });
      if (String(m.maintenance || '').toLowerCase() === 'on') show(m.maintenance_message);
    })
    .catch(function () {});

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function show(msg) {
    var css =
      '#pf-maint{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;text-align:center;' +
      'padding:8vw 6vw;background:#14141A;color:#F2F1EC;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased;}' +
      '#pf-maint .box{max-width:600px}' +
      '#pf-maint .logo{width:58px;height:58px;margin:0 auto 1.8rem;display:block}' +
      '#pf-maint .tag{font-family:ui-monospace,"Space Mono",monospace;font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;color:#FF5A3C;margin:0 0 1rem}' +
      '#pf-maint h1{font-size:clamp(1.9rem,5vw,3rem);margin:0 0 1.1rem;font-weight:800;letter-spacing:-.02em;line-height:1.1}' +
      '#pf-maint p{color:#9A9AA6;font-size:1.08rem;line-height:1.65;margin:0}' +
      '#pf-maint .sig{margin-top:2rem;font-size:.9rem;color:#6b6b75}';
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

    var d = document.createElement('div'); d.id = 'pf-maint'; d.setAttribute('role', 'status');
    d.innerHTML =
      '<div class="box">' +
      '<svg class="logo" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="16" r="9" fill="none" stroke="#F2F1EC" stroke-width="2"/><path d="M18 6 L28 26 L8 26 Z" fill="none" stroke="#FF5A3C" stroke-width="2" stroke-linejoin="round"/></svg>' +
      '<p class="tag">Maintenance en cours</p>' +
      '<h1>Le site fait peau neuve.</h1>' +
      '<p>' + esc(msg || 'Le site est momentanément indisponible pour une petite mise à jour. Il revient très vite — merci de votre patience.') + '</p>' +
      '<p class="sig">Stéphane Donchery — graphiste &amp; web designer</p>' +
      '</div>';

    function put() {
      (document.body || document.documentElement).appendChild(d);
      try { document.documentElement.style.overflow = 'hidden'; document.body && (document.body.style.overflow = 'hidden'); } catch (e) {}
    }
    if (document.body) put(); else document.addEventListener('DOMContentLoaded', put);
  }
})();
