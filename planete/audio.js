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
    const w = s.walk ? 1 : 0, hv = s.hover, land = 1 - hv;
    const rpm = clamp01(Math.abs(s.speed) / 9) * 0.8 + Math.abs(s.throttle) * 0.2 + s.boost * 0.25 + (s.ground ? 0 : 0.15 * Math.abs(s.throttle));
    const f = 34 + rpm * 90;
    set(car.o1.frequency, f); set(car.o2.frequency, f * 0.5 * 1.01); set(car.o3.frequency, f * 0.5);
    set(car.lp.frequency, 260 + rpm * 900 + s.boost * 600);
    set(car.eng.gain, w * land * (0.05 + 0.07 * rpm + 0.03 * Math.abs(s.throttle)));
    const roll = s.ground ? clamp01(Math.abs(s.speed) / 7) : 0;
    set(car.skF.frequency, s.bridge ? 300 : 900 + roll * 600);
    set(car.skG.gain, w * land * roll * (s.bridge ? 0.02 : s.road ? 0.025 : 0.045));
    set(car.tbG.gain, w * land * s.boost * 0.06);
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
      rad = { gs, gd, mlp, mg, buf: null, loading: false, next: 0, srcs: [] };
    }
    set(rad.gs.gain, on ? 0.01 + 0.1 * (1 - signal) : 0, 0.2);   // grésillement : fort quand on s'éloigne de la fréquence
    set(rad.gd.gain, on ? 0.06 : 0, 0.8);
    if (mus) set(mus.out.gain, on ? 0 : 1, 0.6);                   // la musique habituelle se tait
    set(rad.mg.gain, on ? 0.9 : 0, on ? 0.8 : 0.5);
    set(rad.mlp.frequency, 700 + 17000 * signal * signal, 0.25);
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
      rad.srcs.push(s); s.onended = () => { rad.srcs = rad.srcs.filter(x => x !== s); };
      rad.next = t + dur - X;
    }
  }

  return {
    start, applyVolumes, impact, thunder, radio: (dt, on, sig) => radio(dt, on, sig), click: (v, f) => ctx && click(v, f),
    get started() { return S.started; },
    update(dt, car, ambi) { if (!ctx) return; updateCar(dt, car); updateAmbience(dt, ambi); },
  };
}
