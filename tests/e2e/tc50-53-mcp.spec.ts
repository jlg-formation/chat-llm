import { test, expect } from '@playwright/test'
import { setConfig } from './helpers'
import { MCP_URL, MCP_TOOLS, mockMcpServer, openMcpServerCard } from './mcpMock'

test.describe('TC-50 · Connexion à un serveur MCP', () => {
  test('activer le toggle MCP charge les outils et les affiche', async ({ page }) => {
    await setConfig(page, {
      streamEnabled: false,
      mcpUrl: MCP_URL,
      mcpName: 'Test MCP',
      mcpEnabled: false,
    })
    await mockMcpServer(page)
    await page.goto('/')

    const mcpRegion = await openMcpServerCard(page)

    // Activer le toggle du serveur
    await mcpRegion.locator('input[type="checkbox"]').first().click({ force: true })

    // Les outils doivent apparaître
    await expect(mcpRegion.getByText('recherche', { exact: true })).toBeVisible({ timeout: 10_000 })
    await expect(mcpRegion.getByText('calculatrice', { exact: true })).toBeVisible({
      timeout: 5_000,
    })
  })

  test("les échanges MCP (initialize, tools/list) sont visibles dans l'inspecteur HTTP", async ({
    page,
  }) => {
    await setConfig(page, {
      streamEnabled: false,
      mcpUrl: MCP_URL,
      mcpEnabled: false,
    })
    await mockMcpServer(page)
    await page.goto('/')

    const mcpRegion = await openMcpServerCard(page)
    await mcpRegion.locator('input[type="checkbox"]').first().click({ force: true })

    await mcpRegion.getByText('recherche', { exact: true }).waitFor({ timeout: 10_000 })

    const inspector = page.getByRole('complementary', {
      name: 'Inspecteur HTTP',
    })
    await expect(inspector.locator('span.bg-green-100', { hasText: 'MCP' }).first()).toBeVisible({
      timeout: 5_000,
    })
  })
})

test.describe('TC-51 · Activation sélective des outils MCP', () => {
  test("seul l'outil activé est transmis dans la requête LLM", async ({ page }) => {
    await setConfig(page, {
      streamEnabled: false,
      mcpEnabled: true,
      mcpUrl: MCP_URL,
      mcpTools: [
        {
          name: 'recherche',
          description: 'Recherche',
          enabled: true,
          inputSchema: {},
        },
        {
          name: 'calculatrice',
          description: 'Calcul',
          enabled: false,
          inputSchema: {},
        },
      ],
    })

    let capturedBody: Record<string, unknown> | null = null
    await page.route('**/v1/responses', async (route) => {
      capturedBody = (await route.request().postDataJSON()) as Record<string, unknown>
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'r',
          output: [
            {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'output_text', text: 'OK' }],
            },
          ],
          usage: { input_tokens: 5, output_tokens: 1 },
        }),
      })
    })

    await page.goto('/')
    await page.getByRole('textbox', { name: 'Message' }).fill('Test outils sélectifs')
    await page.getByRole('textbox', { name: 'Message' }).press('Enter')
    await page.waitForFunction(() => document.querySelector('main')?.textContent?.includes('OK'), {
      timeout: 10_000,
    })

    const bodyStr = JSON.stringify(capturedBody)
    expect(bodyStr).toContain('recherche')
    expect(bodyStr).not.toContain('calculatrice')
  })
})

test.describe('TC-52 · Boucle tool calling MCP', () => {
  test('un tool_call vers un outil MCP déclenche un appel au serveur MCP et un message tool_result', async ({
    page,
  }) => {
    await setConfig(page, {
      streamEnabled: false,
      mcpEnabled: true,
      mcpUrl: MCP_URL,
      mcpTools: [
        {
          name: 'recherche',
          description: 'Recherche',
          enabled: true,
          inputSchema: {},
        },
      ],
    })

    await mockMcpServer(page)

    let llmCallCount = 0
    await page.route('**/v1/responses', async (route) => {
      llmCallCount++
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body:
          llmCallCount === 1
            ? JSON.stringify({
                id: 'r1',
                output: [
                  {
                    type: 'function_call',
                    call_id: 'tc1',
                    name: 'recherche',
                    arguments: '{"query":"test"}',
                  },
                ],
                usage: { input_tokens: 10, output_tokens: 5 },
              })
            : JSON.stringify({
                id: 'r2',
                output: [
                  {
                    type: 'message',
                    role: 'assistant',
                    content: [{ type: 'output_text', text: 'Résultat reçu.' }],
                  },
                ],
                usage: { input_tokens: 20, output_tokens: 5 },
              }),
      })
    })

    await page.goto('/')
    await page.getByRole('textbox', { name: 'Message' }).fill('Recherche quelque chose')
    await page.getByRole('textbox', { name: 'Message' }).press('Enter')

    await expect(page.locator('main').getByText('Appel outil :', { exact: false })).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.locator('main').getByText('Résultat outil')).toBeVisible({
      timeout: 5_000,
    })
    await expect(page.locator('main').getByText('Résultat reçu.')).toBeVisible({
      timeout: 5_000,
    })
  })
})

test.describe('TC-53 · Déconnexion MCP', () => {
  test('désactiver le toggle MCP envoie DELETE avec Mcp-Session-Id', async ({ page }) => {
    await setConfig(page, {
      streamEnabled: false,
      mcpEnabled: false,
      mcpUrl: MCP_URL,
      mcpName: 'Test MCP',
    })

    const deletedSessions: string[] = []
    await mockMcpServer(page, {
      DELETE: async (route) => {
        deletedSessions.push(route.request().headers()['mcp-session-id'] ?? '')
        await route.fulfill({ status: 200 })
      },
    })

    await page.goto('/')
    const mcpRegion = await openMcpServerCard(page)
    const toggle = mcpRegion.locator('input[type="checkbox"]').first()

    // Activer le toggle MCP : ouvre la session (initialize → Mcp-Session-Id: sess-1)
    await toggle.click({ force: true })
    await expect(mcpRegion.getByText('recherche', { exact: true })).toBeVisible({ timeout: 10_000 })

    // Désactiver le toggle MCP : doit envoyer DELETE avec la session
    await toggle.click({ force: true })

    await expect.poll(() => deletedSessions).toEqual(['sess-1'])
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

    const mcpRegion = await openMcpServerCard(page)
    await expect(mcpRegion.getByText('recherche', { exact: true })).toBeVisible({ timeout: 3_000 })

    // Désactiver MCP
    await mcpRegion.locator('input[type="checkbox"]').first().click({ force: true })

    await expect(mcpRegion.getByText('recherche', { exact: true })).not.toBeVisible({
      timeout: 5_000,
    })
  })
})
