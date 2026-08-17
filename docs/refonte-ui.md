# Refonte UI — plan exhaustif

> Statut : proposition, non implémentée. Rédigé le 2026-08-16 sur la base d'un audit du code
> (`frontend/src`, 29 000 lignes de Vue + CSS, 77 blocs `<style scoped>`).
>
> **Décisions actées (2026-08-16) :** le thème `light` est **supprimé**, 4 thèmes conservés
> (`dark`, `sceau`, `arcane`, `nacre`) · **pas de tests de composant** — Playwright fait
> office de filet · la refonte de navigation (phase 4) est validée **sur maquette d'abord**
> (`docs/maquettes/refonte-ui.html`).

---

## 0. Postulat de conception

Cette application n'est pas un back-office : c'est un **instrument de scène**. Le MJ s'en sert
en direct, dans une pièce sombre, souvent d'une main, pendant qu'il narre, avec des joueurs
qui attendent. Les joueurs s'en servent sur téléphone, en tenant aussi une fiche papier et des
dés. Trois critères priment donc sur l'esthétique :

| Critère | Question opérationnelle |
|---|---|
| **Temps-jusqu'à-l'action** | Combien de secondes entre « il me faut X » et « X est sur la TV » ? |
| **Lisibilité à distance** | Est-ce lisible d'un coup d'œil, à 60 cm, dans une pièce à 50 lux ? |
| **Réversibilité** | Une action diffusée aux joueurs est-elle annulable sans dégâts ? |

« Moderne » découle de ces trois points ; ce n'est pas un objectif en soi.

**Ce qui est déjà bon et ne doit pas être touché** — `TvView` + `components/tv/*` font de la
typographie fluide correcte (`clamp()`, 40+ échelles responsives), `AppIcon` abstrait
proprement Iconify, les onglets sont pilotés par l'URL, `<KeepAlive>` préserve l'état des
onglets, et une palette de commandes (Ctrl+K) existe déjà côté MJ **et** côté joueur. La
refonte propage ces acquis, elle ne les remplace pas.

---

## 1. Diagnostic mesuré

### 1.1 Densité typographique — le problème n°1

| Mesure | Valeur |
|---|---|
| Déclarations `font-size` dans les `.vue` | 648 |
| Valeurs distinctes | **90** |
| Occurrences sous `0.75rem` (12 px) | **165** |
| Plus petite valeur employée | `0.55rem` = **8,8 px** |

`0.55rem` / `0.6rem` / `0.62rem` / `0.65rem` sont utilisés pour des labels de navigation, des
badges d'état et des libellés de formulaire — c'est-à-dire pour du contenu qu'on doit lire vite
et dans la pénombre. C'est l'écart le plus coûteux entre l'app actuelle et l'objectif
« ergonomique ».

### 1.2 Absence de système de design

- **77 blocs `<style scoped>`**, chacun redéfinissant ses boutons, champs, panneaux, badges.
  `.action-btn` est réinventé dans 10 fichiers, `.section-title` dans 13, `.form-input` dans 7,
  `.search-input` dans 5.
- **15 valeurs de `border-radius`** (`2px` → `999px`), **172 valeurs de `padding` distinctes**,
  38 de `gap`. Aucune échelle.
- Le bloc `style.css:668–704` compense l'absence de primitives par **7 `!important`** qui
  forcent, depuis la feuille globale, le style de `.session-card, .player-item, .panel,
  .merchant-item, .spell-card, .message-card` et de tous les champs de formulaire. C'est le
  symptôme le plus net : le système de design existe, mais sous forme de rustine globale.
  (26 `!important` au total dans l'app, dont 4 dans `AdminNavSidebar` seul.)

### 1.3 Architecture de thèmes coûteuse

`style.css` contient **5 palettes quasi complètes** (`dark`, `light`, `sceau`, `arcane`,
`nacre`), ~150 déclarations chacune, soit ~575 lignes de tokens — dont `light`, supprimé par
la refonte, ce qui en laisse 4. Conséquences :

- **Ajouter un token sémantique = 5 éditions.** Rien dans l'architecture ne distingue ce qui
  varie réellement par thème (fonds, encre, accents, teintes sémantiques) de ce qui n'en
  dépend pas (rayons, ombres, échelles) — or les rayons et tailles ne varient déjà **jamais**
  d'un thème à l'autre.
- Le bouton de thème est un **cycle** (`getNextTheme`) : passer de `dark` à `nacre` demande
  4 clics à l'aveugle.
- Un second système de tokens parallèle (`--player-*`, 25 variables) est défini *dans*
  `PlayerInboxView.vue:1510`, hérité par les composants enfants.

### 1.4 Navigation : trop d'entrées, dupliquées

- **MJ : 24 onglets** dans une sidebar plate à 4 groupes. La colonne « Régie TV » (320 px) qui
  indique ce que voient les joueurs disparaît sous 1100 px — l'information la plus critique du
  MJ est la première sacrifiée.
- **Joueur : 15 onglets**, dont **9 sont de la documentation de référence** (Sorts, Objets,
  Objets magiques, Races, Classes, Origines, Aptitudes, Services, États) et non des outils de
  session. Sur mobile ils remplissent une barre d'onglets qui **défile horizontalement** —
  le pire cas d'usage possible pour une barre de navigation.
- Ces 15 entrées sont écrites **deux fois en dur** dans `PlayerInboxView.vue` : une sidebar
  desktop (l. 1014–1110) et une tab bar mobile (l. 1303–1490), soit ~280 lignes de markup
  dupliqué dans un fichier de 2 236 lignes.

### 1.5 Responsive quasi absent

**19 media queries dans toute l'application**, réparties sur 13 des 77 blocs de style. Les
64 autres composants ont une mise en page fixe. Les points de rupture sont ad hoc :
380 / 480 / 640 / 767 / 900 / 1024 / 1100 px.

### 1.6 Accessibilité

| Signal | Occurrences |
|---|---|
| `aria-live` | **0** — dans une app temps réel (toasts de jets, PV, messages, votes) |
| `prefers-reduced-motion` | **0** — alors que `dotPulse` tourne en boucle infinie |
| `aria-expanded` | 0 (menus déroulants, sidebar repliable) |
| Focus trap / `tabindex` | 0, pour ~27 overlays de type dialogue |
| `focus-visible` | 8 déclarations pour ~600 éléments interactifs |
| `min-height: 44px` (cible tactile) | 1 seule occurrence |

### 1.7 Fichiers hors gabarit

`PlayerInboxView.vue` 2 236 l. · `MapManager.vue` 925 · `AudioManager.vue` 911 ·
`ClassSearch.vue` 826 · `TvView.vue` 798 · `SessionManager.vue` 771.
Aucun test de composant n'existe (7 tests d'utilitaires, pas de `@vue/test-utils`) : ces
fichiers ne sont couverts que par l'e2e.

