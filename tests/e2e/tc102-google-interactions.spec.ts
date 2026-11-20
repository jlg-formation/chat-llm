import { test, expect } from '@playwright/test'
import { setConfig } from './helpers'
import { GOOGLE_CONFIG, interceptGoogle } from './googleMock'

async function send(page: import('@playwright/test').Page, text: string) {
  await page.getByRole('textbox', { name: 'Message' }).fill(text)
  await page.getByRole('textbox', { name: 'Message' }).press('Enter')
}

test.describe('TC-102 · Provider Google — sélection du format', () => {
  test.beforeEach(async ({ page }) => {
    await setConfig(page)
    await page.goto('/')
    await page.getByRole('combobox', { name: 'Provider' }).waitFor()
  })

  test('Google propose Interactions API natif et OpenAI compatible', async ({ page }) => {
    await page.getByRole('combobox', { name: 'Provider' }).selectOption('google')
    await expect(page.getByRole('radio', { name: /Interactions API/ })).toBeVisible()
    await expect(page.getByRole('radio', { name: /OpenAI compatible/ })).toBeVisible()
    await page.getByRole('radio', { name: /Interactions API/ }).click()
    await expect(page.getByRole('radio', { name: /Interactions API/ })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })
})

test.describe('TC-102b · Provider Google — Interactions API', () => {
  test('envoi non-streaming sur /v1beta/interactions avec x-goog-api-key', async ({ page }) => {
    await setConfig(page, { ...GOOGLE_CONFIG, streamEnabled: false })
    const requests = await interceptGoogle(page, () => [
      { type: 'model_output', text: 'Bonjour depuis Gemini' },
    ])
    await page.goto('/')
    await send(page, 'Salut')

    await expect(page.locator('main')).toContainText('Bonjour depuis Gemini', {
      timeout: 10_000,
    })
    const { url, headers, body } = requests[0]
    expect(url).toContain('/v1beta/interactions')
    expect(url).not.toContain('/openai/')
    expect(headers['x-goog-api-key']).toBe('AIza-test-key')
    expect(headers['authorization']).toBeUndefined()
    expect(body.model).toBe('gemini-3-flash-preview')
    expect(body.store).toBe(true)
    expect(body.stream).toBe(false)
    expect(body.input).toEqual([{ type: 'text', text: 'Salut' }])
  })

  test('envoi streaming ajoute alt=sse et affiche le texte', async ({ page }) => {
    await setConfig(page, { ...GOOGLE_CONFIG, streamEnabled: true })
    const requests = await interceptGoogle(page, () => [
      { type: 'model_output', text: 'Flux Gemini' },
    ])
    await page.goto('/')
    await send(page, 'Test flux')

    await expect(page.locator('main')).toContainText('Flux Gemini', {
      timeout: 10_000,
    })
    expect(requests[0].url).toContain('alt=sse')
    expect(requests[0].body.stream).toBe(true)
  })

  test('le second tour chaîne previous_interaction_id', async ({ page }) => {
    await setConfig(page, { ...GOOGLE_CONFIG, streamEnabled: false })
    let turn = 0
    const requests = await interceptGoogle(page, () => {
      turn++
      return [{ type: 'model_output', text: `Réponse ${turn}` }]
    })
    await page.goto('/')
    await send(page, 'Premier')
    await expect(page.locator('main')).toContainText('Réponse 1', {
      timeout: 10_000,
    })
    await send(page, 'Second')
    await expect(page.locator('main')).toContainText('Réponse 2', {
      timeout: 10_000,
    })

    expect(requests[0].body.previous_interaction_id).toBeUndefined()
    expect(requests[1].body.previous_interaction_id).toBe('int_test')
    expect(requests[1].body.input).toEqual([{ type: 'text', text: 'Second' }])
  })
})
