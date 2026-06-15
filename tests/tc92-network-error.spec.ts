import { test, expect } from '@playwright/test'
import { setConfig } from './helpers'

test.describe('TC-92 · Gestion des erreurs réseau', () => {

  test.beforeEach(async ({ page }) => {
    await setConfig(page, { streamEnabled: false })
    await page.goto('/')
  })

  test('une erreur 500 affiche un message dans la conversation', async ({ page }) => {
    await page.route('**/v1/responses', route => route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: { message: 'Internal Server Error' } }),
    }))

    await page.getByRole('textbox', { name: 'Message' }).fill('Test erreur')
    await page.getByRole('textbox', { name: 'Message' }).press('Enter')

    await expect(page.locator('main').getByText(/erreur/i)).toBeVisible({ timeout: 15_000 })
  })

  test('une erreur réseau (abort) affiche un message dans la conversation', async ({ page }) => {
    await page.route('**/v1/responses', route => route.abort('failed'))

    await page.getByRole('textbox', { name: 'Message' }).fill('Test abort')
    await page.getByRole('textbox', { name: 'Message' }).press('Enter')

    await expect(page.locator('main').getByText(/erreur/i)).toBeVisible({ timeout: 15_000 })
  })

  test("l'échange HTTP avec erreur 401 est visible dans la sidebar (status rouge)", async ({ page }) => {
    await page.route('**/v1/responses', route => route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: { message: 'Unauthorized' } }),
    }))

    await page.getByRole('textbox', { name: 'Message' }).fill('Test 401')
    await page.getByRole('textbox', { name: 'Message' }).press('Enter')

    await expect(page.locator('.bg-red-100').first()).toBeVisible({ timeout: 15_000 })
  })
})
