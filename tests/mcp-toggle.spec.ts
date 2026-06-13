import { test, expect, type Page } from '@playwright/test'

const MCP_URL = 'https://www.jlg-consulting.com/mcp.php'
const MCP_ALIAS = 'jlgc'

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function openMcpSection(page: Page) {
  const isOpen = await page.locator('input[placeholder="Mon serveur MCP"]').isVisible().catch(() => false)
  if (!isOpen) await page.getByText('Serveur MCP').click()
}

async function configureMcp(page: Page) {
  await openMcpSection(page)
  await page.locator('input[placeholder="Mon serveur MCP"]').fill(MCP_ALIAS)
  await page.locator('input[placeholder="http://localhost:8000"]').fill(MCP_URL)
}

// Le Toggle "MCP activé" : label cliquable + checkbox pour lire l'état
function mcpLabel(page: Page) {
  return page.locator('text=MCP activé').locator('..').locator('label')
}
function mcpCheckbox(page: Page) {
  return page.locator('text=MCP activé').locator('..').locator('input[type="checkbox"]')
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('Serveur MCP — activation / désactivation', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    await configureMcp(page)
  })

  test('activation : envoie initialize puis notifications/initialized', async ({ page }) => {
    const requests: string[] = []
    page.on('request', req => {
      if (req.url() === MCP_URL && req.method() === 'POST') {
        const body = req.postDataJSON() as { method?: string }
        if (body?.method) requests.push(body.method)
      }
    })

    await mcpLabel(page).click()
    await expect(mcpCheckbox(page)).toBeChecked({ timeout: 10_000 })

    expect(requests).toContain('initialize')
    expect(requests).toContain('notifications/initialized')
    expect(requests.indexOf('initialize')).toBeLessThan(requests.indexOf('notifications/initialized'))
  })

  test('activation : la réponse initialize contient protocolVersion et serverInfo', async ({ page }) => {
    let initializeResponse: Record<string, unknown> | null = null

    page.on('response', async resp => {
      if (resp.url() === MCP_URL && resp.request().method() === 'POST') {
        const body = resp.request().postDataJSON() as { method?: string }
        if (body?.method === 'initialize') {
          const json = await resp.json() as { result?: Record<string, unknown> }
          initializeResponse = json.result ?? null
        }
      }
    })

    await mcpLabel(page).click()
    await expect(mcpCheckbox(page)).toBeChecked({ timeout: 10_000 })

    expect(initializeResponse).not.toBeNull()
    expect(initializeResponse).toHaveProperty('protocolVersion')
    expect(initializeResponse).toHaveProperty('serverInfo')
  })

  test('activation : les outils MCP sont chargés automatiquement', async ({ page }) => {
    await mcpLabel(page).click()
    await expect(mcpCheckbox(page)).toBeChecked({ timeout: 10_000 })

    // Les outils doivent apparaître sans clic supplémentaire
    await expect(page.locator('span.font-mono', { hasText: 'about-jlg-consulting' }).first()).toBeVisible({ timeout: 10_000 })
  })

  test('désactivation : envoie shutdown puis exit', async ({ page }) => {
    await mcpLabel(page).click()
    await expect(mcpCheckbox(page)).toBeChecked({ timeout: 10_000 })

    const requests: string[] = []
    page.on('request', req => {
      if (req.url() === MCP_URL && req.method() === 'POST') {
        const body = req.postDataJSON() as { method?: string }
        if (body?.method) requests.push(body.method)
      }
    })

    await mcpLabel(page).click()
    await expect(mcpCheckbox(page)).not.toBeChecked({ timeout: 10_000 })

    expect(requests).toContain('shutdown')
    expect(requests).toContain('exit')
    expect(requests.indexOf('shutdown')).toBeLessThan(requests.indexOf('exit'))
  })

  test('désactivation : la réponse shutdown est un résultat vide sans erreur', async ({ page }) => {
    await mcpLabel(page).click()
    await expect(mcpCheckbox(page)).toBeChecked({ timeout: 10_000 })

    let shutdownResponse: Record<string, unknown> | null = null
    page.on('response', async resp => {
      if (resp.url() === MCP_URL && resp.request().method() === 'POST') {
        const body = resp.request().postDataJSON() as { method?: string }
        if (body?.method === 'shutdown') {
          shutdownResponse = await resp.json() as Record<string, unknown>
        }
      }
    })

    await mcpLabel(page).click()
    await expect(mcpCheckbox(page)).not.toBeChecked({ timeout: 10_000 })

    expect(shutdownResponse).not.toBeNull()
    expect(shutdownResponse).not.toHaveProperty('error')
    expect(shutdownResponse).toHaveProperty('result')
  })

  test('erreur réseau : le toggle reste désactivé si le serveur est inaccessible', async ({ page }) => {
    await page.locator('input[placeholder="http://localhost:8000"]').fill('https://invalid.example.com/mcp')

    await mcpLabel(page).click()

    await expect(mcpCheckbox(page)).not.toBeChecked({ timeout: 10_000 })
    await expect(page.locator('text=Erreur')).toBeVisible({ timeout: 10_000 })
  })

  test('cycle complet : activer → désactiver → réactiver fonctionne', async ({ page }) => {
    await mcpLabel(page).click()
    await expect(mcpCheckbox(page)).toBeChecked({ timeout: 10_000 })

    await mcpLabel(page).click()
    await expect(mcpCheckbox(page)).not.toBeChecked({ timeout: 10_000 })

    await mcpLabel(page).click()
    await expect(mcpCheckbox(page)).toBeChecked({ timeout: 10_000 })
  })

})
