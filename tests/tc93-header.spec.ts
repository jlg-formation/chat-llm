import { test, expect } from '@playwright/test'
import { setConfig } from './helpers'

test.describe('TC-93 · Header synchronisé', () => {

  test('affiche le provider et le modèle par défaut', async ({ page }) => {
    await setConfig(page, { llm: { provider: 'openai', model: 'gpt-5.4-nano' } })
    await page.goto('/')

    const badge = page.locator('header .bg-blue-50')
    await expect(badge).toContainText('OpenAI')
    await expect(badge).toContainText('gpt-5.4-nano')
  })

  test('met à jour le badge provider immédiatement après changement', async ({ page }) => {
    await setConfig(page, { llm: { provider: 'openai', model: 'gpt-5.4-nano' } })
    await page.goto('/')

    await page.getByRole('combobox', { name: 'Provider' }).selectOption('ovh')

    const badge = page.locator('header .bg-blue-50')
    await expect(badge).toContainText('OVH')
    await expect(badge).not.toContainText('OpenAI')
  })

  test('affiche Stream ON quand le streaming est activé', async ({ page }) => {
    await setConfig(page, { streamEnabled: true })
    await page.goto('/')

    await expect(page.locator('header')).toContainText('Stream ON')
  })

  test('affiche Stream OFF quand le streaming est désactivé', async ({ page }) => {
    await setConfig(page, { streamEnabled: false })
    await page.goto('/')

    await expect(page.locator('header')).toContainText('Stream OFF')
  })

  test('le badge de streaming se met à jour après toggle', async ({ page }) => {
    await setConfig(page, { streamEnabled: true })
    await page.goto('/')

    await expect(page.locator('header')).toContainText('Stream ON')

    // Ouvrir l'accordéon Mode Stream puis cliquer le switch
    await page.getByRole('button', { name: 'Mode Stream' }).click()
    await page.getByRole('switch', { name: 'Mode stream' }).click()

    await expect(page.locator('header')).toContainText('Stream OFF')
  })
})
