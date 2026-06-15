import { test, expect, type Page, type Route } from '@playwright/test'
import { setConfig } from './helpers'

const MCP_URL = 'http://localhost:9999'

const MCP_TOOLS = [
  { name: 'recherche', description: 'Recherche sur le web', enabled: true, inputSchema: {} },
  { name: 'calculatrice', description: 'Calcul mathématique', enabled: true, inputSchema: {} },
]

/** Intercepte toutes les requêtes vers le faux serveur MCP et répond selon la méthode JSON-RPC. */
async function mockMcpServer(page: Page, handlers: Partial<Record<string, (route: Route, body: Record<string, unknown>) => Promise<void>>> = {}) {
  await page.route(`${MCP_URL}**`, async route => {
    const body = await route.request().postDataJSON() as Record<string, unknown>
    const method = body.method as string ?? ''

    const custom = handlers[method]
    if (custom) { await custom(route, body); return }

    if (method === 'initialize') {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { protocolVersion: '2025-03-26', capabilities: {} } }),
      })
    } else if (method === 'notifications/initialized' || method === 'exit') {
      await route.fulfill({ status: 204 })
    } else if (method === 'tools/list') {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { tools: MCP_TOOLS } }),
      })
    } else if (method === 'shutdown') {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result: null }),
      })
    } else if (method === 'tools/call') {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { content: [{ type: 'text', text: 'Résultat MCP de test' }] } }),
      })
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result: {} }) })
    }
  })
}

test.describe('TC-50 · Connexion à un serveur MCP', () => {

  test('activer le toggle MCP charge les outils et les affiche', async ({ page }) => {
    await setConfig(page, { streamEnabled: false, mcpUrl: MCP_URL, mcpName: 'Test MCP', mcpEnabled: false })
    await mockMcpServer(page)
    await page.goto('/')

    // Ouvrir l'accordéon Serveur MCP
    await page.getByRole('button', { name: 'Serveur MCP' }).click()

    // Activer le toggle MCP
    await page.getByRole('region', { name: 'Serveur MCP' }).locator('input[type="checkbox"]').first().click({ force: true })

    // Les outils doivent apparaître
    const mcpRegion = page.getByRole('region', { name: 'Serveur MCP' })
    await expect(mcpRegion.getByText('recherche', { exact: true })).toBeVisible({ timeout: 10_000 })
    await expect(mcpRegion.getByText('calculatrice', { exact: true })).toBeVisible({ timeout: 5_000 })
  })

  test('les échanges MCP (initialize, tools/list) sont visibles dans l\'inspecteur HTTP', async ({ page }) => {
    await setConfig(page, { streamEnabled: false, mcpUrl: MCP_URL, mcpEnabled: false })
    await mockMcpServer(page)
    await page.goto('/')

    await page.getByRole('button', { name: 'Serveur MCP' }).click()
    await page.getByRole('region', { name: 'Serveur MCP' }).locator('input[type="checkbox"]').first().click({ force: true })

    await page.getByRole('region', { name: 'Serveur MCP' }).getByText('recherche', { exact: true }).waitFor({ timeout: 10_000 })

    const inspector = page.getByRole('complementary', { name: 'Inspecteur HTTP' })
    await expect(inspector.locator('span.bg-green-100', { hasText: 'MCP' }).first()).toBeVisible({ timeout: 5_000 })
  })
})

test.describe('TC-51 · Activation sélective des outils MCP', () => {

  test('seul l\'outil activé est transmis dans la requête LLM', async ({ page }) => {
    await setConfig(page, {
      streamEnabled: false,
      mcpEnabled: true,
      mcpUrl: MCP_URL,
      mcpTools: [
        { name: 'recherche',    description: 'Recherche', enabled: true,  inputSchema: {} },
        { name: 'calculatrice', description: 'Calcul',    enabled: false, inputSchema: {} },
      ],
    })

    let capturedBody: Record<string, unknown> | null = null
    await page.route('**/v1/responses', async route => {
      capturedBody = await route.request().postDataJSON() as Record<string, unknown>
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          id: 'r', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'OK' }] }],
          usage: { input_tokens: 5, output_tokens: 1 },
        }),
      })
    })

    await page.goto('/')
    await page.getByRole('textbox', { name: 'Message' }).fill('Test outils sélectifs')
    await page.getByRole('textbox', { name: 'Message' }).press('Enter')
    await page.waitForFunction(() => document.querySelector('main')?.textContent?.includes('OK'), { timeout: 10_000 })

    const bodyStr = JSON.stringify(capturedBody)
    expect(bodyStr).toContain('recherche')
    expect(bodyStr).not.toContain('calculatrice')
  })
})

