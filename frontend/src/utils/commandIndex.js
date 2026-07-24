// Index statique des sections de l'application, utilisé par la palette de
// commande (recherche globale). Chaque entrée décrit une section admin par
// ses mots-clés en français, pour qu'une recherche comme "marchand" ou
// "brouillard de guerre" retrouve le bon onglet même sans correspondance
// exacte avec son titre.
export const COMMAND_INDEX = [
  { tabKey: 'players', label: 'Joueurs', icon: 'game-icons:wizard-staff', keywords: 'joueurs pv points de vie ca classe armure initiative conditions concentration liste personnages' },
  { tabKey: 'message', label: 'Messages', icon: 'lucide:mail', keywords: 'messages envoyer message joueur discuter chat texte or gold repartition voix effet' },
  { tabKey: 'dice', label: 'Critical Fail', icon: 'game-icons:dice-six-faces-five', keywords: 'des jet de des critical fail dice lancer resultat' },
  { tabKey: 'journal', label: 'Journal', icon: 'game-icons:scroll-unfurled', keywords: 'journal historique evenements log session stats duree degats soins effacer reinitialiser' },
  { tabKey: 'tension', label: 'Rythme', icon: 'lucide:timer', keywords: 'rythme doom clock horloge du destin tension echelle timer minuteur round de combat chronometre' },
  { tabKey: 'vote', label: 'Vote', icon: 'lucide:check-square', keywords: 'vote sondage decision joueurs options' },
  { tabKey: 'images', label: 'Images', icon: 'lucide:image', keywords: 'images photo galerie projeter tv lobby fond ecran' },
  { tabKey: 'videos', label: 'Vidéos', icon: 'lucide:video', keywords: 'videos video projeter tv film scene projection' },
  { tabKey: 'audio', label: 'Audio', icon: 'lucide:music-2', keywords: 'audio musique son ambiance effets sonores playlist piste volume boucle' },
  { tabKey: 'map', label: 'Carte', icon: 'lucide:map', keywords: 'carte battlemap brouillard de guerre fog tokens grille combat tactique' },
  { tabKey: 'merchants', label: 'Marchands', icon: 'game-icons:shop', keywords: 'marchand boutique achat vente negociation panier prix commerce contre-offre stock' },
  { tabKey: 'puzzle', label: 'Puzzles', icon: 'lucide:puzzle', keywords: 'puzzle enigme casse-tete html interactif joueurs' },
  { tabKey: 'reputation', label: 'Réputations', icon: 'lucide:shield', keywords: 'reputation faction reputations valeur jauge' },
  { tabKey: 'tresor', label: 'Trésor', icon: 'game-icons:coins', keywords: 'tresor or gold repartition division piece banquier' },
  { tabKey: 'spells', label: 'Sorts', icon: 'lucide:sparkles', keywords: 'recherche sorts sort magie ecole niveau rituel aidedd' },
  { tabKey: 'equipment', label: 'Objets', icon: 'lucide:package', keywords: 'recherche objets equipement armes armures outils prix aidedd' },
  { tabKey: 'magic', label: 'Objets magiques', icon: 'lucide:gem', keywords: 'recherche objets magiques rarete harmonisation anneau baguette aidedd' },
  { tabKey: 'races', label: 'Races', icon: 'game-icons:vitruvian-man', keywords: 'races race elfe nain halfelin humain demi-elfe demi-orc gnome drakeide dragonborn tieffelin sous-race taille vitesse langues bonus caracteristiques aidedd' },
  { tabKey: 'classes', label: 'Classes', icon: 'game-icons:round-shield', keywords: 'classes classe barbare barde clerc druide guerrier moine paladin rodeur roublard ensorceleur magicien occultiste artificier sous-classe archetype de vie sorts emplacements progression niveaux aidedd' },
  { tabKey: 'backgrounds', label: 'Origines', icon: 'game-icons:quill-ink', keywords: 'origines origine historique historiques background acolyte artisan de guilde artiste charlatan criminel enfant des rues ermite heros du peuple marin noble sage sauvageon soldat competences outils langues equipement capacite personnalite traits ideaux liens defauts aidedd' },
  { tabKey: 'abilities', label: 'Aptitudes', icon: 'lucide:zap', keywords: 'aptitudes aptitude capacites capacite traits de classe conduit divin paume fremissante metamagie invocations occultes manifestations occultes manoeuvres maitre de guerre styles de combat archerie duel defense options' },
  { tabKey: 'generator', label: 'Générateur', icon: 'lucide:wand-2', keywords: 'generateur ia intelligence artificielle noms pnj lieux auberges accroches quetes descriptions' },
]
