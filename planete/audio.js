/* ============================================================================
   Son de la planète, entièrement synthétisé (Web Audio, aucun fichier) :
   - moteur de la Jeep (régime selon la vitesse), crissement des pneus, planches
     des ponts, turbo ; ventilateur et embruns de l'aéroglisseur ;
   - chocs sur les objets, atterrissages, tonneaux ;
   - ambiance selon l'heure et la météo : vent, vagues près de l'eau, oiseaux le
     jour, grillons la nuit, pluie, tonnerre ;
   - musique calme d'aventure, composée à la volée (harpe, nappe, flûte, basse).
   ============================================================================ */
import { TUNE } from './tune.js';

const midi = n => 440 * Math.pow(2, (n - 69) / 12);
const clamp01 = v => Math.max(0, Math.min(1, v));

export function makeAudio() {
  let ctx = null, master, bus = {}, noise, reverb;
  const S = { started: false };

  /* ---------- démarrage (au premier geste de l'utilisateur) ---------- */
  function start() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3;
    master = ctx.createGain(); master.connect(comp); comp.connect(ctx.destination);
    for (const k of ['musique', 'ambiance', 'effets', 'vehicules']) { bus[k] = ctx.createGain(); bus[k].connect(master); }
    // réverbération douce (réponse impulsionnelle générée)
    reverb = ctx.createConvolver();
    { const len = ctx.sampleRate * 2.6, b = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
      reverb.buffer = b; }
    const rvb = ctx.createGain(); rvb.gain.value = 0.55; reverb.connect(rvb); rvb.connect(master);
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    { const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    buildCar(); buildAmbience(); startMusic();
    S.started = true; applyVolumes();
  }
  const noiseSrc = () => { const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true; s.loopStart = Math.random(); s.start(); return s; };
  const gainNode = (v = 0) => { const g = ctx.createGain(); g.gain.value = v; return g; };
  const filt = (type, f, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  const set = (p, v, tc = 0.08) => p.setTargetAtTime(v, ctx.currentTime, tc);

  function applyVolumes() {
    if (!ctx) return;
    const V = TUNE.son;
    set(master.gain, V.actif ? V.general : 0, 0.15);
    set(bus.musique.gain, V.musique, 0.3); set(bus.ambiance.gain, V.ambiance, 0.3); set(bus.effets.gain, V.effets, 0.1); set(bus.vehicules.gain, V.vehicules, 0.1);
  }

  /* ---------- voiture et aéroglisseur ---------- */
  let car = null;
  function buildCar() {
    const out = gainNode(1); out.connect(bus.vehicules);
    // moteur : deux oscillateurs désaccordés, filtrés, un peu de grain
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), o3 = ctx.createOscillator(); o1.type = 'sawtooth'; o2.type = 'square'; o3.type = 'sine';
    const lp = filt('lowpass', 500, 2), eng = gainNode(0);
    o1.connect(lp); const g2 = gainNode(0.5); o2.connect(g2); g2.connect(lp); const g3 = gainNode(0.8); o3.connect(g3); g3.connect(eng); lp.connect(eng); eng.connect(out);
    o1.start(); o2.start(); o3.start();
    // pneus sur la terre, planches des ponts
    const sk = noiseSrc(), skF = filt('bandpass', 900, 0.6), skG = gainNode(0); sk.connect(skF); skF.connect(skG); skG.connect(out);
    // souffle du turbo
    const tb = noiseSrc(), tbF = filt('highpass', 2600), tbG = gainNode(0); tb.connect(tbF); tbF.connect(tbG); tbG.connect(out);
    // aéroglisseur : souffle du ventilateur, ronronnement, embruns
    const fan = noiseSrc(), fanF = filt('bandpass', 500, 1.2), fanG = gainNode(0); fan.connect(fanF); fanF.connect(fanG); fanG.connect(out);
    const hum = ctx.createOscillator(); hum.type = 'triangle'; const humG = gainNode(0); hum.connect(humG); humG.connect(out); hum.start();
    const spl = noiseSrc(), splF = filt('highpass', 1400), splG = gainNode(0); spl.connect(splF); splF.connect(splG); splG.connect(out);
    car = { o1, o2, o3, lp, eng, skF, skG, tbG, fanF, fanG, hum, humG, splG, plank: 0 };
  }
  function updateCar(dt, s) {
    if (!car) return;
    const w = s.walk ? 1 : 0, hv = s.hover, land = 1 - hv, motor = s.bike ? 0 : 1;   // le vélo n'a pas de moteur
    const rpm = clamp01(Math.abs(s.speed) / 9) * 0.8 + Math.abs(s.throttle) * 0.2 + s.boost * 0.25 + (s.ground ? 0 : 0.15 * Math.abs(s.throttle));
    const f = 34 + rpm * 90;
    set(car.o1.frequency, f); set(car.o2.frequency, f * 0.5 * 1.01); set(car.o3.frequency, f * 0.5);
    set(car.lp.frequency, 260 + rpm * 900 + s.boost * 600);
    set(car.eng.gain, motor * w * land * (0.05 + 0.07 * rpm + 0.03 * Math.abs(s.throttle)));
    const roll = s.ground ? clamp01(Math.abs(s.speed) / 7) : 0;
    set(car.skF.frequency, s.bridge ? 300 : 900 + roll * 600);
    set(car.skG.gain, w * land * roll * (s.bridge ? 0.02 : s.road ? 0.025 : 0.045) * (s.bike ? 0.35 : 1));   // vélo : un léger crissement de gravier
    set(car.tbG.gain, motor * w * land * s.boost * 0.06);
    // vélo en roue libre : le cliquetis du moyeu
    if (w && s.bike && Math.abs(s.speed) > 0.6 && Math.abs(s.throttle) < 0.2) { car.tick = (car.tick || 0) + Math.abs(s.speed) * dt * 9; while (car.tick >= 1) { car.tick -= 1; click(0.018, 2400 + Math.random() * 300, bus.vehicules); } }
    // aéroglisseur
    set(car.fanF.frequency, 380 + Math.abs(s.throttle) * 500 + Math.abs(s.speed) * 30);
    set(car.fanG.gain, w * hv * (0.05 + 0.05 * Math.abs(s.throttle)));
    set(car.hum.frequency, 60 + Math.abs(s.speed) * 6 + Math.abs(s.throttle) * 20); set(car.humG.gain, w * hv * 0.05);
    set(car.splG.gain, w * hv * clamp01(Math.abs(s.speed) / 6) * 0.05);
    // planches des ponts : un petit claquement à chaque planche
    if (w && s.bridge && s.ground && hv < 0.5 && Math.abs(s.speed) > 0.5) {
      car.plank += Math.abs(s.speed) * dt / 0.24;
      while (car.plank >= 1) { car.plank -= 1; click(0.05 + Math.min(0.06, Math.abs(s.speed) * 0.006), 180 + Math.random() * 60, bus.vehicules); }
    }
  }
  /** Petit claquement de bois. */
  function click(v, f, dest) {
    const t = ctx.currentTime, o = ctx.createOscillator(), g = gainNode(0), b = filt('bandpass', f * 2, 3);
    o.type = 'square'; o.frequency.value = f; o.connect(b); b.connect(g); g.connect(dest || bus.effets);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07); o.start(t); o.stop(t + 0.08);
  }

  /* ---------- chocs ---------- */
  let lastHit = 0;
  /** strength : force du choc ; dist : distance à la caméra ; kind : 'bois', 'sol', 'lourd' */
  function impact(strength, dist = 0, kind = 'bois') {
    if (!ctx || strength < 0.3) return;
    const t = ctx.currentTime; if (t - lastHit < 0.03) return; lastHit = t;
    const v = clamp01(strength / 5) * Math.max(0.15, 1 - dist / 25);
    // bruit filtré (le choc) + note grave (la masse) + un peu de réverbération
    const n = ctx.createBufferSource(); n.buffer = noise; const nf = filt('bandpass', kind === 'lourd' ? 220 : 500 + Math.random() * 600, 1.4), ng = gainNode(0);
    n.connect(nf); nf.connect(ng); ng.connect(bus.effets); ng.connect(reverb);
    ng.gain.setValueAtTime(0.35 * v, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.18 + v * 0.2);
    n.start(t, Math.random()); n.stop(t + 0.5);
    const o = ctx.createOscillator(), og = gainNode(0); o.type = 'sine';
    o.frequency.setValueAtTime(kind === 'lourd' ? 70 : 110 + Math.random() * 80, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.25);
    o.connect(og); og.connect(bus.effets); og.gain.setValueAtTime(0.4 * v, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.3); o.start(t); o.stop(t + 0.32);
    if (kind === 'bois') click(0.12 * v, 260 + Math.random() * 200);
  }

  /* ---------- ambiance ---------- */
  let amb = null;
  function buildAmbience() {
    const out = gainNode(1); out.connect(bus.ambiance);
    const wind = noiseSrc(), windF = filt('lowpass', 500), windG = gainNode(0); wind.connect(windF); windF.connect(windG); windG.connect(out);
    const rain = noiseSrc(), rainF = filt('bandpass', 2600, 0.4), rainG = gainNode(0); rain.connect(rainF); rainF.connect(rainG); rainG.connect(out);
    const wave = noiseSrc(), waveF = filt('lowpass', 700), waveG = gainNode(0); wave.connect(waveF); waveF.connect(waveG); waveG.connect(out);
    // grillons : une note aiguë hachée
    const cr = ctx.createOscillator(); cr.frequency.value = 4700; const crAM = gainNode(0), crG = gainNode(0);
    const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 28; const lfoG = gainNode(0.5); lfo.connect(lfoG); lfoG.connect(crAM.gain);
    cr.connect(crAM); crAM.connect(crG); crG.connect(out); cr.start(); lfo.start();
    amb = { out, windF, windG, rainG, waveG, crG, nextBird: 2, wavePh: 0, crPh: 0 };
  }
  function bird(pan) {
    const t0 = ctx.currentTime, p = ctx.createStereoPanner ? ctx.createStereoPanner() : null, g = gainNode(0);
    if (p) { p.pan.value = pan; g.connect(p); p.connect(amb.out); } else g.connect(amb.out);
    g.connect(reverb);
    const base = 2200 + Math.random() * 1800, notes = 2 + Math.floor(Math.random() * 5);
    for (let i = 0; i < notes; i++) {
      const t = t0 + i * (0.09 + Math.random() * 0.08), o = ctx.createOscillator(), og = gainNode(0); o.type = 'sine';
      const f = base * (0.9 + Math.random() * 0.3);
      o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * (1.2 + Math.random() * 0.5), t + 0.06);
      o.connect(og); og.connect(g); og.gain.setValueAtTime(0, t); og.gain.linearRampToValueAtTime(0.05, t + 0.01); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      o.start(t); o.stop(t + 0.1);
    }
    g.gain.value = 1;
  }
  function thunder(far = 0.5) {
    if (!ctx) return;
    const t = ctx.currentTime + 0.3 + far * 2, n = ctx.createBufferSource(); n.buffer = noise; n.loop = true;
    const f = filt('lowpass', 260, 0.5), g = gainNode(0); n.connect(f); f.connect(g); g.connect(bus.ambiance); g.connect(reverb);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.6, t + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.5);
    f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(90, t + 3);
    n.start(t); n.stop(t + 3.6);
  }
  function updateAmbience(dt, a) {
    if (!amb) return;
    const day = clamp01(1 - a.night), quiet = a.walk ? 1 : 0.45;
    set(amb.windF.frequency, 300 + a.wind * 900); set(amb.windG.gain, quiet * (0.015 + a.wind * 0.05), 0.5);
    set(amb.rainG.gain, quiet * Math.min(1, a.rain) * 0.16, 0.6);
    amb.wavePh += dt * 0.55; set(amb.waveG.gain, quiet * a.water * (0.03 + 0.05 * (0.5 + 0.5 * Math.sin(amb.wavePh))), 0.3);
    amb.crPh += dt; const chirp = (Math.sin(amb.crPh * 9) > 0.2 ? 1 : 0) * (Math.sin(amb.crPh * 0.7) > -0.3 ? 1 : 0);
    set(amb.crG.gain, quiet * a.night * (1 - a.rain) * 0.012 * chirp, 0.02);
    if ((amb.nextBird -= dt) <= 0) {
      amb.nextBird = 1.2 + Math.random() * 4;
      if (day > 0.5 && a.rain < 0.2 && Math.random() < 0.8) bird(Math.random() * 1.6 - 0.8);
    }
  }

  /* ---------- musique : calme, d'aventure, composée à la volée ---------- */
  const TEMPO = 72, BEAT = 60 / TEMPO;
  // ré majeur : I, IV, vi, V, puis une variante (I, iii, IV, V)
  const PROG = [[62, 66, 69], [67, 71, 74], [59, 62, 66], [57, 61, 64], [62, 66, 69], [66, 69, 73], [67, 71, 74], [57, 61, 64]];
  const PENTA = [62, 64, 66, 69, 71, 74, 76, 78, 81];
  let mus = null;
  function startMusic() {
    mus = { next: ctx.currentTime + 0.5, step: 0, bar: 0, out: gainNode(1), last: 74 };
    mus.out.connect(bus.musique); const send = gainNode(0.8); mus.out.connect(send); send.connect(reverb);
    setInterval(schedule, 120);
  }
  function note(f, t, dur, type, vol, attack = 0.005, vib = 0) {
    const o = ctx.createOscillator(), g = gainNode(0); o.type = type; o.frequency.value = f;
    if (vib) { const l = ctx.createOscillator(), lg = gainNode(f * 0.006); l.frequency.value = 5; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur + 0.6); }
    o.connect(g); g.connect(mus.out);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function harp(n, t, vol = 0.06) { note(midi(n), t, 1.6, 'triangle', vol); note(midi(n + 12), t, 0.7, 'sine', vol * 0.25); }
  function pad(chord, t, dur) {
    const lp = filt('lowpass', 900, 0.5), g = gainNode(0); lp.connect(g); g.connect(mus.out);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.022, t + 1.4); g.gain.setValueAtTime(0.022, t + dur - 1); g.gain.linearRampToValueAtTime(0, t + dur + 0.6);
    chord.forEach(n => [-6, 6].forEach(c => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midi(n - 12); o.detune.value = c; o.connect(lp); o.start(t); o.stop(t + dur + 0.7); }));
  }
  function schedule() {
    if (!ctx || !TUNE.son.actif || TUNE.son.musique <= 0.001) { if (ctx) mus.next = Math.max(mus.next, ctx.currentTime + 0.2); return; }
    while (mus.next < ctx.currentTime + 0.5) {
      const t = mus.next, s = mus.step % 8, chord = PROG[Math.floor(mus.bar / 2) % PROG.length];
      if (s === 0 && mus.bar % 2 === 0) { pad(chord, t, BEAT * 8); note(midi(chord[0] - 24), t, BEAT * 3.5, 'sine', 0.07, 0.03); }
      if (s === 0 && mus.bar % 2 === 1) note(midi(chord[0] - 24), t, BEAT * 3.5, 'sine', 0.05, 0.03);
      // harpe : arpège montant puis descendant, une note par croche
      const arp = [0, 1, 2, 3, 4, 3, 2, 1], tones = [chord[0], chord[1], chord[2], chord[0] + 12, chord[1] + 12];
      if (Math.random() > 0.12) harp(tones[arp[s]], t + (Math.random() - 0.5) * 0.01, 0.045 + (s === 0 ? 0.02 : 0));
      // flûte : une petite mélodie pentatonique, aérée
      if (mus.bar % 4 >= 2 && s % 2 === 0 && Math.random() < 0.55) {
        const near = PENTA.filter(n => Math.abs(n - mus.last) <= 5 && n !== mus.last), n = near[Math.floor(Math.random() * near.length)] || 74;
        mus.last = n; note(midi(n + 12), t, BEAT * (1.5 + Math.random() * 1.5), 'sine', 0.035, 0.08, 1);
      }
      mus.next += BEAT / 2; mus.step++; if (mus.step % 8 === 0) mus.bar++;
    }
  }

  /* ---------- monde à l'envers : radio qui grésille, drone grave, arpège de synthé années 80 ---------- */
  let rad = null;
  function radio(dt, on, signal) {
    if (!ctx || (!rad && !on)) return;
    if (!rad) {
      const st = noiseSrc(), bp = filt('bandpass', 1900, 0.9), gs = gainNode(0); st.connect(bp); bp.connect(gs); gs.connect(bus.effets);
      const lp = filt('lowpass', 240, 1.2), gd = gainNode(0); lp.connect(gd); gd.connect(bus.ambiance); gd.connect(reverb);
      for (const f of [55, 55.6, 82.4]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(lp); o.start(); }
      // la musique du monde à l'envers passe « par la radio » : un filtre qui s'ouvre quand on capte bien la fréquence
      const mlp = filt('lowpass', 900, 0.8), mg = gainNode(0); mlp.connect(mg); mg.connect(bus.musique);
      rad = { gs, gd, mlp, mg, buf: null, loading: false, next: 0, srcs: [], live: [], voices: null, vNext: 0, vLast: -1, vUntil: 0 };
      // chaque son lancé (musique, répliques, Démogorgon) est gardé avec son gain : à la sortie, on l'arrête ET on le débranche
      rad.track = (src, g) => { const e = [src, g]; rad.live.push(e); src.onended = () => { rad.live = rad.live.filter(x => x !== e); rad.srcs = rad.srcs.filter(x => x !== src); }; };
      rad.was = false;
    }
    set(rad.gs.gain, on ? 0.01 + 0.1 * (1 - signal) : 0, 0.2);   // grésillement : fort quand on s'éloigne de la fréquence
    set(rad.gd.gain, on ? 0.06 : 0, 0.8);
    if (mus) set(mus.out.gain, on ? 0 : 1, 0.6);                   // la musique habituelle se tait
    set(rad.mg.gain, on ? (ctx.currentTime < rad.vUntil ? 0.4 : 0.9) : 0, on ? 0.4 : 0.5);   // la musique s'efface un peu pendant une réplique
    set(rad.mlp.frequency, 700 + 17000 * signal * signal, 0.25);
    // répliques et sons du monde à l'envers, au hasard par-dessus la musique (toutes les 20 à 40 s)
    if (on) {
      if (!rad.was && rad.voices) { rad.vNext = ctx.currentTime + 9; rad.dNext = 0; }   // on (re)vient : première réplique au bout de 9 s
      if (!rad.voices) { rad.voices = []; for (let i = 1; i <= 5; i++) fetch('audio/st/v' + i + '.mp3').then(r => r.arrayBuffer()).then(a => ctx.decodeAudioData(a)).then(b => { rad.voices[i - 1] = b; }).catch(() => {}); rad.vNext = ctx.currentTime + 9; }
      if (rad.voices.some(Boolean) && ctx.currentTime > rad.vNext && TUNE.son.actif) {
        // tirage au hasard, sans répéter le même son d'affilée
        const W = [1, 1, 1, 1, 1], pool = []; rad.voices.forEach((b, i) => { if (b && i !== rad.vLast) pool.push([i, W[i]]); });
        let x = Math.random() * pool.reduce((a, p) => a + p[1], 0), k = pool[0][0]; for (const [i, w] of pool) { if ((x -= w) <= 0) { k = i; break; } } rad.vLast = k;
        const b = rad.voices[k], src = ctx.createBufferSource(), g = gainNode(1.1); src.buffer = b; src.connect(g); g.connect(bus.effets); g.connect(reverb);
        src.start(); rad.track(src, g); rad.vSrc = src; rad.vUntil = ctx.currentTime + b.duration; rad.vNext = rad.vUntil + 20 + Math.random() * 20;
      }
      // en surcouche : le Démogorgon rugit toutes les 15 s environ, d'un côté ou de l'autre
      const dg = rad.voices[3];
      if (dg && TUNE.son.actif) {
        if (!rad.dNext) rad.dNext = ctx.currentTime + 4;
        if (ctx.currentTime > rad.dNext) {
          const src = ctx.createBufferSource(), g = gainNode(0.8), pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null; src.buffer = dg; src.playbackRate.value = 0.92 + Math.random() * 0.16;
          if (pan) { pan.pan.value = (Math.random() * 2 - 1) * 0.7; src.connect(pan); pan.connect(g); } else src.connect(g);
          g.connect(bus.effets); g.connect(reverb); src.start(); rad.track(src, g); rad.dSrc = src; rad.dNext = ctx.currentTime + 14 + Math.random() * 2;
        }
      }
    } else if (rad.was) {   // on quitte le monde à l'envers : tout se tait pour de bon (arrêt et débranchement, quel que soit le navigateur)
      const now = ctx.currentTime;
      for (const p of [rad.mg.gain, rad.gs.gain, rad.gd.gain]) { p.cancelScheduledValues(now); p.setValueAtTime(p.value, now); p.linearRampToValueAtTime(0, now + 0.4); }
      for (const [src, g] of rad.live) { try { g.gain.cancelScheduledValues(now); g.gain.setValueAtTime(g.gain.value, now); g.gain.linearRampToValueAtTime(0, now + 0.4); } catch (e) { /* rien */ } try { src.stop(now + 0.45); } catch (e) { /* déjà arrêtée */ } setTimeout(() => { try { src.disconnect(); g.disconnect(); } catch (e) { /* déjà débranchée */ } }, 600); }
      rad.live = []; rad.srcs = []; rad.next = 0;
      if (rad.dSrc) { try { rad.dSrc.stop(); } catch (e) { /* déjà fini */ } rad.dSrc = null; } rad.dNext = 0;
      if (rad.vSrc) { try { rad.vSrc.stop(); } catch (e) { /* déjà finie */ } rad.vSrc = null; rad.vUntil = 0; if (rad.voices) rad.vNext = ctx.currentTime + 9; }
    }
    rad.was = on;
    if (!on) {
      if (rad.srcs.length) { const t = ctx.currentTime + 2; rad.srcs.forEach(s => { try { s.stop(t); } catch (e) { /* déjà arrêtée */ } }); rad.srcs = []; }
      rad.next = 0; return;
    }
    if (!rad.buf) {
      if (!rad.loading) { rad.loading = true; fetch('audio/upside.mp3').then(r => r.arrayBuffer()).then(a => ctx.decodeAudioData(a)).then(b => { rad.buf = b; }).catch(() => { rad.loading = false; }); }
      return;
    }
    // lecture en boucle : chaque reprise démarre 3 s avant la fin de la précédente, en fondu enchaîné
    const now = ctx.currentTime, X = 3, dur = rad.buf.duration;
    if (!rad.next || rad.next < now - 0.5) rad.next = now + 0.05;
    if (rad.next - now < 0.6) {
      const t = rad.next, s = ctx.createBufferSource(), g = gainNode(0); s.buffer = rad.buf; s.connect(g); g.connect(rad.mlp);
      const first = !rad.srcs.length;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + (first ? 1.2 : X));
      g.gain.setValueAtTime(1, t + dur - X); g.gain.linearRampToValueAtTime(0, t + dur);
      s.start(t); s.stop(t + dur + 0.05);
      rad.srcs.push(s); rad.track(s, g);
      rad.next = t + dur - X;
    }
  }

  /* ---------- clins d'œil : un thème par monde (fichier audio/<nom>.mp3 s'il existe, sinon composé au synthé), et des bruitages ---------- */
  // thèmes originaux : 'et' (nappe de cordes et arpège qui s'envole), 'mario' (petite ritournelle 8 bits)
  const THEMES = {
    et: { bpm: 84, play(st, t, B) {
      const P = [[53, 57, 60, 65], [50, 57, 62, 65], [46, 53, 58, 62], [48, 55, 60, 64]], ch = P[Math.floor(st / 16) % 4], s = st % 16;
      if (s === 0) { ch.forEach(n => tone(midi(n), t, B * 8.2, 'sawtooth', 0.018, 0.6, 0, 1400)); tone(midi(ch[0] - 12), t, B * 7.5, 'sine', 0.07, 0.2); }
      if (s % 2 === 0) tone(midi(ch[(s / 2) % 4] + 12), t, B * 1.6, 'triangle', 0.035, 0.01);
      const LEAD = [77, 0, 0, 76, 74, 0, 72, 0, 74, 0, 0, 0, 69, 0, 72, 0], bar = Math.floor(st / 16) % 4, n = LEAD[s] && bar % 2 === 1 ? LEAD[s] + (bar === 3 ? 2 : 0) : 0;
      if (n) tone(midi(n), t, B * 2.4, 'sine', 0.05, 0.06, 1);
    } },
    mario: { bpm: 150, play(st, t, B) {
      const s = st % 32, BASS = [48, 0, 55, 0, 48, 0, 55, 0, 53, 0, 60, 0, 53, 0, 60, 0, 50, 0, 57, 0, 50, 0, 57, 0, 55, 0, 59, 0, 55, 0, 62, 0];
      const LEAD = [72, 0, 76, 79, 0, 76, 77, 0, 77, 0, 81, 84, 0, 81, 79, 0, 74, 0, 77, 81, 0, 79, 77, 76, 74, 0, 79, 0, 83, 0, 86, 0];
      if (BASS[s]) tone(midi(BASS[s] - 12), t, B * 0.9, 'triangle', 0.09, 0.004);
      if (LEAD[s]) { tone(midi(LEAD[s]), t, B * 0.8, 'square', 0.032, 0.003); tone(midi(LEAD[s] - 12), t, B * 0.6, 'square', 0.012, 0.003); }
      if (s % 4 === 2) { const n = ctx.createBufferSource(); n.buffer = noise; const hp = filt('highpass', 7000), g = gainNode(0); n.connect(hp); hp.connect(g); g.connect(th.out); g.gain.setValueAtTime(0.05, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05); n.start(t, Math.random()); n.stop(t + 0.06); }
    } },
  };
  let th = null;
  function tone(f, t, dur, type, vol, attack = 0.005, vib = 0, lp = 0) {
    const o = ctx.createOscillator(), g = gainNode(0); o.type = type; o.frequency.value = f;
    let last = o; if (lp) { const fl = filt('lowpass', lp, 0.6); o.connect(fl); last = fl; }
    if (vib) { const l = ctx.createOscillator(), lg = gainNode(f * 0.006); l.frequency.value = 5; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur + 0.6); }
    last.connect(g); g.connect(th.out);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.setTargetAtTime(0, t + dur * 0.7, dur * 0.25);
    o.start(t); o.stop(t + dur + 0.6);
  }
  const files = {};
  /** Thème du monde `name` (null : on revient à la musique habituelle). rate : tempo (étoile d'invincibilité). */
  function theme(name, rate = 1) {
    if (!ctx) return;
    if (!th) { th = { out: gainNode(0), name: null, step: 0, next: 0, srcs: [], fileNext: 0 }; th.out.connect(bus.musique); const sd = gainNode(0.5); th.out.connect(sd); sd.connect(reverb); }
    if (name !== th.name) {
      if (th.srcs.length) { const t = ctx.currentTime + 1; th.srcs.forEach(x => { try { x.stop(t); } catch (e) { /* déjà arrêtée */ } }); th.srcs = []; }
      th.name = name; th.step = 0; th.next = ctx.currentTime + 0.3; th.fileNext = 0;
      set(th.out.gain, name ? 0.9 : 0, name ? 0.5 : 0.4);
      if (mus) set(mus.out.gain, name ? 0 : 1, 0.6);
      if (name && files[name] === undefined) { files[name] = null; fetch('audio/' + name + '.mp3').then(r => { if (!r.ok) throw 0; return r.arrayBuffer(); }).then(a => ctx.decodeAudioData(a)).then(b => { files[name] = b; }).catch(() => { files[name] = false; }); }
    }
    th.rate = rate;
    if (!name || !TUNE.son.actif) return;
    const buf = files[name];
    if (buf) {   // le fichier fourni : en boucle, chaque reprise 3 s avant la fin, en fondu enchaîné
      const now = ctx.currentTime, X = 3, dur = buf.duration / rate;
      if (!th.fileNext || th.fileNext < now - 0.5) th.fileNext = now + 0.05;
      if (th.fileNext - now < 0.6) {
        const t = th.fileNext, src = ctx.createBufferSource(), g = gainNode(0); src.buffer = buf; src.playbackRate.value = rate; src.connect(g); g.connect(th.out);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + (th.srcs.length ? X : 1)); g.gain.setValueAtTime(1, t + dur - X); g.gain.linearRampToValueAtTime(0, t + dur);
        src.start(t); src.stop(t + dur + 0.05); th.srcs.push(src); src.onended = () => { th.srcs = th.srcs.filter(x => x !== src); }; th.fileNext = t + dur - X;
      }
      th.srcs.forEach(x => { x.playbackRate.value = rate; });
      return;
    }
    if (buf === null) return;   // en cours de chargement
    const T = THEMES[name]; if (!T) return; const B = 60 / (T.bpm * rate) / 2;   // pas : une croche
    while (th.next < ctx.currentTime + 0.4) { T.play(th.step, th.next, B); th.next += B; th.step++; }
  }
  /** Petits bruitages : 'coin', 'bump', 'power', 'star', 'pipe', 'spin', 'pick', 'alarm', 'fly', 'boom', 'flag', 'grow'. */
  function sfx(kind) {
    if (!ctx) return;
    const t = ctx.currentTime, out = bus.effets;
    const beep = (f, t0, d, type = 'square', v = 0.08, f2 = 0) => { const o = ctx.createOscillator(), g = gainNode(0); o.type = type; o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + d); o.connect(g); g.connect(out); g.gain.setValueAtTime(v, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d); o.start(t0); o.stop(t0 + d + 0.02); };
    if (kind === 'jump') beep(midi(62), t, 0.16, 'square', 0.05, midi(79));
    else if (kind === 'coin') { beep(midi(83), t, 0.07, 'square', 0.06); beep(midi(88), t + 0.07, 0.3, 'square', 0.06); }
    else if (kind === 'bump') { beep(220, t, 0.12, 'square', 0.08, 110); impact(2.5, 0, 'bois'); }
    else if (kind === 'power') [60, 64, 67, 72, 76, 79, 84].forEach((n, i) => beep(midi(n), t + i * 0.05, 0.09, 'square', 0.05));
    else if (kind === 'grow') for (let i = 0; i < 9; i++) beep(midi(55 + i * 2 + (i % 2) * 5), t + i * 0.06, 0.07, 'square', 0.05);
    else if (kind === 'star') [72, 76, 79, 84, 88, 91].forEach((n, i) => beep(midi(n), t + i * 0.04, 0.12, 'triangle', 0.07));
    else if (kind === 'pipe') for (let i = 0; i < 3; i++) beep(midi(60 - i * 5), t + i * 0.12, 0.11, 'square', 0.07);
    else if (kind === 'spin') beep(900, t, 0.5, 'sawtooth', 0.04, 120);
    else if (kind === 'flag') for (let i = 0; i < 12; i++) beep(midi(84 - i * 2), t + i * 0.05, 0.06, 'square', 0.04);
    else if (kind === 'pick') [69, 76, 81, 88].forEach((n, i) => beep(midi(n), t + i * 0.09, 0.6, 'sine', 0.07));
    else if (kind === 'alarm') for (let i = 0; i < 4; i++) beep(i % 2 ? 660 : 880, t + i * 0.18, 0.17, 'sawtooth', 0.035);
    else if (kind === 'fly') { const n = ctx.createBufferSource(); n.buffer = noise; const bp = filt('bandpass', 400, 0.8), g = gainNode(0); n.connect(bp); bp.connect(g); g.connect(out); g.connect(reverb); bp.frequency.exponentialRampToValueAtTime(2400, t + 3); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12, t + 1); g.gain.linearRampToValueAtTime(0, t + 4); n.start(t); n.stop(t + 4.1); [60, 67, 72, 76, 79].forEach((m, i) => beep(midi(m + 12), t + 0.3 + i * 0.3, 1.4, 'sine', 0.04)); }
    else if (kind === 'boom') { const n = ctx.createBufferSource(); n.buffer = noise; const lp = filt('lowpass', 1200), g = gainNode(0); n.connect(lp); lp.connect(g); g.connect(out); g.connect(reverb); g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9); lp.frequency.exponentialRampToValueAtTime(120, t + 0.8); n.start(t, Math.random()); n.stop(t + 1); }
  }

  return {
    start, applyVolumes, impact, thunder, radio: (dt, on, sig) => radio(dt, on, sig), click: (v, f) => ctx && click(v, f), theme, sfx,
    get started() { return S.started; },
    update(dt, car, ambi) { if (!ctx) return; updateCar(dt, car); updateAmbience(dt, ambi); },
  };
}
