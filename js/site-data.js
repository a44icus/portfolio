/* ============================================================================
   Données partagées du portfolio (site principal + version Liquid Glass).
   - SVC_DETAILS : contenu des volets dépliables des services (clé = nom du
     service en minuscules). Le champ « Descriptif dépliable » de l'admin
     remplace l'accroche (lead).
   - PERSO_PROJECTS : projets personnels.
   ============================================================================ */
window.SVC_DETAILS = {
  "identité visuelle": {
    "lead": "Une identité forte se reconnaît en un coup d'œil et se décline sans effort. Je pars de votre histoire, de vos valeurs et de votre marché pour construire un système graphique complet, pensé pour durer.",
    "pour": "Création d'entreprise, refonte d'une image vieillissante, lancement d'une marque ou d'un produit.",
    "livrables": [
      "Logo et ses variantes",
      "Palette de couleurs",
      "Typographies",
      "Charte graphique",
      "Papeterie",
      "Kit réseaux sociaux",
      "Signalétique"
    ],
    "etapes": [
      "Immersion",
      "Pistes créatives",
      "Affinage",
      "Charte & fichiers"
    ],
    "cta": "Une marque à créer ou à rafraîchir ?"
  },
  "direction artistique": {
    "lead": "Je donne un cap visuel à vos projets : un concept clair, un ton, des images qui se répondent. Je coordonne ensuite les talents — photographes, illustrateurs, développeurs — pour que chaque support raconte la même histoire.",
    "pour": "Campagnes, lancements, événements, et toutes les marques qui veulent une image cohérente sur chaque support.",
    "livrables": [
      "Concept & moodboard",
      "Univers visuel",
      "Direction de shooting",
      "Déclinaisons de campagne",
      "Coordination des intervenants"
    ],
    "etapes": [
      "Brief",
      "Concept",
      "Production",
      "Déclinaisons"
    ],
    "cta": "Une campagne ou un lancement en vue ?"
  },
  "édition & print": {
    "lead": "Du livre à l'affiche, je soigne la lisibilité, le rythme et le détail typographique. Je prépare des fichiers impeccables pour l'imprimeur et je peux suivre la fabrication jusqu'au bon à tirer, choix du papier et des finitions compris.",
    "pour": "Éditeurs, entreprises, collectivités, artistes : tous les projets imprimés qui doivent être beaux, sans mauvaise surprise à la livraison.",
    "livrables": [
      "Livres & catalogues",
      "Revues & magazines",
      "Plaquettes & brochures",
      "Affiches & flyers",
      "Fichiers prêts à imprimer",
      "Suivi de fabrication"
    ],
    "etapes": [
      "Gabarit",
      "Mise en page",
      "Corrections",
      "BAT & impression"
    ],
    "cta": "Un livre, une revue ou une affiche à imprimer ?"
  },
  "web & interaction": {
    "lead": "Je conçois des sites qui donnent envie de rester : clairs, rapides et agréables sur mobile. Du prototype à la mise en ligne, je m'occupe de l'arborescence, du design et de l'intégration, pour un site à votre image et facile à faire évoluer.",
    "pour": "Indépendants, artisans, PME et associations qui veulent une vitrine en ligne qui leur ressemble.",
    "livrables": [
      "Site vitrine sur mesure",
      "Maquettes & prototype",
      "Design system",
      "Intégration responsive",
      "Mise en ligne"
    ],
    "etapes": [
      "Arborescence",
      "Maquettes",
      "Développement",
      "Mise en ligne"
    ],
    "cta": "Un site à créer ou à refondre ?"
  },
  "motion & vidéo": {
    "lead": "Un logo qui s'anime, une vidéo habillée à vos couleurs, des formats courts pour les réseaux : le mouvement capte l'attention et donne du caractère à votre marque. Je travaille sous After Effects et Premiere.",
    "pour": "Marques présentes sur les réseaux sociaux, événements, présentations et vidéos d'entreprise.",
    "livrables": [
      "Animation de logo",
      "Habillage vidéo",
      "Formats réseaux sociaux",
      "Motion design",
      "Montage"
    ],
    "etapes": [
      "Script",
      "Storyboard",
      "Animation",
      "Exports"
    ],
    "cta": "Envie de donner du mouvement à votre image ?"
  },
  "packaging & production": {
    "lead": "Je conçois vos packagings et supports physiques, puis je suis leur fabrication jusqu'à l'atelier. Un seul interlocuteur de la création au produit fini, pour un résultat fidèle à la maquette.",
    "pour": "Producteurs, brasseurs, commerçants et entreprises qui veulent des supports qui se remarquent.",
    "livrables": [
      "Étiquettes & packaging",
      "PLV",
      "Grand format",
      "Impression textile",
      "Covering de véhicules",
      "Découpe"
    ],
    "etapes": [
      "Conception",
      "Fichiers techniques",
      "Validation",
      "Fabrication"
    ],
    "cta": "Un produit à habiller ou un support à fabriquer ?"
  }
};

window.PERSO_PROJECTS = [
  {
    "title": "Clé en classe",
    "tag": "Web · Éducation",
    "meta": "Séances prêtes à l’emploi et outils TBI pour les professeurs des écoles, de la PS au CM2 — 2026",
    "url": "https://cleenclasse.fr/",
    "image": "/images/perso/cle-en-classe.webp",
    "label": "Clé en classe, site de séances pour professeurs des écoles"
  },
  {
    "title": "Social World",
    "tag": "Web · Expérimental",
    "meta": "Un réseau social dans une galaxie à l’échelle 1:1 : chacun choisit sa planète, la décore et reçoit des visiteurs — 2026",
    "url": "https://social-world-eight.vercel.app/",
    "image": "/images/perso/social-world.webp",
    "label": "Social World, réseau social dans une galaxie"
  },
  {
    "title": "Atlas des Âges",
    "tag": "Web · Histoire",
    "meta": "L’histoire du monde sur une carte : des milliers d’événements de la Préhistoire à aujourd’hui, à parcourir sur une frise animée — 2026",
    "url": "https://atlas-des-ages.vercel.app/",
    "image": "/images/perso/atlas-des-ages.webp",
    "label": "Atlas des Âges, l’histoire du monde sur une carte"
  }
];
