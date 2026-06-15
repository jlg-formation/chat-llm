import { test, expect } from '@playwright/test'
import { setConfig } from './helpers'

const MINIMAL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
)

test.describe('TC-20 · Ajout d\'image via le bouton « + »', () => {

  test.beforeEach(async ({ page }) => {
    await setConfig(page, { streamEnabled: false })
    await page.goto('/')
  })

  test('une miniature apparaît après sélection d\'un fichier PNG', async ({ page }) => {
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: 'Ajouter une image' }).click(),
    ])
    await fileChooser.setFiles({ name: 'test.png', mimeType: 'image/png', buffer: MINIMAL_PNG })

    await expect(page.locator('img[alt="Image jointe 1"]')).toBeVisible({ timeout: 3_000 })
  })

  test('la miniature disparaît quand on clique sur le bouton de suppression', async ({ page }) => {
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: 'Ajouter une image' }).click(),
    ])
    await fileChooser.setFiles({ name: 'test.png', mimeType: 'image/png', buffer: MINIMAL_PNG })
    await expect(page.locator('img[alt="Image jointe 1"]')).toBeVisible({ timeout: 3_000 })

    await page.getByRole('button', { name: 'Supprimer l\'image 1' }).click()

    await expect(page.locator('img[alt="Image jointe 1"]')).not.toBeVisible()
  })

  test('l\'image est affichée dans le message utilisateur après envoi', async ({ page }) => {
    await page.route('**/v1/responses', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'r',
        output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Vu !' }] }],
        usage: { input_tokens: 5, output_tokens: 2 },
      }),
    }))

    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: 'Ajouter une image' }).click(),
    ])
    await fileChooser.setFiles({ name: 'photo.png', mimeType: 'image/png', buffer: MINIMAL_PNG })
    await page.getByRole('textbox', { name: 'Message' }).fill('Voici une image')
    await page.getByRole('button', { name: 'Envoyer' }).click()

    await expect(page.locator('main img[alt="image jointe"]').first()).toBeVisible({ timeout: 10_000 })
  })
})

test.describe('TC-22 · Rejet des formats non supportés', () => {

  test('un fichier PDF n\'ajoute pas de miniature dans la zone de saisie', async ({ page }) => {
    await setConfig(page, { streamEnabled: false })
    await page.goto('/')

    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: 'Ajouter une image' }).click(),
    ])
    await fileChooser.setFiles({
      name: 'document.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4'),
    })

    await page.waitForTimeout(500)
    await expect(page.locator('img[alt="Image jointe 1"]')).toHaveCount(0)
  })
})
