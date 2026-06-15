import { test, expect } from '@playwright/test'
import { setConfig } from './helpers'

const toolCallBody = JSON.stringify({
  id: 'resp_tool_1',
  output: [
    {
      type: 'function_call',
      call_id: 'call_001',
      name: 'get_skill_details',
      arguments: '{"skill_name":"mon-skill"}',
    },
  ],
  usage: { input_tokens: 12, output_tokens: 5 },
})

const finalTextBody = JSON.stringify({
  id: 'resp_2',
  output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Voici le résultat.' }] }],
  usage: { input_tokens: 20, output_tokens: 8 },
})

test.describe('TC-83 · Messages tool_call et tool_result pliables', () => {

  test.beforeEach(async ({ page }) => {
    await setConfig(page, { streamEnabled: false })

    let callCount = 0
    await page.route('**/v1/responses', route => {
      callCount++
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: callCount === 1 ? toolCallBody : finalTextBody,
      })
    })

    await page.goto('/')
    await page.getByRole('textbox', { name: 'Message' }).fill('Utilise un outil')
    await page.getByRole('textbox', { name: 'Message' }).press('Enter')
  })

  test('un message "Appel outil" apparaît dans le fil de conversation', async ({ page }) => {
    await expect(
      page.locator('main').getByText('Appel outil :', { exact: false })
    ).toBeVisible({ timeout: 15_000 })
  })

  test('un message "Résultat outil" apparaît après résolution du tool_call', async ({ page }) => {
    await expect(
      page.locator('main').getByText('Résultat outil')
    ).toBeVisible({ timeout: 15_000 })
  })

  test('le message tool_call affiche le nom de l\'outil appelé', async ({ page }) => {
    await expect(
      page.locator('main').getByText('get_skill_details', { exact: false })
    ).toBeVisible({ timeout: 15_000 })
  })

  test('cliquer sur le message tool_call déplie les arguments JSON', async ({ page }) => {
    const toolCallBtn = page.locator('main').getByText('Appel outil :', { exact: false }).first()
    await toolCallBtn.waitFor({ timeout: 15_000 })
    await toolCallBtn.click()

    // Les arguments doivent être affichés dans un <pre>
    await expect(
      page.locator('main pre', { hasText: 'mon-skill' }).first()
    ).toBeVisible({ timeout: 3_000 })
  })

  test('la réponse finale de l\'assistant s\'affiche après la boucle tool_call', async ({ page }) => {
    await expect(
      page.locator('main').getByText('Voici le résultat.')
    ).toBeVisible({ timeout: 15_000 })
  })
})
