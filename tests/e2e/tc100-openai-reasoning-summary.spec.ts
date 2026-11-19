import { test, expect, type Page, type Route } from '@playwright/test'
import { setConfig } from './helpers'

async function send(page: Page, text: string) {
  await page.getByRole('textbox', { name: 'Message' }).fill(text)
  await page.getByRole('textbox', { name: 'Message' }).press('Enter')
}

const sseBody = (...events: unknown[]) =>
  [...events.map((e) => `data: ${JSON.stringify(e)}`), 'data: [DONE]', ''].join('\n\n')

async function interceptReasoning(page: Page) {
  const requests: Array<{ body: Record<string, unknown> }> = []
  await page.route('**/v1/responses', async (route: Route) => {
    const body = (await route.request().postDataJSON()) as Record<string, unknown>
    requests.push({ body })
    await route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Access-Control-Allow-Origin': '*',
      },
      body: sseBody(
        {
          type: 'response.reasoning_summary_text.delta',
          delta: 'Je compare les options.',
        },
        { type: 'response.output_text.delta', delta: 'Réponse finale' },
        {
          type: 'response.completed',
          response: {
            id: 'resp_r',
            usage: { input_tokens: 5, output_tokens: 3 },
          },
        },
      ),
    })
  })
  return requests
}

test.describe('TC-100 · OpenAI — résumé de réflexion', () => {
  test('le résumé streamé est dans un bloc replié au-dessus de la réponse', async ({ page }) => {
    await setConfig(page, { streamEnabled: true, llm: { model: 'gpt-5.4' } })
    const requests = await interceptReasoning(page)
    await page.goto('/')
    await send(page, 'Test')

    await expect(page.locator('main')).toContainText('Réponse finale', {
      timeout: 10_000,
    })
    const toggle = page.locator('main').getByRole('button', { name: 'Réflexion' })
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(page.locator('main')).not.toContainText('Je compare les options.')

    await toggle.click()
    await expect(page.locator('main')).toContainText('Je compare les options.')

    expect(requests[0].body.reasoning).toEqual({
      effort: 'medium',
      summary: 'auto',
    })
  })

  test('désactiver le résumé masque le bloc sans renvoyer la réflexion à l’API', async ({
    page,
  }) => {
    await setConfig(page, { streamEnabled: true, llm: { model: 'gpt-5.4' } })
    const requests = await interceptReasoning(page)
    await page.goto('/')
    await page.getByRole('button', { name: 'Thinking' }).click()
    await page.getByRole('switch', { name: 'Afficher le résumé de réflexion' }).click()
    await send(page, 'Test')

    await expect(page.locator('main')).toContainText('Réponse finale', {
      timeout: 10_000,
    })
    await expect(page.locator('main').getByRole('button', { name: 'Réflexion' })).toHaveCount(0)

    await send(page, 'Second tour')
    await expect.poll(() => requests.length).toBe(2)
    expect(requests[0].body.reasoning).toEqual({
      effort: 'medium',
      summary: 'auto',
    })
    expect(JSON.stringify(requests[1].body)).not.toContain('Je compare les options.')
  })
})
