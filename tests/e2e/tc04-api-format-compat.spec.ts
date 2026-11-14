import { test, expect } from '@playwright/test'
import { setConfig } from './helpers'

test.describe('TC-04 · Incompatibilité format API', () => {

  test('sur OVH avec un modèle non supporté, le format responses est désactivé', async ({ page }) => {
    await setConfig(page, { llm: { provider: 'ovh', model: 'mistral-7b-instruct', apiFormat: 'chat_completions' } })
    await page.goto('/')

    await expect(page.getByRole('radio', { name: /API Responses/ })).toBeDisabled()
  })

  test('sur OVH avec gpt-oss-20b, les deux formats sont accessibles', async ({ page }) => {
    await setConfig(page, { llm: { provider: 'ovh', model: 'gpt-oss-20b' } })
    await page.goto('/')

    await expect(page.getByRole('radio', { name: /API Responses/ })).toBeEnabled()
    await expect(page.getByRole('radio', { name: /API Chat Completions/ })).toBeEnabled()
  })

  test('sur OVH avec gpt-oss-120b, les deux formats sont accessibles', async ({ page }) => {
    await setConfig(page, { llm: { provider: 'ovh', model: 'gpt-oss-120b' } })
    await page.goto('/')

    await expect(page.getByRole('radio', { name: /API Responses/ })).toBeEnabled()
  })

  test('sur OpenAI, tous les formats sont accessibles', async ({ page }) => {
    await setConfig(page, { llm: { provider: 'openai', model: 'gpt-5.4-nano' } })
    await page.goto('/')

    await expect(page.getByRole('radio', { name: /API Responses/ })).toBeEnabled()
    await expect(page.getByRole('radio', { name: /API Chat Completions/ })).toBeEnabled()
  })
})
