import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { setConfig } from './helpers'
import { MISTRAL_BASE, MISTRAL_CONFIG, interceptMistral } from './mistralMock'

// PNG 1×1 pixel minimal encodé en base64
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

const FORMATS = ['chat_completions', 'responses'] as const

async function send(page: Page, text: string) {
  await page.getByRole('textbox', { name: 'Message' }).fill(text)
  await page.getByRole('textbox', { name: 'Message' }).press('Enter')
}

test.describe('TC-99 · Provider Mistral — sélection et configuration', () => {
  test.beforeEach(async ({ page }) => {
    await setConfig(page)
    await page.goto('/')
    await page.getByRole('combobox', { name: 'Provider' }).waitFor()
  })

  test('Mistral est en 3e position avec Chat Completions par défaut', async ({ page }) => {
    const options = page.locator('#provider-select option')
    await expect(options.nth(2)).toHaveText('Mistral AI')

    await page.getByRole('combobox', { name: 'Provider' }).selectOption('mistral')

    await expect(page.getByRole('radio', { name: /API Chat Completions/ })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await expect(page.getByRole('radio', { name: /API Responses/ })).toBeVisible()
    await expect(page.getByLabel('URL de base')).toBeEnabled()
    await expect(page.getByLabel('URL de base')).toHaveValue(MISTRAL_BASE)
    await expect(page.getByRole('combobox', { name: 'Modèle' })).toHaveValue('ministral-3b-latest')
  })

  test('la liste de repli propose ministral, small et large', async ({ page }) => {
    await page.getByRole('combobox', { name: 'Provider' }).selectOption('mistral')
    for (const id of ['ministral-3b-latest', 'mistral-small-latest', 'mistral-large-latest'])
      await expect(page.locator(`select[aria-label="Modèle"] option[value="${id}"]`)).toHaveCount(1)
  })

  test('le chargement dynamique utilise GET /models avec Bearer', async ({ page }) => {
    let headers: Record<string, string> = {}
    await page.route(`${MISTRAL_BASE}/models`, async (route) => {
      headers = route.request().headers()
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({
          data: [
            { id: 'mistral-nouveau', capabilities: { completion_chat: true } },
            { id: 'mistral-embed', capabilities: { completion_chat: false } },
          ],
        }),
      })
    })
    await page.getByRole('combobox', { name: 'Provider' }).selectOption('mistral')
    await page.getByLabel(/Clé API/).fill('mist-load')
    await page.getByRole('button', { name: /Charger/ }).click()

    await expect(page.locator('option[value="mistral-nouveau"]')).toHaveCount(1, {
      timeout: 5_000,
    })
    await expect(page.locator('option[value="mistral-embed"]')).toHaveCount(0)
    expect(headers['authorization']).toBe('Bearer mist-load')
  })
})

