import type { Page, Route } from '@playwright/test'

export const MCP_URL = 'http://localhost:9999'

export const MCP_TOOLS = [
  {
    name: 'recherche',
    description: 'Recherche sur le web',
    enabled: true,
    inputSchema: {},
  },
  {
    name: 'calculatrice',
    description: 'Calcul mathématique',
    enabled: true,
    inputSchema: {},
  },
]

/** Intercepte toutes les requêtes vers le faux serveur MCP et répond selon la méthode JSON-RPC. */
export async function mockMcpServer(
  page: Page,
  handlers: Partial<
    Record<string, (route: Route, body: Record<string, unknown>) => Promise<void>>
  > = {},
) {
  await page.route(`${MCP_URL}**`, async (route) => {
    const isDelete = route.request().method() === 'DELETE'
    const body = isDelete ? {} : ((await route.request().postDataJSON()) as Record<string, unknown>)
    const method = isDelete ? 'DELETE' : ((body.method as string) ?? '')

    const custom = handlers[method]
    if (custom) {
      await custom(route, body)
      return
    }

    if (method === 'initialize') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'Mcp-Session-Id': 'sess-1',
          'Access-Control-Expose-Headers': 'Mcp-Session-Id',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: body.id,
          result: { protocolVersion: '2025-03-26', capabilities: {} },
        }),
      })
    } else if (method === 'notifications/initialized') {
      await route.fulfill({ status: 204 })
    } else if (method === 'tools/list') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: body.id,
          result: { tools: MCP_TOOLS },
        }),
      })
    } else if (method === 'DELETE') {
      await route.fulfill({ status: 200 })
    } else if (method === 'tools/call') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: body.id,
          result: { content: [{ type: 'text', text: 'Résultat MCP de test' }] },
        }),
      })
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result: {} }),
      })
    }
  })
}

/** Ouvre l'accordéon "Serveurs MCP" et déplie la carte du premier serveur. */
export async function openMcpServerCard(page: Page) {
  await page.getByRole('button', { name: 'Serveurs MCP' }).click()
  const region = page.getByRole('region', { name: 'Serveurs MCP' })
  await region.getByRole('button', { name: 'Développer' }).first().click()
  return region
}
