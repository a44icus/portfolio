/* ============================================================================
   Ouvert depuis Messenger, Facebook, Instagram… (navigateur intégré à l'appli) :
   - sur Android, on bascule tout de suite vers Chrome (lien « intent ») ;
   - sur iPhone, rien ne peut forcer Safari : un bandeau propose de l'ouvrir
     (schéma x-safari-https, reconnu par iOS récents) et explique le menu ⋯.
   ============================================================================ */
(function () {
  var ua = navigator.userAgent || '';
  var inApp = /FBAN|FBAV|FB_IAB|FBIOS|FB4A|Messenger|Instagram|LinkedInApp|Snapchat|TikTok|musical_ly|Line\//i.test(ua);
  if (!inApp) return;
  var android = /Android/i.test(ua), ios = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var url = location.href.replace(/#.*$/, '');
  var store = function (k, v) { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (e) { return null; } };
  var chrome = 'intent://' + url.replace(/^https?:\/\//, '') + '#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=' + encodeURIComponent(url) + ';end';

  // Android : une seule tentative par session (si Chrome est absent, on revient ici et le bandeau prend le relais)
  if (android && !store('sd-inapp-tried')) { store('sd-inapp-tried', '1'); location.href = chrome; }

  function banner() {
    if (store('sd-inapp-closed') || document.getElementById('sdInApp')) return;
    var st = document.createElement('style');
    st.textContent = '#sdInApp{position:fixed;left:12px;right:12px;bottom:max(12px,env(safe-area-inset-bottom));z-index:2147483000;display:flex;flex-direction:column;gap:.55rem;padding:.9rem 1rem;border-radius:16px;background:rgba(16,14,30,.94);color:#fff;font:500 .88rem/1.35 Manrope,system-ui,sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.45);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}'
      + '#sdInApp b{font-weight:800}#sdInApp .row{display:flex;gap:.5rem;align-items:center}#sdInApp a.go{flex:1;text-align:center;padding:.7rem 1rem;border-radius:100px;background:#d9ff4a;color:#141414;font-weight:800;text-decoration:none}'
      + '#sdInApp button{border:1px solid rgba(255,255,255,.3);background:none;color:#fff;border-radius:100px;padding:.6rem .9rem;font:inherit;cursor:pointer}#sdInApp small{opacity:.75;font-size:.78rem}';
    document.head.appendChild(st);
    var el = document.createElement('div'); el.id = 'sdInApp'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Ouvrir dans le navigateur');
    var how = ios ? 'Sinon : touchez <b>⋯</b> en haut à droite, puis <b>« Ouvrir dans le navigateur »</b>.' : 'Sinon : touchez <b>⋮</b> en haut à droite, puis <b>« Ouvrir dans Chrome »</b>.';
    el.innerHTML = '<div>Ce site s\'affiche mieux dans votre navigateur que dans l\'application.</div>'
      + '<div class="row"><a class="go" href="' + (ios ? 'x-safari-' + url : chrome) + '">Ouvrir dans ' + (ios ? 'Safari' : 'le navigateur') + '</a><button type="button" class="cp">Copier le lien</button><button type="button" class="x" aria-label="Fermer">✕</button></div>'
      + '<small>' + how + '</small>';
    document.body.appendChild(el);
    el.querySelector('.x').onclick = function () { store('sd-inapp-closed', '1'); el.remove(); };
    el.querySelector('.cp').onclick = function () {
      var b = this, done = function () { b.textContent = 'Lien copié ✓'; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { prompt('Copiez ce lien :', url); });
      else prompt('Copiez ce lien :', url);
    };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', banner); else banner();
})();
