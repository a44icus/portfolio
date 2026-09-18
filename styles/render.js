/* ============================================================================
   Moteur de rendu partagé par les variantes (aurora / glass / kinetic / warm).
   Piloté par un contrat d'ids présents dans chaque page :
     #availability #line1 #line2pre #word #herosub #stats
     #bento #svc #steps #gal #trav #cv #quotes #facts
     #profil1 #profil2 #mail #cmeta #socials #copyright
     #t-travaux #t-services #t-approche #t-galerie #t-parcours #t-voix #contact-title
     #loading  + lightbox (#lb #lbImg #lbCount #lbClose #lbPrev #lbNext)
   Chaque page habille librement ces éléments via son CSS + son Three.js.
   ============================================================================ */
(function(){
  var E=(window.PF&&PF.esc)||function(s){return s==null?'':String(s);};
  var IMG=(window.PF&&PF.img)||function(u){return u;};
  var $=function(s){return document.querySelector(s);};
  var reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;

  loadPortfolio().then(render).catch(function(e){ console.error(e); hideLoader(); });

  function hideLoader(){ var l=$('#loading'); if(l){ l.classList.add('out'); setTimeout(function(){ if(l.parentNode) l.remove(); },600); } }
  function setTxt(sel,v){ if(v!=null){ var el=$(sel); if(el) el.textContent=v; } }
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

    var stats=[[S.stat1_num,S.stat1_label],[S.stat2_num,S.stat2_label],[S.stat3_num,S.stat3_label],[S.stat4_num,S.stat4_label]];
    setHtml('#stats', stats.filter(function(s){return s[0];}).map(function(s){
      return '<div class="hstat"><div class="n" data-count="'+E(s[0])+'">0<span class="plus">+</span></div><div class="l">'+E(s[1])+'</div></div>';
    }).join(''));

    setHtml('#bento', (data.projects||[]).map(function(p,i){
      var href=(p.slug&&(p.intro_body||p.approach_body||p.lede))?('../projets/projet.html?p='+encodeURIComponent(p.slug)):(p.link&&p.link!=='#'?p.link:'#');
      return '<a class="card proj reveal" style="transition-delay:'+(i*40)+'ms" href="'+E(href)+'"'+(href==='#'?' onclick="return false"':'')+' data-i="'+i+'">'+
        '<div class="thumb" style="background-image:url(\''+E(IMG(p.image_url,{w:900}))+'\')"></div>'+
        '<span class="arrow" aria-hidden="true">↗</span>'+
        '<div class="meta"><span class="cat">'+('0'+(i+1)).slice(-2)+' · '+E(p.category)+'</span>'+
        '<div class="t">'+E(p.title)+'</div><div class="m">'+E(p.meta||p.year)+'</div></div></a>';
    }).join(''));

    setHtml('#svc', (data.services||[]).map(function(s,i){
      return '<div class="svc reveal" style="transition-delay:'+(i*40)+'ms"><span class="i">'+('0'+(i+1)).slice(-2)+'</span><h3>'+E(s.name)+'</h3><p>'+E(s.tags)+'</p></div>';
    }).join(''));

    var steps=[[S.step1_title,S.step1_text],[S.step2_title,S.step2_text],[S.step3_title,S.step3_text],[S.step4_title,S.step4_text]];
    setHtml('#steps', steps.map(function(st,i){
      return '<div class="step reveal" style="transition-delay:'+(i*50)+'ms"><div class="n">'+('0'+(i+1)).slice(-2)+'</div><h3>'+E(st[0])+'</h3><p>'+E(st[1])+'</p></div>';
    }).join(''));

    var gal=data.carousel||[];
    setHtml('#gal', gal.map(function(g,i){
      return '<div class="gal-item reveal" data-gal="'+i+'"><img loading="lazy" src="'+E(IMG(g.url,{w:700}))+'" alt="'+E(g.caption||'Photographie')+'"></div>';
    }).join(''));
    var galFull=gal.map(function(g){return IMG(g.url,{w:1600});});
    document.querySelectorAll('#gal .gal-item').forEach(function(el){ el.addEventListener('click',function(){ openLightbox(galFull, +el.getAttribute('data-gal')||0); }); });

    var places=data.places||[];
    setHtml('#trav', places.map(function(pl,i){
      var n=(pl.photos||[]).length;
      return '<div class="trav reveal" style="transition-delay:'+(i*40)+'ms" data-place="'+i+'"'+(n?'':' data-empty="1"')+'>'+
        '<div><div class="tn">'+E(pl.name)+'</div>'+(pl.caption?'<div class="tc">'+E(pl.caption)+'</div>':'')+'</div>'+
        '<span class="badge">'+(n? n+' photo'+(n>1?'s':'') : 'Bientôt')+'</span></div>';
    }).join(''));
    document.querySelectorAll('#trav .trav').forEach(function(el){
      el.addEventListener('click', function(){ var pl=places[+el.getAttribute('data-place')]; if(!pl||!pl.photos.length) return;
        openLightbox(pl.photos.map(function(ph){return IMG(ph.url,{w:1600});}),0); });
    });

    var exp=(data.parcours||[]).filter(function(r){return r.kind!=='formation';});
    var form=(data.parcours||[]).filter(function(r){return r.kind==='formation';});
    setHtml('#cv',
      '<div class="cv-col reveal"><h3 class="cv-h">Expérience</h3><ul>'+exp.map(cvItem).join('')+'</ul></div>'+
      '<div class="cv-col reveal"><h3 class="cv-h">Formation</h3><ul>'+form.map(cvItem).join('')+'</ul></div>');

    setHtml('#quotes', (data.testimonials||[]).map(function(t,i){
      return '<figure class="quote reveal" style="transition-delay:'+(i*50)+'ms"><div class="mk" aria-hidden="true">“</div><p>'+E(t.quote)+'</p><figcaption><strong>'+E(t.author)+'</strong><span>'+E(t.role)+'</span></figcaption></figure>';
    }).join(''));

    setTxt('#profil1',S.profil_p1); setTxt('#profil2',S.profil_p2);
    var facts=[[S.fact1_label,S.fact1_text],[S.fact2_label,S.fact2_text],[S.fact3_label,S.fact3_text],[S.fact4_label,S.fact4_text]];
    setHtml('#facts', facts.filter(function(f){return f[0];}).map(function(f){
      return '<div class="fact"><strong>'+E(f[0])+'</strong><span>'+E(f[1])+'</span></div>';
    }).join(''));

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
      var target=parseInt(n.getAttribute('data-count'),10)||0, t0=null;
      var io2=new IntersectionObserver(function(es){ if(es[0].isIntersecting){ io2.disconnect();
        if(reduce){ n.firstChild.textContent=target; return; }
        (function step(ts){ if(!t0)t0=ts; var p=Math.min((ts-t0)/1200,1); n.firstChild.textContent=Math.round(target*(1-Math.pow(1-p,3))); if(p<1) requestAnimationFrame(step); })(performance.now());
      } },{threshold:.5}); io2.observe(n);
    });
    var nav=$('#nav'); if(nav) addEventListener('scroll', function(){ nav.classList.toggle('scrolled', scrollY>40); }, {passive:true});
  }

  /* ---- lightbox partagée ---- */
  var lb=$('#lb'), lbImg=$('#lbImg'), lbCount=$('#lbCount'), _imgs=[], _idx=0;
  function openLightbox(imgs,i){ if(!lb) return; _imgs=imgs; _idx=i||0; showLb(); lb.classList.add('on'); }
  function showLb(){ lbImg.src=_imgs[_idx]; if(lbCount) lbCount.textContent=(_idx+1)+' / '+_imgs.length; }
  function closeLb(){ if(lb) lb.classList.remove('on'); }
  function navLb(d){ _idx=(_idx+d+_imgs.length)%_imgs.length; showLb(); }
  if(lb){
    $('#lbClose').onclick=closeLb; $('#lbPrev').onclick=function(){navLb(-1);}; $('#lbNext').onclick=function(){navLb(1);};
    lb.addEventListener('click',function(e){ if(e.target===lb) closeLb(); });
    addEventListener('keydown',function(e){ if(!lb.classList.contains('on'))return; if(e.key==='Escape')closeLb(); if(e.key==='ArrowLeft')navLb(-1); if(e.key==='ArrowRight')navLb(1); });
  }
  window.__openLightbox=openLightbox;
})();
