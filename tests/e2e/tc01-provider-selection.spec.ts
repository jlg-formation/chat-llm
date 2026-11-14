import { test, expect } from '@playwright/test'
import { setConfig } from './helpers'

test.describe('TC-01 · Sélection du provider et du modèle', () => {

  test.beforeEach(async ({ page }) => {
    await setConfig(page)
    await page.goto('/')
    await page.getByRole('combobox', { name: 'Provider' }).waitFor()
  })

  test("sélectionner OVH met à jour l'URL de base", async ({ page }) => {
    await page.getByRole('combobox', { name: 'Provider' }).selectOption('ovh')

    await expect(page.getByLabel('URL de base')).toHaveValue(/ovh|openai-compat/i)
  })

  test('sélectionner OVH propose les formats responses et chat_completions', async ({ page }) => {
    await page.getByRole('combobox', { name: 'Provider' }).selectOption('ovh')

    await expect(page.getByRole('radio', { name: /API Responses/ })).toBeVisible()
    await expect(page.getByRole('radio', { name: /API Chat Completions/ })).toBeVisible()
  })

  test("sélectionner Ollama rend l'URL éditable avec localhost", async ({ page }) => {
    await page.getByRole('combobox', { name: 'Provider' }).selectOption('ollama')

    const urlInput = page.getByLabel('URL de base')
    await expect(urlInput).toBeEnabled()
    await expect(urlInput).toHaveValue(/localhost:11434/)
  })

  test("sélectionner OpenAI verrouille l'URL de base", async ({ page }) => {
    await page.getByRole('combobox', { name: 'Provider' }).selectOption('ovh')
    await page.getByRole('combobox', { name: 'Provider' }).selectOption('openai')

    await expect(page.getByLabel('URL de base')).toBeDisabled()
    await expect(page.getByLabel('URL de base')).toHaveValue(/openai\.com/)
  })

  test('changer de provider ne recharge pas la page', async ({ page }) => {
    let navigationCount = 0
    page.on('framenavigated', () => navigationCount++)

    await page.getByRole('combobox', { name: 'Provider' }).selectOption('ovh')
    await page.getByRole('combobox', { name: 'Provider' }).selectOption('lmstudio')

    expect(navigationCount).toBe(0)
  })

  test('sélectionner LM Studio affiche le format lmstudio_chat', async ({ page }) => {
    await page.getByRole('combobox', { name: 'Provider' }).selectOption('lmstudio')

    await expect(page.getByRole('radio', { name: /LM Studio Chat/ })).toBeVisible()
  })
})
