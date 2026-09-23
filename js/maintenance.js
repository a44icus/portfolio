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
      '#pf-maint .logo{width:120px;height:auto;margin:0 auto 1.8rem;display:block}' +
      '#pf-maint .tag{font-family:ui-monospace,"Space Mono",monospace;font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;color:#FF5A3C;margin:0 0 1rem}' +
      '#pf-maint h1{font-size:clamp(1.9rem,5vw,3rem);margin:0 0 1.1rem;font-weight:800;letter-spacing:-.02em;line-height:1.1}' +
      '#pf-maint p{color:#9A9AA6;font-size:1.08rem;line-height:1.65;margin:0}' +
      '#pf-maint .sig{margin-top:2rem;font-size:.9rem;color:#6b6b75}';
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

    var d = document.createElement('div'); d.id = 'pf-maint'; d.setAttribute('role', 'status');
    d.innerHTML =
      '<div class="box">' +
      '<svg class="logo" viewBox="0 0 180.38 131.63" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path fill="#f6406b" d="M178.91,80.13c0-.09.03-.18.03-.27V7c0-2.38-1.93-4.31-4.31-4.31s-4.31,1.93-4.31,4.31v47.92c-8.81-12.63-23.09-20.33-39.41-20.51-4.18-.05-8.36.52-12.37,1.68-14.9,4.28-25.53,14.34-31.03,26.52-1.49,3.3-1.19,7.14.66,10.25l3.8,6.38c1-12.24,7.69-23.85,19.02-30.6,6.16-3.67,13.04-5.55,20.03-5.55,3.24,0,6.5.4,9.71,1.22,10.17,2.58,18.72,8.96,24.09,17.97,3.63,6.09,5.55,13.04,5.54,20.09-.01,13.77-7.36,26.7-19.18,33.74-9.01,5.37-19.57,6.91-29.74,4.33-10.17-2.58-18.72-8.96-24.09-17.97-.43-.73-13.99-23.64-13.99-23.64,0,.03-17.78-29.83-17.78-29.83-.36-.59-9-14.52-27.88-14.52S5.75,46.22,5.75,61.79s14.76,19.95,26.61,23.47c1.37.41,5.83,1.77,5.83,1.77,14.18,4.4,22.86,7.52,22.86,15.91,0,10.66-10.81,18.7-25.15,18.7s-21.85-10.01-22.17-10.49c-1.29-1.99-3.95-2.55-5.94-1.27-2,1.29-2.58,3.96-1.29,5.96.38.59,9.52,14.42,29.4,14.42s33.77-11.74,33.77-27.32-14.71-19.72-28.93-24.14c0,0-4.52-1.39-5.93-1.81-12.72-3.77-20.44-6.67-20.44-15.2,0-10.83,9.82-18.69,23.35-18.69s20.26,9.96,20.49,10.34c0,0,31.68,53.33,31.75,53.44,6.55,10.99,16.98,18.77,29.38,21.91,3.93.99,7.9,1.49,11.85,1.49,8.52,0,16.91-2.29,24.42-6.77,14.41-8.58,23.37-24.35,23.39-41.14,0-.75-.04-1.5-.07-2.25Z"/></svg>' +
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