---

## 2. Contraintes non négociables

Reprises de `CLAUDE.md` et des préférences projet — elles cadrent toute la suite :

- ❌ **Aucun framework CSS externe** (Tailwind, Bootstrap…) ni bibliothèque de composants.
  Le système de design est écrit à la main, en CSS natif + custom properties.
- ❌ **Pas de TypeScript.**
- ❌ **Pas de tests de composant** (`@vue/test-utils`) — Playwright est le filet.
- ❌ **Pas de lazy-loading dans `router/index.js`** — les imports statiques chargent le CSS
  global de chaque vue. Cela exclut d'emblée le réflexe « on découpe les vues en chunks ».
- ✅ Les routes `/admin/:tab?` et `/admin/session/:code/:tab?` restent **distinctes** (ambiguïté
  de matching documentée). Toute navigation passe par `adminTabRoute()` et `contentBasePath()`.
- ✅ Les onglets « Contenu » restent accessibles **sans session active**.
- ✅ Pas de sur-ingénierie : app solo, une PR par lot cohérent.

### 2.1 Les clés d'onglet sont un contrat, pas un détail d'affichage

Point capital pour la phase 4 : les 24 clés MJ et les 9 clés de contenu **sont des segments
d'URL**, et trois mécanismes en dépendent —

- `useContentTabQuery()` identifie l'onglet actif via `route.params.tab`, et
  `PlayerInboxView.vue` documente que les `CONTENT_TABS` joueur doivent rester **identiques**
  à celles du MJ pour que les composants réutilisés (`SpellSearch`, `ItemSearch`…) se résolvent ;
- `contentBasePath(route)` construit tous les liens internes (`RefLink`, clics délégués) ;
- les deux palettes de commandes poussent `{ tab, query, slug }` directement dans la route.

**Conséquence : toute la refonte de navigation (§4.2, §4.3) est une refonte de _présentation_
au-dessus des clés existantes. Aucune clé n'est renommée, fusionnée ni supprimée.** Sans quoi
on casse silencieusement les liens profonds, `RefLink` et les deux palettes.

À préserver également : `:key="activeTab"` sur le composant sous `<KeepAlive>` — `magic` et
`equipment` pointent tous deux sur `ItemSearch` avec une prop `category` différente, et seule
cette clé distingue les deux instances.

---

## 3. Architecture cible

### 3.1 Tokens en 3 couches

Le test de validation de l'architecture : **ajouter un token sémantique ne doit demander
qu'une seule édition, pas une par thème.**

```
frontend/src/styles/
├── tokens.seed.css      # L0 — ce qui varie VRAIMENT par thème (~30 valeurs × 4)
├── tokens.derive.css    # L1 — dérivé, invariant : échelles, rayons, ombres, motion
├── tokens.alias.css     # L2 — alias de compatibilité (--color-gold, --player-*, …)
├── base.css             # reset, typo de base, scrollbars, focus ring
└── primitives/          # une feuille par primitive (ou CSS scoped dans components/ui/)
```

**L0 — seeds (par thème).** Uniquement : `--seed-bg`, `--seed-surface-1..3`,
`--seed-ink`, `--seed-ink-dim`, `--seed-border`, `--seed-accent` (+ `-dark`/`-bright`),
`--seed-accent-2` (déjà présent dans `nacre`), et les 6 teintes sémantiques
(success / warning / info / danger / pending / neutral). Environ **30 valeurs par thème au lieu
de 150**. Les palettes existantes (`--school-*`, `--rarity-*`, `--cond-*`, `--map-token-*`,
`--coin-*`…) sont déjà invariantes par thème → elles descendent en L1.

**L1 — dérivé, `:root` nu, un seul exemplaire :**

```css
:root {
  /* Espacement — échelle 4 px */
  --space-0:0; --space-1:.25rem; --space-2:.5rem; --space-3:.75rem; --space-4:1rem;
  --space-5:1.25rem; --space-6:1.5rem; --space-8:2rem; --space-10:2.5rem; --space-12:3rem;

  /* Typographie — plancher relevé (cf. §4.1) */
  --text-2xs:.6875rem; --text-xs:.75rem; --text-sm:.8125rem; --text-base:.875rem;
  --text-md:1rem; --text-lg:1.125rem; --text-xl:1.375rem; --text-2xl:1.75rem;
  --leading-tight:1.25; --leading-normal:1.5; --leading-relaxed:1.65;

  /* Rayons — 5 paliers au lieu de 15 */
  --radius-xs:4px; --radius-sm:6px; --radius-md:10px; --radius-lg:14px; --radius-full:999px;

  /* Élévation, dérivée du seed d'ombre */
  --elev-0:none; --elev-1:…; --elev-2:…; --elev-3:…;

  /* Motion */
  --dur-fast:120ms; --dur-base:180ms; --dur-slow:280ms;
  --ease-out:cubic-bezier(.22,1,.36,1);

  /* Interaction */
  --focus-ring: 0 0 0 2px var(--color-bg), 0 0 0 4px var(--color-accent);
  --touch-min: 44px;

  /* Empilement — remplace les z-index magiques (9999 dans AdminNavSidebar) */
  --z-sticky:10; --z-dropdown:100; --z-modal:1000; --z-toast:1100; --z-tooltip:1200;
}
```

