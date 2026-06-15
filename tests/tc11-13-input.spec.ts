import { test, expect } from '@playwright/test'
import { setConfig } from './helpers'

test.describe('TC-11 · Saut de ligne et TC-13 · Bouton Envoyer désactivé', () => {

  test.beforeEach(async ({ page }) => {
    await setConfig(page)
    await page.goto('/')
  })

  test('TC-11 · Maj+Entrée insère un saut de ligne sans envoyer le message', async ({ page }) => {
    const input = page.getByRole('textbox', { name: 'Message' })
    await input.click()
    await input.type('Ligne 1')
    await input.press('Shift+Enter')
    await input.type('Ligne 2')

    // Aucun message ne doit apparaître dans la liste des messages
    const messagesArea = page.locator('main .overflow-y-auto')
    await expect(messagesArea.getByText('Ligne 1', { exact: false })).not.toBeVisible()

    // Le textarea doit contenir le saut de ligne
    const value = await input.inputValue()
    expect(value).toContain('\n')
    expect(value).toContain('Ligne 1')
    expect(value).toContain('Ligne 2')
  })

  test('TC-13 · le bouton Envoyer est désactivé si le champ est vide', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Envoyer' })).toBeDisabled()
  })

  test("TC-13 · le bouton Envoyer est activé dès qu'un caractère est saisi", async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Envoyer' })).toBeDisabled()
    await page.getByRole('textbox', { name: 'Message' }).type('a')
    await expect(page.getByRole('button', { name: 'Envoyer' })).toBeEnabled()
  })

  test("TC-12 · le textarea s'agrandit avec le contenu (auto-expand)", async ({ page }) => {
    const input = page.getByRole('textbox', { name: 'Message' })
    const heightBefore = (await input.boundingBox())?.height ?? 0

    for (let i = 0; i < 6; i++) {
      await input.press('Shift+Enter')
    }

    const heightAfter = (await input.boundingBox())?.height ?? 0
    expect(heightAfter).toBeGreaterThan(heightBefore)
  })
})
