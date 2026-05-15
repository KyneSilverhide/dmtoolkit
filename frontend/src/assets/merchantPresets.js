/**
 * Modèles de marchands pré-configurés pour D&D 5e.
 * Chaque modèle pré-remplit uniquement la liste d'articles.
 * Le nom et la description sont volontairement absents — le MJ les saisit lui-même.
 * Les prix sont en pièces d'or (po) — valeurs SRD 5e.
 */

export const MERCHANT_PRESETS = [
  // ═══════════════════════════════════════════════════════════
  //  FORGERONS & ARMURIERS
  // ═══════════════════════════════════════════════════════════
  {
    id: 'village-smith',
    label: 'Forgeron de village',
    icon: 'game-icons:anvil',
    items: [
      { name: 'Dague', description: '1d4 perforant — légère, finesse, lancer', price: 2, stock: 5, category: 'Armes simples' },
      { name: 'Hachette', description: '1d6 tranchant — légère, lancer (6/18 m)', price: 5, stock: 4, category: 'Armes simples' },
      { name: 'Marteau léger', description: '1d4 contondant — légère, lancer (6/18 m)', price: 2, stock: 4, category: 'Armes simples' },
      { name: 'Masse d\'armes', description: '1d6 contondant', price: 5, stock: 3, category: 'Armes simples' },
      { name: 'Lance', description: '1d6 perforant — lancer, polyvalente (1d8)', price: 1, stock: 5, category: 'Armes simples' },
      { name: 'Épée courte', description: '1d6 perforant — légère, finesse', price: 10, stock: 3, category: 'Armes de guerre' },
      { name: 'Hache d\'armes', description: '1d8 tranchant — polyvalente (1d10)', price: 10, stock: 2, category: 'Armes de guerre' },
      { name: 'Armure de cuir', description: 'CA 11 + Dex', price: 10, stock: 3, category: 'Armures légères' },
      { name: 'Armure de cuir clouté', description: 'CA 12 + Dex', price: 45, stock: 2, category: 'Armures légères' },
      { name: 'Armure d\'écailles', description: 'CA 14 + Dex (max +2) — désavantage Discrétion', price: 50, stock: 1, category: 'Armures intermédiaires' },
      { name: 'Cotte de mailles', description: 'CA 16 — Force min 13, désavantage Discrétion', price: 75, stock: 1, category: 'Armures lourdes' },
      { name: 'Bouclier', description: 'CA +2', price: 10, stock: 4, category: 'Armures' },
      { name: 'Marteau', description: 'Outil — peut servir d\'arme improvisée (1d4)', price: 1, stock: -1, category: 'Équipement' },
      { name: 'Pince-monseigneur', description: 'Avantage aux jets de Force pour forcer une porte', price: 2, stock: 3, category: 'Équipement' },
      { name: 'Pitons (10)', description: 'Utiles pour l\'escalade et le campement', price: 1, stock: -1, category: 'Équipement' },
      { name: 'Chaîne (3 m)', description: '10 PV — DD 20 de Force pour la briser', price: 5, stock: 3, category: 'Équipement' },
    ],
  },

  {
    id: 'master-armorer',
    label: 'Maître armurer',
    icon: 'game-icons:breastplate',
    items: [
      { name: 'Armure de cuir clouté', description: 'CA 12 + Dex', price: 45, stock: 2, category: 'Armures légères' },
      { name: 'Armure de crin', description: 'CA 13 + Dex (max +2)', price: 50, stock: 2, category: 'Armures intermédiaires' },
      { name: 'Armure d\'écailles', description: 'CA 14 + Dex (max +2)', price: 50, stock: 2, category: 'Armures intermédiaires' },
      { name: 'Cuirasse', description: 'CA 14 + Dex (max +2) — aucun désavantage', price: 400, stock: 1, category: 'Armures intermédiaires' },
      { name: 'Demi-plates', description: 'CA 15 + Dex (max +2) — désavantage Discrétion', price: 750, stock: 1, category: 'Armures intermédiaires' },
      { name: 'Cotte de mailles', description: 'CA 16 — Force min 13', price: 75, stock: 2, category: 'Armures lourdes' },
      { name: 'Cotte de plates', description: 'CA 17 — Force min 15', price: 200, stock: 1, category: 'Armures lourdes' },
      { name: 'Armure de plates', description: 'CA 18 — Force min 15 (sur commande)', price: 1500, stock: 1, category: 'Armures lourdes' },
      { name: 'Bouclier', description: 'CA +2', price: 10, stock: 5, category: 'Armures' },
      { name: 'Mors et bride', description: 'Nécessaire pour diriger une monture', price: 2, stock: 3, category: 'Équipement de monture' },
    ],
  },

  {
    id: 'war-merchant',
    label: 'Armurier de guerre',
    icon: 'game-icons:crossed-swords',
    items: [
      { name: 'Épée longue', description: '1d8 tranchant — polyvalente (1d10)', price: 15, stock: 3, category: 'Armes de guerre' },
      { name: 'Espadon', description: '2d6 tranchant — lourde, à deux mains', price: 50, stock: 2, category: 'Armes de guerre' },
      { name: 'Hache à deux mains', description: '1d12 tranchant — lourde, à deux mains', price: 30, stock: 2, category: 'Armes de guerre' },
      { name: 'Hallebarde', description: '1d10 tranchant — lourde, allonge, à deux mains', price: 20, stock: 2, category: 'Armes de guerre' },
      { name: 'Voulge', description: '1d10 tranchant — lourde, allonge, à deux mains', price: 20, stock: 2, category: 'Armes de guerre' },
      { name: 'Pique', description: '1d10 perforant — lourde, allonge, à deux mains', price: 5, stock: 4, category: 'Armes de guerre' },
      { name: 'Marteau de guerre', description: '1d8 contondant — polyvalente (1d10)', price: 15, stock: 3, category: 'Armes de guerre' },
      { name: 'Morgenstern', description: '1d8 perforant', price: 15, stock: 3, category: 'Armes de guerre' },
      { name: 'Rapière', description: '1d8 perforant — finesse', price: 25, stock: 2, category: 'Armes de guerre' },
      { name: 'Trident', description: '1d6 perforant — lancer, polyvalente (1d8)', price: 5, stock: 3, category: 'Armes de guerre' },
      { name: 'Lance de cavalerie', description: '1d12 perforant — allonge', price: 10, stock: 2, category: 'Armes de guerre' },
      { name: 'Fléau d\'armes', description: '1d8 contondant', price: 10, stock: 3, category: 'Armes de guerre' },
      { name: 'Menottes', description: 'Immobilise les poignets — DD 20 Force ou DD 17 Discrétion', price: 2, stock: 5, category: 'Équipement' },
      { name: 'Caltropes (sac de 20)', description: 'DD 15 Dex ou 1 dégât + vitesse réduite', price: 1, stock: 5, category: 'Équipement' },
      { name: 'Billes (sac de 1 000)', description: 'Surface 3×3 m — DD 10 Dex ou tombe à terre', price: 1, stock: 5, category: 'Équipement' },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  //  ARCHERIE & CHASSE
  // ═══════════════════════════════════════════════════════════
  {
    id: 'fletcher',
    label: 'Archers & Chasseurs',
    icon: 'game-icons:bow-arrow',
    items: [
      { name: 'Arc court', description: '1d6 perforant — munitions, à deux mains (24/96 m)', price: 25, stock: 3, category: 'Armes simples' },
      { name: 'Arc long', description: '1d8 perforant — lourde, à deux mains (45/180 m)', price: 50, stock: 2, category: 'Armes de guerre' },
      { name: 'Arbalète légère', description: '1d8 perforant — munitions (24/96 m)', price: 25, stock: 3, category: 'Armes simples' },
      { name: 'Arbalète lourde', description: '1d10 perforant — lourde (30/120 m)', price: 50, stock: 2, category: 'Armes de guerre' },
      { name: 'Arbalète de poing', description: '1d6 perforant — légère (9/36 m)', price: 75, stock: 2, category: 'Armes de guerre' },
      { name: 'Sarbacane', description: '1 perforant — chargement (7,5/30 m)', price: 10, stock: 3, category: 'Armes de guerre' },
      { name: 'Fronde', description: '1d4 contondant — munitions (9/36 m)', price: 1, stock: 5, category: 'Armes simples' },
      { name: 'Flèches (20)', description: 'Munitions pour arcs', price: 1, stock: 20, category: 'Munitions' },
      { name: 'Carreaux d\'arbalète (20)', description: 'Munitions pour arbalètes', price: 1, stock: 15, category: 'Munitions' },
      { name: 'Dards de sarbacane (50)', description: 'Munitions pour sarbacane', price: 1, stock: 10, category: 'Munitions' },
      { name: 'Balles de fronde (20)', description: 'Munitions pour fronde', price: 1, stock: 10, category: 'Munitions' },
      { name: 'Carquois', description: 'Contient 20 flèches', price: 1, stock: 10, category: 'Équipement' },
      { name: 'Étui à carreaux', description: 'Contient 20 carreaux', price: 1, stock: 10, category: 'Équipement' },
      { name: 'Dague', description: '1d4 perforant — finesse, légère, lancer', price: 2, stock: 5, category: 'Armes simples' },
      { name: 'Corde de chanvre (15 m)', description: '2 PV, CA 11 — jusqu\'à 340 kg', price: 1, stock: 5, category: 'Équipement' },
      { name: 'Grappin', description: 'Escalade d\'une surface avec une corde', price: 2, stock: 3, category: 'Équipement' },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  //  ALCHIMIE & POTIONS
  // ═══════════════════════════════════════════════════════════
  {
    id: 'alchemist',
    label: 'Alchimiste',
    icon: 'game-icons:round-bottom-flask',
    items: [
      { name: 'Potion de soins', description: 'Récupère 2d4+2 PV', price: 50, stock: 10, category: 'Potions' },
      { name: 'Potion de soins supérieurs', description: 'Récupère 4d4+4 PV', price: 100, stock: 5, category: 'Potions' },
      { name: 'Potion de soins importants', description: 'Récupère 8d4+8 PV', price: 500, stock: 2, category: 'Potions' },
      { name: 'Antidote', description: 'Avantage contre le poison pendant 1 heure', price: 50, stock: 8, category: 'Potions' },
      { name: 'Eau bénite (flasque)', description: '2d6 radiants contre morts-vivants/fiélons', price: 25, stock: 6, category: 'Potions' },
      { name: 'Huile (flasque)', description: 'Inflammable — 5 feu/round pendant 2 rounds', price: 1, stock: 20, category: 'Consommables' },
      { name: 'Acide (flasque)', description: '2d6 acide si touchez — attaque à distance', price: 25, stock: 5, category: 'Consommables' },
      { name: 'Feu grégeois (flasque)', description: '1d4 feu/round jusqu\'à extinction (DD 10 Dex)', price: 50, stock: 3, category: 'Consommables' },
      { name: 'Poison de base (flacon)', description: 'Arme empoisonnée — DD 10 Con ou empoisonné 1h', price: 100, stock: 3, category: 'Poisons' },
      { name: 'Matériel d\'alchimiste', description: 'Crée potions et substances alchimiques', price: 50, stock: 1, category: 'Outils' },
    ],
  },

  {
    id: 'apothecary',
    label: 'Apothicaire & Guérisseur',
    icon: 'game-icons:caduceus',
    items: [
      { name: 'Potion de soins', description: 'Récupère 2d4+2 PV', price: 50, stock: 15, category: 'Soins' },
      { name: 'Potion de soins supérieurs', description: 'Récupère 4d4+4 PV', price: 120, stock: 5, category: 'Soins' },
      { name: 'Antidote', description: 'Avantage contre le poison pendant 1 heure', price: 60, stock: 8, category: 'Soins' },
      { name: 'Trousse de soins', description: '10 utilisations — stabilise sans jet de Médecine', price: 5, stock: 5, category: 'Soins' },
      { name: 'Eau bénite (flasque)', description: '2d6 radiants — morts-vivants et fiélons', price: 25, stock: 10, category: 'Soins' },
      { name: 'Huile (flasque)', description: 'Huile de lampe ou d\'onction', price: 1, stock: 20, category: 'Consommables' },
      { name: 'Bougie', description: 'Lumière 1,5 m — dure 1 heure', price: 1, stock: 50, category: 'Consommables' },
      { name: 'Matériel d\'empoisonneur', description: 'Identifie et crée des poisons', price: 50, stock: 1, category: 'Outils' },
      { name: 'Couverture', description: 'Couverture de laine épaisse', price: 1, stock: 10, category: 'Équipement' },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  //  ÉPICERIE & RAVITAILLEMENT
  // ═══════════════════════════════════════════════════════════
  {
    id: 'general-store',
    label: 'Épicerie & Ravitaillement',
    icon: 'game-icons:barrel',
    items: [
      { name: 'Rations (1 jour)', description: 'Nourriture séchée pour une journée', price: 1, stock: 50, category: 'Nourriture' },
      { name: 'Torche', description: 'Lumière 6 m — dure 1 heure', price: 1, stock: 100, category: 'Éclairage' },
      { name: 'Bougie', description: 'Lumière 1,5 m — dure 1 heure', price: 1, stock: 50, category: 'Éclairage' },
      { name: 'Huile (flasque)', description: '6 heures de lampe', price: 1, stock: 30, category: 'Éclairage' },
      { name: 'Lanterne à capote', description: 'Lumière 9 m — capote rabattable', price: 5, stock: 5, category: 'Éclairage' },
      { name: 'Boîte à amadou', description: 'Allume un feu en une action', price: 1, stock: 15, category: 'Équipement' },
      { name: 'Sac à dos', description: 'Capacité 13,5 kg / 28 litres', price: 2, stock: 8, category: 'Équipement' },
      { name: 'Couverture', description: 'Couverture de laine épaisse', price: 1, stock: 15, category: 'Équipement' },
      { name: 'Sac de couchage', description: 'Repos confortable à l\'extérieur', price: 1, stock: 8, category: 'Équipement' },
      { name: 'Corde de chanvre (15 m)', description: '2 PV, CA 11 — jusqu\'à 340 kg', price: 1, stock: 10, category: 'Équipement' },
      { name: 'Tente (2 personnes)', description: 'Abri contre les intempéries', price: 2, stock: 5, category: 'Équipement' },
      { name: 'Pitons (10)', description: 'Escalade et campement', price: 1, stock: 20, category: 'Équipement' },
      { name: 'Marteau', description: 'Enfoncer des pitons ou arme improvisée (1d4)', price: 1, stock: 10, category: 'Équipement' },
      { name: 'Pelle', description: 'Déblaye 0,5 m³ de terre par heure', price: 2, stock: 5, category: 'Équipement' },
      { name: 'Vêtements communs', description: 'Tunique, pantalon, chaussures', price: 1, stock: 20, category: 'Vêtements' },
      { name: 'Vêtements de voyageur', description: 'Manteau robuste et bottes solides', price: 2, stock: 10, category: 'Vêtements' },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  //  SELLERIE & MONTRES
  // ═══════════════════════════════════════════════════════════
  {
    id: 'stable',
    label: 'Écurie & Sellier',
    icon: 'game-icons:horse-head',
    items: [
      { name: 'Cheval de monte', description: 'V. 18 m — CA 10, 13 PV, Force 16 — Charge 240 kg', price: 75, stock: 3, category: 'Montures' },
      { name: 'Cheval de trait', description: 'V. 12 m — CA 10, 19 PV, Force 18 — Charge 295 kg', price: 50, stock: 2, category: 'Montures' },
      { name: 'Destrier', description: 'V. 18 m — entraîné au combat — CA 11, 19 PV', price: 400, stock: 1, category: 'Montures' },
      { name: 'Mulet', description: 'V. 12 m — robuste — Charge 210 kg, terrain difficile', price: 8, stock: 4, category: 'Montures' },
      { name: 'Poney', description: 'V. 12 m — CA 10, 11 PV, Force 15', price: 30, stock: 3, category: 'Montures' },
      { name: 'Selle de voyage', description: 'Avantage pour rester en selle', price: 10, stock: 6, category: 'Équipement de monture' },
      { name: 'Selle de guerre', description: 'Robuste — avantage pour rester en selle au combat', price: 20, stock: 3, category: 'Équipement de monture' },
      { name: 'Sacoches de selle', description: '2 × 15 kg de capacité', price: 4, stock: 8, category: 'Équipement de monture' },
      { name: 'Mors et bride', description: 'Nécessaire pour diriger une monture', price: 2, stock: 10, category: 'Équipement de monture' },
      { name: 'Charrette', description: 'Véhicule à 4 roues — Charge 400 kg, 2 montures', price: 35, stock: 1, category: 'Véhicules' },
      { name: 'Chariot', description: 'Véhicule à 2 roues — Charge 200 kg', price: 15, stock: 2, category: 'Véhicules' },
      { name: 'Rations (1 jour)', description: 'Pour les montures aussi !', price: 1, stock: 30, category: 'Nourriture' },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  //  MAGIE
  // ═══════════════════════════════════════════════════════════
  {
    id: 'magic-shop',
    label: 'Boutique de magie',
    icon: 'game-icons:magic-swirl',
    items: [
      { name: 'Potion de soins', description: '2d4+2 PV', price: 60, stock: 5, category: 'Potions magiques' },
      { name: 'Potion de soins supérieurs', description: '4d4+4 PV', price: 150, stock: 3, category: 'Potions magiques' },
      { name: 'Potion de soins importants', description: '8d4+8 PV', price: 700, stock: 1, category: 'Potions magiques' },
      { name: 'Parchemin d\'identification', description: 'Identifie un objet magique ou une créature', price: 100, stock: 3, category: 'Parchemins' },
      { name: 'Parchemin de sort de 1er niveau', description: 'Sort de 1er niveau (aléatoire ou choisi)', price: 150, stock: 4, category: 'Parchemins' },
      { name: 'Parchemin de sort de 2e niveau', description: 'Sort de 2e niveau (aléatoire ou choisi)', price: 350, stock: 2, category: 'Parchemins' },
      { name: 'Parchemin de sort de 3e niveau', description: 'Sort de 3e niveau (aléatoire ou choisi)', price: 700, stock: 1, category: 'Parchemins' },
      { name: 'Focaliseur arcanique (cristal)', description: 'Incantation sans composantes matérielles', price: 10, stock: 3, category: 'Focalisants' },
      { name: 'Sacoche à composantes', description: 'Toutes les composantes sans valeur', price: 25, stock: 4, category: 'Focalisants' },
      { name: 'Symbole sacré (argent)', description: 'Focalisant divin en argent gravé', price: 5, stock: 3, category: 'Focalisants' },
      { name: 'Symbole sacré (or)', description: 'Focalisant divin en or incrusté', price: 25, stock: 2, category: 'Focalisants' },
      { name: 'Focaliseur druidique (totem)', description: 'Totem animal ou végétal pour druides', price: 1, stock: 3, category: 'Focalisants' },
      { name: 'Loupe', description: 'Allume un feu au soleil — avantage examens détaillés', price: 100, stock: 2, category: 'Instruments' },
      { name: 'Baguette magique (inerte)', description: 'Baguette dont les charges sont épuisées… ou presque', price: 300, stock: 1, category: 'Curiosités' },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  //  LIBRAIRIE & ÉRUDITION
  // ═══════════════════════════════════════════════════════════
  {
    id: 'scribe',
    label: 'Scribe & Libraire',
    icon: 'game-icons:quill-ink',
    items: [
      { name: 'Livre vierge', description: '200 pages de parchemin', price: 25, stock: 5, category: 'Livres' },
      { name: 'Encre (flacon)', description: 'Flacon d\'encre noire', price: 10, stock: 10, category: 'Écriture' },
      { name: 'Plume d\'écriture', description: 'Plume taillée pour l\'écriture', price: 1, stock: 20, category: 'Écriture' },
      { name: 'Parchemin (feuille)', description: 'Feuille de parchemin vierge', price: 1, stock: 50, category: 'Écriture' },
      { name: 'Papier (feuille)', description: 'Feuille de papier vierge', price: 1, stock: 30, category: 'Écriture' },
      { name: 'Matériel de calligraphe', description: 'Copies et enluminures de qualité', price: 10, stock: 2, category: 'Outils' },
      { name: 'Matériel de cartographe', description: 'Trace des routes et cartes précises', price: 15, stock: 2, category: 'Outils' },
      { name: 'Loupe', description: 'Utile pour lire les tout petits caractères', price: 100, stock: 1, category: 'Instruments' },
      { name: 'Focaliseur arcanique (cristal)', description: 'Pour les mages studieux', price: 10, stock: 2, category: 'Magie' },
      { name: 'Matériel de faussaire', description: 'Produit des faux documents convaincants', price: 15, stock: 1, category: 'Outils' },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  //  CONFECTION & MODE
  // ═══════════════════════════════════════════════════════════
  {
    id: 'clothier',
    label: 'Fripier & Tailleur',
    icon: 'game-icons:sewing-needle',
    items: [
      { name: 'Vêtements communs', description: 'Tunique, pantalon, chaussures robustes', price: 1, stock: 20, category: 'Vêtements' },
      { name: 'Vêtements de voyageur', description: 'Manteau, bottes, pratiques pour la route', price: 2, stock: 15, category: 'Vêtements' },
      { name: 'Vêtements fins', description: 'Tenue élégante pour se présenter en société', price: 15, stock: 8, category: 'Vêtements' },
      { name: 'Vêtements de cérémonie', description: 'Tenue somptueuse — soie, broderies, bijoux', price: 115, stock: 3, category: 'Vêtements' },
      { name: 'Matériel de déguisement', description: 'Maquillage, perruques, costumes — jet de Discrétion', price: 25, stock: 3, category: 'Déguisement' },
      { name: 'Couverture', description: 'Laine épaisse, chaude et résistante', price: 1, stock: 15, category: 'Équipement' },
      { name: 'Sac à dos', description: 'Modèle solide, coutures renforcées', price: 2, stock: 8, category: 'Équipement' },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  //  BAZAR EXOTIQUE
  // ═══════════════════════════════════════════════════════════
  {
    id: 'exotic-bazaar',
    label: 'Bazar Exotique',
    icon: 'game-icons:magic-lamp',
    items: [
      { name: 'Luth', description: 'Instrument à cordes pincées, sonorité douce', price: 35, stock: 2, category: 'Instruments' },
      { name: 'Flûte', description: 'Instrument à vent simple', price: 2, stock: 4, category: 'Instruments' },
      { name: 'Tambour', description: 'Instrument à percussion', price: 6, stock: 3, category: 'Instruments' },
      { name: 'Cor', description: 'Signal militaire ou de chasse', price: 3, stock: 3, category: 'Instruments' },
      { name: 'Cornemuse', description: 'Sonorité puissante, originaire des hauts plateaux', price: 30, stock: 1, category: 'Instruments' },
      { name: 'Viole', description: 'Ancêtre du violon, sonorité mélancolique', price: 30, stock: 1, category: 'Instruments' },
      { name: 'Cartes à jouer', description: 'Jeu de cartes pour les tavernes', price: 1, stock: 10, category: 'Jeux' },
      { name: 'Dés à jouer', description: 'Pour tous les jeux de hasard', price: 1, stock: 10, category: 'Jeux' },
      { name: 'Jeu de Dragonchets', description: 'Populaire dans toutes les tavernes', price: 1, stock: 5, category: 'Jeux' },
      { name: 'Miroir en acier', description: 'Reflet parfait — utile contre les basilics', price: 5, stock: 3, category: 'Curiosités' },
      { name: 'Loupe', description: 'Verre grossissant de qualité', price: 100, stock: 1, category: 'Curiosités' },
      { name: 'Chameau', description: 'Idéal pour le désert — V. 15 m, Charge 480 kg', price: 50, stock: 1, category: 'Montures' },
      { name: 'Focaliseur arcanique (cristal)', description: 'Cristal taillé acheté en Orient', price: 12, stock: 2, category: 'Magie' },
      { name: 'Symbole sacré (or)', description: 'Symbole religieux exotique en or fin', price: 30, stock: 2, category: 'Magie' },
      { name: 'Parchemin (feuille)', description: 'Parchemin de haute qualité', price: 2, stock: 20, category: 'Écriture' },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  //  PÈGRE & MARCHÉ NOIR
  // ═══════════════════════════════════════════════════════════
  {
    id: 'black-market',
    label: 'Contact de la Pègre',
    icon: 'game-icons:hood',
    items: [
      { name: 'Outils de voleur', description: 'Crochets, miroir, lime — crochète serrures et pièges', price: 30, stock: 3, category: 'Outils' },
      { name: 'Matériel de déguisement', description: 'Tout pour changer d\'identité', price: 30, stock: 2, category: 'Outils' },
      { name: 'Matériel de faussaire', description: 'Documents officiels, sceaux, lettres de noblesse', price: 20, stock: 2, category: 'Outils' },
      { name: 'Matériel d\'empoisonneur', description: 'Crée et identifie des poisons', price: 60, stock: 1, category: 'Outils' },
      { name: 'Poison de base (flacon)', description: 'DD 10 Con ou empoisonné 1h — discret', price: 120, stock: 5, category: 'Poisons' },
      { name: 'Menottes', description: 'Pour… retenir quelqu\'un', price: 3, stock: 5, category: 'Équipement' },
      { name: 'Caltropes (sac de 20)', description: 'Ralentit les poursuivants', price: 2, stock: 5, category: 'Équipement' },
      { name: 'Billes (sac de 1 000)', description: 'Fait trébucher dans les couloirs', price: 2, stock: 5, category: 'Équipement' },
      { name: 'Corde de soie (15 m)', description: 'CA 13 — légère, solide, discrète', price: 12, stock: 3, category: 'Équipement' },
      { name: 'Grappin', description: 'Escalade de bâtiments', price: 3, stock: 3, category: 'Équipement' },
      { name: 'Dague', description: '1d4 perforant — facile à dissimuler', price: 3, stock: 8, category: 'Armes' },
      { name: 'Sarbacane', description: 'Silencieuse — parfaite pour livrer un poison', price: 12, stock: 2, category: 'Armes' },
      { name: 'Arbalète de poing', description: 'Compacte, dissimulable sous un manteau', price: 90, stock: 1, category: 'Armes' },
      { name: 'Vêtements fins', description: 'Couverture parfaite pour un noble', price: 20, stock: 3, category: 'Couverture' },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  //  MÉDECIN DE CAMPAGNE
  // ═══════════════════════════════════════════════════════════
  {
    id: 'field-medic',
    label: 'Médecin de guerre',
    icon: 'game-icons:health-normal',
    items: [
      { name: 'Trousse de soins', description: '10 utilisations — stabilise une créature 0 PV', price: 5, stock: 10, category: 'Soins' },
      { name: 'Potion de soins', description: 'Récupère 2d4+2 PV', price: 55, stock: 12, category: 'Soins' },
      { name: 'Potion de soins supérieurs', description: 'Récupère 4d4+4 PV', price: 110, stock: 4, category: 'Soins' },
      { name: 'Antidote', description: 'Avantage contre le poison pendant 1 heure', price: 55, stock: 6, category: 'Soins' },
      { name: 'Eau bénite (flasque)', description: 'Soins spirituels — 2d6 radiants', price: 25, stock: 5, category: 'Soins' },
      { name: 'Rations (1 jour)', description: 'Important de manger pour guérir', price: 1, stock: 20, category: 'Nourriture' },
      { name: 'Couverture', description: 'Contre le choc et le froid', price: 1, stock: 15, category: 'Repos' },
      { name: 'Sac de couchage', description: 'Repos complet pour récupérer', price: 1, stock: 8, category: 'Repos' },
      { name: 'Matériel d\'empoisonneur', description: 'Pour identifier les substances toxiques', price: 50, stock: 1, category: 'Outils' },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  //  FORGERON NAIN
  // ═══════════════════════════════════════════════════════════
  {
    id: 'dwarven-smith',
    label: 'Forgeron nain',
    icon: 'game-icons:dwarf-helmet',
    items: [
      { name: 'Marteau de guerre', description: '1d8 contondant — polyvalente (1d10), robuste', price: 20, stock: 3, category: 'Armes naines' },
      { name: 'Hache à deux mains', description: '1d12 tranchant — lourde, à deux mains', price: 35, stock: 2, category: 'Armes naines' },
      { name: 'Hache d\'armes', description: '1d8 tranchant — polyvalente (1d10)', price: 12, stock: 4, category: 'Armes naines' },
      { name: 'Pic de guerre', description: '1d8 perforant — contre les armures', price: 6, stock: 4, category: 'Armes naines' },
      { name: 'Maul', description: '2d6 contondant — lourde, à deux mains', price: 12, stock: 2, category: 'Armes naines' },
      { name: 'Cotte de mailles', description: 'CA 16 — Force min 13, forgée main', price: 80, stock: 3, category: 'Armures naines' },
      { name: 'Cotte de plates', description: 'CA 17 — Force min 15, qualité supérieure', price: 220, stock: 2, category: 'Armures naines' },
      { name: 'Armure de plates', description: 'CA 18 — Force min 15, chef-d\'œuvre', price: 1600, stock: 1, category: 'Armures naines' },
      { name: 'Cuirasse', description: 'CA 14 + Dex (max +2) — sobre et efficace', price: 420, stock: 1, category: 'Armures naines' },
      { name: 'Bouclier', description: 'CA +2 — armoiries sur demande', price: 12, stock: 5, category: 'Armures naines' },
      { name: 'Marteau', description: 'Bien équilibré — aussi arme improvisée (1d4)', price: 1, stock: -1, category: 'Outils' },
      { name: 'Pitons (10)', description: 'En acier durci — résistent à tout', price: 1, stock: -1, category: 'Équipement' },
      { name: 'Chaîne (3 m)', description: 'Acier forgé — 10 PV, DD 20 Force pour briser', price: 6, stock: 5, category: 'Équipement' },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  //  MARCHAND ITINÉRANT
  // ═══════════════════════════════════════════════════════════
  {
    id: 'traveling-merchant',
    label: 'Caravane itinérante',
    icon: 'game-icons:caravan',
    items: [
      { name: 'Potion de soins', description: '2d4+2 PV', price: 55, stock: 5, category: 'Potions' },
      { name: 'Antidote', description: 'Avantage contre le poison 1h', price: 55, stock: 3, category: 'Potions' },
      { name: 'Rations (1 jour)', description: 'Nourriture pour une journée', price: 1, stock: 30, category: 'Nourriture' },
      { name: 'Torche', description: 'Lumière 6 m — dure 1 heure', price: 1, stock: 50, category: 'Équipement' },
      { name: 'Corde de chanvre (15 m)', description: 'CA 11, 2 PV — 340 kg', price: 1, stock: 8, category: 'Équipement' },
      { name: 'Dague', description: '1d4 perforant — finesse, légère', price: 2, stock: 5, category: 'Armes' },
      { name: 'Vêtements de voyageur', description: 'Résistants pour la route', price: 2, stock: 10, category: 'Vêtements' },
      { name: 'Boîte à amadou', description: 'Indispensable en route', price: 1, stock: 10, category: 'Équipement' },
      { name: 'Sac à dos', description: 'Capacité 13,5 kg', price: 2, stock: 5, category: 'Équipement' },
      { name: 'Luth', description: 'Un musicien l\'a laissé en échange d\'un repas', price: 40, stock: 1, category: 'Curiosités' },
      { name: 'Cartes à jouer', description: 'Les soirées sont longues en route', price: 1, stock: 5, category: 'Divertissement' },
      { name: 'Miroir en acier', description: 'Pratique, léger', price: 5, stock: 2, category: 'Équipement' },
      { name: 'Parchemin (feuille)', description: '3 feuilles, légèrement froissées', price: 1, stock: 10, category: 'Écriture' },
      { name: 'Encre (flacon)', description: 'Encre noire de qualité correcte', price: 10, stock: 2, category: 'Écriture' },
    ],
  },
]

export default MERCHANT_PRESETS

