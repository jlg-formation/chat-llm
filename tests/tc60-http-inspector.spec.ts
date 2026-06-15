import { test, expect } from '@playwright/test'
import { setConfig, interceptLLM } from './helpers'

test.describe('TC-60 · Inspecteur HTTP — affichage échange LLM', () => {

  test.beforeEach(async ({ page }) => {
    await setConfig(page, { streamEnabled: false })
    await interceptLLM(page, 'Réponse inspecteur.')
    await page.goto('/')
  })

  test("une carte d'échange LLM apparaît dans la sidebar droite après envoi", async ({ page }) => {
    await page.getByRole('textbox', { name: 'Message' }).fill('Test inspecteur')
    await page.getByRole('textbox', { name: 'Message' }).press('Enter')

    await expect(page.locator('span.bg-blue-100', { hasText: 'LLM' }).first()).toBeVisible({ timeout: 15_000 })
  })

  test("la carte affiche la méthode POST et l'URL de l'API", async ({ page }) => {
    await page.getByRole('textbox', { name: 'Message' }).fill('Test')
    await page.getByRole('textbox', { name: 'Message' }).press('Enter')
    await page.locator('span.bg-blue-100', { hasText: 'LLM' }).first().waitFor({ timeout: 15_000 })

    const inspector = page.getByRole('complementary', { name: 'Inspecteur HTTP' })
    await expect(inspector).toContainText('POST')
    await expect(inspector).toContainText('openai.com')
  })

  test('la clé API est masquée dans les headers affichés', async ({ page }) => {
    await page.getByRole('textbox', { name: 'Message' }).fill('Test')
    await page.getByRole('textbox', { name: 'Message' }).press('Enter')
    await page.locator('span.bg-blue-100', { hasText: 'LLM' }).first().waitFor({ timeout: 15_000 })

    const inspector = page.getByRole('complementary', { name: 'Inspecteur HTTP' })
    const text = await inspector.textContent()
    expect(text).not.toContain('sk-test-key')
  })

  test("le bouton Vider l'inspecteur supprime tous les échanges", async ({ page }) => {
    await page.getByRole('textbox', { name: 'Message' }).fill('Message 1')
    await page.getByRole('textbox', { name: 'Message' }).press('Enter')
    await page.locator('span.bg-blue-100', { hasText: 'LLM' }).first().waitFor({ timeout: 15_000 })

    await page.getByRole('button', { name: "Vider l'inspecteur" }).click()

    await expect(page.locator('span.bg-blue-100', { hasText: 'LLM' })).toHaveCount(0)
  })
})
