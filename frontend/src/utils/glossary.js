// Glossaire de règles D&D 5e utilisé pour la surbrillance dans les descriptions (voir
// textLinker.js withGlossary()/highlightGlossaryHtml()). Toutes les descriptions sont des
// paraphrases courtes, jamais une copie verbatim du PHB/SRD (même contrainte de copyright
// que dnd_classes.json, voir CLAUDE.md).
//
// RULE_TERMS : termes de règle réelle — surlignés avec une infobulle expliquant la règle,
// sans navigation (pas de fiche dédiée).
// CONCEPT_TERMS : mots de vocabulaire (caractéristiques, économie d'action) sans règle
// propre à expliquer — juste un style visuel différent, aucune infobulle.
// CONDITION_TERMS : les 15 états D&D (voir aussi la fiche dédiée /admin/conditions et
// backend/src/data/dnd_conditions.json, même contenu dupliqué côté client pour la
// détection de texte — voir la note sur slugify.js pour le même principe). Contrairement
// aux RULE_TERMS, ces mentions sont NAVIGABLES (type 'condition', comme 'item') vers la
// fiche état correspondante. `aliases` couvre les accords de genre/nombre courants dans les
// descriptions de sorts (ex: "la cible est aveuglée" / "les créatures aveuglées") — le
// français n'accorde pas ces adjectifs d'état de la même façon que leur nom canonique.

export const RULE_TERMS = [
  { name: 'Vision dans le noir', description: "Vous voyez dans l'obscurité jusqu'à une certaine distance, mais uniquement en tons de gris — impossible d'y distinguer les couleurs." },
  { name: 'Résistance', description: 'Les dégâts subis d\'un type donné sont réduits de moitié.' },
  { name: 'Résistances', description: 'Les dégâts subis d\'un type donné sont réduits de moitié.' },
  { name: 'Vulnérabilité', description: "Les dégâts subis d'un type donné sont doublés." },
  { name: 'Immunité', description: "Aucun dégât ni effet d'un type donné n'est subi." },
  { name: 'Repos long', description: 'Période de repos ininterrompue d\'au moins 8 heures qui restaure tous les points de vie, la moitié des dés de vie dépensés, et de nombreuses ressources de classe.' },
  { name: 'Repos court', description: 'Période de repos d\'au moins 1 heure durant laquelle des dés de vie peuvent être dépensés pour regagner des points de vie, et certaines ressources de classe sont récupérées.' },
  { name: 'Points de vie temporaires', description: "Réserve de points de vie supplémentaire, absorbée en premier lors de dégâts subis. Ne s'additionne pas avec d'autres points temporaires déjà en réserve — seul le plus élevé des deux est conservé." },
  { name: 'Jet de sauvegarde', description: 'Jet de d20 (+ modificateur de caractéristique) effectué pour résister ou réduire l\'effet d\'un sort, d\'un piège ou d\'une capacité.' },
  { name: 'Jets de sauvegarde', description: 'Jets de d20 (+ modificateur de caractéristique) effectués pour résister ou réduire l\'effet d\'un sort, d\'un piège ou d\'une capacité.' },
  { name: 'Avantage', description: 'Le jet de d20 est lancé deux fois : seul le résultat le plus élevé est conservé.' },
  { name: 'Désavantage', description: 'Le jet de d20 est lancé deux fois : seul le résultat le plus faible est conservé.' },
  { name: 'Concentration', description: "Certains sorts exigent de rester concentré : l'effet cesse si un autre sort de concentration est lancé, si la créature devient incapable d'agir, ou en cas d'échec à un jet de sauvegarde de Constitution après avoir subi des dégâts." },
  { name: 'Bonus de maîtrise', description: 'Bonus lié au niveau ou au dé de puissance, ajouté aux jets pour lesquels la maîtrise s\'applique (compétence, sauvegarde, arme, sort...).' },
  { name: "Attaque d'opportunité", description: 'Attaque déclenchée quand une créature hostile visible quitte la portée d\'allonge sans se téléporter ni bénéficier d\'un effet similaire.' },
  { name: 'Surpris', description: "Une créature surprise ne peut ni se déplacer ni agir lors du premier tour du combat, et ne peut pas non plus réagir avant son premier tour." },
  { name: "Emplacement de sort", description: "Ressource dépensée pour lancer un sort à un niveau donné ou supérieur." },
  { name: "Classe d'armure", description: "Valeur qui détermine la difficulté à toucher une créature lors d'une attaque." },
]

export const CONCEPT_TERMS = [
  'Dextérité',
  'Constitution',
  'Intelligence',
  'Sagesse',
  'Charisme',
  'Action',
  'Action bonus',
  'Réaction',
]