**L2 — alias.** `--color-gold: var(--seed-accent)`, `--gradient-panel: …`, et l'intégralité
des `--player-*` remontés de `PlayerInboxView.vue` vers la feuille globale. **C'est cette
couche qui rend la migration incrémentale possible** : les 77 composants existants continuent
de fonctionner sans modification pendant qu'on refond les couches du dessous.

### 3.1.1 Suppression du thème `light` — travail exact

**Décision actée :** `light` est supprimé, `dark` · `sceau` · `arcane` · `nacre` sont
conservés tels quels. Gain réel : ~20 % sur les phases 1 et 3 (un cinquième de palettes en
moins), pas davantage — c'est une simplification, pas un changement de périmètre.

`light` apparaît à **4 endroits** dans `utils/themePreferences.js` (et pas 2 — les deux
derniers alimentent le futur sélecteur explicite) :

| Ligne | Élément | Action |
|---|---|---|
| 2 | `VALID_THEMES` | retirer `'light'` |
| 15 | `THEME_ORDER` | retirer `'light'` |
| 7 | `THEME_META_COLORS_FALLBACK` | retirer `light: '#f5f1e8'` |
| 19 | `THEME_META` | retirer `light: { label: 'Clair', icon: 'lucide:sun' }` |

Plus : le bloc `:root[data-theme='light']` de `style.css:200–283`, **15 lignes** de
`themePreferences.test.js` (dont `getNextTheme('light') === 'sceau'` et
`getNextTheme('blue') === 'light'` — ce dernier dépend de `THEME_ORDER[1]`, qui change quand
le tableau rétrécit), et `22-theme.spec.ts` l. 54, 62, 81.

**Migration des préférences stockées.** `normalizeTheme()` renvoie le fallback pour toute
valeur hors `VALID_THEMES` : sans rien faire, un utilisateur sur `light` bascule sur `dark`,
c'est-à-dire d'un crème chaud à un quasi-noir. On ajoute donc un **remap explicite
`light → sceau`** (3 lignes dans `normalizeTheme`), qui conserve au moins « j'étais sur un
thème clair ».

**Bonus révélateur — `TvView.vue:691–694.`** Ces 4 sélecteurs corrigent la couleur du texte
des overlays (timer, doom clock) uniquement pour `[data-theme='light']`. Or `sceau` et `nacre`
sont **aussi** des thèmes à fond clair et n'en bénéficient pas : c'est un bug actuel, et
supprimer `light` transformerait ce bloc en code mort qui masque le problème. Correction en
phase 1 : un token de seed `--tv-overlay-text`, défini par thème. C'est la meilleure
démonstration concrète que la découpe L0/L1 se rentabilise.

### 3.2 Primitives — `frontend/src/components/ui/`

16 composants, aucune dépendance externe. Chacun encapsule ce qui est aujourd'hui recopié
dans 5 à 13 fichiers.

| Primitive | Remplace | Présent dans |
|---|---|---|
| `UiButton` (variants: accent/ghost/danger/success/info, sizes: sm/md/lg) | `.action-btn`, `.create-btn`, `.send-btn`, `.submit-btn`, `.home-btn` | 10+ fichiers |
| `UiIconButton` | boutons icône ad hoc | ~15 |
| `UiField` + `UiInput` / `UiSelect` / `UiTextarea` | `.form-input`, `.form-select`, `.search-input` | 7 / 3 / 5 |
| `UiPanel` (+ slot `title`, `actions`) | `.panel`, `.section-title` | 5 / 13 |
| `UiCard` | `.session-card`, `.merchant-item`, `.spell-card`, `.message-card` | ~8 |
| `UiBadge` / `UiChip` | badges de rareté, d'état, compteurs | ~12 |
| `UiModal` (Teleport + focus trap + Escape + `aria-modal`) | 27 overlays manuels | 27 |
| `UiSheet` (drawer mobile) | — (nouveau, cf. §4.2) | — |
| `UiToast` / `UiToastStack` | `PlayerRollToasts`, toasts joueur, toasts de réputation | 3 |
| `UiTooltip` | `HelpTip`, `generator-locked-tooltip`, `HtmlSpanTooltip` | 3 |
| `UiEmptyState` | messages « aucun X » ad hoc | 4+ |
| `UiSegmented` / `UiSwitch` | bascules ad hoc | ~6 |
| `UiSearchField` (avec debounce intégré) | `useDebouncedTabFilter` + markup recopié | 9 onglets contenu |
| `UiSkeleton` | — (nouveau, cf. §4.5) | — |

Règle : une primitive ne consomme **que** des tokens L1/L2, jamais de valeur en dur. C'est ce
qui garantit qu'un 6ᵉ thème ne demandera aucune retouche de composant.

---

## 4. Refonte ergonomique — les changements de fond

### 4.1 Échelle de densité, et une densité réglable

- Plancher du **corps de texte à `--text-sm` (13 px)**, plancher absolu `--text-2xs` (11 px)
  réservé aux méta-informations non critiques (versions, horodatages).
- Les 90 valeurs de `font-size` convergent vers les **8 paliers** de L1.
- **Bascule Compact / Confortable** (`data-density` sur `<html>`, comme `data-theme`) : elle
  ne change que `--space-*` et 2 paliers de typo. Le MJ sur un 27" veut de la densité, le
  joueur sur un téléphone veut des cibles tactiles. Aujourd'hui les deux subissent le même
  réglage, calibré pour ni l'un ni l'autre. La persistance réutilise
  `utils/themePreferences.js` et son schéma `cf_theme_preferences` scopé admin/player — pas
  une seconde clé localStorage ; `themePreferences.test.js` est étendu en conséquence.
