import { test, expect } from '@playwright/test'
import { setConfig } from './helpers'

test.describe('TC-05 · Paramètres de sampling', () => {

  test('les valeurs de sampling sont restaurées après rechargement', async ({ page }) => {
    await setConfig(page, { llm: { temperature: 0.5, topP: 0.8, maxTokens: 512 } })
    await page.goto('/')

    await page.getByRole('button', { name: 'Sampling' }).click()
    await page.reload()
    await page.getByRole('button', { name: 'Sampling' }).click()

    await expect(page.getByRole('slider', { name: 'Temperature' })).toHaveValue('0.5')
  })

  test('la température est transmise dans la requête LLM', async ({ page }) => {
    await setConfig(page, { streamEnabled: false, llm: { temperature: 0.3, topP: null, maxTokens: null } })

    let body: Record<string, unknown> | null = null
    await page.route('**/v1/responses', async route => {
      body = await route.request().postDataJSON() as Record<string, unknown>
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          id: 'r', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'OK' }] }],
          usage: { input_tokens: 5, output_tokens: 1 },
        }),
      })
    })

    await page.goto('/')
    await page.getByRole('textbox', { name: 'Message' }).fill('Hi')
    await page.getByRole('textbox', { name: 'Message' }).press('Enter')
    await page.waitForFunction(() => document.querySelector('main')?.textContent?.includes('OK'), { timeout: 10_000 })

    expect(body?.temperature).toBe(0.3)
  })

  test('max tokens est transmis dans la requête LLM', async ({ page }) => {
    await setConfig(page, { streamEnabled: false, llm: { temperature: null, topP: null, maxTokens: 256 } })

    let body: Record<string, unknown> | null = null
    await page.route('**/v1/responses', async route => {
      body = await route.request().postDataJSON() as Record<string, unknown>
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          id: 'r', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'OK' }] }],
          usage: { input_tokens: 5, output_tokens: 1 },
        }),
      })
    })

    await page.goto('/')
    await page.getByRole('textbox', { name: 'Message' }).fill('Hi')
    await page.getByRole('textbox', { name: 'Message' }).press('Enter')
    await page.waitForFunction(() => document.querySelector('main')?.textContent?.includes('OK'), { timeout: 10_000 })

    expect(body?.max_output_tokens).toBe(256)
  })
})
