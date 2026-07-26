import { test, expect } from '../fixtures'
import { createSession } from '../helpers/session'
import { AdminPage } from '../page-objects/AdminPage'

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

  await page.getByTestId('player-tab-spells').filter({ visible: true }).click()

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

    const searchInput = adminPage.page.locator('input[placeholder*="objet" i], input[placeholder*="item" i]').first()
    await searchInput.fill('épée')
    await adminPage.page.keyboard.press('Enter')
    await expect(adminPage.page.locator('[class*="result"], [class*="item"]').first()).toBeVisible({ timeout: 8_000 })
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