- **Corollaire obligatoire :** relever la typo fait déborder les mises en page à hauteur fixe.
  L'audit de débordement à 3 gabarits (360 / 768 / 1440) est une **étape du plan**, pas une
  hypothèse (§6, phase 3).

### 4.2 Joueur : de 15 onglets à 5

```
Aujourd'hui (mobile) : [Combat][Dés][Notes][Sorts][Objets][Obj.mag][Races][Classes]
                       [Origines][Aptitudes][Services][États][Boutique?][Vote?][Puzzle?][Messages]
                       └─ défilement horizontal, 16 cibles ─┘

Cible : [Combat] [Dés] [Grimoire] [Messages] [Notes]
        + carte contextuelle en tête d'écran quand Boutique / Vote / Puzzle sont actifs
```

- **« Grimoire »** = un **écran d'index** avec recherche en tête et 9 catégories en grille,
  qui **route vers les URL existantes** (`/player/spells?q=…`, `/player/magic`, …). Ce n'est
  pas un onglet qui absorbe neuf routes : les 9 clés restent des destinations à part entière
  (cf. §2.1), le Grimoire n'est qu'un point d'entrée de plus. Ces contenus se cherchent, ils ne
  se parcourent pas onglet par onglet — la palette de commandes joueur existante devient la
  voie d'accès principale.
- **Boutique / Vote / Puzzle** restent des **entrées contextuelles** : elles n'existent que
  tant que le MJ diffuse la chose correspondante. À l'implémentation (2026-08-16), la
  conversion en cartes poussées en tête d'écran a été **écartée** : le conditionnement
  `v-if` existait déjà, le gain visible était marginal, et l'absence de
  `player-tab-boutique` hors marchand actif est un contrat vérifié par `13-merchant`
  (9 assertions) qu'une carte toujours présente aurait cassé. Avec 5 entrées de base au
  lieu de 12, elles ne sont de toute façon plus reléguées au bout d'une barre qui défile.
- **Une seule source de navigation** : un tableau `navItems` rendu par un `PlayerNav`
  unique — **une seule instance dans le DOM**, rail latéral ≥ 1024 px et barre basse en
  dessous via `order`, au lieu de deux blocs alternés par `display: none`. Supprime 281
  lignes de markup dupliqué **et** les `data-testid` en double qui obligeaient chaque spec
  e2e à filtrer sur la visibilité.

### 4.3 MJ : layout « Régie »

Trois zones stables, quel que soit le viewport :

```
┌──────────────────────────────────────────────────────────────┐
│ BARRE DE SCÈNE — ce que voient les joueurs, en permanence     │ ← nouveau, sticky
│  [ TV : Combat ]  [ Round 3 −/+ ]  [ Thème ]  [ Ctrl+K ]      │
├────────┬─────────────────────────────────────────────────────┤
│ RAIL   │  PANNEAU DE TRAVAIL                                  │
│ 7 dom. │                                                      │
└────────┴─────────────────────────────────────────────────────┘
```

- **Barre de scène** : remonte l'information la plus critique (« qu'est-ce qui est diffusé
  en ce moment ») du sidebar droit — qui disparaît sous 1100 px — vers une barre persistante
  visible à tous les gabarits. Le changement de mode TV se fait depuis un menu déroulant
  compact, et non plus depuis une colonne de 13 boutons.
- **Rail à 7 domaines** au lieu de 24 onglets plats : `Table` (joueurs, journal) ·
  `Scène` (TV, images, vidéos, audio, carte) · `Rythme` (doom clock, tension, temps) ·
  `Interactions` (messages, votes, puzzles) · `Économie` (marchands, trésor, réputations) ·
  `Grimoire` (les 9 onglets contenu) · `Outils` (dés, générateur). Le second niveau apparaît
  dans le panneau, pas dans le rail. **C'est un regroupement de présentation au-dessus des 24
  clés existantes** (cf. §2.1) : `/admin/session/XXXX/merchants` reste valide, `adminTabRoute()`
  reste le seul constructeur d'URL, et le rail ne crée aucune route.

**Correspondance 24 clés → 7 domaines** — exhaustive, aucune clé perdue :

| Domaine | Clés d'onglet (inchangées) | Nb |
|---|---|---|
| Table | `players` · `journal` | 2 |
| Scène | `images` · `videos` · `audio` · `map` | 4 |
| Rythme | `tension` | 1 |
| Interactions | `message` · `vote` · `puzzle` | 3 |
| Économie | `merchants` · `tresor` · `reputation` | 3 |
| Grimoire | `spells` · `equipment` · `magic` · `races` · `classes` · `backgrounds` · `abilities` · `services` · `conditions` | 9 |
| Outils | `dice` · `generator` | 2 |
| | **total** | **24** |

Deux pièges dans ce tableau : la clé `tension` porte déjà le libellé « Rythme » et constitue à
elle seule son domaine (elle regroupe doom clock, échelle de tension et échelle de temps) ; et
`equipment` / `magic` sont **deux clés distinctes** pointant sur `ItemSearch` avec des props
`category` différentes — elles restent deux entrées séparées du Grimoire, jamais fusionnées
(cf. `:key="activeTab"`, §2.1). Le choix du mode TV n'apparaît pas ici : ce n'est pas un
onglet, il migre vers la barre de scène.
- **Sélecteur de thème explicite** (menu à 4 entrées avec pastille de couleur) au lieu du
  cycle actuel à l'aveugle. Il doit continuer d'émettre `set-tv-theme` : la TV suit le thème du
  MJ par ce socket, et §5 promet aucune modification de contrat socket.

### 4.3.1 La palette de commandes — combler la couverture, pas la construire

**Usage réel constaté (MJ, 2026-08-16) :** « en admin je privilégie le Ctrl+K pour chercher
dans tout le contenu, et je n'utilise les onglets restants (images, etc.) que pour afficher
quelque chose sur la TV. » Cela réoriente tout le §4 : le menu n'est pas le parcours principal,
la palette l'est, et les onglets sont surtout des **sources de diffusion**.

