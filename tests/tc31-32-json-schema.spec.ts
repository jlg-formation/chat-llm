import { test, expect } from '@playwright/test'
import { setConfig } from './helpers'

test.describe('TC-31 · Validation JSON Schema et TC-32 · Transmission', () => {

  test.beforeEach(async ({ page }) => {
    await setConfig(page, { streamEnabled: false })
    await page.goto('/')
    await page.getByRole('button', { name: 'Structured Output' }).click()
  })

  test("TC-31 · un JSON invalide affiche un message d'erreur en temps réel", async ({ page }) => {
    await page.getByRole('textbox', { name: 'Schéma JSON' }).fill('{ "type": "object" ')

    await expect(page.getByText('JSON invalide')).toBeVisible({ timeout: 3_000 })
  })

  test("TC-31 · corriger le JSON fait disparaître l'erreur", async ({ page }) => {
    const schemaInput = page.getByRole('textbox', { name: 'Schéma JSON' })
    await schemaInput.fill('{ "type": "object" ')
    await expect(page.getByText('JSON invalide')).toBeVisible({ timeout: 3_000 })

    await schemaInput.fill('{"type":"object"}')
    await expect(page.getByText('JSON invalide')).not.toBeVisible()
  })

  test('TC-32 · le JSON Schema est transmis dans la requête LLM', async ({ page }) => {
    const schema = '{"name":"test","schema":{"type":"object","properties":{"answer":{"type":"string"}}}}'

    let body: Record<string, unknown> | null = null
    await page.route('**/v1/responses', async route => {
      body = await route.request().postDataJSON() as Record<string, unknown>
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          id: 'r',
          output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '{"answer":"42"}' }] }],
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      })
    })

    await page.getByRole('textbox', { name: 'Schéma JSON' }).fill(schema)
    await page.getByRole('textbox', { name: 'Message' }).fill('Question')
    await page.getByRole('textbox', { name: 'Message' }).press('Enter')
    await page.waitForFunction(() => document.querySelector('main')?.textContent?.includes('42'), { timeout: 10_000 })

    expect(body).not.toBeNull()
    const textFormat = body!['text'] as Record<string, unknown> | undefined
    expect(textFormat?.format).toBeDefined()
  })
})
