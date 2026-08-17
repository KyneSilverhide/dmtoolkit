import { test, expect } from '../fixtures'
import { createSession } from '../helpers/session'
import { AdminPage } from '../page-objects/AdminPage'
import { PlayerPage } from '../page-objects/PlayerPage'
import { TvPage } from '../page-objects/TvPage'

test('spell search returns results for known spell', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)
    await adminPage.switchTab('spells')

    // Search for a known D&D 5e spell
    const searchInput = adminPage.page.locator('input[placeholder*="sort" i], input[placeholder*="spell" i], input[placeholder*="recherche" i]').first()
    await searchInput.fill('boule de feu')
    await adminPage.page.keyboard.press('Enter')

    await expect(adminPage.page.getByRole('heading', { level: 3, name: /^\s*boule de feu\s*$/i })).toBeVisible({ timeout: 8_000 })
  } finally {
    await adminCtx.close()
  }
})

test('spell search shows no results for unknown spell', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)
    await adminPage.switchTab('spells')

    const searchInput = adminPage.page.locator('input[placeholder*="sort" i], input[placeholder*="spell" i], input[placeholder*="recherche" i]').first()
    await searchInput.fill('xyzzy_nonexistent_spell_xyz')
    await adminPage.page.keyboard.press('Enter')

    await expect(adminPage.page.getByText(/aucun sort trouvé/i)).toBeVisible({ timeout: 8_000 })
  } finally {
    await adminCtx.close()
  }
})

test('player sorts tab has spell search', async ({ page, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const { joinAsPlayer } = await import('../helpers/player')
  await joinAsPlayer(page, code, { name: 'Mage', hp: 24 })

  // Les Sorts s'ouvrent désormais depuis l'index Grimoire — switchTab() encapsule le saut.
  await new PlayerPage(page).switchTab('spells')

  // Spell search input should be visible
  const searchInput = page.locator('input[placeholder*="sort" i], input[placeholder*="spell" i], input[placeholder*="recherche" i]').first()
  await expect(searchInput).toBeVisible({ timeout: 8_000 })
})

test('magic item search returns results', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)
    await adminPage.switchTab('magic')

    // Le placeholder réel d'ItemSearch.vue en catégorie "magic" est "Nom, type, rareté,
    // description…" — ni "objet" ni "item" n'y figurent (le sélecteur précédent ne
    // matchait donc rien, d'où le timeout de fill() en attente d'un élément inexistant).
    // .filter({ visible: true }) protège aussi contre les autres onglets de recherche
    // restés montés via <KeepAlive>, qui partagent la même classe .search-input.
    const searchInput = adminPage.page.locator('input[placeholder*="rareté" i]').filter({ visible: true }).first()
    await searchInput.fill('épée')
    await adminPage.page.keyboard.press('Enter')
    await expect(adminPage.page.locator('.item-result-card').first()).toBeVisible({ timeout: 8_000 })
  } finally {
    await adminCtx.close()
  }
})

test('races tab lists races and filters by search', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)
    await adminPage.switchTab('races')

    // Toutes les races s'affichent par défaut, sans recherche
    await expect(adminPage.page.getByRole('heading', { level: 3, name: /^\s*nain\s*$/i })).toBeVisible({ timeout: 8_000 })
    await expect(adminPage.page.getByRole('heading', { level: 3, name: /^\s*elfe\s*$/i })).toBeVisible({ timeout: 8_000 })

    const searchInput = adminPage.page.locator('input[placeholder*="trait" i], input[placeholder*="caractéristique" i]').first()
    await searchInput.fill('halfelin')
    await expect(adminPage.page.getByRole('heading', { level: 3, name: /^\s*halfelin\s*$/i })).toBeVisible({ timeout: 8_000 })
    await expect(adminPage.page.getByRole('heading', { level: 3, name: /^\s*nain\s*$/i })).not.toBeVisible()
  } finally {
    await adminCtx.close()
  }
})

test('classes tab lists classes and filters by search', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)
    await adminPage.switchTab('classes')

    // Toutes les classes s'affichent par défaut, sans recherche
    await expect(adminPage.page.getByRole('heading', { level: 3, name: /^\s*magicien\s*$/i })).toBeVisible({ timeout: 8_000 })
    await expect(adminPage.page.getByRole('heading', { level: 3, name: /^\s*guerrier\s*$/i })).toBeVisible({ timeout: 8_000 })

    const searchInput = adminPage.page.locator('input[placeholder*="sous-classe" i], input[placeholder*="caractéristique" i]').first()
    await searchInput.fill('occultiste')
    await expect(adminPage.page.getByRole('heading', { level: 3, name: /^\s*occultiste\s*$/i })).toBeVisible({ timeout: 8_000 })
    await expect(adminPage.page.getByRole('heading', { level: 3, name: /^\s*guerrier\s*$/i })).not.toBeVisible()
  } finally {
    await adminCtx.close()
  }
})