test.describe('TC-99b · Provider Mistral — chat', () => {
  for (const apiFormat of FORMATS) {
    for (const stream of [false, true]) {
      test(`${apiFormat} : message (streaming ${stream ? 'ON' : 'OFF'})`, async ({ page }) => {
        await setConfig(page, {
          ...MISTRAL_CONFIG,
          llm: { ...MISTRAL_CONFIG.llm, apiFormat },
          streamEnabled: stream,
        })
        const requests = await interceptMistral(page, () => ({
          text: 'Bonjour depuis Mistral',
        }))
        await page.goto('/')
        await send(page, 'Salut')

        await expect(page.locator('main')).toContainText('Bonjour depuis Mistral', {
          timeout: 10_000,
        })
        const { headers, body } = requests[0]
        expect(headers['authorization']).toBe('Bearer mist-test-key')
        expect(body.stream).toBe(stream)
        expect(body.model).toBe('mistral-small-latest')
        if (apiFormat === 'responses') {
          expect(body.store).toBe(false)
          expect(body).not.toHaveProperty('previous_response_id')
        } else {
          expect(body).not.toHaveProperty('stream_options')
        }
      })
    }
  }

  test('chat_completions : sampling avec max_tokens', async ({ page }) => {
    await setConfig(page, {
      ...MISTRAL_CONFIG,
      llm: {
        ...MISTRAL_CONFIG.llm,
        temperature: 0.4,
        topP: 0.7,
        maxTokens: 99,
      },
      streamEnabled: false,
    })
    const requests = await interceptMistral(page, () => ({ text: 'ok' }))
    await page.goto('/')
    await send(page, 'Test')
    await expect(page.locator('main')).toContainText('ok', { timeout: 10_000 })

    const { body } = requests[0]
    expect(body.temperature).toBe(0.4)
    expect(body.top_p).toBe(0.7)
    expect(body.max_tokens).toBe(99)
    expect(body).not.toHaveProperty('max_completion_tokens')
  })

  test('responses : max_output_tokens', async ({ page }) => {
    await setConfig(page, {
      ...MISTRAL_CONFIG,
      llm: { ...MISTRAL_CONFIG.llm, apiFormat: 'responses', maxTokens: 77 },
      streamEnabled: false,
    })
    const requests = await interceptMistral(page, () => ({ text: 'ok' }))
    await page.goto('/')
    await send(page, 'Test')
    await expect(page.locator('main')).toContainText('ok', { timeout: 10_000 })
    expect(requests[0].body.max_output_tokens).toBe(77)
  })

  test('le system prompt est envoyé dans les deux formats', async ({ page }) => {
    for (const apiFormat of FORMATS) {
      await page.unrouteAll()
      await setConfig(page, {
        ...MISTRAL_CONFIG,
        llm: { ...MISTRAL_CONFIG.llm, apiFormat },
        streamEnabled: false,
        systemPrompt: 'Tu es un pirate.',
      })
      const requests = await interceptMistral(page, () => ({ text: 'Arr' }))
      await page.goto('/')
      await send(page, 'Salut')
      await expect(page.locator('main')).toContainText('Arr', {
        timeout: 10_000,
      })
      const { body } = requests[0]
      if (apiFormat === 'responses') expect(body.instructions).toBe('Tu es un pirate.')
      else
        expect(body.messages[0]).toEqual({
          role: 'system',
          content: 'Tu es un pirate.',
        })
    }
  })

  test('le structured output est envoyé avec strict: false', async ({ page }) => {
    const schema = { type: 'object', properties: { a: { type: 'string' } } }
    await setConfig(page, {
      ...MISTRAL_CONFIG,
      streamEnabled: false,
      jsonSchema: JSON.stringify({ name: 's', schema }),
    })
    const requests = await interceptMistral(page, () => ({
      text: '{"a":"x"}',
    }))
    await page.goto('/')
    await send(page, 'JSON')
    await expect(page.locator('main')).toContainText('"a"', {
      timeout: 10_000,
    })
    expect(requests[0].body.response_format.type).toBe('json_schema')
    expect(requests[0].body.response_format.json_schema.strict).not.toBe(true)
  })

  test('une image collée est envoyée en image_url', async ({ page }) => {
    await setConfig(page, { ...MISTRAL_CONFIG, streamEnabled: false })
    const requests = await interceptMistral(page, () => ({ text: 'Vu' }))
    await page.goto('/')
    await page.getByRole('textbox', { name: 'Message' }).click()
    await page.evaluate((b64: string) => {
      const textarea = document.querySelector('textarea')!
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      const dt = new DataTransfer()
      dt.items.add(new File([bytes], 'p.png', { type: 'image/png' }))
      textarea.dispatchEvent(
        new ClipboardEvent('paste', {
          clipboardData: dt,
          bubbles: true,
          cancelable: true,
        }),
      )
    }, PNG_B64)
    await expect(page.locator('img[alt="Image jointe 1"]')).toBeVisible()
    await send(page, 'Décris')
    await expect(page.locator('main')).toContainText('Vu', { timeout: 10_000 })

    const content = requests[0].body.messages[0].content
    expect(content[1]).toEqual({
      type: 'image_url',
      image_url: { url: `data:image/png;base64,${PNG_B64}` },
    })
  })

  for (const apiFormat of FORMATS) {
    test(`${apiFormat} : tokens, coût estimé et clé masquée dans l'inspecteur`, async ({
      page,
    }) => {
      await setConfig(page, {
        ...MISTRAL_CONFIG,
        llm: { ...MISTRAL_CONFIG.llm, apiFormat },
        streamEnabled: false,
      })
      await interceptMistral(page, () => ({ text: 'Réponse OK' }), {
        prompt: 42,
        completion: 17,
      })
      await page.goto('/')
      await send(page, 'Usage')
      await expect(page.locator('main')).toContainText('Réponse OK', {
        timeout: 10_000,
      })

      const usage = page.getByLabel('Usage de la conversation')
      await expect(usage.getByText('42')).toBeVisible({ timeout: 5_000 })
      await expect(usage.getByText('17')).toBeVisible()
      await expect(page.getByText('Coût total estimé')).toBeVisible()

      const inspector = page.getByRole('complementary', {
        name: 'Inspecteur HTTP',
      })
      await expect(inspector).toContainText(
        apiFormat === 'responses'
          ? 'api.mistral.ai/v1/responses'
          : 'api.mistral.ai/v1/chat/completions',
      )
      expect(await inspector.textContent()).not.toContain('mist-test-key')
    })
  }
})