Bonne nouvelle : la palette fait **déjà ~70 %** du travail. `CommandPalette.vue` indexe les
24 sections (`commandIndex.js`), lance une recherche live sur le contenu de référence, indexe
les images / vidéos / cartes / audio / marchands de la session, et sait déjà diffuser sur la TV
via `showOnTv()`. Il ne s'agit donc pas de la promouvoir — c'est déjà fait, dans les faits —
mais de **combler ses trous de couverture**.

`canShowOnTv()` n'autorise que `image | video | map | merchant`, soit **4 des 13 modes TV** :

| Mode TV | Depuis Ctrl+K ? | Nature du manque |
|---|---|---|
| `image` · `video` · `map` · `merchant` | ✅ | — |
| `content` (sorts, objets, races, origines, aptitudes, services, états) | ✅ **depuis le 2026-08-16** | C'était **le vrai trou** : `SHOW_CONTENT` existait et fonctionnait (`ContentActionButtons.vue`), mais les résultats de la palette portaient `subTab`/`query`/`slug` et **naviguaient** au lieu de diffuser. Corrigé — les 7 types sont projetables depuis Ctrl+K, classes exclues |
| `lobby` · `combat` | ❌ | Trivial — simple `SET_TV_MODE` sans charge utile, déjà émis depuis `AdminView:276` |
| `vote` · `puzzle` · `reputation` | ❌ | Conditionnel — nécessite qu'un objet soit actif ; la palette peut au mieux l'activer s'il existe |
| `doom` · `tension` · `timescale` | ❌ | Non pertinent — demandent une configuration (durée, échelle) qui n'a pas de sens comme résultat de recherche. L'entrée honnête est « aller à Rythme », pas « diffuser » |
| _(audio)_ | n/a | **Intentionnel** : le son sort du navigateur du MJ, pas de scène TV — `launchAudio()` navigue vers l'onglet, et le code cite CLAUDE.md pour cette raison |

**Fait le 2026-08-16** — `canShowOnTv()` teste désormais la présence d'un `contentType` posé
par les `*Preview()` (jamais par `classPreview`, cf. CLAUDE.md), et `showOnTv()` émet
`SHOW_CONTENT` avec l'objet brut, exactement comme `ContentActionButtons`. Les 7 familles ont
été vérifiées bout en bout (clic → socket → persistance → rendu TV). La charge la plus lourde
mesurée est de 18,2 Ko (« Baguette des merveilles ») contre une limite serveur de 50 000
(`MAX_CONTENT_JSON_LENGTH`), qui rejetterait silencieusement : aucune marge d'erreur en pratique.

**Reste à faire**, par ordre décroissant de valeur : `lobby`/`combat`, puis `vote`/`puzzle`/
`reputation`. Voir la **phase A** du §6.

### 4.3.2 Unifier l'affordance de diffusion

Corollaire du même constat : si les onglets servent surtout à diffuser, le geste « envoyer ça
sur la TV » doit être identique partout. Il ne l'est pas —

| Surface | Affordance actuelle |
|---|---|
| `ContentActionButtons.vue` | Composant partagé, bouton « TV » + « Envoyer à un joueur » (7 types de fiches) |
| `ImageManager.vue:265` | `.show-btn` local, apparaît au survol |
| `VideoManager.vue:255` | Bouton inline, style propre |
| `MapGallery.vue:67` | Émet `show-on-tv` vers le parent |

