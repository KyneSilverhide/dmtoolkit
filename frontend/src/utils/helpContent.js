export const helpContent = {
  // ── Admin — PlayerList ─────────────────────────────────────────────────────
  'admin.kick':
    'Expulse ce joueur de la session. Il peut rejoindre à nouveau avec le code de session.',

  // ── Admin — TvControls ────────────────────────────────────────────────────
  'tv.combat-round':
    'Round de combat actuellement affiché sur l\'écran TV. Modifiez-le manuellement au fil des tours.',
  'tv.doom-clock':
    'Compte à rebours visible sur la TV. Crée de la pression narrative : quand il atteint zéro, il se remet à la valeur de départ en boucle.',
  'tv.free-timer':
    'Minuteur à usage libre projeté sur la TV, avec un libellé personnalisé (ex : "Temps pour négocier"). S\'arrête seul à zéro.',
  'tv.tension-scale':
    'Jauge de tension narrative affichée sur la TV. Avancez-la pour intensifier l\'ambiance dramatique. Peut monter ou descendre selon la direction choisie.',
  'tv.time-scale':
    'Représentation visuelle du temps qui passe dans l\'aventure (ex : une journée en 6 paliers). Le repos long avance automatiquement du nombre de paliers défini.',

  // ── Admin — VoteManager ───────────────────────────────────────────────────
  'vote.anonymous':
    'Masque les noms des votants dans les résultats affichés sur la TV. Les joueurs savent qui a voté sans voir ce qu\'ils ont choisi.',

  // ── Admin — ImageManager ──────────────────────────────────────────────────
  'image.tv-label':
    'Texte affiché en overlay en haut à gauche de la TV quand cette image est projetée (ex : "Taverne du Poignard Noir").',
  'image.lobby-bg':
    'Définit cette image comme fond du lobby TV, à 15 % d\'opacité. Crée une ambiance visuelle entre deux scènes.',

  // ── Admin — MapManager ────────────────────────────────────────────────────
  'map.fog':
    'Voile noir couvrant toute la carte côté TV. Peignez avec la souris sur le canvas pour révéler des zones. Les joueurs voient la révélation en temps réel.',
  'map.fog-brush':
    'Taille du pinceau de révélation en pixels. Un rayon plus grand révèle des zones plus larges d\'un seul passage.',
  'map.token-place':
    'Sélectionnez un joueur dans le plateau ci-dessus, puis cliquez sur la carte pour y placer son pion. Cliquez à nouveau sur le pion pour le retirer.',
  'map.viewport':
    'Contrôle le zoom et le cadrage visible sur la TV. Utile pour focaliser l\'attention des joueurs sur une zone précise de la carte.',

  // ── Admin — AudioManager ──────────────────────────────────────────────────
  'audio.reclassify':
    'Demande à l\'IA (GPT-4o-mini) de recatégoriser automatiquement toutes les pistes en se basant sur leur nom de fichier. Nécessite GITHUB_TOKEN.',
  'audio.category':
    'Catégorie libre de la piste (ex : "Ambiance", "Combat", "Village"). Modifiez-la directement pour regrouper vos pistes comme vous le souhaitez.',
  'audio.loop':
    'La piste repart automatiquement au début quand elle se termine. Idéal pour les musiques d\'ambiance de longue durée.',

  // ── Admin — MerchantManager ───────────────────────────────────────────────
  'merchant.counter-offer':
    'Proposez un prix différent de la demande du joueur : une ristourne (réduction) ou une augmentation. Le joueur recevra la contre-offre et pourra l\'accepter ou la refuser.',
  'merchant.preset':
    'Modèles de marchands pré-remplis (armurier, herboriste, forgeron…). Choisissez-en un pour pré-remplir le formulaire, puis personnalisez selon vos besoins.',
  'merchant.stock':
    'Quantité disponible à la vente. 0 = article épuisé (non achetable). Laissez vide ou mettez une grande valeur pour un stock illimité.',

  // ── Admin — PuzzleManager ─────────────────────────────────────────────────
  'puzzle.html':
    'Puzzle interactif au format HTML. Importez un fichier .html qui sera servi aux joueurs sur leur écran. Un seed aléatoire unique est généré à chaque affichage pour varier les configurations.',

  // ── Admin — ReputationManager ─────────────────────────────────────────────
  'reputation.range':
    'Plage de valeurs possible pour cette faction (ex : −5 à +5). La jauge ne peut pas dépasser ces bornes.',
  'reputation.project':
    'Projette les jauges de réputation de toutes les factions sur l\'écran TV. Utile pour une révélation dramatique ou un récapitulatif.',

  // ── Admin — SessionJournal ────────────────────────────────────────────────
  'journal.clear':
    'Efface définitivement tous les événements du journal de cette session. Les statistiques (dégâts, soins) sont également remises à zéro. Irréversible.',
  'journal.reset':
    'Réinitialise la session complète : journal, statistiques et round de combat. À utiliser entre deux sessions de jeu.',
  'journal.summary':
    'Génère un résumé narratif de la session en utilisant l\'IA. Nécessite GITHUB_TOKEN. Le résumé est basé sur les événements enregistrés dans le journal.',

  // ── Admin — MessageTool ───────────────────────────────────────────────────
  'message.effect':
    'Animation appliquée au texte dans la boîte de réception du joueur : lent (fade progressif), glitch (corruption visuelle), frappe (machine à écrire), tremblement, lueur.',
  'message.author-color':
    'Couleur du nom de l\'auteur affichée dans la boîte de réception du joueur. Permet de différencier visuellement plusieurs narrateurs.',

  // ── Admin — CriticalFailTool ──────────────────────────────────────────────
  'critfail.duration':
    'Durée de l\'animation du dé qui roule avant l\'affichage du résultat. Augmentez-la pour créer du suspense.',

  // ── Admin — GoldDividerTool ───────────────────────────────────────────────
  'gold.coins':
    'PP = Platine (10 PO) · PO = Or · PE = Électrum (½ PO) · PA = Argent (1/10 PO) · PC = Cuivre (1/100 PO). Le calcul convertit tout en valeur PO pour la division.',
  'gold.remainder':
    'Pièces qui ne peuvent pas être divisées équitablement entre tous les joueurs. À distribuer manuellement ou à garder dans le trésor du groupe.',

  // ── Admin — SearchTool ────────────────────────────────────────────────────
  'search.ritual':
    'Un sort rituel peut être lancé en 10 minutes supplémentaires sans dépenser d\'emplacement de sort, à condition de posséder le sort.',
  'search.harmonisation':
    'Cet objet magique nécessite une attunement (harmonisation) : une courte/longue pause pour créer un lien magique. Un personnage peut être harmonisé à 3 objets maximum.',

  // ── Player — Combat ───────────────────────────────────────────────────────
  'player.hp-update':
    'Entrez les dégâts subis (négatif) ou les soins reçus (positif). La mise à jour est envoyée au MJ automatiquement 800 ms après votre dernière frappe.',
  'player.temp-hp':
    'Points de vie temporaires accordés par un sort ou une capacité (ex : Faux-semblant). Ils absorbent les dégâts en priorité avant vos PV normaux, mais ne se cumulent pas.',
  'player.max-hp':
    'Modifiez vos PV maximum si un effet permanent (maladie, malédiction, niveau d\'épuisement) les réduit durablement.',
  'player.initiative':
    'Votre valeur d\'initiative pour déterminer l\'ordre de jeu en combat. Entrez le résultat de votre jet (d20 + modificateur de DEX).',
  'player.concentration':
    'Certains sorts (Bénédiction, Suggestion…) nécessitent de maintenir la concentration. Subir des dégâts impose un jet de Sauvegarde Constitution (DD 10 ou la moitié des dégâts reçus, le plus élevé).',
  'player.counter-offer':
    'Le MJ vous propose un prix différent pour votre panier. Acceptez si le prix vous convient, déclinez sinon.',

  // ── Player — Conditions ───────────────────────────────────────────────────
  'condition.charmed':
    'Charmé : ne peut pas attaquer la source du charme ni la cibler avec des effets nuisibles. La source a l\'avantage à tous les jets de caractéristique sociaux contre vous.',
  'condition.blinded':
    'Aveuglé : échec automatique aux jets nécessitant la vue. Les attaques effectuées ont le désavantage ; celles reçues ont l\'avantage.',
  'condition.deafened':
    'Assourdi : échec automatique aux jets nécessitant l\'ouïe.',
  'condition.exhaustion':
    'Épuisé : 6 niveaux de pénalités cumulatives. Niv. 1 : désavantage aux jets de caractéristique. Niv. 5 : vitesse 0. Niv. 6 : mort.',
  'condition.frightened':
    'Effrayé : désavantage aux jets d\'attaque et de caractéristique tant que la source est visible. Ne peut pas se rapprocher volontairement de la source.',
  'condition.grappled':
    'Agrippé : vitesse réduite à 0. Fin si l\'agresseur est incapacité, ou si vous vous échappez (action Se dégager).',
  'condition.incapacitated':
    'Incapacité : ne peut plus effectuer d\'actions ni de réactions.',
  'condition.invisible':
    'Invisible : impossible à voir sans sorts ou sens spéciaux. Avantage aux jets d\'attaque, désavantage sur les attaques reçues.',
  'condition.paralyzed':
    'Paralysé : incapacité totale, ne peut bouger ni parler. Les attaques corps-à-corps sont des coups critiques automatiques.',
  'condition.petrified':
    'Pétrifié : transformé en substance inerte. Incapacité totale, résistance à tous les dégâts. N\'a plus conscience de son environnement.',
  'condition.poisoned':
    'Empoisonné : désavantage aux jets d\'attaque et à tous les jets de caractéristique.',
  'condition.prone':
    'À terre : doit dépenser la moitié de sa vitesse pour se relever. Désavantage aux jets d\'attaque. Les attaques corps-à-corps reçues ont l\'avantage, les attaques à distance l\'ont le désavantage.',
  'condition.restrained':
    'Entravé : vitesse 0. Désavantage aux jets d\'attaque et aux jets de sauvegarde DEX. Les attaques contre vous ont l\'avantage.',
  'condition.stunned':
    'Étourdi : incapacité, ne peut pas bouger, ne parle qu\'avec difficulté. Jets de sauvegarde FOR et DEX automatiquement ratés. Attaques reçues avec avantage.',
  'condition.unconscious':
    'Inconscient : incapacité totale, tombe à terre. Jets de sauvegarde FOR et DEX automatiquement ratés. Attaques corps-à-corps critiques automatiques.',


  // ── Player — Dés ──────────────────────────────────────────────────────────
  'player.dice-advantage':
    'Lancez deux dés et gardez le plus élevé. Accordé par certains sorts (Bénédiction), capacités de classe ou situations favorables (adversaire à terre).',
  'player.dice-disadvantage':
    'Lancez deux dés et gardez le plus bas. Imposé par certaines conditions (Empoisonné, Effrayé) ou situations défavorables.',
  'player.hidden-roll':
    'Envoie le résultat uniquement au MJ — les autres joueurs ne le voient pas. Utile pour les jets de Perception ou de Discrétion discrets.',
  'player.dice-modifier':
    'Bonus ou malus fixe ajouté au résultat du dé (ex : +5 pour un modificateur de Force de +3 et maîtrise +2). Peut être négatif.',

  // ── Player — Notes ────────────────────────────────────────────────────────
  'player.notes-canvas':
    'Zone de dessin tactile. Utilisez votre doigt ou un stylet pour annoter une carte, griffonner un plan ou noter visuellement. Activez le verrou pour écrire sans risquer de faire défiler la page.',

  // ── Player — Boutique ─────────────────────────────────────────────────────
  'player.shop-quantity':
    'Quantité de cet article dans votre panier. Le MJ verra le détail complet avant d\'accepter ou de proposer un autre prix.',
  'player.shop-cart':
    'Récapitulatif de votre sélection. Envoyez-le au MJ pour déclencher la transaction. Il peut accepter, refuser, ou contre-proposer un prix différent.',

  // ── Player — Vote ─────────────────────────────────────────────────────────
  'player.vote-anonymous':
    'Le MJ a activé l\'anonymat : votre vote est comptabilisé mais votre nom n\'apparaît pas dans les résultats affichés sur la TV.',
}
