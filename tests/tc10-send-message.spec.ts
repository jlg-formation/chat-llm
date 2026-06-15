import { test, expect } from '@playwright/test'
import { setConfig, interceptLLM } from './helpers'

test.describe('TC-10 · Envoi de message simple', () => {

  test.beforeEach(async ({ page }) => {
    await setConfig(page, { streamEnabled: false })
    await interceptLLM(page, 'Bonjour, je suis votre assistant pédagogique.')
    await page.goto('/')
  })

  test('le message utilisateur apparaît dans le fil', async ({ page }) => {
    await page.getByRole('textbox', { name: 'Message' }).fill('Bonjour !')
    await page.getByRole('textbox', { name: 'Message' }).press('Enter')

    await expect(page.locator('main').getByText('Bonjour !', { exact: true })).toBeVisible()
  })

  test('la réponse assistant apparaît après envoi', async ({ page }) => {
    await page.getByRole('textbox', { name: 'Message' }).fill('Bonjour !')
    await page.getByRole('textbox', { name: 'Message' }).press('Enter')

    await expect(page.locator('main').getByText('Bonjour, je suis votre assistant pédagogique.', { exact: true })).toBeVisible({ timeout: 15_000 })
  })

  test("l'input est vidé après envoi", async ({ page }) => {
    const input = page.getByRole('textbox', { name: 'Message' })
    await input.fill('Bonjour !')
    await input.press('Enter')

    await expect(input).toHaveValue('')
  })

  test('le bouton Envoyer est désactivé si le champ est vide', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Envoyer' })).toBeDisabled()
  })

  test('un échange HTTP LLM apparaît dans la sidebar droite', async ({ page }) => {
    await page.getByRole('textbox', { name: 'Message' }).fill('Test')
    await page.getByRole('textbox', { name: 'Message' }).press('Enter')

    await expect(page.locator('span.bg-blue-100', { hasText: 'LLM' }).first()).toBeVisible({ timeout: 15_000 })
  })
})