`ContentActionButtons` est **déjà** la forme aboutie (avec une seconde action, l'envoi à un
joueur, qu'aucune autre surface ne propose). La primitive de diffusion consiste donc à
**généraliser ce composant existant aux médias**, pas à en inventer un — et à faire remonter
l'envoi-à-un-joueur aux images et cartes au passage.

### 4.4 Retour d'état et réversibilité

- **Régions `aria-live`** pour les événements socket (jets, PV, messages, votes) — actuellement
  zéro dans une application dont c'est la raison d'être. **Contrainte d'implémentation
  (2026-08-17) :** la région doit être montée *avant* que le contenu n'y arrive. Une région
  créée en même temps que son premier enfant n'annonce rien — silencieusement, sans erreur, et
  sans que ça se voie sur une capture. Les deux piles de toasts satisfont la condition (montées
  sans `v-if`, vidées mais jamais démontées) ; `MerchantRequestsBanner`, en `v-if`, ne la
  satisfait pas et n'a donc **pas** été équipée : elle demanderait d'abord d'être restructurée,
  et resterait de toute façon inerte tant que le MJ n'est pas déjà sur l'onglet Marchands.
- **Toast d'annulation** (5 s) sur les actions diffusées : envoi de message, diffusion d'image,
  démarrage de doom clock. Aujourd'hui ces actions sont immédiates et irréversibles devant les
  joueurs.
- **États de chargement explicites** : `UiSkeleton` sur les listes de contenu (479 sorts dans
  `backend/src/data/aidedd_spells.json`) au lieu du saut de mise en page actuel.

### 4.5 Responsive et mouvement

- **4 points de rupture nommés** en L1 (`--bp-sm:640`, `--bp-md:768`, `--bp-lg:1024`,
  `--bp-xl:1280`) remplaçant les 7 valeurs ad hoc.
- Généraliser `clamp()` — le modèle est déjà écrit dans `components/tv/*`.
- `@media (prefers-reduced-motion: reduce)` global neutralisant `dotPulse`, `fadeUp`,
  `tabFadeIn` et les secousses de `TvTensionScale`. ✅ **Fait en phase 1** — bloc global en fin
  de `tokens.derive.css`. Il couvre aussi les `transform` de survol : `transition-duration`
  tombant à 0,001 ms, un `translateY(-1px)` devient un déplacement instantané d'un pixel, ce qui
  n'est pas du mouvement vestibulaire — rien à corriger de ce côté.
- Cibles tactiles à `--touch-min` (44 px) sur toute la surface joueur. **Reporté** : relever la
  cible tactile pousse directement sur le seul cas de la phase 4 resté non mesuré — la barre
  basse à 768 px avec Boutique, Vote et Puzzle simultanément actifs, soit 8 entrées libellées.
  À reprendre avec la sonde de débordement de la phase 3, en mesurant **d'abord** cette
  configuration précise.
- **`outline: none` en état de base — la vraie limite de l'anneau de focus (mesuré 2026-08-17).**
  La règle globale `:focus-visible` couvre boutons, liens et onglets, mais **27 sélecteurs**
  écrivent `outline: none` dans leur état de base — pas dans `:focus` — et la neutralisent :
  les champs de recherche des 9 onglets contenu, `.form-input` de HomeView et PlayerJoinView,
  les composeurs de message MJ et joueur, `.notes-textarea`, `.cat-input`… Autrement dit
  l'anneau manque précisément là où il compte le plus, et ces champs n'offrent au clavier qu'un
  changement de `border-color` de 1 px. Deux détails rendent la correction non triviale :
  (a) à spécificité de classe contre `:focus-visible` (0,1,0 chacun), c'est l'ordre source qui
  tranche, et les styles scoped sont injectés après `style.css` — un `:focus-visible:focus-visible`
  (0,2,0) suffirait donc en **une** édition, sans toucher les 27 fichiers ; (b) le navigateur fait
  correspondre `:focus-visible` aux champs de saisie **même au clic souris** — l'anneau
  apparaîtrait donc à chaque clic dans un champ, pas seulement au clavier. C'est un changement
  visuel sur l'interaction la plus fréquente de l'app, et il tombe sur les mêmes champs que la
  décision `!important` en attente (§ phase 5) : à trancher avec les deux sous les yeux, pas
  séparément.
- **Focus trap des ~27 overlays — hors de la première passe de la phase 6, délibérément.**
  Les `data-testid`, `aria-live` et `aria-expanded` sont purement additifs : ils ne changent
  aucun comportement. Un focus trap, lui, **intercepte le clavier** dans les composants que
  traversent justement les specs adaptées à l'aveugle en phase 4 (`PlayerPage.switchTab`,
  `20-search:56`, `AdminPage.setTvMode`, `14-tv-modes:174`), encore jamais exécutées. Empiler
  une seconde couche non vérifiée sur la première produirait exactement la suite rouge illisible
  contre laquelle la contrainte n°1 du §6 met en garde. À ouvrir après la passe e2e.

---

## 5. Ce qui n'est PAS dans le périmètre

Pour éviter la dérive : **pas** de changement de stack (Vue 3 + Vite + Pinia restent), **pas**
de framework CSS, **pas** de refonte du backend, **pas** de modification des contrats socket
(le plugin Obsidian en dépend), **pas** de lazy-loading du router, **pas** de nouvelle
fonctionnalité métier. La refonte est purement front, et le comportement fonctionnel doit
rester identique à iso-e2e.

---

## 6. Phasage

**La phase A se fait en premier et se suffit à elle-même.** Elle ne touche que
`CommandPalette.vue` et ses imports de `socket-events.js` : aucun token, aucune primitive,
aucun markup déplacé, aucun risque de dérive de sélecteur au-delà de `20-search.spec.ts`.
Elle n'est donc pas soumise au séquençage ci-dessous et peut partir seule, tout de suite —
c'est le meilleur rapport effort/gain du document, et elle sert le parcours principal réel.

Ensuite, trois contraintes d'ordre commandent le séquençage :
1. Les tests e2e utilisent **207 sélecteurs de classe CSS** contre 171 `data-testid`. Si le
   markup bouge avant, chaque phase produit une suite rouge où l'on ne distingue plus la
   régression de la dérive de sélecteur.
2. Le bloc `!important` de `style.css` est **porteur** : le supprimer d'un coup casse
   silencieusement tout composant qui en dépend.
3. Playwright étant le seul filet (décision actée : pas de tests de composant), la baseline
   visuelle doit exister **avant** la phase 1 — c'est elle qui porte la promesse « zéro
   changement visuel ». Deux exigences pour qu'elle ne devienne pas du bruit ignoré :
   lancer avec `animations: 'disabled'` (`dotPulse` tourne en boucle infinie, `fadeUp` et
   `tabFadeIn` se déclenchent au montage), et disposer de la stack Docker (cf. CLAUDE.md).

