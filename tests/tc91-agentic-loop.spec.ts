import { test, expect } from '@playwright/test'
import { setConfig } from './helpers'

function makeToolCallResponse(n: number) {
  return JSON.stringify({
    id: `resp_${n}`,
    output: [
      {
        type: 'function_call',
        call_id: `call_${n}`,
        name: 'get_skill_details',
        arguments: '{"skill_name":"boucle"}',
      },
    ],
    usage: { input_tokens: 10, output_tokens: 3 },
  })
}

/** Attend que l'envoi démarre (bouton "Arrêter" visible) puis se termine (bouton absent). */
async function waitForSendingComplete(page: import('@playwright/test').Page) {
  const stopBtn = page.getByRole('button', { name: 'Arrêter la génération' })
  await expect(stopBtn).toBeVisible({ timeout: 10_000 })
  await expect(stopBtn).not.toBeVisible({ timeout: 30_000 })
}

test.describe('TC-91 · Boucle agentique — limite de 5 itérations', () => {

  test('la boucle ne fait pas plus de 6 requêtes (1 initiale + 5 itérations)', async ({ page }) => {
    await setConfig(page, { streamEnabled: false })

    let requestCount = 0
    await page.route('**/v1/responses', route => {
      requestCount++
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: makeToolCallResponse(requestCount),
      })
    })

    await page.goto('/')
    await page.getByRole('textbox', { name: 'Message' }).fill('Boucle infinie')
    await page.getByRole('textbox', { name: 'Message' }).press('Enter')
    await waitForSendingComplete(page)

    expect(requestCount).toBeGreaterThanOrEqual(5)
    expect(requestCount).toBeLessThanOrEqual(6)
  })

  test('exactement 5 messages "Appel outil" sont présents après la boucle', async ({ page }) => {
    await setConfig(page, { streamEnabled: false })

    let n = 0
    await page.route('**/v1/responses', route => {
      n++
      route.fulfill({ status: 200, contentType: 'application/json', body: makeToolCallResponse(n) })
    })

    await page.goto('/')
    await page.getByRole('textbox', { name: 'Message' }).fill('Boucle')
    await page.getByRole('textbox', { name: 'Message' }).press('Enter')
    await waitForSendingComplete(page)

    const toolCallMsgs = page.locator('main').getByText('Appel outil :', { exact: false })
    await expect(toolCallMsgs).toHaveCount(5, { timeout: 5_000 })
  })

  test('le bouton "Arrêter la génération" disparaît après la fin de la boucle', async ({ page }) => {
    await setConfig(page, { streamEnabled: false })

    await page.route('**/v1/responses', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: makeToolCallResponse(1),
    }))

    await page.goto('/')
    await page.getByRole('textbox', { name: 'Message' }).fill('Test arrêt boucle')
    await page.getByRole('textbox', { name: 'Message' }).press('Enter')
    await waitForSendingComplete(page)
  })
})
