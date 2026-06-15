import { test, expect } from '@playwright/test'
import { setConfig, interceptLLM } from './helpers'

test.describe('TC-12 · Auto-expansion du textarea — hauteur maximale', () => {

  test.beforeEach(async ({ page }) => {
    await setConfig(page, { streamEnabled: false })
    await page.goto('/')
  })

  test('la hauteur du textarea est plafonnée à 200 px même avec beaucoup de lignes', async ({ page }) => {
    const input = page.getByRole('textbox', { name: 'Message' })

    // Ajouter 25 sauts de ligne pour dépasser le plafond de 200 px
    for (let i = 0; i < 25; i++) {
      await input.press('Shift+Enter')
    }

    const height = (await input.boundingBox())?.height ?? 0
    // La hauteur ne doit pas dépasser 200 px (avec tolérance de 5 px pour le rendu)
    expect(height).toBeLessThanOrEqual(205)
    expect(height).toBeGreaterThan(100) // Bien plus grand que la hauteur initiale (~42 px)
  })

  test('après envoi du message, le textarea revient à sa hauteur initiale', async ({ page }) => {
    await interceptLLM(page, 'OK.')
    const input = page.getByRole('textbox', { name: 'Message' })

    // Agrandir le textarea
    for (let i = 0; i < 15; i++) {
      await input.press('Shift+Enter')
    }
    // Ajouter du texte pour permettre l'envoi
    await input.type('Message avec plusieurs lignes')

    const heightBefore = (await input.boundingBox())?.height ?? 0
    expect(heightBefore).toBeGreaterThan(60)

    // Envoyer le message
    await input.press('Enter')

    // Attendre la fin de l'envoi
    await expect(page.locator('main').getByText('OK.')).toBeVisible({ timeout: 10_000 })

    // Hauteur revient à la valeur initiale (~42 px)
    const heightAfter = (await input.boundingBox())?.height ?? 0
    expect(heightAfter).toBeLessThanOrEqual(60)
  })
})
