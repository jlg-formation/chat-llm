import { test, expect } from '@playwright/test'
import { setConfig, interceptLLM } from './helpers'

test.describe('TC-64 · Auto-scroll de l\'inspecteur HTTP vers le dernier échange', () => {

  test('le conteneur de l\'inspecteur est scrollé vers le bas après un nouvel échange', async ({ page }) => {
    await setConfig(page, { streamEnabled: false })
    await interceptLLM(page, 'Réponse.')
    await page.goto('/')

    // Envoyer 5 messages pour remplir l'inspecteur
    for (let i = 1; i <= 5; i++) {
      await page.getByRole('textbox', { name: 'Message' }).fill(`Message ${i}`)
      await page.getByRole('textbox', { name: 'Message' }).press('Enter')
      await page.locator('span.bg-blue-100', { hasText: 'LLM' }).nth(i - 1).waitFor({ timeout: 15_000 })
    }

    // Remonter manuellement le scroll dans le conteneur de l'inspecteur
    const scrollContainer = page.locator('aside[aria-label="Inspecteur HTTP"] div.overflow-y-auto')
    await scrollContainer.evaluate((el: HTMLElement) => { el.scrollTop = 0 })

    // Vérifier qu'on est bien remonté
    const scrollTopBefore = await scrollContainer.evaluate((el: HTMLElement) => el.scrollTop)
    expect(scrollTopBefore).toBe(0)

    // Envoyer un 6e message → l'auto-scroll doit descendre le conteneur vers le bas
    await page.getByRole('textbox', { name: 'Message' }).fill('Message 6')
    await page.getByRole('textbox', { name: 'Message' }).press('Enter')
    await page.locator('span.bg-blue-100', { hasText: 'LLM' }).nth(5).waitFor({ timeout: 15_000 })

    // Attendre que le scroll soit revenu en bas (smooth scroll asynchrone)
    await page.waitForFunction(() => {
      const el = document.querySelector('aside[aria-label="Inspecteur HTTP"] div.overflow-y-auto')
      if (!el) return false
      return el.scrollTop + el.clientHeight >= el.scrollHeight - 20
    }, { timeout: 5_000 })
  })
})