| Phase | Contenu | Risque | Vérification |
|---|---|---|---|
| **A. Couverture Ctrl+K** | ✅ **Fait (2026-08-16)** — `canShowOnTv()` élargi à la famille `content` + branche `SHOW_CONTENT` dans `showOnTv()`. Les 7 types sont diffusables depuis Ctrl+K, classes exclues. Reste à faire : `lobby`/`combat`, puis `vote`/`puzzle`/`reputation` (§4.3.1). | Faible | 7 familles vérifiées bout en bout (socket → DB → rendu TV) ; `20-search.spec.ts` 8/8 (le 9ᵉ échec est antérieur : `SyntaxError` sur un `import()` dynamique de helper TS) |
| **0. Filet** | `data-testid` sur les 207 sélecteurs de classe des e2e (scopés à la classe racine du composant, jamais global — `v-show` laisse tout dans le DOM). Baseline de captures Playwright **3 gabarits × 4 thèmes**, avec `animations: 'disabled'`. | Nul (aucun changement visuel) | e2e verte, captures archivées |
| **1. Tokens** | 🟡 **Partiellement fait (2026-08-16)** — `styles/tokens.derive.css` (L1) créé et importé, `light` supprimé + remap `light → sceau`, tokens `--color-overlay-text` / `--color-overlay-danger-text` (bug TvView corrigé pour `sceau` et `nacre`), sélecteur de thème explicite + bascule de densité. **Reste :** la découpe L0 (seeds) — les 4 palettes sont encore écrites à plat. **+ CLAUDE.md fait** | Moyen — régression de couleur silencieuse | `themePreferences.test.js` : 86 tests verts (74 avant) ; `22-theme.spec.ts` réécrit pour le sélecteur explicite |
| **2. Primitives** | Les 16 `components/ui/*`. Adoption sur 3 pilotes (`SessionManager`, `VoteManager`, `MessageTool`). **+ CLAUDE.md** (arbo `components/ui/`) | Faible | Baseline visuelle Playwright + e2e — pas de test de composant (décision actée) |
| **3. Densité** | ✅ **Fait (2026-08-16)** — 524 `font-size` convergées vers 8 paliers (plancher 13 px) + **1061 `padding`/`margin`/`gap` convergés vers `--space-*`**. Ce second volet est ce qui rend la bascule Compact/Confortable réellement effective : sans lui, seuls les composants écrits après la refonte y réagissaient. | **Élevé** — c'est ici que les mises en page fixes cassent | Sonde de débordement automatisée à 375/768/1440 × 2 densités : 0 rognage, 0 débordement de page, 0 texte < 11 px. Densité mesurée : +19 % padding, +19 % gaps |
| **4. Navigation** | ✅ **Fait (2026-08-16)** — **MJ :** barre de scène persistante (`AdminSceneBar.vue`, remplace `AdminTvSidebar` supprimée) + rail à 7 domaines ; le panneau de travail récupère les 320 px de la colonne droite, le point de rupture 1100 px disparaît. L'indicateur de diffusion nomme la fiche projetée et son type (`Boule de feu (Sort)`). **Joueur :** `PlayerNav.vue` unique (rail ≥ 1024 px / barre basse en dessous, via `order`) — **−281 lignes** de markup dupliqué et fin des `data-testid` en double ; 5 entrées Combat · Dés · Grimoire · Messages · Notes + Boutique/Vote/Puzzle contextuelles ; `PlayerGrimoireIndex.vue` route vers les 9 URL existantes. **+ CLAUDE.md fait** | **Élevé** — change les parcours | Build + unitaires verts. Vérifié sur la stack en cours : rail 160 px à 1280 px, barre basse à 375 px (0 débordement, 0 défilement interne), `/view/:code/spells` atteint depuis l'index avec le champ de recherche attendu, 1 seul nœud par `player-tab-*`, 0 erreur console. e2e adaptés (`PlayerPage.switchTab` saute par l'index, `20-search:56`, `AdminPage.setTvMode`) mais **non exécutés** |
| **5. Migration** | 🟡 **Entamé (2026-08-16)** — l'audit du bloc `!important` de `style.css` a montré qu'il ne masquait **plus** de couleurs en dur (tout est déjà tokenisé) mais des **intentions de composants**. Retirés : le bloc « cartes » (`.panel`/`.merchant-item`/`.message-card`/`.player-item` résolvent à l'identique — `--player-panel-bg` et `--tv-panel-bg` sont des alias de `--gradient-panel` ; `.spell-card` retrouve `--gradient-panel-soft`, `.session-card` son fond plat), le bloc « en-têtes » **supprimé entièrement** (voir ci-dessous), `.admin-main` rapatrié dans `AdminView`, et `.search-input`/`.custom-price-input` sortis de la liste des champs. En cascade, les `!important` défensifs de `ItemSearch` et `TvMerchant` ont pu tomber. **Reste :** `.form-input`/`.form-select`/`.form-textarea`/`.recipient-select` — les règles scoped veulent `--color-surface` **opaque** là où le global force `--surface-raised` **translucide** ; basculer tous les champs d'un coup est un changement visuel à part entière, à traiter composant par composant. Puis les 74 composants, domaine par domaine. | Moyen, mais étalé | Vérifié sur la stack : `.admin-header` retrouve son dégradé de crête, `.inbox-header` son fond `--surface-highlight` (il était forcé transparent — l'en-tête n'est pas sticky, donc rien ne défilait derrière : il était simplement à plat sur la page, séparé par sa seule bordure). `.panel` inchangé au pixel, `.spell-card` passe au variant *soft* sur les 4 thèmes, `.merchant-item.is-magic` (TV) conserve sa bordure de rareté sans `!important` — vérifié via le CSSOM, pas déduit. `.admin-main` 40 px à ≥1024. Build + 86 unitaires verts. **Réserve :** sur `sceau`, `--surface-highlight` (72 % blanc) composite sur `--color-bg` (blanc pur) — l'en-tête y reste donc à plat, contrairement aux 3 autres thèmes. Correctif de token par thème, à traiter séparément |
| **6. A11y & motion** | 🟡 **Entamé (2026-08-17)** — trois volets **additifs** faits : (a) **anneau de focus** — `--focus-ring-*` en L1 + **une** règle `:focus-visible` globale, là où 30 déclarations éparses sur 23 fichiers laissaient ~600 éléments à l'anneau par défaut du navigateur, noir donc invisible sur `dark` et `arcane` ; (b) **`aria-live`** sur les deux piles de toasts, seuls conteneurs montés en permanence donc seuls capables d'annoncer ; (c) **`aria-expanded`** sur les 9 boutons de divulgation restants (`ClassSearch` ×4, `BackgroundSearch`, `MessageTool`, `ContentActionButtons`, menu d'en-tête joueur, historique des notes de version) + le bouton de repli du rail. `prefers-reduced-motion` était déjà couvert en phase 1 (bloc global dans `tokens.derive.css`). **Reste : le focus trap des ~27 overlays et les cibles 44 px** — volontairement hors de cette passe, cf. ci-contre. | Faible | Vérifié sur le serveur de dev : la règle globale existe au CSSOM, l'anneau résout 2 px / décalage 2 px et la bonne couleur sur les **4** thèmes (`f5b450` · `7d160f` · `a78bfa` · `77234e`), et il peint réellement sous focus clavier (`matches(':focus-visible')` vrai, `outline: 2px solid rgb(245,180,80)`). **Portée réelle, mesurée et plus étroite qu'annoncé :** un clic souris sur `.form-input` donne bien `:focus-visible` (le navigateur fait toujours correspondre les champs de saisie, quel que soit le mode d'entrée) **mais aucun anneau ne peint** — `outline-style: none`. Cause trouvée : **27 sélecteurs posent `outline: none` dans leur état de base**, à spécificité de classe, ce qui neutralise la règle globale. Voir la réserve ci-dessous. Le pass-through d'attributs de `TransitionGroup` a été **mesuré**, pas supposé : conteneur présent et **vide** avant tout toast, `role`/`aria-live` bien sur l'élément rendu, enfants insérés ensuite — la condition exacte pour qu'un lecteur d'écran annonce. Build + 86 unitaires verts |
| **7. Découpage** | `PlayerInboxView` 2 236 l. → vue + composables + sous-composants. Idem `MapManager`, `AudioManager`. | Moyen | Tests de composant |
| **8. Finition** | Squelettes de chargement, toasts d'annulation, micro-interactions, états vides soignés. | Faible | — |

Ordre de valeur perçue : **3 → 4 → 8**. Ordre de sécurité : **0 → 1 → 2** d'abord.
Les phases 0-2 ne se voient pas mais conditionnent tout le reste.

### 6.1 Rayon d'impact e2e de la phase 4

Passer le joueur à 5 onglets supprime comme cibles cliquables `player-tab-spells`,
`-equipment`, `-magic`, `-races`, `-classes`, `-backgrounds`, `-abilities`, `-services`,
`-conditions`, et transforme Boutique / Vote / Puzzle en cartes contextuelles. Le sélecteur de
thème explicite remplace le bouton de cycle. Fichiers à reprendre, connus d'avance :

| Fichier | Motif |
|---|---|
| `e2e/page-objects/PlayerPage.ts` | Point central — toute la navigation joueur |
| `specs/12-votes.spec.ts` | Vote : onglet → carte contextuelle |
| `specs/13-merchant.spec.ts` | Boutique : onglet → carte contextuelle |
| `specs/29-puzzle.spec.ts` | Puzzle : onglet → carte contextuelle |
| `specs/20-search.spec.ts` | Palette de commandes + accès contenu via Grimoire |
| `specs/22-theme.spec.ts` | Cycle → menu explicite à 5 entrées |
| `specs/05-auto-rejoin.spec.ts` · `09-messages.spec.ts` | Traversent la nav joueur |

Les URL, elles, ne changent pas (§2.1) : un test qui navigue par `goto('/player/spells')`
survit tel quel. Seuls les tests qui **cliquent** sur un onglet sont touchés.

### 6.2 Maintenance de CLAUDE.md

`CLAUDE.md` impose sa propre mise à jour dans le même commit, et le hook Stop
`.claude/hooks/check-docs.ps1` le vérifie. À intégrer :
arborescence `frontend/src/styles/` (phase 1) et `frontend/src/components/ui/` (phase 2) dans
la section Structure ; et trois règles nouvelles en « Règles non-déductibles du code » —
une primitive ne consomme que des tokens L1/L2, `data-density` sur `<html>` en parallèle de
`data-theme`, toute navigation passe par `<AppNav>` (phases 1, 2, 4).

---

## 7. Effort indicatif

| Phase | Ampleur |
|---|---|
| A · Couverture Ctrl+K | 1 fichier, quelques dizaines de lignes — le meilleur rapport effort/gain |
| 0 · Filet | ~380 sélecteurs à réviser + outillage — le poste le plus ingrat, le plus rentable |
| 1 · Tokens | 575 lignes de CSS restructurées (dont 84 supprimées avec `light`), mécanique |
| 2 · Primitives | 16 composants, c'est le cœur créatif |
| 3 · Densité | 648 déclarations touchées, mais mécanique une fois L1 posé ; l'audit visuel domine |
| 4 · Navigation | 2 vues restructurées, ~500 lignes supprimées |
| 5 · Migration | 74 composants × ~20 min — le poste le plus long en volume |
| 6-8 | Transverses, parallélisables |

Découpage en PR suggéré : une par phase, sauf la phase 5 (une PR par domaine).

---

## 8. Décisions actées

| Question | Décision | Conséquence |
|---|---|---|
| Combien de thèmes ? | **4** — `light` supprimé, `dark`/`sceau`/`arcane`/`nacre` conservés | Travail détaillé en §3.1.1. Remap `light → sceau` pour les préférences stockées. ~20 % de moins sur les phases 1 et 3 |
| Tests de composant ? | **Non** — Playwright suffit | Pas de `@vue/test-utils`. La baseline visuelle (phase 0) devient le filet unique et doit tourner `animations: 'disabled'`. Le suite vitest d'utilitaires existante reste et est mise à jour |
| Refonte de navigation ? | **Validée sur maquette d'abord** | `docs/maquettes/refonte-ui.html` — interactive (4 thèmes × 2 densités), à approuver avant d'ouvrir la phase 4 |

---

## 9. Si tu ne fais que trois choses

1. ~~**Phase A — combler la couverture de Ctrl+K**~~ ✅ **fait** (§4.3.1) : diffuser un sort ou
   un objet sur la TV directement depuis Ctrl+K, sans passer par l'onglet.
2. **Phase 1 + 3** — tokens en couches puis plancher typographique à 13 px. Le gain de confort
   le plus immédiat, et il bénéficie aux 4 thèmes d'un coup.
3. **Ramener le joueur à 5 onglets** (§4.2). Supprime ~280 lignes dupliquées et corrige le
   défaut d'ergonomie mobile le plus visible pour tes joueurs.

Le rail MJ à 7 domaines (§4.3) reste utile mais n'est plus prioritaire : validé sur maquette,
il perd de son enjeu dès lors que la palette couvre 100 % de la diffusion.
