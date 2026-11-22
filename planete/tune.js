/* ============================================================================
   Barre de réglages : tous les paramètres de la planète, modifiables en direct.
   Les valeurs sont gardées dans le navigateur et s'exportent en JSON
   (bouton « Copier les réglages ») pour être transmises telles quelles.
   ============================================================================ */
export const DEFAULTS = {
  ambiance: { heureFixe: true, heure: 12.4, vitesseJour: 1, meteo: 'clear', vent: 2.1, brume: 1 },
  lumiere: {
    soleil: 1, ciel: 1, ambiante: 1, exposition: 1,
    teinteOmbres: '#9466d1', forceTeinteOmbres: 0,
    teinteLumiere: '#ffe0c4', forceTeinteLumiere: 0,
  },
  post: { bloom: 1, bloomRayon: 0.45, bloomSeuil: 1.05, flou: 1, zoneNette: 0.14, saturation: 1.18 },
  eau: { bord: '#34bdb0', milieu: '#38b5bf', large: '#0b4766', ecume: 1, largeurLisere: 1, epaisseurTraits: 1, espacementTraits: 1, longueurTraits: 0.5, paillettes: 0.05, eclatPaillettes: 0.7 },
  sable: { couleur: '#fee09f', forceCouleur: 0, paillettes: 0.06, eclatPaillettes: 0.9 },
  herbe: { base: '#2c420b', pointe: '#cacc28', hauteur: 0.6, largeur: 0.9, densite: 1 },
  arbres: { tronc: '#d4c2ff', feuillage: '#ffffff', taille: 1.35, largeurHouppier: 1, densite: 0.69, buissons: 1.3,
    jaune: '#c9b52e', olive: '#b0a52a', orange: '#ec7a2e', rouge: '#e0502e', rose: '#ee6aa4', sapin: '#6e6a20' },
  feuilles: { taille: 0.9, quantite: 0.69 },
  lupins: { densite: 1, taille: 0.95, hauteur: 0.9, vent: 0.7, fleurs: 0.88, tailleFleurs: 1.05, violet: '#8f5cf0', mauve: '#c873ff', rose: '#ff7ab8', bleu: '#6f86ff', blanc: '#f4f0ff' },
  turbo: { largeur: 0.12, duree: 1.4, couleurDebut: '#ff6666', couleurMilieu: '#0008ff', couleurFin: '#5b28e6', milieu: 0.4, eclat: 0.55 },
  voiture: { taille: 1, vitesse: 6.5, acceleration: 9, turbo: 0.7, braquage: 1.5, gravite: 30.5, saut: 1.7, raideur: 0.9, paillettes: 0.55, eclatPaillettes: 3 },
  camera: { distance: 8.1, hauteur: 6, focale: 30 },
  son: { actif: true, general: 0.51, musique: 0.45, ambiance: 0.7, vehicules: 0.17, effets: 0.8 },
};
const KEY = 'planete-reglages';
const clone = o => JSON.parse(JSON.stringify(o));
function merge(dst, src) { for (const k in src) { if (dst[k] && typeof dst[k] === 'object' && typeof src[k] === 'object') merge(dst[k], src[k]); else if (k in dst) dst[k] = src[k]; } return dst; }
export const TUNE = clone(DEFAULTS);
try { const saved = localStorage.getItem(KEY); if (saved) merge(TUNE, JSON.parse(saved)); } catch (e) { /* stockage indisponible : valeurs par défaut */ }
// anciennes valeurs par défaut enregistrées telles quelles : on prend les nouvelles
if (TUNE.voiture.gravite === 17 || TUNE.voiture.gravite === 11) TUNE.voiture.gravite = DEFAULTS.voiture.gravite;
if (TUNE.voiture.saut === 5.6) TUNE.voiture.saut = DEFAULTS.voiture.saut;
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(TUNE)); } catch (e) { /* rien */ } };

/** Seuls les réglages qui diffèrent des valeurs d'origine (pour un export lisible). */
function changes(a = TUNE, b = DEFAULTS) {
  const out = {};
  for (const k in a) {
    if (typeof a[k] === 'object') { const c = changes(a[k], b[k]); if (Object.keys(c).length) out[k] = c; }
    else if (a[k] !== b[k]) out[k] = a[k];
  }
  return out;
}

