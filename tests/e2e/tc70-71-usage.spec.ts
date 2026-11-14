import { test, expect } from '@playwright/test'
import { setConfig } from './helpers'

const mockWithUsage = (inputTokens: number, outputTokens: number) => JSON.stringify({
  id: 'r',
  output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Réponse OK' }] }],
  usage: { input_tokens: inputTokens, output_tokens: outputTokens },
})

test.describe('TC-70 · Affichage des tokens et du coût', () => {

  test.beforeEach(async ({ page }) => {
    await setConfig(page, { streamEnabled: false })
    await page.route('**/v1/responses', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: mockWithUsage(42, 17),
    }))
    await page.goto('/')
    await page.getByRole('textbox', { name: 'Message' }).fill('Test usage')
    await page.getByRole('textbox', { name: 'Message' }).press('Enter')
    await page.waitForFunction(
      () => document.querySelector('main')?.textContent?.includes('Réponse OK'),
      { timeout: 10_000 }
    )
  })

  test('la section "Usage de la conversation" apparaît après un échange', async ({ page }) => {
    await expect(page.getByText('Usage de la conversation')).toBeVisible({ timeout: 5_000 })
  })

  test('le nombre de tokens input est affiché', async ({ page }) => {
    await expect(page.getByText('Usage de la conversation')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByLabel('Usage de la conversation').getByText('42')).toBeVisible()
  })

  test('le nombre de tokens output est affiché', async ({ page }) => {
    await expect(page.getByText('Usage de la conversation')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByLabel('Usage de la conversation').getByText('17')).toBeVisible()
  })

  test('le coût total estimé est affiché pour gpt-5.4-nano', async ({ page }) => {
    await expect(page.getByText('Coût total estimé')).toBeVisible({ timeout: 5_000 })
  })
})

test.describe('TC-71 · Réinitialisation des compteurs', () => {

  test('le bouton "Réinitialiser le compteur" masque la section Usage', async ({ page }) => {
    await setConfig(page, { streamEnabled: false })
    await page.route('**/v1/responses', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: mockWithUsage(10, 5),
    }))
    await page.goto('/')

    await page.getByRole('textbox', { name: 'Message' }).fill('Test reset')
    await page.getByRole('textbox', { name: 'Message' }).press('Enter')
    await page.waitForFunction(
      () => document.querySelector('main')?.textContent?.includes('Réponse OK'),
      { timeout: 10_000 }
    )

    await expect(page.getByText('Usage de la conversation')).toBeVisible({ timeout: 5_000 })

    await page.getByRole('button', { name: 'Réinitialiser le compteur' }).click()

    // La section disparaît (total === 0 → le composant retourne null)
    await expect(page.getByText('Usage de la conversation')).not.toBeVisible({ timeout: 3_000 })
  })

  test('la conversation reste intacte après reset des compteurs', async ({ page }) => {
    await setConfig(page, { streamEnabled: false })
    await page.route('**/v1/responses', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: mockWithUsage(10, 5),
    }))
    await page.goto('/')

    await page.getByRole('textbox', { name: 'Message' }).fill('Test persistance')
    await page.getByRole('textbox', { name: 'Message' }).press('Enter')
    await page.waitForFunction(
      () => document.querySelector('main')?.textContent?.includes('Réponse OK'),
      { timeout: 10_000 }
    )

    await page.getByRole('button', { name: 'Réinitialiser le compteur' }).click()

    // Les messages de conversation sont toujours présents
    await expect(page.locator('main').getByText('Test persistance')).toBeVisible()
    await expect(page.locator('main').getByText('Réponse OK')).toBeVisible()
  })
})
