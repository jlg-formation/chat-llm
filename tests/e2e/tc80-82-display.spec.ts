import { test, expect } from '@playwright/test'
import { setConfig } from './helpers'

const mockResponse = (text: string) => JSON.stringify({
  id: 'r',
  output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }],
  usage: { input_tokens: 5, output_tokens: 10 },
})

test.describe('TC-80 · Rendu Markdown', () => {

  test.beforeEach(async ({ page }) => {
    await setConfig(page, { streamEnabled: false })
  })

  test('les titres Markdown sont rendus en HTML h2', async ({ page }) => {
    await page.route('**/v1/responses', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: mockResponse('## Titre de section\n\nContenu du paragraphe.'),
    }))

    await page.goto('/')
    await page.getByRole('textbox', { name: 'Message' }).fill('Test')
    await page.getByRole('textbox', { name: 'Message' }).press('Enter')

    await expect(page.locator('main h2', { hasText: 'Titre de section' })).toBeVisible({ timeout: 10_000 })
  })

  test('les listes à puces sont rendues en ul > li', async ({ page }) => {
    await page.route('**/v1/responses', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: mockResponse('- Item A\n- Item B\n- Item C'),
    }))

    await page.goto('/')
    await page.getByRole('textbox', { name: 'Message' }).fill('Test')
    await page.getByRole('textbox', { name: 'Message' }).press('Enter')

    await expect(page.locator('main').getByRole('listitem').filter({ hasText: 'Item A' })).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('main').getByRole('listitem').filter({ hasText: 'Item B' })).toBeVisible({ timeout: 10_000 })
  })

  test('le code inline est rendu en élément code', async ({ page }) => {
    await page.route('**/v1/responses', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: mockResponse('Utilisez la fonction `console.log()` pour déboguer.'),
    }))

    await page.goto('/')
    await page.getByRole('textbox', { name: 'Message' }).fill('Test')
    await page.getByRole('textbox', { name: 'Message' }).press('Enter')

    await expect(page.locator('main code', { hasText: 'console.log()' })).toBeVisible({ timeout: 10_000 })
  })
})

test.describe('TC-82 · Affichage JSON structuré', () => {

  test('la réponse JSON est formatée quand le schéma est actif', async ({ page }) => {
    const schema = '{"name":"test","schema":{"type":"object"}}'
    await setConfig(page, { streamEnabled: false, jsonSchema: schema })

    await page.route('**/v1/responses', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: mockResponse('{"key":"valeur","number":42}'),
    }))

    await page.goto('/')
    await page.getByRole('textbox', { name: 'Message' }).fill('Test')
    await page.getByRole('textbox', { name: 'Message' }).press('Enter')

    const chat = page.locator('main')
    await expect(chat.getByText('"key"', { exact: false })).toBeVisible({ timeout: 10_000 })
    await expect(chat.getByText('"valeur"', { exact: false })).toBeVisible({ timeout: 10_000 })
  })
})
