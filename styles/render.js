/* ============================================================================
   Moteur de rendu de la version Liquid Glass (styles/glass.html).
   Remplit la page avec le contenu de l'admin (content.js) et les données
   partagées avec le site principal (js/site-data.js : volets des services,
   projets personnels). Contrat d'ids présents dans la page :
     #availability #line1 #line2pre #word #herosub
     #profil1 #profil2 #sigName #sigRole #facts #stats
     #svc #bento #persoGrid #gal #steps #quotes #trav #cv
     #mail #cmeta #socials #copyright
     #t-services #t-travaux #t-galerie #t-approche #t-voix #t-parcours #contact-title
     #loading + lightbox (#lb #lbImg #lbCount #lbClose #lbPrev #lbNext)
   ============================================================================ */
(function(){
  var E=(window.PF&&PF.esc)||function(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
  var IMG=(window.PF&&PF.img)||function(u){return u;};
  var $=function(s){return document.querySelector(s);};
  var reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  var pad=function(i){ return ('0'+(i+1)).slice(-2); };

  loadPortfolio().then(render).catch(function(e){ console.error(e); renderPerso(); hideLoader(); });

  function hideLoader(){ var l=$('#loading'); if(l){ l.classList.add('out'); setTimeout(function(){ if(l.parentNode) l.remove(); },600); } }
  function setTxt(sel,v){ if(v!=null && v!==''){ var el=$(sel); if(el) el.textContent=v; } }
  function setHtml(sel,html){ var el=$(sel); if(el) el.innerHTML=html; }

  function render(data){
    var S=data.settings||{};
    setTxt('#availability',S.hero_availability); setTxt('#line1',S.hero_line1);
    setTxt('#line2pre',S.hero_line2_prefix); setTxt('#herosub',S.hero_sub);
    setTxt('#copyright',S.footer_copyright);
    setTxt('#t-travaux',S.title_travaux); setTxt('#t-services',S.title_services);
    setTxt('#t-approche',S.title_approche); setTxt('#t-galerie',S.title_galerie);
    setTxt('#t-parcours',S.title_parcours); setTxt('#t-voix',S.title_voix);
    if((S.contact_title_1||S.contact_title_2) && $('#contact-title')){
      $('#contact-title').innerHTML=E(S.contact_title_1||'')+'<br><span class="accent">'+E(S.contact_title_2||'')+'</span>';
    }

    var words=(S.hero_words||'bougent.').split(',').map(function(w){return w.trim();}).filter(Boolean);
    if(words.length && $('#word')){ $('#word').textContent=words[0]; if(!reduce && words.length>1) cycleWords(words); }

    /* ---- profil ---- */
    setTxt('#profil1',S.profil_p1); setTxt('#profil2',S.profil_p2);
    setTxt('#sigName',S.signature_name); setTxt('#sigRole',S.signature_role);
    var facts=[[S.fact1_label,S.fact1_text],[S.fact2_label,S.fact2_text],[S.fact3_label,S.fact3_text],[S.fact4_label,S.fact4_text]].filter(function(f){return f[0];});
    var flickr=S.social_flickr||'https://www.flickr.com/photos/cliiiche/';
    setHtml('#facts', facts.map(function(f){ return '<li><strong>'+E(f[0])+'</strong>'+E(f[1])+'</li>'; }).join('')+
      '<li><strong>En dehors de l’écran</strong><a href="'+E(flickr)+'" target="_blank" rel="noopener">photographie</a> &amp; guitare</li>');
    var stats=[[S.stat1_num,S.stat1_label],[S.stat2_num,S.stat2_label],[S.stat3_num,S.stat3_label],[S.stat4_num,S.stat4_label]];
    setHtml('#stats', stats.filter(function(s){return s[0];}).map(function(s,i){
      return '<div class="hstat"><div class="n" data-count="'+E(s[0])+'">0'+(i<2?'<span class="plus">+</span>':'')+'</div><div class="l">'+E(s[1])+'</div></div>';
    }).join(''));

    /* ---- services : accordéon, tiroir bento ---- */
    var DEF=window.SVC_DETAILS||{};
    setHtml('#svc', (data.services||[]).map(function(s,i){
      var d=DEF[String(s.name||'').trim().toLowerCase()]||{};
      var lead=(s.description&&String(s.description).trim())||d.lead||'';
      var has=!!(lead||d.livrables), n=pad(i);
      return '<div class="svc reveal" style="transition-delay:'+(i*40)+'ms">'+
        '<button class="svc-row" type="button" aria-expanded="false"'+(has?' aria-controls="svc-d'+n+'"':' disabled')+'>'+
          '<span class="svc-idx">'+n+'</span><span class="svc-name">'+E(s.name)+'</span><span class="svc-tags">'+E(s.tags)+'</span>'+(has?'<span class="svc-plus" aria-hidden="true"></span>':'')+'</button>'+
        (has?'<div class="svc-desc" id="svc-d'+n+'"><div class="svc-desc-in">'+svcPanel(d,lead)+'</div></div>':'')+
      '</div>';
    }).join(''));

    /* ---- travaux ---- */
    setHtml('#bento', (data.projects||[]).map(function(p,i){
      var href=(p.slug&&(p.intro_body||p.approach_body||p.lede))?('../projets/projet.html?p='+encodeURIComponent(p.slug)):(p.link&&p.link!=='#'?p.link:'#');
      return '<a class="card proj reveal" style="transition-delay:'+(i%2*60)+'ms" href="'+E(href)+'"'+(href==='#'?' onclick="return false"':'')+'>'+
        '<div class="thumb" style="background-image:url(\''+E(IMG(p.image_url,{w:900}))+'\')"></div>'+
        '<span class="arrow" aria-hidden="true">↗</span>'+
        '<div class="meta"><span class="cat">'+pad(i)+' · '+E(p.category)+'</span>'+
        '<div class="t">'+E(p.title)+'</div><div class="m">'+E(p.meta||p.year)+'</div></div></a>';
    }).join(''));

    renderPerso();

    /* ---- photos ---- */
    var gal=data.carousel||[];
    setHtml('#gal', gal.map(function(g,i){
      return '<button type="button" class="gal-item reveal" data-gal="'+i+'" aria-label="Agrandir la photo '+(i+1)+'"><img loading="lazy" src="'+E(IMG(g.url,{w:700}))+'" alt="'+E(g.caption||'Photographie')+'"></button>';
    }).join(''));
    var galFull=gal.map(function(g){return IMG(g.url,{w:1600});});
    document.querySelectorAll('#gal .gal-item').forEach(function(el){ el.addEventListener('click',function(){ openLightbox(galFull, +el.getAttribute('data-gal')||0); }); });

    /* ---- méthode ---- */
    var steps=[[S.step1_title,S.step1_text],[S.step2_title,S.step2_text],[S.step3_title,S.step3_text],[S.step4_title,S.step4_text]].filter(function(st){return st[0];});
    setHtml('#steps', steps.map(function(st,i){
      return '<div class="step reveal" style="transition-delay:'+(i*50)+'ms"><div class="n">'+pad(i)+'</div><h3>'+E(st[0])+'</h3><p>'+E(st[1])+'</p></div>';
    }).join(''));

    /* ---- témoignages ---- */
    setHtml('#quotes', (data.testimonials||[]).map(function(t,i){
      return '<figure class="quote reveal" style="transition-delay:'+(i*50)+'ms"><div class="mk" aria-hidden="true">“</div><p>'+E(t.quote)+'</p><figcaption><strong>'+E(t.author)+'</strong><span>'+E(t.role)+'</span></figcaption></figure>';
    }).join(''));

    /* ---- voyages ---- */
    var places=data.places||[];
    setHtml('#trav', places.map(function(pl,i){
      var n=(pl.photos||[]).length;
      return '<button type="button" class="trav reveal" style="transition-delay:'+(i*40)+'ms" data-place="'+i+'"'+(n?'':' data-empty="1" aria-disabled="true"')+'>'+
        '<div><div class="tn">'+E(pl.name)+'</div>'+(pl.caption?'<div class="tc">'+E(pl.caption)+'</div>':'')+'</div>'+
        '<span class="badge">'+(n? n+' photo'+(n>1?'s':'') : 'Bientôt')+'</span></button>';
    }).join(''));
    document.querySelectorAll('#trav .trav').forEach(function(el){
      el.addEventListener('click', function(){ var pl=places[+el.getAttribute('data-place')]; if(!pl||!pl.photos||!pl.photos.length) return;
        openLightbox(pl.photos.map(function(ph){return IMG(ph.url,{w:1600});}),0); });
    });

    /* ---- parcours ---- */
    var exp=(data.parcours||[]).filter(function(r){return r.kind!=='formation';});
    var form=(data.parcours||[]).filter(function(r){return r.kind==='formation';});
    setHtml('#cv',
      '<div class="cv-col reveal"><h3 class="cv-h">Expérience</h3><ul>'+exp.map(cvItem).join('')+'</ul></div>'+
      '<div class="cv-col reveal"><h3 class="cv-h">Formation</h3><ul>'+form.map(cvItem).join('')+'</ul></div>');

    /* ---- contact ---- */
    var mail=S.contact_email||'stephane.donchery@gmail.com';
    if($('#mail')){ $('#mail').textContent=mail; $('#mail').href='mailto:'+mail; }
    var phone=S.contact_phone||''; var tel=phone.replace(/[^0-9+]/g,''); if(tel && tel.charAt(0)!=='+') tel='+33'+tel.replace(/^0/,'');
    setHtml('#cmeta', [
      S.contact_location?'<span>'+E(S.contact_location)+'</span>':'',
      phone?'<a href="tel:'+E(tel)+'">'+E(phone)+'</a>':'',
      S.contact_availability?'<span>'+E(S.contact_availability)+'</span>':''
    ].filter(Boolean).join(''));
    var soc=[['Instagram',S.social_instagram],['Flickr',S.social_flickr],['LinkedIn',S.social_linkedin],['Behance',S.social_behance]];
    setHtml('#socials', soc.filter(function(s){return s[1];}).map(function(s){
      return '<a href="'+E(s[1])+'" target="_blank" rel="noopener">'+s[0]+' ↗</a>';
    }).join(''));

    afterRender();
  }

  /* projets personnels : données partagées avec le site principal */
  function renderPerso(){
    var P=window.PERSO_PROJECTS||[];
    setHtml('#persoGrid', P.map(function(p,i){
      return '<a class="card proj reveal" style="transition-delay:'+(i*60)+'ms" href="'+E(p.url)+'" target="_blank" rel="noopener" aria-label="'+E(p.label||p.title)+' (nouvel onglet)">'+
        '<div class="thumb" style="background-image:url(\''+E(p.image)+'\')"></div>'+
        '<span class="arrow" aria-hidden="true">↗</span>'+
        '<div class="meta"><span class="cat">'+pad(i)+' · '+E(p.tag)+'</span><div class="t">'+E(p.title)+'</div><div class="m">'+E(p.meta)+'</div></div></a>';
    }).join(''));
  }

  function svcPanel(d, lead){
    var h='<div class="svc-panel"><div class="svc-b svc-b--lead"><span class="svc-label">En bref</span><p class="svc-lead">'+E(lead)+'</p></div>';
    if(d.pour) h+='<div class="svc-b svc-b--for"><span class="svc-label">Idéal pour</span><p>'+E(d.pour)+'</p></div>';
    if(d.livrables&&d.livrables.length) h+='<div class="svc-b svc-b--deliv"><span class="svc-label">Ce que je livre</span><ul class="svc-deliv-list">'+d.livrables.map(function(x){return '<li>'+E(x)+'</li>';}).join('')+'</ul></div>';
    if(d.etapes&&d.etapes.length) h+='<div class="svc-b svc-b--steps"><span class="svc-label">Comment on avance</span><ol class="svc-steps">'+d.etapes.map(function(x){return '<li>'+E(x)+'</li>';}).join('')+'</ol></div>';
    return h+'<a class="svc-cta" href="#contact"><span class="svc-cta-q">'+E(d.cta||'Un projet en tête ?')+'</span><span class="svc-cta-a">Parlons-en <i aria-hidden="true">→</i></span></a></div>';
  }

  /* accordéon : un seul volet ouvert à la fois */
  document.addEventListener('click', function(e){
    var row=e.target.closest('.svc-row'); if(!row || row.disabled) return;
    var svc=row.closest('.svc'), open=!svc.classList.contains('open');
    if(open) svc.parentElement.querySelectorAll('.svc.open').forEach(function(o){ if(o!==svc){ o.classList.remove('open'); var r=o.querySelector('.svc-row'); if(r) r.setAttribute('aria-expanded','false'); } });
    svc.classList.toggle('open', open); row.setAttribute('aria-expanded', open?'true':'false');
    if(open) setTimeout(function(){ var top=row.getBoundingClientRect().top; if(top<90) window.scrollBy({ top: top-100, behavior: reduce?'auto':'smooth' }); }, 480);
  });

  function cvItem(r){ return '<li><span class="yr">'+E(r.period)+'</span><div><strong>'+E(r.title)+'</strong>'+(r.detail?'<p>'+E(r.detail)+'</p>':'')+'</div></li>'; }

  function cycleWords(words){
    var el=$('#word'), i=0;
    setInterval(function(){ i=(i+1)%words.length; el.style.opacity=0; el.style.transform='translateY(-8px)'; el.style.transition='opacity .3s, transform .3s';
      setTimeout(function(){ el.textContent=words[i]; el.style.opacity=1; el.style.transform='none'; },300); }, 2600);
  }

  function afterRender(){
    hideLoader();
    var io=new IntersectionObserver(function(es){ es.forEach(function(e){ if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); } }); }, {threshold:.12});
    document.querySelectorAll('.reveal').forEach(function(el){ io.observe(el); });
    document.querySelectorAll('.hstat .n').forEach(function(n){
      // « 10 800 » saisi dans l'admin : on ne garde que les chiffres, puis on réaffiche avec séparateur de milliers
      var target=parseInt(String(n.getAttribute('data-count')||'').replace(/\D/g,''),10)||0, t0=null;
      var fmt=function(v){ return String(v).replace(/\B(?=(\d{3})+(?!\d))/g,' '); };
      var io2=new IntersectionObserver(function(es){ if(es[0].isIntersecting){ io2.disconnect();
        if(reduce){ n.firstChild.textContent=fmt(target); return; }
        (function step(ts){ if(!t0)t0=ts; var p=Math.min((ts-t0)/1200,1); n.firstChild.textContent=fmt(Math.round(target*(1-Math.pow(1-p,3)))); if(p<1) requestAnimationFrame(step); })(performance.now());
      } },{threshold:.5}); io2.observe(n);
    });
    var nav=$('#nav'); if(nav) addEventListener('scroll', function(){ nav.classList.toggle('scrolled', scrollY>40); }, {passive:true});
  }

  /* ---- lightbox ---- */
  var lb=$('#lb'), lbImg=$('#lbImg'), lbCount=$('#lbCount'), _imgs=[], _idx=0, _back=null;
  function openLightbox(imgs,i){ if(!lb) return; _back=document.activeElement; _imgs=imgs; _idx=i||0; showLb(); lb.classList.add('on'); var c=$('#lbClose'); if(c) c.focus(); }
  function showLb(){ lbImg.src=_imgs[_idx]; if(lbCount) lbCount.textContent=(_idx+1)+' / '+_imgs.length; }
  function closeLb(){ if(!lb) return; lb.classList.remove('on'); if(_back && _back.focus) _back.focus(); }
  function navLb(d){ _idx=(_idx+d+_imgs.length)%_imgs.length; showLb(); }
  if(lb){
    $('#lbClose').onclick=closeLb; $('#lbPrev').onclick=function(){navLb(-1);}; $('#lbNext').onclick=function(){navLb(1);};
    lb.addEventListener('click',function(e){ if(e.target===lb) closeLb(); });
    addEventListener('keydown',function(e){ if(!lb.classList.contains('on'))return; if(e.key==='Escape')closeLb(); if(e.key==='ArrowLeft')navLb(-1); if(e.key==='ArrowRight')navLb(1); });
  }
  window.__openLightbox=openLightbox;
})();
