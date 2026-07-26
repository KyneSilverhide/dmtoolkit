# CLAUDE.md — Contexte projet pour Claude Code

Ce fichier est lu automatiquement par Claude Code à chaque session. Il contient tout le contexte nécessaire pour travailler efficacement sur ce dépôt.

---

## Résumé du projet

**DM Toolkit** est une application web de gestion de sessions de jeu de rôle D&D 5e (en français), destinée au Maître du Jeu (MJ). Elle permet :

- La gestion en temps réel des joueurs (PV, CA, conditions, concentration, initiative)
- Au login, le choix d'une classe (+ sous-classe si la classe est connue), d'une race, chacun parmi la liste de contenu ou en saisie libre (`/api/classes/public`, `/api/races/public`) — l'écran Joueurs du MJ affiche alors un résumé des résistances/immunités/sens permanents qui en découlent (`/api/defensive-traits`, voir `frontend/src/utils/defensiveTraits.js`)
- L'affichage sur un écran TV dédié (vue spectateur)
- Côté joueur, parité avec le MJ pour la recherche de contenu de référence (Sorts, Objets, Races, Classes, Origines, Aptitudes, Services, États), avec une recherche globale équivalente au Ctrl+K du MJ (`PlayerCommandPalette.vue`), masqué en mode démo
- Depuis n'importe quel onglet « Contenu » (sauf Classes), afficher la fiche d'un sort/objet/race/origine/aptitude/service/état sur la TV (mode `content`) ou l'envoyer à un ou tous les joueurs par message (`ContentActionButtons.vue`, rendu partagé via `ContentSheetView.vue` — voir sections Socket.IO et composants ci-dessous)
- L'envoi de messages et jets de dés aux joueurs
- Des systèmes de vote, d'horloge de doom, d'échelle de tension, timer et round de combat
- Un système de marchand interactif avec panier et négociation de prix
- Une battlemap interactive avec brouillard de guerre et tokens de joueurs
- La recherche de sorts D&D 5e (477 sorts FR depuis `aidedd_spells.json`), chaque sort listant les classes pouvant le lancer (champ `classes`, déduit du filtre par classe d'aidedd.org)
- La recherche d'équipement standard et d'objets magiques D&D 5e
- Une fiche des races jouables D&D 5e 2014 (taille, âge, vitesse, langues, bonus de caractéristiques, traits, sous-races) depuis `dnd_races.json`
- Une fiche des classes jouables D&D 5e 2014 (12 classes du PHB + l'Artificier) depuis `dnd_classes.json` : dé de vie, caractéristique(s) clé(s), JS, maîtrises, équipement de départ, progression complète niveau par niveau (1-20), table d'emplacements de sorts pour les lanceurs, et sous-classes avec leurs traits par niveau — un bouton « Voir les sorts de cette classe » filtre l'onglet Sorts sur les sorts de cette classe (via `/api/spells/by-class/:className`)
- Une fiche des origines jouables D&D 5e 2014 (13 origines du PHB) depuis `dnd_backgrounds.json` : compétences et outils maîtrisés, langues, équipement de départ, capacité spéciale, et tables de personnalité suggérée (traits/idéaux/liens/défauts)
- Une recherche d'aptitudes (`GET /api/classes/abilities`) : toutes les features de classe et tous les traits de sous-classe de `dnd_classes.json` aplatis en une liste recherchable (ex: Conduit divin, Paume frémissante), avec un bouton retour vers la fiche de classe d'origine. Certaines features/traits portent aussi un champ `options` (ex: Métamagie, Manifestations occultes de l'Occultiste, Manœuvres du Maître de guerre, Styles de combat) — chaque option est elle-même aplatie en entrée individuellement recherchable (ex: « Sort subtil »)
- Une palette de commande globale (Ctrl+K) : recherche unifiée dans les sections admin ainsi que dans les sorts/objets/races/classes/origines/aptitudes (aperçu enrichi des résultats, y compris un aperçu du trait de classe/sous-classe qui a matché la recherche le cas échéant) ; utilisable sans session active, restreinte aux sections du menu visible
- Un générateur IA de noms (PNJ, lieux, auberges), accroches de quêtes et descriptions via GitHub Models (gpt-4o-mini)
- Un gestionnaire audio côté admin : upload de fichiers audio (MP3/WAV/OGG/FLAC/M4A), organisés par catégorie (ambiance/musique/effets/autre), lecture multi-piste simultanée avec volume et boucle par piste, renommage inline
- Une isolation multi-tenant : chaque admin ne voit que ses propres sessions, et les fichiers uploadés sont stockés par tenant (`/uploads/<adminId>/`)
- Un système de release notes intégré : cloche de notification dans l'en-tête (MJ et joueur), modal filtré par rôle (`admin`/`player`/`all`), dernier numéro de version vu en localStorage (`rn-last-viewed`)
- Un plugin Obsidian pour synchroniser l'Initiative Tracker avec DM Toolkit

---

## Architecture du monorepo

```
/
├── frontend/          # Vue 3 + Vite + Pinia (port 5173 en dev)
│   ├── src/
│   │   ├── views/     # HomeView, AdminView, TvView, PlayerInboxView, PlayerJoinView
│   │   ├── components/admin/  # Composants admin (MapManager, MerchantManager, GeneratorTool, AudioManager, ImageManager, VideoManager, PuzzleManager, ReputationManager, SessionJournal, etc.)
│   │   │                      # VideoManager : upload de vidéos (type='video'), recherche/filtre, suppression, projection sur la TV (scène 'video', maximisée et autoplay via TvVideo) — onglet verrouillé en mode démo
│   │   │                      #   Audio : comme les fichiers audio, le son sort du navigateur de l'admin (PC → TV/Bluetooth). L'aperçu admin a le son ; TvVideo est muet (muted) pour éviter le double son ; la lecture (play/pause/seek) est synchronisée admin → TV via l'événement video-control
│   │   │                      # MapManager : brouillard de guerre — deux modes : peinture libre (grid_type='none') et cellule par cellule (grid_type='square'|'hex')
│   │   │                      # SessionJournal : journal des événements en temps réel, stats de session (durée, dégâts totaux, soins totaux), boutons "Effacer le journal" et "Réinitialiser session"
│   │   │                      # SpellSearch / ItemSearch (props category='equipment'|'magic') / RaceSearch / ClassSearch / BackgroundSearch / AbilitySearch / ServiceSearch / ConditionSearch : onglets top-level "Sorts"/"Objets"/"Objets magiques"/"Races"/"Classes"/"Origines"/"Aptitudes"/"Services"/"États" du groupe nav "Contenu" — chacun garde un input de recherche local, synchronisé avec la query string de sa route (`/admin/<tab>?q=&slug=&class=`) via le composable `useContentTabQuery(tabKey)` (voir composables/) plutôt qu'une prop `prefill` : lecture au montage + sur `onActivated` (les composants restent vivants via `<KeepAlive>`, guardé par `route.params.tab === tabKey` pour ignorer les navigations des autres onglets), écriture debounce 250ms sur la saisie
│   │   │                      #   ClassSearch : sections dépliables par carte (traits de classe, progression niveaux 1-20, emplacements de sorts, sous-classes) via une map réactive `expanded` clé `${slug}:${section}` ; le bouton « Voir les sorts de cette classe » navigue directement vers `/admin/spells?class=<nom>` (`router.push`) ; affiche un aperçu du trait matché par la recherche locale (`traitPreviews`) quand la recherche cible un trait précis plutôt que le nom/la caractéristique clé. Les traits de classe (`dndClass.features`) ET de sous-classe n'affichent que le nom du trait en `RefLink` (type `ability`, voir plus bas) — jamais sa description en clair, pour ne pas la répéter alors qu'elle est déjà détaillée dans l'onglet Aptitudes ; seule exception : un trait qui donne accès à une liste de sorts (Sorts de domaine/de serment/de cercle…, détecté via `isSpellListTrait()`/`SPELL_LIST_NAME_RE`) garde sa description complète (via `LinkedText`), car son contenu utile — les noms de sorts — serait sinon caché derrière la fiche d'aptitude
│   │   │                      #   BackgroundSearch : mêmes principes que RaceSearch, avec une section dépliable « Personnalité suggérée » (4 sous-tables : traits/idéaux/liens/défauts) via la même map réactive `expanded`
│   │   │                      #   SpellSearch / ItemSearch / AbilitySearch : quand la recherche est vide (ou < seuil auto-recherche), affichent la liste complète paginée via `ContentPagination.vue` (20/page) au lieu de rien afficher — SpellSearch charge `GET /api/spells`, ItemSearch charge `GET /api/magic-items` (liste fusionnée magiques+standards, filtrée côté client par `source_category` comme pour la recherche), AbilitySearch pagine directement le tableau déjà chargé au montage (`GET /api/classes/abilities`, trié alphabétiquement) ; le composant `isBrowsing` (computed) bascule entre mode parcours et mode recherche, `ContentPagination` n'est visible qu'en mode parcours avec plus d'une page
│   │   │                      #   SpellSearch : accepte aussi le param `class` (rempli par ClassSearch) — bascule alors sur `GET /api/spells/by-class/:className` (liste complète, sans troncature à 50) au lieu de la recherche texte ; affiche les classes pouvant lancer chaque sort en badges
│   │   │                      #   AbilitySearch : aplatit `GET /api/classes/abilities` (features de classe + traits de sous-classe, y compris leurs `options` — Métamagie, Invocations, Manœuvres, Styles de combat — chacune aplatie en entrée séparée) ; bouton « Voir la classe » navigue vers `/admin/classes?q=<classe>&slug=<classSlug>`
│   │   │                      # CommandPalette : palette de commande globale (Ctrl+K, bouton "Rechercher" dans AdminHeader) — recherche statique dans les sections admin (utils/commandIndex.js, restreinte aux onglets visibles via `visibleTabKeys`) + recherche live (debounce 250ms) dans /api/spells/search, /api/magic-items/search, /api/races/search, /api/classes/search, /api/backgrounds/search, /api/classes/abilities/search avec aperçu (icône, tag coloré, prix, extrait de description) ; le résultat classe affiche le trait matché (`matchedTrait`, calculé côté serveur) à la place du résumé générique quand la recherche cible un trait précis ; sélectionner un résultat navigue directement (`router.push`) vers l'onglet/URL correspondant ; utilisable sans session active
│   │   │                      # ClassSearch (traits de classe de base + aperçu de recherche) / RaceSearch / BackgroundSearch / AbilitySearch (fiche complète d'une aptitude) : les descriptions de trait passent par `LinkedText.vue` (`utils/textLinker.js`) qui détecte les mentions de sorts (et, dans ClassSearch, d'aptitudes de la MÊME classe) pour les transformer en liens `RefLink.vue` avec bulle d'aperçu au survol (nom, niveau/école ou classe·sous-classe, extrait) et navigation au clic vers l'onglet Sorts/Aptitudes en correspondance exacte (`?q=&slug=`). Un candidat "sort" d'un seul mot (ex: Résistance, Bouclier, Lumière) n'est lié que si le nom du trait évoque une liste de sorts (`SPELL_LIST_NAME_RE`, ex: "Sorts de domaine") ou s'il suit immédiatement un verbe d'incantation (lance/apprend/connaît…) — sans ce filtre, la plupart de ces mots sont aussi du vocabulaire courant des règles (« résistance aux dégâts », « un bouclier reste utilisable ») et généreraient des liens erronés ; les candidats multi-mots (la grande majorité des noms de sorts) ne sont eux jamais filtrés
│   │   │                      # Glossaire de règles (`utils/glossary.js` : `RULE_TERMS`/`CONCEPT_TERMS`) : deux niveaux de surbrillance supplémentaires dans TOUTE description passant par le texte de règles — vision dans le noir, résistance/vulnérabilité/immunité, repos long/court, points de vie temporaires, jet de sauvegarde, avantage/désavantage, concentration, conditions D&D (Aveuglé, Paralysé…), etc. surlignés avec une infobulle expliquant la règle (type `glossary` sur `RefLink`, pas de navigation — badge "Règle", pas de "Cliquer pour voir la fiche") ; caractéristiques (Dextérité/Constitution/Sagesse/…) et mots d'économie d'action (Action/Action bonus/Réaction) surlignés en `.concept-term` (style seul, aucune infobulle/interaction). Contrairement au filtre `SPACELESS_TRIGGER_RE` des sorts, ces deux types ne sont jamais gardés par un contexte requis : dans un texte de règles, "résistance"/"avantage"/etc. désignent quasi-systématiquement le concept de règle. "Force" est volontairement exclu de `CONCEPT_TERMS` (mot courant du français narratif, faux positifs trop fréquents sans garde-fou dédié). `textLinker.js` expose `withGlossary(candidates)` (fusionne + re-trie par longueur) pour le texte brut (Vue, via `LinkedText.vue` — branche `concept` en `<span>`, les autres types passent par `RefLink`) et `highlightGlossaryHtml(html)` pour le HTML pré-rendu des sorts/objets (`description_html`, ~99% des entrées, contient parfois des `<table>`/`<svg>`) : cette dernière alterne balises/texte via `split(/(<[^>]+>)/g)` et n'applique la détection qu'aux segments de texte, jamais à l'intérieur d'une balise — tableaux/listes/liens existants restent intacts. Pour ce chemin HTML, l'infobulle glossaire est un `title` natif du navigateur (pas de bulle Teleport riche — impossible de monter un composant Vue dans du `v-html`), et aucun lien sort/aptitude n'est généré (juste glossaire/concept)
│   │   │                      # Équipement de départ cliquable (ClassSearch `dndClass.starting_equipment`, BackgroundSearch `background.equipment`) : `itemCandidates(items)` (`utils/textLinker.js`) construit des candidats `RefLink` type `item` (navigation vers `/admin/equipment`, badge = `item_type` coloré via `itemTypeStyle()`) à partir des objets standard (`GET /api/magic-items` filtré `source_category !== 'magic'`). En plus du nom exact, chaque objet enregistre deux alias de matching : le nom sans son suffixe parenthétique de variante (« Symbole sacré (argent) » → « Symbole sacré ») et son pluriel simple en +s (« Dague » → « Dagues ») — nécessaires car le texte d'équipement ne reprend jamais le nom exact de la base. **Ces candidats objets ne sont utilisés QUE pour le paragraphe d'équipement de départ** (`equipmentCandidates`, séparé de `refCandidates`/`refCandidates(dndClass)`) — jamais fusionnés dans les traits/features générales : plusieurs noms d'objets sont des mots courants d'un seul mot (Lance, Bouclier, Acide, Torche, Chaîne…) qui apparaissent ailleurs dans les descriptions de traits avec un tout autre sens (« Lance Détection des pensées » = lance le sort, pas l'objet ; « dégâts d'acide » = type de dégâts, pas la fiole) — les y lier produirait énormément de faux positifs. Gap connu, non comblé : plusieurs objets mentionnés dans l'équipement de départ n'existent toujours pas dans `aidedd_standard_items.json` (les sacs d'aventure — sac d'explorateur/d'ecclésiastique/d'érudit/d'aventurier/de diplomate/d'artiste/d'exploration souterraine/de cambrioleur —, le grimoire) et restent donc en texte simple ; `Carreaux d'arbalète (20)` ne matche pas le phrasé courant « 20 carreaux » (ordre des mots différent, pas résolu par les alias) — à compléter après ajout de ces objets à la base plutôt que deviner leurs caractéristiques (prix/poids). Le kit d'herboriste (Ermite) est en revanche résolu : objet ajouté (voir bullet `aidedd_standard_items.json`), et le phrasé de `dnd_backgrounds.json`/`dnd_classes.json` aligné sur le nom officiel « Kit d'herboriste » (au lieu de « kit d'herboristerie »)
│   │   ├── components/player/ # Composants joueur (PlayerDiceTool, PlayerCombatTab, etc.)
│   │   │                      # Parité de contenu avec le MJ (PlayerInboxView.vue, onglets Sorts/Objets/Objets magiques/Races/Classes/Origines/Aptitudes/Services/États, masqués en mode démo) : PlayerInboxView réutilise DIRECTEMENT les composants admin/*Search.vue (SpellSearch, ItemSearch ×2 pour equipment/magic, RaceSearch, ClassSearch, BackgroundSearch, AbilitySearch, ServiceSearch, ConditionSearch) via une prop `player-mode` plutôt qu'une réimplémentation séparée — une première version avec des composants joueur simplifiés (texte brut, pas de glossaire/RefLink/tooltips, Objets non séparé des Objets magiques) s'est révélée visuellement très différente et incomplète (retour utilisateur direct), d'où ce choix de réutilisation. En `player-mode` : (1) fetch sur les endpoints publics (`GET /api/*/public*`, sans JWT) au lieu des endpoints admin authentifiés — `/api/spells/public` et `/api/magic-items/public` (parcours complet) et `/api/spells/public/by-class/:className` ont été ajoutés spécifiquement pour ça, les autres endpoints `/public*` existaient déjà (voir routes plus bas) ; (2) `ContentActionButtons` (boutons TV/Envoyer, actions MJ) est masqué ; (3) dans ClassSearch, les traits de classe/sous-classe affichent leur description complète au lieu du lien RefLink-only vers l'onglet Aptitudes utilisé côté MJ (préférence explicite du joueur : pas de changement d'onglet pour lire un trait). `useContentTabQuery(tabKey)` (déjà route-agnostique) et `RefLink.vue`/`utils/contentRoutes.js` `contentBasePath(route)` (résout `/admin`, `/view/:code` ou `/player` selon `route.name`) permettent à ces composants partagés de fonctionner identiquement dans les deux contextes de route.
│   │   │                      # PlayerCommandPalette.vue : équivalent joueur de CommandPalette.vue (MJ) — recherche globale (bouton loupe dans l'en-tête de PlayerInboxView, masqué en mode démo). Sorts/Objets recherchés côté serveur (`/api/spells/public/search`, `/api/magic-items/public/search`) ; Races/Classes/Origines/Aptitudes/Services filtrés localement sur des catalogues chargés une fois à l'ouverture et mis en cache au niveau du module (`composables/usePlayerContentCatalogs.js`) ; États via `useConditions.js`. Sélectionner un résultat pousse `{ tab, query: q, slug }` dans l'URL courante (mêmes clés que `useContentTabQuery`), pas de navigation vers `/admin/...`
│   │   ├── components/AppIcon.vue  # Composant icônes dynamiques (remplace les emojis statiques)
│   │   ├── components/LinkedText.vue, RefLink.vue  # Voir ClassSearch / RaceSearch / BackgroundSearch / AbilitySearch (sorts/aptitudes/glossaire) ci-dessus
│   │   ├── components/ContentSheetView.vue  # Rendu générique d'une fiche de contenu (spell/item/race/background/ability/service/condition — jamais class), partagé entre `tv/TvContent.vue` (prop `variant="tv"`, grande police) et `player/MessageCard.vue` (`variant="compact"`, branche `message.type === 'content'`) ; `item` est l'objet brut déjà chargé côté client (aucun fetch propre), voir `admin/ContentActionButtons.vue`
│   │   ├── components/admin/ContentActionButtons.vue  # Boutons « TV » / « Envoyer à un joueur » ajoutés au pied de chaque carte des 7 onglets Contenu (Sorts/Objets/Objets magiques/Races/Origines/Aptitudes/Services/États — PAS Classes, fiche trop volumineuse). « TV » émet `show-content` avec l'objet déjà en mémoire ; « Envoyer » ouvre un petit picker (joueur ou tous) et réutilise directement `send-message` avec `type: 'content'`, `content` = JSON `{ contentType, item }`. Masqué (`v-if="!playerMode"`) quand ces mêmes composants sont réutilisés côté écran joueur (voir components/player/ ci-dessus) — actions MJ uniquement
│   │   ├── components/ReleaseNotesBell.vue  # Cloche de notification (prop role="admin"|"player")
│   │   ├── components/ReleaseNotesModal.vue # Modal release notes (Teleport+Transition, filtre par rôle)
│   │   ├── stores/    # Pinia stores (auth.js, session.js, releaseNotes.js)
│   │   ├── router/    # Vue Router (toutes les vues importées statiquement) — routes `/admin/:tab?` (nom `admin`), `/view/:code/:tab?` (nom `player-view`), `/player/:tab?` (nom `player-self`), `/tv/:code` : le paramètre `:tab` pilote directement l'onglet affiché (map tabKey→composant existante dans AdminView/PlayerInboxView), pas de sous-routes ni de lazy-loading. Garde `beforeEach` : décode le JWT (`utils/jwt.js` `isTokenExpired`) avant toute route `meta.requiresAuth` et redirige vers `/?expired=1` si absent/expiré (voir section Authentification)
│   │   ├── composables/  # useMapUpload.js, useContentTabQuery.js (synchronise un onglet "Contenu" avec sa query string ; route-agnostique — fonctionne aussi bien sous /admin/:tab que /view/:code/:tab ou /player/:tab, voir composants admin/*Search.vue), useConditions.js (fusionne utils/conditions.js et GET /api/conditions/public, cache module-level partagé — voir PlayerList.vue/TvCombat.vue/PlayerCombatTab.vue), usePlayerContentCatalogs.js (catalogues Races/Classes/Origines/Aptitudes/Services chargés une fois et mis en cache au niveau du module, utilisé par PlayerCommandPalette.vue pour la recherche globale)
│   │   ├── utils/     # Utilitaires (conditions.js, playerProfiles.js, playerSessionMemory.js, themePreferences.js, generatorUtils.js, mapGrid.js, jwt.js, apiFetch.js, textLinker.js, glossary.js, slugify.js, defensiveTraits.js, contentRoutes.js)
│   │   │              # contentRoutes.js `contentBasePath(route)` : préfixe de route pour la navigation interne au contenu (RefLink.vue, onDescClick des spans data-condition-slug/data-spell-slug, boutons "Voir les sorts de cette classe"/"Voir la classe") — `/admin`, `/view/:code` ou `/player` selon `route.name`, nécessaire car les composants admin/*Search.vue sont désormais partagés avec l'écran joueur (voir components/player/ ci-dessus)
│   │   │                      # defensiveTraits.js : `getDefensiveSummary(traitsData, {race, dndClass, subclass})` — combine les entrées de GET /api/defensive-traits pour une race/classe/sous-classe de joueur (slugify() de chaque nom pour matcher les clés du fichier curé ; une race/classe/sous-classe personnalisée ne matche simplement rien). Utilisé par PlayerList.vue (badges résistances/immunités/sens dans l'écran Joueurs du MJ)
│   │   │                      # textLinker.js : détection de mentions de sorts/aptitudes/glossaire de règles dans un texte (voir LinkedText.vue et le glossaire de règles ci-dessus) ; glossary.js : données du glossaire (`RULE_TERMS`/`CONCEPT_TERMS`, paraphrases courtes, jamais de copie verbatim du PHB/SRD) ; slugify.js doit rester identique à la fonction slugify() de backend/src/routes/classes.js (même algorithme de génération d'id d'aptitude, dupliqué côté client pour éviter un appel API supplémentaire)
│   │   │                      #   textLinker.js `renderContentHtml(entry, { internalizeSpells })` : point d'entrée unique pour rendre `description_html`/`description` d'un sort ou objet magique (`aidedd_spells.json`/`aidedd_magic_items.json`, 823 entrées au total) — remplace les fonctions `toHtml()`/`descriptionHtml()` dupliquées dans SpellSearch.vue/ItemSearch.vue/SpellSearchTool.vue/MagicItemSearchTool.vue/ContentSheetView.vue. Compose `normalizeDescriptionHtml()` (aucune de ces entrées n'a de `<p>`/`<br>` dans son HTML brut — seulement des lignes vides entre paragraphes et des puces `• texte`, qui se réduisent sinon à un bloc de texte illisible au rendu HTML par défaut ; reconstruit `<p>`/`<ul><li>`, jamais autour d'un `<table>` déjà présent, no-op si le HTML contient déjà `<p>`/`<ul>`/`<ol>`) puis `highlightGlossaryHtml()` puis, si `internalizeSpells: true` (objets magiques uniquement — vérifié qu'aucun sort ne référence un autre sort dans sa description), `internalizeSpellLinks()` : convertit les liens `<a href="https://www.aidedd.org/dnd/sorts.php?vf=SLUG">` (le slug de l'URL est garanti identique au `slug` de `aidedd_spells.json`, même source de scraping) en `<span class="spell-ref-term" data-spell-slug data-spell-name">`, même mécanisme que `data-condition-slug` (délégation de clic côté composant admin vers `/admin/spells`, span non-navigable côté outils joueur)
│   │   │                      # mapGrid.js : géométrie partagée pour la grille (getCellAt, getCellPolygon) — utilisé par MapManager ET TvView
│   │   │                      #   paramètres cellW/cellH optionnels (taille de cellule normalisée, détection auto) — null = cellule dérivée de cols/rows
│   │   │                      # apiFetch.js : wrapper fetch pour tout appel admin authentifié (Authorization: Bearer) — sur 401, déconnecte et redirige vers `/?expired=1`. À utiliser à la place de `fetch(`${BACKEND_URL}...`)` direct dès qu'un header Authorization est envoyé
│   │   └── socket.js  # Singleton Socket.IO client
├── backend/           # Node.js + Express + Socket.IO (port 3000)
│   ├── src/
│   │   ├── index.js       # Point d'entrée Express + Socket.IO
│   │   ├── socket.js      # Tous les handlers Socket.IO
│   │   ├── migrations.js  # Migrations SQL (PostgreSQL) — exécutées au démarrage
│   │   ├── demo.js        # Compte démo : seed, reset nocturne, scheduler (code 0000 réservé)
│   │   ├── db.js          # Pool PostgreSQL (pg, max 20 connexions)
│   │   ├── middleware/auth.js  # Vérification JWT (HS256 explicite)
│   │   ├── gridDetection.js    # Détection auto de grille (carrée/hex) sur les battlemaps via sharp
│   │   │                       # (projections de gradients écrêtés + passe-haut médian + binarisation + autocorrélation/somme harmonique ;
│   │   │                       #  ratio périodes X/Y : 1 = carrée, √3 = hex flat, 1/√3 = hex pointy)
│   │   │                       # Taille de cellule détectée stockée dans grid_cell_w/h (découplée de cols/rows → gère marges et grilles partielles)
│   │   │                       # Étendue détectée : cols/rows et offsets bornés aux lignes réellement présentes (combExtent + énergie des bandes
│   │   │                       #   de bord pour distinguer cellule partielle coupée vs marge vide ; hex : trimHexExtent par énergie de colonne/ligne)
│   │   │                       # Offset hex : recalage 2D du gradient le long des arêtes du maillage candidat (fitHexOffset)
│   │   │                       # Exécutée à l'upload (type='map') et via POST .../detect-grid
│   │   │                       # Fixtures d'entraînement : backend/test/grid-fixtures/ ; CLI : scripts/detect-grid.js, scripts/grid-overlay.js
│   │   ├── data/          # Fichiers JSON de données statiques
│   │   │   ├── aidedd_spells.json        # 477 sorts D&D 5e en français
│   │   │   ├── aidedd_magic_items.json   # Objets magiques D&D 5e
│   │   │   ├── release-notes.json        # Notes de version (triées plus récentes en premier)
│   │   │   ├── aidedd_standard_items.json # 169 objets standard D&D 5e — inclut outils (instruments de musique, outils d'artisan, kits) et montures/véhicules/bateaux complétés depuis aidedd.org/regles/equipement/outils/ et /montures-et-marchandises/ (hors table « Marchandises », non modélisée). Le champ `detail_url` de ces objets ajoutés pointe vers la page de règles source (`/regles/equipement/...`) plutôt qu'une fiche `equipement.php?vf=...` dédiée — **ces fiches individuelles n'existent plus du tout sur aidedd.org** (route `equipement.php` entièrement 404, vérifié sur des objets pré-existants comme « Gourdin » — probable restructuration du site après le scraping initial ; `sorts.php`, `om.php` et `monstres.php` fonctionnent toujours). Le « Voir sur AideDD » de TOUS les objets standard existants (armes/armures incluses) pointe donc vers un lien mort — bug préexistant, non corrigé ici (corriger nécessiterait de ré-scraper `detail_url` pour les 169 entrées vers une page réellement valide, hors scope de cet ajout). Éléphant/Molosse (nouvelles montures) pointent vers leur fiche `monstres.php?vf=...` (toujours valide, stats de créature complètes)
│   │   │   ├── dnd_races.json            # 9 races jouables PHB 2014 en français (source aidedd.org), avec sous-races
│   │   │   ├── dnd_classes.json          # 12 classes PHB 2014 + Artificier (Tasha's) en français (source aidedd.org) : progression niveau par niveau 1-20, table d'emplacements de sorts pour les lanceurs, sous-classes avec traits par niveau. Certaines features/traits portent un champ `options` (array `{name, description}`) pour les listes de choix optionnelles : Métamagie (Ensorceleur, 8), Manifestations occultes (Occultiste, 32 — invocations avec prérequis inclus dans la description), Disciple martial (Guerrier/Maître de guerre, 16 manœuvres), Style de combat (Guerrier 6 / Paladin 4 / Rôdeur 4 — listes différentes par classe, pas un seul style de combat partagé). Toutes les descriptions (features de base + traits de sous-classe, 334 entrées) sont des paraphrases complètes — jamais de copie verbatim du PHB/aidedd (contrainte de copyright), mais chaque détail mécanique (coûts, dés, DD, dégâts, portées, durées, prérequis) doit être conservé ; une description qui ne garde que le flavor text sans la règle chiffrée est un bug, pas un style acceptable. Les sous-classes qui donnent un accès à des sorts supplémentaires ont un premier trait dédié (« Sorts de serment » pour le Paladin, « Sorts de domaine » pour le Clerc, « Liste de sorts étendue » pour l'Occultiste, « Sorts de cercle »/« Sorts d'alchimiste »/etc. pour Druide/Artificier) listant les noms exacts de sorts par niveau — noms vérifiés un par un contre `aidedd_spells.json` pour garantir que le lien+tooltip vers la fiche de sort fonctionne. Ce trait manque encore sur 5 domaines de Clerc (Domaine de la protection, de l'union, de la tombe, de l'ordre, du crépuscule) : leur identité réelle vis-à-vis des domaines officiels n'a pas pu être confirmée avec assez de certitude pour éviter d'inventer une liste de sorts erronée — à compléter après recherche manuelle plutôt que deviner
│   │   │   └── dnd_backgrounds.json      # 13 origines PHB 2014 en français (source aidedd.org) : compétences/outils/langues, équipement de départ, capacité, tables de personnalité (traits/idéaux/liens/défauts)
│   │   └── routes/        # auth, sessions, uploads, spells, magic-items, equipment, races, classes, backgrounds, generate, release-notes, puzzles
│   │                      # races: GET /api/races (liste complète), GET /api/races/search?q=... (filtre nom/traits/sous-races/bonus, insensible aux accents côté client, sous-chaîne côté serveur), GET /api/races/public (public, sans auth — nom + slug uniquement, sans les descriptions ; utilisé par PlayerJoinView pour peupler le select race), GET /api/races/public/full (public, sans auth, fiches complètes — utilisé par l'onglet Races de l'écran joueur, voir `frontend/src/components/player/RaceSearchTool.vue`)
│   │                      # classes: GET /api/classes (liste complète), GET /api/classes/search?q=... (filtre nom/caractéristique clé/traits/sous-classes, même pattern que races ; ajoute `matchedTrait` sur chaque résultat quand le match provient d'un trait de classe/sous-classe précis, pour l'aperçu dans CommandPalette), GET /api/classes/public (public, sans auth — nom + slug + noms de sous-classes uniquement, sans les descriptions ; utilisé par PlayerJoinView pour peupler les selects classe/sous-classe), GET /api/classes/public/full (public, sans auth, fiches complètes — onglet Classes de l'écran joueur), GET /api/classes/abilities/public (public, sans auth — onglet Aptitudes de l'écran joueur)
│   │                      # defensive-traits: GET /api/defensive-traits (résumé résistances/immunités/sens permanents et inconditionnels par race et par classe/sous-classe, curé à la main dans backend/src/data/dnd_defensive_traits.json — volontairement exclu tout trait temporaire/activé « en rage », « pendant 1 minute », etc., car les joueurs n'ont pas de niveau de personnage suivi ; consommé par PlayerList.vue via `frontend/src/utils/defensiveTraits.js` `getDefensiveSummary()`)
│   │                      # classes: GET /api/classes/abilities (aplatit features de classe + traits de sous-classe + leurs `options` en liste unique « aptitudes », chaque entrée avec un `id` synthétique `classSlug__subclassSlug__nameSlug[__optionSlug]` et une référence `classSlug`/`classDetailUrl` vers la classe d'origine), GET /api/classes/abilities/search?q=... (même filtre : nom/description/classe/sous-classe)
│   │                      # backgrounds: GET /api/backgrounds (liste complète), GET /api/backgrounds/search?q=... (filtre nom/compétences/outils/capacité/tables de personnalité, même pattern que races), GET /api/backgrounds/public (public, sans auth, fiches complètes — onglet Origines de l'écran joueur)
│   │                      # services: GET /api/services (liste complète), GET /api/services/search?q=..., GET /api/services/public (public, sans auth, fiches complètes — onglet Services de l'écran joueur)
│   │                      # conditions: GET /api/conditions (auth admin, liste complète des 15 états, utilisé par ConditionSearch.vue), GET /api/conditions/search?q=..., GET /api/conditions/public (public, sans auth, champs complets — contenu de règles non sensible ; consommé par `frontend/src/composables/useConditions.js`, source unique fusionnée avec la config icône/couleur de `frontend/src/utils/conditions.js` pour les badges d'état de PlayerList.vue/TvCombat.vue/PlayerCombatTab.vue, et par l'onglet États de l'écran joueur)
│   │                      # spells: GET /api/spells (liste complète des 477 sorts, triée alphabétiquement, sans troncature — utilisé par le mode parcours paginé de SpellSearch), GET /api/spells/by-class/:className (liste complète des sorts d'une classe, sans troncature à 50 — utilisé par le bouton « Voir les sorts » de ClassSearch), GET /api/spells/public (public, sans auth, mêmes données — utilisé par SpellSearch.vue en `player-mode`), GET /api/spells/public/by-class/:className (idem, pour ClassSearch.vue en `player-mode`)
│   │                      # magic-items: GET /api/magic-items (liste complète fusionnée objets standards + magiques, triée alphabétiquement, sans troncature — utilisé par le mode parcours paginé d'ItemSearch, filtré côté client par `source_category`), GET /api/magic-items/search?q=... (troncature à 80 résultats), GET /api/magic-items/public (public, sans auth, mêmes données — utilisé par ItemSearch.vue en `player-mode`)
│   │                      # uploads: POST /api/uploads (images, 50MB), POST /api/uploads/audio (audio, 150MB), POST /api/uploads/video (vidéos MP4/WebM/OGG/MOV/MKV/M4V, 500MB — enregistre type='video')
│   │                      # uploads: POST /api/uploads/puzzle (HTML, 5MB) — enregistre type='puzzle' dans session_images
│   │                      # puzzles: GET /api/puzzles/serve/:imageId?seed=SEED (public, sans auth) — sert le HTML avec PRNG injecté
│   │                      # release-notes: GET /api/release-notes (public, sans auth)
│   │                      # sessions: GET/DELETE/PATCH /api/sessions/:id/images/:imageId
│   │                      # sessions: POST /api/sessions/:id/images/:imageId/detect-grid — relance la détection auto de grille et persiste le résultat
│   │                      # sessions: GET /api/sessions/:id/journal (résumé IA : durée calculée entre premier et dernier événement, 0 si journal vide)
│   │                      # sessions: DELETE /api/sessions/:id/journal (efface tous les session_events)
│   │                      # (+ GET /api/sessions/:id/players pour sync Obsidian)
├── obsidian-plugin/   # Plugin Obsidian (TypeScript) — sync Initiative Tracker ↔ DM Toolkit
├── e2e/               # Tests Playwright (TypeScript) — specs dans e2e/specs/, page objects dans e2e/page-objects/
│   ├── fixtures/      # Worker-level isolation : adminToken, _reset (nettoyage DB entre tests)
│   ├── helpers/       # createSession, joinAsPlayer, loginAsAdmin
│   └── page-objects/  # AdminPage, TvPage, PlayerPage
├── docker-compose.yml     # Postgres 16 + backend + frontend
└── docker-compose.prod.yml
```

---

## Commandes de validation

```bash
# Frontend — tests unitaires (Vitest) + build Vite
cd frontend && npm test && npm run build

# Backend — vérification syntaxique Node.js (pas de tests automatisés)
cd backend && node --check src/index.js src/socket.js src/routes/spells.js src/routes/sessions.js src/routes/equipment.js src/routes/races.js src/routes/classes.js src/routes/backgrounds.js src/routes/magic-items.js src/routes/generate.js src/routes/release-notes.js src/demo.js src/migrations.js

# E2E — tests Playwright (nécessite stack Docker démarrée)
cd e2e && npx playwright test

# Dev local (sans Docker)
cd backend && npm run dev   # node --watch src/index.js
cd frontend && npm run dev  # vite dev server
```

---

## Stack technique

| Couche | Technologie | Version |
|---|---|---|
| Frontend framework | Vue 3 (`<script setup>`) | ^3.5 |
| Frontend build | Vite | ^8.0 |
| Frontend state | Pinia | via `stores/` |
| Frontend routing | Vue Router 4 | ^4.4 |
| Frontend tests | Vitest | ^4.1 |
| Backend runtime | Node.js | 20 (alpine) |
| Backend framework | Express | ^4.19 |
| Temps réel | Socket.IO | ^4.8 |
| Base de données | PostgreSQL | 16 |
| Authentification | JWT (jsonwebtoken) | ^9.0 |
| Hachage | bcrypt | ^5.1 |
| Upload fichiers | multer | ^2.1 |
| Traitement images | sharp | ^0.34 |
| QR Code | qrcode | ^1.5 |

---

## Authentification

- **Backend** : JWT signé avec `process.env.JWT_SECRET`. Le token est envoyé dans le header `Authorization: Bearer <token>`. `middleware/auth.js` renvoie `401` (pas `403`) pour un token absent/invalide/expiré — `403` reste réservé aux erreurs métier (ex. : session pas la vôtre dans `routes/uploads.js`), pour que le frontend puisse distinguer "reconnecte-toi" de "action refusée".
- **Admin par défaut** : créé au démarrage si absent (`username=admin`, mot de passe dans l'env).
- **Socket.IO** : le token JWT est passé via `socket.handshake.auth.token`. Le middleware socket vérifie le token et positionne `socket.admin` si valide. Les joueurs n'ont pas de token, ils s'authentifient uniquement via leur nom dans la session.
- **Frontend** : `getSocket(token)` crée un singleton Socket.IO — le token n'est appliqué qu'à la première création. Utiliser `resetSocket()` avant de créer un nouveau socket avec un token différent (ex. : déconnexion, kick).
- **Garde de route admin** (`router/index.js`) : proactive — décode le payload JWT (`frontend/src/utils/jwt.js` `isTokenExpired()`) avant toute navigation vers une route `meta.requiresAuth` et redirige vers `/?expired=1` si expiré. Réactive — tout appel `apiFetch()` (`frontend/src/utils/apiFetch.js`) qui reçoit un `401` déconnecte et redirige de la même façon ; `AdminView.vue` appelle en plus `GET /api/auth/me` au montage (`verifySession()`) pour détecter un compte admin supprimé côté serveur (réponse `404`). `HomeView.vue` détecte `?expired=1` pour rouvrir le modal de login avec un message.

---

## Base de données — règles importantes

- **Ne jamais modifier le schéma directement.** Toujours ajouter des `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...` à la fin du fichier `backend/src/migrations.js`. Les migrations sont exécutées au démarrage via `runMigrations()`.
- La DB est PostgreSQL 16. Les requêtes utilisent le driver `pg` (pool de connexions dans `db.js`).
- Tables principales : `admins`, `sessions`, `players`, `messages`, `dice_results`, `votes`, `vote_responses`, `session_events`, `merchants`, `merchant_items`, `purchase_requests`, `session_images`, `factions`.
- Table `factions` : `id`, `session_id` (FK sessions ON DELETE CASCADE), `name` (VARCHAR 200), `min_value` (INTEGER, défaut -5), `max_value` (INTEGER, défaut 5), `current_value` (INTEGER, défaut 0), `created_at`. Chaque session peut avoir N factions. Route REST : `GET /api/sessions/:id/factions`.
- Colonnes clés de `sessions` : `tv_mode` (lobby/doom/tension/timescale/vote/image/video/map/merchant/puzzle/reputation/content), `current_map_url`, `map_fog_enabled`, `map_viewport` (JSON), `map_fog_strokes` (JSON, max 500 strokes — mode peinture libre), `map_fog_cells` (JSON array d'indices entiers — cellules révélées en mode grille), `map_tokens` (JSON), `doom_clock_*`, `tension_*`, `current_vote_id`, `current_merchant_id`, `combat_round` (entier), `timer_label` (VARCHAR 200), `timer_end_at` (TIMESTAMP), `lobby_bg_url` (VARCHAR 500, image de fond du lobby TV à 15 % d'opacité), `current_puzzle_image_id` (INTEGER), `current_puzzle_url` (VARCHAR 500), `current_puzzle_seed` (VARCHAR 100), `current_image_label` (VARCHAR 200 : label affiché en overlay top-left sur la TV quand une image est projetée), `current_video_url` (VARCHAR 500 : URL de la vidéo projetée sur la TV en mode `video`), `current_content_type` (VARCHAR 20 : `spell`/`item`/`race`/`background`/`ability`/`service`/`condition` — jamais `class` — fiche de contenu affichée en mode `content`), `current_content_data` (TEXT : JSON de la fiche telle qu'envoyée par l'admin, jamais résolue à nouveau côté serveur, voir `show-content`), `tv_theme` (VARCHAR 10, défaut `dark` : thème clair/sombre de l'écran TV — toujours synchronisé sur le thème de l'admin, pas de switch indépendant côté TV).
- Colonnes `timescale_*` de `sessions` : `timescale_title` (VARCHAR 200), `timescale_total_hours` (INTEGER, ex: 24), `timescale_slot_count` (INTEGER, nb de paliers), `timescale_rest_slots` (INTEGER, durée du repos long en paliers), `timescale_elapsed_slots` (INTEGER, paliers écoulés), `timescale_rest_taken` (BOOLEAN, défaut FALSE : indique si le repos long a déjà été pris). Toutes nullable ; si `timescale_title` est NULL l'échelle est inactive.
- Colonnes clés de `session_images` : `url`, `original_name` (nom d'affichage, renommable), `type` (`image` / `map` / `audio` / `video` / `puzzle`), `audio_category` (VARCHAR 50 : catégorie libre assignée par l'IA (GPT-4o-mini via GitHub Models) au moment de l'upload ; défaut `Général` si GITHUB_TOKEN absent ou si l'IA échoue ; l'admin peut saisir/modifier librement depuis l'AudioManager), `thumbnail_url` (VARCHAR 500 : URL du WebP 400px généré par `sharp` après upload pour les types `image` et `map` — null pour les fichiers audio ou si la génération échoue ; les galeries admin utilisent cette URL avec fallback sur `url`), `tv_label` (VARCHAR 200 : label optionnel affiché en overlay top-left sur la TV lors de la projection — saisie inline dans l'ImageManager, sauvegardé via PATCH), `grid_type` (VARCHAR 10 : `none` / `square` / `hex` — type de grille configuré sur la carte ; rempli automatiquement à l'upload des `type='map'` par `gridDetection.js`, re-calculable via POST `/api/sessions/:id/images/:imageId/detect-grid`), `grid_cols` (INTEGER), `grid_rows` (INTEGER), `grid_hex_orientation` (VARCHAR 10 : `flat` / `pointy`), `grid_offset_x` (REAL), `grid_offset_y` (REAL), `grid_cell_w` (REAL : largeur d'une cellule normalisée en fraction de l'image — null = dérivée de grid_cols), `grid_cell_h` (REAL : hauteur d'une cellule normalisée — null = dérivée de grid_rows). Quand `grid_cell_w/h` sont non-null (détection auto), la géométrie de la grille est découplée de cols/rows — qui ne définissent plus que l'espace d'indices — ce qui permet l'alignement sur les cartes à marges ou recadrées ; toute modification manuelle du type/cols/rows/orientation dans MapGridConfig les remet à null (retour au mode « la grille divise exactement l'image »).
- Colonnes clés de `messages` : `session_id`, `from_name` (VARCHAR), `to_player_id` (FK players, nullable — NULL = tous), `from_player_id` (FK players ON DELETE SET NULL, nullable — non-NULL = message joueur → MJ), `type` (`text`/`image`/`gold`/`player`/`content` — ce dernier : `content` est un JSON `{ contentType, item }` produit par `ContentActionButtons.vue`, jamais résolu à nouveau côté serveur), `content`, `voice_style`, `text_effect`, `author_color`.
- Colonnes clés de `players` : `ac`, `max_hp`, `current_hp`, `initiative`, `conditions` (JSON array), `is_concentrating`, `dnd_class`, `race` (VARCHAR 100 : choisie au login parmi la liste de contenu ou saisie libre), `subclass` (VARCHAR 100 : proposée uniquement si `dnd_class` est une classe connue avec des sous-classes ; vide, connue ou saisie libre), `avatar_url`, `socket_id`.
- Les joueurs sont supprimés de la DB à la déconnexion socket (`disconnect`/`leave-session`).
- Les codes de session sont sur **4 chiffres numériques** (migration automatique des anciens codes).
- Le code `0000` est **réservé** à la session de démonstration du compte `demo` — il n'est jamais généré par la logique normale (qui génère entre 1000 et 9999).
- La colonne `admins.is_demo` (BOOLEAN) identifie le compte de démonstration. Son contenu est effacé et re-seedé chaque nuit à minuit via `backend/src/demo.js`.

---

## Architecture Socket.IO

### Rooms (namespaces de salle)
- `session:<sessionId>` — tous les joueurs d'une session
- `admin:<sessionId>` — l'admin de la session
- `tv:<sessionId>` — le(s) écran(s) TV de la session

### Événements entrants (client → serveur)

#### Joueurs
| Événement | Description |
|---|---|
| `join-session` | Rejoindre une session (code, playerName, ac, hp, maxHp, dndClass, race, subclass, avatarUrl) |
| `leave-session` | Quitter la session |
| `update-hp` | Mettre à jour les PV courants |
| `update-max-hp` | Mettre à jour les PV max |
| `update-conditions` | Mettre à jour les conditions |
| `update-concentration` | Basculer la concentration |
| `update-initiative` | Mettre à jour l'initiative |
| `player-roll` | Envoyer un jet de dé effectué par le joueur (résultat transmis à l'admin) |
| `player-send-message` | Envoyer un message secret au MJ (`{ content }`) |
| `submit-vote` | Voter pour une option |
| `request-purchase` | Demander l'achat d'un objet (legacy) |
| `request-batch-purchase` | Demander l'achat d'un panier d'objets |
| `respond-counter-offer` | Accepter/refuser une contre-offre |

#### TV
| Événement | Description |
|---|---|
| `tv-join` | Rejoindre la room TV (`{ sessionCode }`) — reçoit le snapshot TV |

#### Admin (nécessite `socket.admin`)
| Événement | Description |
|---|---|
| `admin-join` | Rejoindre la room admin + recevoir le snapshot |
| `set-tv-mode` | Changer le mode TV |
| `start-doom-clock` | Démarrer l'horloge de doom |
| `stop-doom-clock` | Arrêter l'horloge de doom |
| `create-tension-scale` | Créer une échelle de tension |
| `increment-tension-scale` | Avancer/reculer l'échelle de tension (`{ sessionId, delta }` — delta entier signé, borné à [-20, 20], défaut 1) |
| `end-tension-scale` | Terminer l'échelle de tension |
| `create-vote` | Créer un vote |
| `close-vote` | Fermer un vote |
| `show-image` | Afficher une image sur le TV |
| `show-video` | Afficher une vidéo sur le TV (`{ sessionId, videoUrl }`) — passe tv_mode à 'video' |
| `video-control` | Synchroniser la lecture vidéo vers la TV (`{ sessionId, videoUrl, action: 'play'\|'pause'\|'seek', time }`) — relayé à la TV **uniquement** si cette vidéo est celle projetée (tv_mode='video' et current_video_url correspond), sinon ignoré |
| `set-lobby-bg` | Définir/effacer l'image de fond du lobby (`{ sessionId, imageUrl: string\|null }`) |
| `set-tv-theme` | Synchroniser le thème clair/sombre de la TV sur celui de l'admin (`{ sessionId, theme: 'light'\|'dark' }`) — la TV n'a pas de switch indépendant |
| `show-map` | Afficher une battlemap sur le TV |
| `show-content` | Afficher une fiche de contenu sur la TV (`{ sessionId, contentType, contentData }` — `contentType` ∈ spell/item/race/background/ability/service/condition, jamais class ; `contentData` est l'objet déjà chargé côté client par le composant de recherche appelant, stocké et relayé tel quel, jamais résolu côté serveur) |
| `map-set-fog` | Activer/désactiver le brouillard |
| `map-viewport-update` | Mettre à jour la vue de la map |
| `map-fog-clear` | Révéler des zones (ajout de strokes) |
| `map-fog-reset` | Réinitialiser le brouillard |
| `map-token-move` | Déplacer un token de joueur |
| `map-token-remove` | Retirer un token de joueur |
| `map-sync-grid` | Synchroniser la config de grille vers la TV après sauvegarde (`{ sessionId, gridType, gridCols, gridRows, gridHexOrientation, gridOffsetX, gridOffsetY, gridCellW, gridCellH }`) — relayé via `map-grid-updated` |
| `send-message` | Envoyer un message à un ou tous les joueurs |
| `send-dice-result` | Envoyer un résultat de jet de dé |
| `send-gold-split` | Envoyer une répartition d'or entre joueurs |
| `create-merchant` | Créer un marchand |
| `show-merchant` | Afficher le marchand sur le TV |
| `close-merchant` | Fermer le marchand |
| `delete-merchant` | Supprimer définitivement un marchand |
| `respond-purchase` | Répondre à une demande d'achat (legacy) |
| `respond-batch-purchase` | Répondre à un panier d'achat |
| `set-combat-round` | Définir le round de combat courant |
| `start-timer` | Démarrer un timer (`{ sessionId, label, durationSeconds }`) |
| `stop-timer` | Arrêter le timer actif |
| `kick-player` | Expulser un joueur |
| `obsidian-sync-initiatives` | Sync depuis Obsidian Initiative Tracker — met à jour les initiatives en masse par nom de joueur (`{ sessionId, updates: [{playerName, initiative}] }`) |
| `admin-update-hp` | Met à jour les PV d'un joueur par nom (pour sync Obsidian) — `{ sessionId, playerName, currentHp }` |
| `obsidian-play-audio` | Déclenche la lecture d'une piste audio depuis Obsidian — `{ sessionId, trackId }` — relayé à l'admin via `audio-play-requested` |
| `obsidian-stop-audio` | Arrête une piste audio depuis Obsidian — `{ sessionId, trackId }` — relayé via `audio-stop-requested` |
| `obsidian-loop-audio` | Active/désactive la boucle d'une piste depuis Obsidian — `{ sessionId, trackId, loop: boolean }` — relayé via `audio-loop-requested` |
| `obsidian-volume-audio` | Règle le volume d'une piste depuis Obsidian — `{ sessionId, trackId, volume: 0..1 }` — relayé via `audio-volume-requested` |
| `create-time-scale` | Créer une échelle temporelle (`{ sessionId, title, totalHours, slotCount, restSlots }`) — passe tv_mode à 'timescale' |
| `advance-time-scale` | Avancer d'un palier (`{ sessionId }`) |
| `long-rest-time-scale` | Prendre un repos long (`{ sessionId }`) — avance de restSlots paliers |
| `end-time-scale` | Terminer l'échelle de temps (`{ sessionId }`) |
| `show-puzzle` | Afficher un puzzle HTML sur le TV et chez les joueurs (`{ sessionId, imageId }`) — génère un seed aléatoire |
| `close-puzzle` | Fermer le puzzle actif (`{ sessionId }`) — retour en mode lobby |
| `map-fog-cell-reveal` | Révéler des cellules de grille (`{ sessionId, cells: [idx] }`) — mode grille uniquement |
| `map-fog-cells-reset` | Réinitialiser toutes les cellules révélées (`{ sessionId }`) — mode grille uniquement |
| `create-faction` | Créer une faction (`{ sessionId, name, minValue, maxValue, initialValue }`) |
| `update-faction-value` | Modifier la réputation d'une faction (`{ sessionId, factionId, delta }`) |
| `delete-faction` | Supprimer une faction (`{ sessionId, factionId }`) |
| `show-reputation` | Projeter les réputations sur la TV (`{ sessionId }`) — passe tv_mode à 'reputation' |

#### Joueurs (puzzle)
| Événement | Description |
|---|---|
| `puzzle-click` | Clic d'un joueur sur le puzzle (`{ sessionId, path: number[] }`) — chemin DOM par indices enfant |

### Événements sortants (serveur → client)

| Événement | Cible | Description |
|---|---|---|
| `session-joined` | joueur | Confirmation de connexion à la session |
| `players-snapshot` | admin | Liste initiale des joueurs |
| `admin-state` | admin | État complet de la session (TV mode, doom clock, etc.) |
| `tv-snapshot` | TV | État complet pour l'écran TV (inclut `currentImageLabel` quand une image est active) |
| `player-joined` | admin + TV | Un joueur a rejoint |
| `player-left` | admin + TV | Un joueur a quitté/été expulsé |
| `hp-updated` | admin + TV | Mise à jour des PV (courants ou max) |
| `hp-update-confirmed` | joueur | Confirmation mise à jour PV courants |
| `max-hp-update-confirmed` | joueur | Confirmation mise à jour PV max |
| `conditions-updated` | admin + TV | Mise à jour des conditions |
| `concentration-updated` | admin + TV | Mise à jour de la concentration |
| `concentration-confirmed` | joueur | Confirmation bascule de concentration |
| `concentration-warning` | joueur | Alerte jet de sauvegarde de concentration |
| `initiative-updated` | admin + TV | Mise à jour de l'initiative |
| `initiative-confirmed` | joueur | Confirmation mise à jour initiative |
| `player-roll-result` | admin | Résultat d'un jet de dé effectué côté joueur |
| `player-roll-confirmed` | joueur | Confirmation du jet de dé (visible) |
| `player-roll-hidden-sent` | joueur | Confirmation du jet de dé masqué envoyé à l'admin |
| `player-message` | admin | Message secret d'un joueur — `{ playerName, playerId, content, sentAt }` |
| `player-message-sent` | joueur | Confirmation que le message secret a été envoyé au MJ |
| `tv-mode-changed` | TV + admin | Changement de mode TV (pour `image` : inclut `imageUrl` et `imageLabel` ; pour `video` : inclut `videoUrl` ; pour `content` : inclut `contentType` et `contentData`) |
| `video-control` | TV | Commande de lecture vidéo relayée depuis l'admin (`{ action: 'play'\|'pause'\|'seek', time }`) — appliquée par TvVideo |
| `doom-clock-started` | TV + admin | Démarrage de l'horloge doom |
| `doom-clock-stopped` | TV + admin | Arrêt de l'horloge doom |
| `tension-scale-updated` | TV + admin | Mise à jour de l'échelle de tension |
| `tension-scale-ended` | TV + admin | Fin de l'échelle de tension |
| `round-updated` | TV + admin | Round de combat mis à jour |
| `timer-updated` | TV + admin | Données du timer actif |
| `timer-stopped` | TV + admin | Timer arrêté |
| `lobby-bg-updated` | TV + admin | Image de fond du lobby mise à jour (`{ url: string\|null }`) |
| `tv-theme-updated` | TV | Thème de la TV mis à jour pour suivre celui de l'admin (`{ theme: 'light'\|'dark' }`) |
| `vote-started` | TV + session + admin | Vote démarré |
| `vote-updated` | TV + admin | Mise à jour des résultats du vote |
| `vote-closed` | TV + session + admin | Vote fermé |
| `vote-submitted` | joueur | Confirmation de vote |
| `vote-error` | joueur | Erreur de vote |
| `map-state` | TV + admin | État complet de la battlemap |
| `map-fog-updated` | TV + admin | Activation/désactivation du brouillard |
| `map-viewport-changed` | TV | Mise à jour de la vue |
| `map-fog-patch` | TV + admin | Nouvelles strokes de révélation |
| `map-fog-reset` | TV + admin | Réinitialisation du brouillard |
| `map-token-moved` | TV + admin | Token déplacé |
| `map-token-removed` | TV + admin | Token retiré |
| `map-grid-updated` | TV + admin | Config de grille synchronisée (mêmes champs que `map-sync-grid`) |
| `new-message` | joueur(s) | Nouveau message du MJ |
| `dice-result` | joueur(s) | Résultat de jet de dé |
| `session-event` | admin | Événement de session (log) |
| `merchant-created` | admin | Marchand créé |
| `merchant-shown` | session | Marchand affiché aux joueurs |
| `merchant-closed` | session | Marchand fermé |
| `merchant-deleted` | admin | Marchand supprimé définitivement |
| `merchant-updated` | admin | Données marchand mises à jour |
| `merchant-items-updated` | TV + session | Mise à jour des stocks |
| `purchase-request` | admin | Demande d'achat reçue |
| `purchase-requested` | joueur | Confirmation de la demande |
| `purchase-error` | joueur | Erreur d'achat |
| `purchase-counter-offer` | joueur | Contre-offre de l'admin |
| `counter-offer-result` | joueur | Résultat de la contre-offre |
| `counter-offer-response` | admin | Réponse du joueur à la contre-offre |
| `purchase-responded` | admin | Confirmation réponse admin |
| `batch-accepted` | joueur | Panier accepté |
| `batch-rejected` | joueur | Panier refusé |
| `kicked` | joueur | Joueur expulsé |
| `audio-play-requested` | admin | Lecture d'une piste audio déclenchée depuis Obsidian — `{ trackId }` |
| `audio-stop-requested` | admin | Arrêt d'une piste audio déclenché depuis Obsidian — `{ trackId }` |
| `audio-loop-requested` | admin | Changement de boucle déclenché depuis Obsidian — `{ trackId, loop: boolean }` |
| `audio-volume-requested` | admin | Changement de volume déclenché depuis Obsidian — `{ trackId, volume: 0..1 }` |
| `time-scale-updated` | TV + admin | Échelle de temps mise à jour — `{ title, totalHours, slotCount, restSlots, elapsedSlots, slotHours }` |
| `time-scale-ended` | TV + admin | Échelle de temps terminée |
| `puzzle-started` | TV + session + admin | Puzzle affiché — `{ puzzleImageId, puzzleSeed, puzzleClicks: [] }` |
| `puzzle-closed` | TV + session + admin | Puzzle fermé |
| `puzzle-cell-clicked` | TV + session + admin (sauf émetteur) | Clic relayé — `{ path: number[] }` |
| `map-fog-cells-patch` | TV + admin | Nouvelles cellules révélées — `{ cells: [idx] }` |
| `map-fog-cells-reset` | TV + admin | Toutes les cellules redeviennent cachées |
| `faction-created` | admin | Faction créée — `{ faction }` |
| `faction-deleted` | admin | Faction supprimée — `{ factionId }` |
| `factions-updated` | admin + TV | Liste complète des factions mise à jour — `[faction, ...]` |
| `reputation-toast` | TV | Changement de réputation quand tv_mode ≠ 'reputation' — `{ factionName, oldValue, newValue, delta }` |
| `demo-reset` | session + admin + TV | Réinitialisation du compte démo — déclenche `window.location.reload()` côté client |
| `error` | émetteur | Erreur générique |
| `tv-control-error` | admin | Erreur de contrôle TV |
| `send-error` | admin | Erreur d'envoi de message |

---

## Conventions de code

### Frontend
- Vue 3 avec `<script setup>` et Composition API — pas d'Options API
- Pinia pour le state management global (`stores/auth.js`, `stores/session.js`)
- Vue Router 4 — toutes les vues sont importées **statiquement** dans `router/index.js` (pas de lazy-loading), ce qui inclut leur CSS globalement dans le bundle
- Socket.IO via le singleton `getSocket(token)` — **ne jamais créer un `io()` directement**, toujours utiliser `getSocket()` et `resetSocket()` de `frontend/src/socket.js`
- L'URL du backend vient de `import.meta.env.VITE_BACKEND_URL` (fallback `http://localhost:3000`)
- **Bouton d'action primaire** (form-commit standalone en bas de formulaire) : `width: 100%`, `padding: 0.6rem 1rem`, `font-size: 0.8rem`, `background: var(--gradient-accent-action)`, `border: 1px solid var(--color-gold-dark)`. Ne pas appliquer aux boutons inline avec un input (search, select+send), ni aux grilles de contrôles compacts (TvControls, MapManager).
- **`font-family` avec variables CSS** : toujours ajouter `, sans-serif` après le `var()` — ex : `font-family: var(--font-heading), sans-serif;`. Toutes les variables `--font-*` du projet sont `sans-serif`; le fallback générique est requis par la spec CSS et évite les warnings linter.
- **`HelpTip` — bulles d'aide contextuelles** (`components/HelpTip.vue`) : deux modes d'usage. (1) **Badge `?`** : `<HelpTip id="clé" />` — ajoute un petit cercle `?` inline, à utiliser sur des titres/labels (`<h2>`, `<label>`, en-têtes de colonnes). (2) **Slot wrapper** : `<HelpTip id="clé"><button …/></HelpTip>` — la bulle s'affiche au survol/focus du contenu sans ajouter de `?`; à utiliser systématiquement quand le déclencheur est un bouton existant. Ne jamais placer un `<HelpTip>` à côté d'un bouton sans le wrapper (ajoute un `?` superflu et peut casser le layout). Les textes sont dans `frontend/src/utils/helpContent.js`.
- **`GoldDividerTool` — deux modes de répartition** : `exact` (division entière par joueur, reste affiché séparément) et `approximate` (toutes les pièces distribuées — les extras vont aux joueurs avec la valeur cumulée la plus basse, traitées du dénominateur le plus fort au plus faible). Groupement de joueurs disponible pour afficher le total d'un « banquier » avec détail individuel dépliable.
- **Responsive `PlayerInboxView`** — trois breakpoints : `< 640px` mobile (tab bar en bas, layout colonne unique), `640px–1023px` tablette (tab bar en bas, onglet Combat en 2 colonnes CSS grid 3fr/2fr), `≥ 1024px` desktop (sidebar gauche 160px `.sidebar-nav`, tab bar cachée, onglet Combat 2 colonnes). Les items de navigation sont **dupliqués** entre `.sidebar-nav` et `.tab-bar` — toute modification d'un onglet doit être répercutée aux deux endroits. Le shell intermédiaire `.inbox-lower` (flex row sur desktop) contient la sidebar et `.inbox-main` (flex: 1, flex column) qui héberge le puzzle-overlay et le contenu scrollable.

- **`AdminNavSidebar` — onglets verrouillés** : la prop `lockedTabs` est une map `{ [tabKey]: { title, text } }`. Tout onglet présent dans cette map est grisé (`.tab-locked`), non cliquable, et affiche une tooltip flottante (Teleport) avec son `title`/`text` au survol (`text` peut contenir du markup simple comme `<code>`, rendu via `v-html` — contenu défini en dur, jamais une entrée utilisateur). `AdminView` calcule `lockedTabs` : `generator` quand le générateur IA est désactivé, `videos` en mode démo. Pour verrouiller un nouvel onglet, il suffit d'ajouter une entrée à ce computed — ne pas re-coder de cas en dur dans `AdminNavSidebar`.
- **`AdminNavSidebar` — onglets « Contenu » accessibles sans session** : `AdminView` calcule `navGroups` (computed) — sans session active, seul le groupe « Contenu » (Sorts/Objets/Objets magiques/Races/Classes/Origines/Aptitudes, `CONTENT_TABS`) est affiché, les autres groupes nécessitant une session (joueurs, scène TV, trésor…) sont masqués. La sidebar elle-même est toujours montée (plus de `v-if="sessionStore.activeSession"`) ; c'est `navGroups` qui filtre son contenu. La tab bar mobile dérive sa liste de `navGroups` (`visibleTabs`, pas de la prop `tabs` complète) pour rester cohérente avec la sidebar desktop. Dans `.admin-main`, la condition d'affichage du panneau devient `sessionStore.activeSession || isContentTab` (`isContentTab` = `activeTab` ∈ `CONTENT_TABS`). Pour rendre un nouvel onglet accessible sans session, il doit : (1) ne lire/écrire aucun état de session (`sessionStore`, sockets liés à une session), (2) être ajouté à `CONTENT_TABS` dans `AdminView.vue`.
  - `CommandPalette` (Ctrl+K, bouton « Rechercher » dans `AdminHeader`) est aussi utilisable sans session — reçoit `visible-tab-keys` (= `navGroups` aplati) et filtre ses résultats de section (`COMMAND_INDEX`) à ces seules clés, pour ne jamais proposer un raccourci vers un onglet caché (ex: « Joueurs » sans session). La recherche live (sorts/objets/races/classes/origines/aptitudes) reste inchangée : elle ne cible que des endpoints de contenu, toujours accessibles.

### Backend
- CommonJS (`require`/`module.exports`), pas d'ESM
- Pas de framework ORM — requêtes SQL directes via le pool `pg`
- Toutes les modifications de schéma DB passent par `migrations.js` (jamais de DDL manuel)
- Les erreurs dans les handlers socket sont catchées silencieusement avec `console.error(err)` — pattern à respecter
- Validation des entrées via `parseInt`, `Math.max/min`, et constantes de limites définies en haut de `socket.js`

---

## Variables d'environnement

| Variable | Où | Description |
|---|---|---|
| `DATABASE_URL` | backend | URL PostgreSQL |
| `JWT_SECRET` | backend | Clé secrète JWT (obligatoire en prod) |
| `PORT` | backend | Port Express (défaut 3000) |
| `FRONTEND_URL` | backend | URL du frontend pour CORS et QR codes |
| `VITE_BACKEND_URL` | frontend (build) | URL du backend pour le client Socket.IO et fetch |
| `GITHUB_TOKEN` | backend | Token GitHub (classic, aucun scope requis) pour le générateur IA via GitHub Models (gpt-4o-mini). Optionnel — sans ce token, `POST /api/generate` retourne 503. |
| `DEMO_ENABLED` | backend | Met à `false` pour désactiver entièrement le compte démo (défaut : `true`) |
| `DEMO_PASSWORD` | backend | Mot de passe du compte `demo` (défaut : `demo`) |
| `DEMO_SEED_ENABLED` | backend | Met à `false` pour ne pas re-seeder le contenu démo au démarrage (défaut : `true`) |
| `DEMO_FORCE_RESEED` | backend | Met à `true` pour forcer un clean + re-seed complet du contenu démo à chaque démarrage (défaut : `false`) |
| `DEMO_RESET_ENABLED` | backend | Met à `false` pour désactiver le reset nocturne automatique à minuit (défaut : `true`) |

---

## Ce qu'il ne faut pas faire

- ❌ Ne pas modifier le schéma DB autrement qu'en ajoutant des `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` à la fin de `migrations.js`
- ❌ Ne pas créer un nouveau `io()` dans le frontend — utiliser `getSocket()` / `resetSocket()`
- ❌ Ne pas ajouter de lazy-loading dans `router/index.js` sans comprendre l'impact sur le CSS global
- ❌ Ne pas utiliser d'ESM (`import`/`export`) dans le backend (CommonJS uniquement)
- ❌ Ne pas supprimer de colonnes DB existantes (les données en prod seraient perdues)
- ❌ Ne pas hardcoder l'URL du backend dans le frontend (toujours utiliser `VITE_BACKEND_URL`)
- ❌ Ne pas restreindre le CORS à `FRONTEND_URL` uniquement — les origines `app://obsidian.md` et `capacitor://obsidian.md` doivent aussi être autorisées (plugin Obsidian desktop/mobile)
- ❌ Ne pas déplacer les fichiers JSON de données hors de `backend/src/data/` — les routes `spells`, `magic-items` et `equipment` chargent depuis ce dossier
- ❌ Dans un FormData d'upload avatar, toujours appender `sessionCode` **avant** le champ `file` — multer résout le dossier tenant dans `destination()` au moment où le flux fichier arrive ; les champs après le fichier ne sont pas encore dans `req.body`
- ❌ Ne pas utiliser le code de session `0000` pour autre chose que la session démo — il est réservé et ne sera jamais généré par la logique normale
- ❌ Ne pas supprimer ou renommer le compte `demo` dans la DB sans mettre à jour `seedDemoAdmin()` dans `index.js`
- ❌ Ne pas appeler `fetch(`${BACKEND_URL}...`)` directement avec un header `Authorization: Bearer` dans un composant admin — utiliser `apiFetch()` (`frontend/src/utils/apiFetch.js`), qui intercepte les 401 pour déconnecter et rediriger vers le login

---

## Maintenance de la documentation

### Quand mettre à jour ce fichier (CLAUDE.md)

Mettre à jour CLAUDE.md **dans le même commit** que tout changement touchant :

| Ce qui change | Section à mettre à jour |
|---|---|
| Nouveau fichier dans `backend/src/` ou nouvelle route | Architecture du monorepo |
| Nouvel événement Socket.IO (entrant ou sortant) | Architecture Socket.IO |
| Nouvelle table ou colonne DB | Base de données — règles importantes |
| Nouvelle variable d'environnement | Variables d'environnement |
| Nouveau composant Vue majeur dans `components/admin/` | Architecture du monorepo |
| Changement de version d'une dépendance clé | Stack technique |
| Nouvelle règle ou piège découvert | Ce qu'il ne faut pas faire |

### Quand mettre à jour README.md

README.md est orienté utilisateur (installation, fonctionnalités). Mettre à jour si :
- Une nouvelle variable d'environnement est ajoutée
- Une commande de lancement ou de validation change
- Une fonctionnalité majeure est ajoutée ou supprimée

Le hook Stop `.claude/hooks/check-docs.ps1` avertit automatiquement si des fichiers source changent sans mise à jour de la documentation.

<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
| ------ | ---------- |
| `detect_changes` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context` | Need source snippets for review — token-efficient |
| `get_impact_radius` | Understanding blast radius of a change |
| `get_affected_flows` | Finding which execution paths are impacted |
| `query_graph` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Finding functions/classes by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.
