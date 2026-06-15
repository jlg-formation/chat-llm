import { test, expect } from '@playwright/test'
import { setConfig, interceptLLM } from './helpers'

test.describe('TC-14 · Nouvelle discussion', () => {

  test.beforeEach(async ({ page }) => {
    await setConfig(page, { streamEnabled: false })
    await interceptLLM(page, 'Réponse de test.')
    await page.goto('/')
  })

  test('le bouton Nouvelle discussion vide le fil de conversation', async ({ page }) => {
    const chat = page.locator('main')
    const input = page.getByRole('textbox', { name: 'Message' })

    await input.fill('Bonjour')
    await input.press('Enter')
    await expect(chat.getByText('Réponse de test.', { exact: true })).toBeVisible({ timeout: 15_000 })

    await page.getByRole('button', { name: 'Nouvelle discussion' }).click()

    await expect(chat.getByText('Bonjour', { exact: true })).not.toBeVisible()
    await expect(chat.getByText('Réponse de test.', { exact: true })).not.toBeVisible()
  })

  test('après nouvelle discussion, un nouveau message peut être envoyé', async ({ page }) => {
    const chat = page.locator('main')
    const input = page.getByRole('textbox', { name: 'Message' })

    await input.fill('Premier message')
    await input.press('Enter')
    await expect(chat.getByText('Réponse de test.', { exact: true })).toBeVisible({ timeout: 15_000 })

    await page.getByRole('button', { name: 'Nouvelle discussion' }).click()

    await input.fill('Second message')
    await input.press('Enter')
    await expect(chat.getByText('Second message', { exact: true })).toBeVisible({ timeout: 15_000 })
  })
})
