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
  await expect(stopBtn).not.toBeVisible({ timeout: 120_000 })
}

/** Charge la page et masque l'inspecteur HTTP (son rendu, quadratique sur 100 itérations, n'est pas l'objet du test). */
async function gotoWithInspectorHidden(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.getByRole('button', { name: "Masquer l'inspecteur HTTP" }).click()
}

const MAX_ITERATIONS = 100

test.describe('TC-91 · Boucle agentique — limite de 100 itérations', () => {
  test.describe.configure({ mode: 'serial', timeout: 150_000 })

  test('la boucle ne fait pas plus de 101 requêtes (1 initiale + 100 itérations)', async ({ page }) => {
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

    await gotoWithInspectorHidden(page)
    await page.getByRole('textbox', { name: 'Message' }).fill('Boucle infinie')
    await page.getByRole('textbox', { name: 'Message' }).press('Enter')
    await waitForSendingComplete(page)

    expect(requestCount).toBeGreaterThanOrEqual(MAX_ITERATIONS)
    expect(requestCount).toBeLessThanOrEqual(MAX_ITERATIONS + 1)
  })

  test('exactement 100 messages "Appel outil" sont présents après la boucle', async ({ page }) => {
    await setConfig(page, { streamEnabled: false })

    let n = 0
    await page.route('**/v1/responses', route => {
      n++
      route.fulfill({ status: 200, contentType: 'application/json', body: makeToolCallResponse(n) })
    })

    await gotoWithInspectorHidden(page)
    await page.getByRole('textbox', { name: 'Message' }).fill('Boucle')
    await page.getByRole('textbox', { name: 'Message' }).press('Enter')
    await waitForSendingComplete(page)

    const toolCallMsgs = page.locator('main').getByText('Appel outil :', { exact: false })
    await expect(toolCallMsgs).toHaveCount(MAX_ITERATIONS, { timeout: 5_000 })
  })

  test('le bouton "Arrêter la génération" disparaît après la fin de la boucle', async ({ page }) => {
    await setConfig(page, { streamEnabled: false })

    await page.route('**/v1/responses', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: makeToolCallResponse(1),
    }))

    await gotoWithInspectorHidden(page)
    await page.getByRole('textbox', { name: 'Message' }).fill('Test arrêt boucle')
    await page.getByRole('textbox', { name: 'Message' }).press('Enter')
    await waitForSendingComplete(page)
  })
})
