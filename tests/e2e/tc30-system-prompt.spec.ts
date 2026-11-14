import { test, expect } from '@playwright/test'
import { setConfig } from './helpers'

test.describe('TC-30 · Injection du prompt système', () => {

  test('le prompt système est inclus dans la requête LLM (format Responses API)', async ({ page }) => {
    const systemPrompt = 'Tu es un assistant pédagogique expert en mathématiques.'
    await setConfig(page, { streamEnabled: false, systemPrompt })

    let capturedBody: Record<string, unknown> | null = null
    await page.route('**/v1/responses', async route => {
      capturedBody = await route.request().postDataJSON() as Record<string, unknown>
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'resp_test',
          output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'OK' }] }],
          usage: { input_tokens: 10, output_tokens: 1 },
        }),
      })
    })

    await page.goto('/')
    await page.getByRole('textbox', { name: 'Message' }).fill('Bonjour')
    await page.getByRole('textbox', { name: 'Message' }).press('Enter')
    await page.waitForFunction(() => document.querySelector('main')?.textContent?.includes('OK'), { timeout: 10_000 })

    expect(capturedBody).not.toBeNull()
    expect(capturedBody!['instructions'] as string).toContain(systemPrompt)
  })

  test('sans prompt système, le champ instructions est vide ou absent', async ({ page }) => {
    await setConfig(page, { streamEnabled: false, systemPrompt: '' })

    let capturedBody: Record<string, unknown> | null = null
    await page.route('**/v1/responses', async route => {
      capturedBody = await route.request().postDataJSON() as Record<string, unknown>
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'resp_test',
          output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'OK' }] }],
          usage: { input_tokens: 5, output_tokens: 1 },
        }),
      })
    })

    await page.goto('/')
    await page.getByRole('textbox', { name: 'Message' }).fill('Hi')
    await page.getByRole('textbox', { name: 'Message' }).press('Enter')
    await page.waitForFunction(() => document.querySelector('main')?.textContent?.includes('OK'), { timeout: 10_000 })

    const instructions = capturedBody!['instructions'] as string | undefined
    expect(!instructions || instructions.trim() === '').toBe(true)
  })
})