let gui = null;
/**
 * Ouvre (ou ferme) le panneau. hooks.apply() répercute les réglages sur la scène,
 * hooks.recolorGrass() repeint l'herbe.
 */
export async function toggleTunePanel(hooks) {
  if (gui) { gui.destroy(); gui = null; return; }
  const { GUI } = await import('https://cdn.jsdelivr.net/npm/lil-gui@0.19.2/+esm');
  gui = new GUI({ title: 'Réglages de la planète', width: 300 });
  Object.assign(gui.domElement.style, { top: 'calc(max(14px, env(safe-area-inset-top)) + 54px)', right: '16px', maxHeight: 'calc(100vh - 160px)', overflowY: 'auto', zIndex: 45 });
  const ch = (c, extra) => c.onChange(() => { save(); hooks.apply(); if (extra) extra(); });

  const fA = gui.addFolder('Ambiance');
  ch(fA.add(TUNE.ambiance, 'heureFixe').name('Heure figée'));
  ch(fA.add(TUNE.ambiance, 'heure', 0, 24, 0.1).name('Heure'));
  ch(fA.add(TUNE.ambiance, 'vitesseJour', 0, 10, 0.1).name('Vitesse du jour'));
  ch(fA.add(TUNE.ambiance, 'meteo', { Auto: 'auto', Beau: 'clear', Nuages: 'cloudy', Pluie: 'rain', Orage: 'storm' }).name('Météo'));
  ch(fA.add(TUNE.ambiance, 'vent', 0, 3, 0.05).name('Force du vent'));
  ch(fA.add(TUNE.ambiance, 'brume', 0, 3, 0.05).name('Brume'));

  const fL = gui.addFolder('Lumière');
  ch(fL.add(TUNE.lumiere, 'soleil', 0, 3, 0.05).name('Soleil'));
  ch(fL.add(TUNE.lumiere, 'ciel', 0, 3, 0.05).name('Lumière du ciel'));
  ch(fL.add(TUNE.lumiere, 'ambiante', 0, 4, 0.05).name('Lumière ambiante'));
  ch(fL.add(TUNE.lumiere, 'exposition', 0.3, 2, 0.01).name('Exposition'));
  ch(fL.addColor(TUNE.lumiere, 'teinteOmbres').name('Teinte des ombres'));
  ch(fL.add(TUNE.lumiere, 'forceTeinteOmbres', 0, 1, 0.01).name('↳ force'));
  ch(fL.addColor(TUNE.lumiere, 'teinteLumiere').name('Teinte de la lumière'));
  ch(fL.add(TUNE.lumiere, 'forceTeinteLumiere', 0, 1, 0.01).name('↳ force'));

  const fP = gui.addFolder('Rendu');
  ch(fP.add(TUNE.post, 'bloom', 0, 3, 0.05).name('Halo (bloom)'));
  ch(fP.add(TUNE.post, 'bloomRayon', 0, 1.5, 0.01).name('Rayon du halo'));
  ch(fP.add(TUNE.post, 'bloomSeuil', 0, 2, 0.01).name('Seuil du halo'));
  ch(fP.add(TUNE.post, 'flou', 0, 3, 0.05).name('Flou de maquette'));
  ch(fP.add(TUNE.post, 'zoneNette', 0, 0.5, 0.01).name('Zone nette'));
  ch(fP.add(TUNE.post, 'saturation', 0.5, 2, 0.01).name('Saturation'));

  const fE = gui.addFolder('Eau');
  ch(fE.addColor(TUNE.eau, 'bord').name('Couleur au bord'));
  ch(fE.addColor(TUNE.eau, 'milieu').name('Couleur intermédiaire'));
  ch(fE.addColor(TUNE.eau, 'large').name('Couleur au large'));
  ch(fE.add(TUNE.eau, 'ecume', 0, 2, 0.05).name('Écume'));
  ch(fE.add(TUNE.eau, 'largeurLisere', 0, 4, 0.05).name('Écume : largeur du liseré'));
  ch(fE.add(TUNE.eau, 'epaisseurTraits', 0, 4, 0.05).name('Écume : épaisseur des traits'));
  ch(fE.add(TUNE.eau, 'espacementTraits', 0.3, 4, 0.05).name('Écume : espacement des traits'));
  ch(fE.add(TUNE.eau, 'longueurTraits', 0, 1, 0.01).name('Écume : longueur des traits'));
  ch(fE.add(TUNE.eau, 'paillettes', 0, 1, 0.005).name('Paillettes (densité)'));
  ch(fE.add(TUNE.eau, 'eclatPaillettes', 0, 5, 0.05).name('Paillettes (éclat)'));

  const fS = gui.addFolder('Sable');
  const sandForce = fS.add(TUNE.sable, 'forceCouleur', 0, 1, 0.01).name('↳ force (0 = d’origine)');
  ch(fS.addColor(TUNE.sable, 'couleur').name('Teinte du sable'), () => { if (TUNE.sable.forceCouleur === 0) { TUNE.sable.forceCouleur = 1; sandForce.updateDisplay(); save(); hooks.apply(); } });
  ch(sandForce);
  ch(fS.add(TUNE.sable, 'paillettes', 0, 1, 0.005).name('Paillettes (densité)'));
  ch(fS.add(TUNE.sable, 'eclatPaillettes', 0, 6, 0.05).name('Paillettes (éclat)'));

  const fH = gui.addFolder('Herbe');
  ch(fH.addColor(TUNE.herbe, 'base').name('Couleur : base'), () => hooks.recolorGrass());
  ch(fH.addColor(TUNE.herbe, 'pointe').name('Couleur : pointe'), () => hooks.recolorGrass());
  ch(fH.add(TUNE.herbe, 'hauteur', 0.1, 3, 0.05).name('Hauteur'));
  ch(fH.add(TUNE.herbe, 'largeur', 0.2, 3, 0.05).name('Largeur des brins'));
  ch(fH.add(TUNE.herbe, 'densite', 0, 1, 0.01).name('Densité'));
  const fT = gui.addFolder('Arbres et buissons');
  ch(fT.addColor(TUNE.arbres, 'tronc').name('Troncs'));
  ch(fT.addColor(TUNE.arbres, 'feuillage').name('Teinte du feuillage'));
  ch(fT.add(TUNE.arbres, 'taille', 0.3, 3, 0.05).name('Taille des arbres'));
  ch(fT.add(TUNE.arbres, 'largeurHouppier', 0.3, 3, 0.05).name('Largeur des houppiers'));
  ch(fT.add(TUNE.arbres, 'densite', 0, 1, 0.01).name('Nombre d’arbres'));
  ch(fT.add(TUNE.arbres, 'buissons', 0.2, 3, 0.05).name('Taille des buissons'));
  const fK = gui.addFolder('Couleurs des arbres');
  [['jaune', 'Feuillage jaune'], ['olive', 'Feuillage olive'], ['orange', 'Feuillage orange'], ['rouge', 'Feuillage rouge'], ['rose', 'Feuillage rose'], ['sapin', 'Sapins']]
    .forEach(([k, n]) => ch(fK.addColor(TUNE.arbres, k).name(n), () => hooks.recolorTrees()));
  const fU = gui.addFolder('Lupins');
  ch(fU.add(TUNE.lupins, 'densite', 0, 1, 0.01).name('Densité'));
  ch(fU.add(TUNE.lupins, 'taille', 0.3, 3, 0.05).name('Taille'));
  ch(fU.add(TUNE.lupins, 'hauteur', 0.3, 3, 0.05).name('Hauteur'));
  ch(fU.add(TUNE.lupins, 'vent', 0, 3, 0.05).name('Balancement au vent'));
  ch(fU.add(TUNE.lupins, 'fleurs', 0, 1, 0.01).name('Densité des fleurs sur l’épi'));
  ch(fU.add(TUNE.lupins, 'tailleFleurs', 0.2, 3, 0.05).name('Taille des fleurs'));
  [['violet', 'Violet'], ['mauve', 'Mauve'], ['rose', 'Rose'], ['bleu', 'Bleu'], ['blanc', 'Blanc']].forEach(([k, n]) => ch(fU.addColor(TUNE.lupins, k).name('Couleur : ' + n.toLowerCase()), () => hooks.recolorLupins()));
  const fF = gui.addFolder('Feuilles au sol');
  ch(fF.add(TUNE.feuilles, 'taille', 0.2, 4, 0.05).name('Taille'));
  ch(fF.add(TUNE.feuilles, 'quantite', 0, 1, 0.01).name('Quantité'));

  const fV = gui.addFolder('Voiture');
  ch(fV.add(TUNE.voiture, 'taille', 0.4, 3, 0.05).name('Taille'));
  ch(fV.add(TUNE.voiture, 'paillettes', 0, 1, 0.01).name('Paillettes (densité)'));
  ch(fV.add(TUNE.voiture, 'eclatPaillettes', 0, 8, 0.1).name('Paillettes (éclat)'));
  ch(fV.add(TUNE.voiture, 'vitesse', 2, 15, 0.1).name('Vitesse max'));
  ch(fV.add(TUNE.voiture, 'acceleration', 2, 30, 0.5).name('Accélération'));
  ch(fV.add(TUNE.voiture, 'turbo', 0, 2, 0.05).name('Bonus du turbo'));
  ch(fV.add(TUNE.voiture, 'braquage', 0.5, 5, 0.05).name('Braquage'));
  ch(fV.add(TUNE.voiture, 'gravite', 4, 40, 0.5).name('Gravité'));
  ch(fV.add(TUNE.voiture, 'saut', 0, 15, 0.1).name('Saut'));
  ch(fV.add(TUNE.voiture, 'raideur', 0.2, 3, 0.05).name('Raideur des suspensions'));

  const fR = gui.addFolder('Traînées du turbo');
  ch(fR.add(TUNE.turbo, 'largeur', 0.01, 0.5, 0.005).name('Largeur'));
  ch(fR.add(TUNE.turbo, 'duree', 0.2, 5, 0.05).name('Durée'));
  ch(fR.addColor(TUNE.turbo, 'couleurDebut').name('Couleur : départ'));
  ch(fR.addColor(TUNE.turbo, 'couleurMilieu').name('Couleur : milieu'));
  ch(fR.addColor(TUNE.turbo, 'couleurFin').name('Couleur : fin'));
  ch(fR.add(TUNE.turbo, 'milieu', 0.02, 0.9, 0.01).name('Position du milieu'));
  ch(fR.add(TUNE.turbo, 'eclat', 0, 3, 0.05).name('Éclat'));
  const fN = gui.addFolder('Son');
  ch(fN.add(TUNE.son, 'actif').name('Son activé'));
  ch(fN.add(TUNE.son, 'general', 0, 1, 0.01).name('Volume général'));
  ch(fN.add(TUNE.son, 'musique', 0, 1, 0.01).name('Musique'));
  ch(fN.add(TUNE.son, 'ambiance', 0, 1, 0.01).name('Ambiance'));
  ch(fN.add(TUNE.son, 'vehicules', 0, 1, 0.01).name('Véhicules (moteur, aéroglisseur)'));
  ch(fN.add(TUNE.son, 'effets', 0, 1, 0.01).name('Chocs'));
  const fC = gui.addFolder('Caméra');
  ch(fC.add(TUNE.camera, 'distance', 2, 25, 0.1).name('Distance'));
  ch(fC.add(TUNE.camera, 'hauteur', 0.5, 20, 0.1).name('Hauteur'));
  ch(fC.add(TUNE.camera, 'focale', 15, 80, 1).name('Angle de vue'));

  [fA, fL, fP, fE, fS, fH, fT, fK, fU, fF, fV, fR, fN, fC].forEach(f => f.close());

  const toast = msg => { const b = gui.title(); gui.title(msg); setTimeout(() => gui && gui.title(b), 1800); };
  const actions = {
    copier() {
      const txt = JSON.stringify(changes(), null, 2);
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => toast('Copié ✓'), () => { prompt('Réglages à copier :', txt); });
    },
    telecharger() {
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(TUNE, null, 2)], { type: 'application/json' }));
      a.download = 'reglages-planete.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    },
    reinitialiser() { merge(TUNE, clone(DEFAULTS)); save(); hooks.apply(); hooks.recolorGrass(); hooks.recolorTrees(); hooks.recolorLupins(); gui.controllersRecursive().forEach(c => c.updateDisplay()); toast('Réglages d’origine'); },
  };
  gui.add(actions, 'copier').name('📋 Copier les réglages');
  gui.add(actions, 'telecharger').name('⬇ Télécharger (JSON)');
  gui.add(actions, 'reinitialiser').name('↺ Réinitialiser');
}
