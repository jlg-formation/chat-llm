import { test, expect } from '@playwright/test'
import { setConfig } from './helpers'

function mockResponse(text: string) {
  return JSON.stringify({
    id: 'r',
    output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }],
    usage: { input_tokens: 5, output_tokens: 10 },
  })
}

test.describe('TC-81 · Blocs XML pliables', () => {

  test.beforeEach(async ({ page }) => {
    await setConfig(page, { streamEnabled: false })
  })

  test('un bloc <think>…</think> est affiché plié avec le tag visible', async ({ page }) => {
    await page.route('**/v1/responses', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: mockResponse('<think>Raisonnement détaillé interne.</think>\n\nRéponse finale.'),
    }))

    await page.goto('/')
    await page.getByRole('textbox', { name: 'Message' }).fill('Test')
    await page.getByRole('textbox', { name: 'Message' }).press('Enter')

    // Le tag <think> est visible dans le bouton du bloc plié
    await expect(page.locator('main').getByText('<think>', { exact: false })).toBeVisible({ timeout: 10_000 })
    // Le contenu du raisonnement n'est PAS visible (bloc plié par défaut)
    await expect(page.locator('main').getByText('Raisonnement détaillé interne.')).not.toBeVisible()
    // La réponse finale est visible normalement
    await expect(page.locator('main').getByText('Réponse finale.')).toBeVisible()
  })

  test('cliquer sur le bloc XML déplie son contenu', async ({ page }) => {
    await page.route('**/v1/responses', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: mockResponse('<think>Raisonnement à déplier.</think>\n\nOK.'),
    }))

    await page.goto('/')
    await page.getByRole('textbox', { name: 'Message' }).fill('Test')
    await page.getByRole('textbox', { name: 'Message' }).press('Enter')

    // Attendre que le bloc apparaisse
    await page.locator('main').getByText('<think>', { exact: false }).waitFor({ timeout: 10_000 })

    // Cliquer sur le bouton du bloc pour le déplier
    await page.locator('main button', { hasText: '<think>' }).click()

    // Le contenu est maintenant visible
    await expect(page.locator('main').getByText('Raisonnement à déplier.')).toBeVisible({ timeout: 3_000 })
  })

  test('un bloc XML non fermé (streaming en cours) affiche le style indigo de chargement', async ({ page }) => {
    // Texte avec tag ouvert mais non fermé → parseXmlBlocks détecte unclosed: true
    await page.route('**/v1/responses', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: mockResponse('<think>Réflexion encore en cours sans balise de fermeture'),
    }))

    await page.goto('/')
    await page.getByRole('textbox', { name: 'Message' }).fill('Test')
    await page.getByRole('textbox', { name: 'Message' }).press('Enter')

    // Le bloc unclosed a un style indigo distinctif
    await expect(page.locator('main .border-indigo-300')).toBeVisible({ timeout: 10_000 })
    // Le tag est visible avec le style indigo
    await expect(page.locator('main .text-indigo-500', { hasText: '<think>' })).toBeVisible({ timeout: 3_000 })
  })
})