test('backgrounds tab lists origins and filters by search', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)
    await adminPage.switchTab('backgrounds')

    // Toutes les origines s'affichent par défaut, sans recherche
    await expect(adminPage.page.getByRole('heading', { level: 3, name: /^\s*acolyte\s*$/i })).toBeVisible({ timeout: 8_000 })
    await expect(adminPage.page.getByRole('heading', { level: 3, name: /^\s*soldat\s*$/i })).toBeVisible({ timeout: 8_000 })

    const searchInput = adminPage.page.locator('input[placeholder*="capacité" i], input[placeholder*="compétence" i]').first()
    await searchInput.fill('marin')
    await expect(adminPage.page.getByRole('heading', { level: 3, name: /^\s*marin\s*$/i })).toBeVisible({ timeout: 8_000 })
    await expect(adminPage.page.getByRole('heading', { level: 3, name: /^\s*soldat\s*$/i })).not.toBeVisible()
  } finally {
    await adminCtx.close()
  }
})

test('spells/items/abilities tabs show a paginated browse list with no search typed', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    // Sorts : liste paginée sans recherche
    await adminPage.switchTab('spells')
    await expect(adminPage.page.getByText(/\d+ sort\(s\) au total/i)).toBeVisible({ timeout: 8_000 })
    await expect(adminPage.page.getByText(/^Page 1 \//)).toBeVisible()

    // Objets magiques : liste paginée sans recherche
    await adminPage.switchTab('magic')
    await expect(adminPage.page.getByText(/objet\(s\) magique\(s\) au total/i)).toBeVisible({ timeout: 8_000 })
    await expect(adminPage.page.getByText(/^Page 1 \//)).toBeVisible()

    // Aptitudes : liste paginée sans recherche (plus de message "tapez pour chercher")
    await adminPage.switchTab('abilities')
    await expect(adminPage.page.getByText(/\d+ aptitude\(s\) au total/i)).toBeVisible({ timeout: 8_000 })
    const nextBtn = adminPage.page.getByRole('button', { name: /suivant/i })
    await expect(nextBtn).toBeVisible()
    await nextBtn.click()
    await expect(adminPage.page.getByText(/^Page 2 \//)).toBeVisible()
  } finally {
    await adminCtx.close()
  }
})

test('abilities tab finds a class feature and a subclass trait by name', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)
    await adminPage.switchTab('abilities')

    const searchInput = adminPage.page.locator('input[placeholder*="aptitude" i]').first()

    // Trait de classe de base (Clerc)
    await searchInput.fill('Conduit divin')
    await expect(adminPage.page.getByRole('heading', { level: 3, name: /^\s*conduit divin\s*$/i })).toBeVisible({ timeout: 8_000 })

    // Trait de sous-classe (Moine — Voie de la paume)
    await searchInput.fill('Paume frémissante')
    await expect(adminPage.page.getByRole('heading', { level: 3, name: /^\s*paume frémissante\s*$/i })).toBeVisible({ timeout: 8_000 })

    // Option d'une liste (Métamagie de l'Ensorceleur)
    await searchInput.fill('Sort subtil')
    await expect(adminPage.page.getByRole('heading', { level: 3, name: /^\s*sort subtil\s*$/i })).toBeVisible({ timeout: 8_000 })
  } finally {
    await adminCtx.close()
  }
})

// Projection d'une fiche de contenu directement depuis la palette Ctrl+K, sans passer par
// l'onglet (voir docs/refonte-ui.md §4.3.1). Les classes sont volontairement exclues :
// `classPreview()` n'attache pas de `contentType`, donc pas de bouton TV — cf. CLAUDE.md.
test('command palette can show a content sheet on TV', async ({ browser, adminToken }) => {
  const token = adminToken
  const code = await createSession(token)

  const adminCtx = await browser.newContext()
  const tvCtx = await browser.newContext()
  try {
    const adminPage = new AdminPage(await adminCtx.newPage())
    await adminPage.login(token)
    await adminPage.selectSession(code)

    const tv = new TvPage(await tvCtx.newPage())
    await tv.goto(code)

    await adminPage.page.getByTestId('open-search-palette').click()
    await adminPage.page.locator('.cp-input').fill('boule de feu')

    // Un sort est projetable, une classe ne l'est pas.
    const spellTvBtn = adminPage.page.getByTestId('cp-tv-spell-boule-de-feu')
    await expect(spellTvBtn).toBeVisible({ timeout: 10_000 })
    await expect(adminPage.page.getByTestId('cp-tv-class-clerc')).toHaveCount(0)

    await spellTvBtn.click()

    await expect(tv.getMode()).toHaveAttribute('data-tv-mode', 'content', { timeout: 10_000 })
    await expect(tv.page.getByText(/boule de feu/i).first()).toBeVisible({ timeout: 10_000 })
  } finally {
    await adminCtx.close()
    await tvCtx.close()
  }
})