// Les 15 états D&D — mêmes noms/slugs/descriptions que backend/src/data/dnd_conditions.json
// (fiche dédiée /admin/conditions), dupliqués ici pour la détection de texte sans appel API
// (même principe que utils/slugify.js). `slug` doit rester identique à slugify(name) pour
// que la navigation RefLink (?q=&slug=) trouve la bonne fiche.
export const CONDITION_TERMS = [
  { name: 'À terre', slug: 'a-terre', aliases: [], description: "Ne peut se déplacer qu'en rampant, à moins de se relever (ce qui met fin à l'état). Subit le désavantage aux jets d'attaque. Les attaques contre elle ont l'avantage si l'attaquant est à 1,50 m ou moins, sinon elles ont le désavantage." },
  { name: 'Agrippé', slug: 'agrippe', aliases: ['Agrippée', 'Agrippés', 'Agrippées'], description: "Sa vitesse tombe à 0 et elle ne peut bénéficier d'aucun bonus de vitesse. L'état prend fin si l'agrippeur devient incapable d'agir, ou si un effet écarte la créature agrippée hors de portée de l'agrippeur." },
  { name: 'Assourdi', slug: 'assourdi', aliases: ['Assourdie', 'Assourdis', 'Assourdies'], description: "N'entend rien et rate automatiquement tout jet de caractéristique nécessitant l'ouïe." },
  { name: 'Aveuglé', slug: 'aveugle', aliases: ['Aveuglée', 'Aveuglés', 'Aveuglées'], description: "Ne voit rien et rate automatiquement tout jet de caractéristique nécessitant la vue. Les attaques contre cette créature ont l'avantage, et ses propres attaques ont le désavantage." },
  { name: 'Charmé', slug: 'charme', aliases: ['Charmée', 'Charmés', 'Charmées'], description: "Ne peut ni attaquer le charmeur ni le cibler avec une capacité ou un effet magique nuisible. Le charmeur bénéficie de l'avantage aux jets de caractéristique pour interagir socialement avec elle." },
  { name: 'Effrayé', slug: 'effraye', aliases: ['Effrayée', 'Effrayés', 'Effrayées'], description: "Subit le désavantage aux jets de caractéristique et aux jets d'attaque tant que la source de sa peur reste dans son champ de vision, et ne peut pas s'en approcher volontairement." },
  { name: 'Empoisonné', slug: 'empoisonne', aliases: ['Empoisonnée', 'Empoisonnés', 'Empoisonnées'], description: "Subit le désavantage aux jets d'attaque et aux jets de caractéristique." },
  { name: 'Entravé', slug: 'entrave', aliases: ['Entravée', 'Entravés', 'Entravées'], description: "Sa vitesse tombe à 0 sans qu'aucun bonus de vitesse ne s'applique. Les attaques contre elle ont l'avantage, ses propres attaques ont le désavantage, et elle subit le désavantage à ses jets de sauvegarde de Dextérité." },
  { name: 'Étourdi', slug: 'etourdi', aliases: ['Étourdie', 'Étourdis', 'Étourdies'], description: "Incapable d'agir, ne peut plus bouger et ne parle que de façon hésitante. Échoue automatiquement ses jets de sauvegarde de Force et de Dextérité. Les attaques contre elle ont l'avantage." },
  { name: 'Épuisement', slug: 'epuisement', aliases: ['Épuisé', 'Épuisée', 'Épuisés', 'Épuisées'], description: "État cumulable en six niveaux, chacun ajoutant l'effet des niveaux inférieurs : 1 — désavantage aux jets de caractéristique ; 2 — vitesse réduite de moitié ; 3 — désavantage aux jets d'attaque et de sauvegarde ; 4 — maximum de points de vie réduit de moitié ; 5 — vitesse réduite à 0 ; 6 — mort. Terminer un repos long en ayant mangé et bu réduit le niveau d'épuisement de 1." },
  { name: "Incapable d'agir", slug: 'incapable-d-agir', aliases: ['Neutralisé', 'Neutralisée', 'Neutralisés', 'Neutralisées', "Incapables d'agir"], description: 'Ne peut effectuer aucune action ni réaction.' },
  { name: 'Inconscient', slug: 'inconscient', aliases: ['Inconsciente', 'Inconscients', 'Inconscientes'], description: "Incapable d'agir, ne peut plus bouger ni parler, inconsciente de son environnement, et lâche tout ce qu'elle tenait en tombant à terre. Échoue automatiquement ses jets de sauvegarde de Force et de Dextérité ; les attaques contre elle ont l'avantage et sont critiques si l'attaquant est à 1,50 m ou moins." },
  { name: 'Invisible', slug: 'invisible', aliases: ['Invisibles'], description: "Ne peut être vue sans magie ni sens particulier ; sa position ne peut être détectée que par le bruit qu'elle fait ou les traces qu'elle laisse. Les attaques contre elle ont le désavantage, ses propres attaques ont l'avantage." },
  { name: 'Paralysé', slug: 'paralyse', aliases: ['Paralysée', 'Paralysés', 'Paralysées'], description: "Incapable d'agir, ne peut plus bouger ni parler. Échoue automatiquement ses jets de sauvegarde de Force et de Dextérité ; les attaques contre elle ont l'avantage et sont critiques si l'attaquant est à 1,50 m ou moins." },
  { name: 'Pétrifié', slug: 'petrifie', aliases: ['Pétrifiée', 'Pétrifiés', 'Pétrifiées'], description: "Transformée, avec tout objet non magique porté, en une substance solide inanimée (généralement de la pierre) ; son poids est multiplié par dix et elle cesse de vieillir. Incapable d'agir, ne peut plus bouger ni parler, inconsciente de son environnement. Échoue automatiquement ses jets de sauvegarde de Force et de Dextérité ; les attaques contre elle ont l'avantage. Bénéficie de la résistance à tous les types de dégâts et de l'immunité au poison et à la maladie (un poison ou une maladie déjà présent est seulement suspendu, pas neutralisé)." },
]