test.describe('TC-52 · Boucle tool calling MCP', () => {

  test('un tool_call vers un outil MCP déclenche un appel au serveur MCP et un message tool_result', async ({ page }) => {
    await setConfig(page, {
      streamEnabled: false,
      mcpEnabled: true,
      mcpUrl: MCP_URL,
      mcpTools: [{ name: 'recherche', description: 'Recherche', enabled: true, inputSchema: {} }],
    })

    await mockMcpServer(page)

    let llmCallCount = 0
    await page.route('**/v1/responses', async route => {
      llmCallCount++
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: llmCallCount === 1
          ? JSON.stringify({
              id: 'r1',
              output: [{ type: 'function_call', call_id: 'tc1', name: 'recherche', arguments: '{"query":"test"}' }],
              usage: { input_tokens: 10, output_tokens: 5 },
            })
          : JSON.stringify({
              id: 'r2',
              output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Résultat reçu.' }] }],
              usage: { input_tokens: 20, output_tokens: 5 },
            }),
      })
    })

    await page.goto('/')
    await page.getByRole('textbox', { name: 'Message' }).fill('Recherche quelque chose')
    await page.getByRole('textbox', { name: 'Message' }).press('Enter')

    await expect(page.locator('main').getByText('Appel outil :', { exact: false })).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('main').getByText('Résultat outil')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('main').getByText('Résultat reçu.')).toBeVisible({ timeout: 5_000 })
  })
})

test.describe('TC-53 · Déconnexion MCP', () => {

  test('désactiver le toggle MCP envoie shutdown et exit au serveur', async ({ page }) => {
    await setConfig(page, {
      streamEnabled: false,
      mcpEnabled: true,
      mcpUrl: MCP_URL,
      mcpTools: MCP_TOOLS,
    })

    const calledMethods: string[] = []
    await mockMcpServer(page, {
      shutdown: async route => {
        calledMethods.push('shutdown')
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: 1, result: null }) })
      },
      exit: async route => {
        calledMethods.push('exit')
        await route.fulfill({ status: 204 })
      },
    })

    await page.goto('/')
    await page.getByRole('button', { name: 'Serveur MCP' }).click()

    // Désactiver le toggle MCP (il est actuellement actif)
    await page.getByRole('region', { name: 'Serveur MCP' }).locator('input[type="checkbox"]').first().click({ force: true })

    // Attendre que l'état MCP soit mis à jour
    await page.waitForTimeout(2_000)

    expect(calledMethods).toContain('shutdown')
    expect(calledMethods).toContain('exit')
  })

  test('après déconnexion, les outils MCP ne sont plus dans la liste', async ({ page }) => {
    await setConfig(page, {
      streamEnabled: false,
      mcpEnabled: true,
      mcpUrl: MCP_URL,
      mcpTools: MCP_TOOLS,
    })
    await mockMcpServer(page)
    await page.goto('/')

    await page.getByRole('button', { name: 'Serveur MCP' }).click()
    const mcpRegion = page.getByRole('region', { name: 'Serveur MCP' })
    await expect(mcpRegion.getByText('recherche', { exact: true })).toBeVisible({ timeout: 3_000 })

    // Désactiver MCP
    await mcpRegion.locator('input[type="checkbox"]').first().click({ force: true })

    await expect(mcpRegion.getByText('recherche', { exact: true })).not.toBeVisible({ timeout: 5_000 })
  })
})
