import { test, expect } from '@playwright/test'
import { setConfig } from './helpers'

test.describe('TC-15 · Arrêt de la génération', () => {

  test.beforeEach(async ({ page }) => {
    await setConfig(page, { streamEnabled: true })
    await page.goto('/')
  })

  test('le bouton Arrêter la génération apparaît pendant le streaming', async ({ page }) => {
    await page.route('**/v1/responses', async route => {
      await new Promise(r => setTimeout(r, 100))
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
        body: [
          'data: {"type":"response.output_text.delta","delta":"Début..."}',
          'data: {"type":"response.completed","response":{"id":"r","usage":{"input_tokens":5,"output_tokens":3}}}',
          'data: [DONE]',
          '',
        ].join('\n'),
      })
    })

    await page.getByRole('textbox', { name: 'Message' }).fill('Génère du texte')
    await page.getByRole('textbox', { name: 'Message' }).press('Enter')

    await expect(page.getByRole('button', { name: 'Arrêter la génération' })).toBeVisible({ timeout: 5_000 })
  })

  test('cliquer Arrêter restaure le bouton Envoyer', async ({ page }) => {
    await page.route('**/v1/responses', async route => {
      setTimeout(async () => {
        await route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
          body: 'data: {"type":"response.output_text.delta","delta":"Texte..."}\n\n',
        })
      }, 2000)
    })

    await page.getByRole('textbox', { name: 'Message' }).fill('Génère du texte')
    await page.getByRole('textbox', { name: 'Message' }).press('Enter')

    const stopBtn = page.getByRole('button', { name: 'Arrêter la génération' })
    await expect(stopBtn).toBeVisible({ timeout: 5_000 })
    await stopBtn.click()

    await expect(page.getByRole('button', { name: 'Envoyer' })).toBeVisible({ timeout: 5_000 })
  })
})
