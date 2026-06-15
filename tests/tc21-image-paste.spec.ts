import { test, expect } from '@playwright/test'
import { setConfig } from './helpers'

// PNG 1×1 pixel minimal encodé en base64
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

/** Dispatch un ClipboardEvent paste avec une image PNG sur le textarea de saisie. */
async function pastePng(page: import('@playwright/test').Page) {
  await page.getByRole('textbox', { name: 'Message' }).click()
  await page.evaluate((b64: string) => {
    const textarea = document.querySelector('textarea')
    if (!textarea) return
    const binary = atob(b64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const blob = new Blob([bytes], { type: 'image/png' })
    const file = new File([blob], 'pasted.png', { type: 'image/png' })
    const dt = new DataTransfer()
    dt.items.add(file)
    const event = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })
    textarea.dispatchEvent(event)
  }, PNG_B64)
}

test.describe('TC-21 · Ajout d\'image par copier-coller', () => {

  test.beforeEach(async ({ page }) => {
    await setConfig(page, { streamEnabled: false })
    await page.goto('/')
  })

  test('coller une image dans le textarea ajoute une miniature', async ({ page }) => {
    await pastePng(page)
    await expect(page.locator('img[alt="Image jointe 1"]')).toBeVisible({ timeout: 3_000 })
  })

  test('l\'image collée peut être supprimée via le bouton "×"', async ({ page }) => {
    await pastePng(page)
    await expect(page.locator('img[alt="Image jointe 1"]')).toBeVisible({ timeout: 3_000 })

    await page.getByRole('button', { name: 'Supprimer l\'image 1' }).click()

    await expect(page.locator('img[alt="Image jointe 1"]')).not.toBeVisible()
  })

  test('le texte normal collé n\'ajoute pas de miniature', async ({ page }) => {
    // Playwright keyboard paste (texte)
    await page.getByRole('textbox', { name: 'Message' }).click()
    await page.evaluate(() => {
      const textarea = document.querySelector('textarea')
      if (!textarea) return
      const dt = new DataTransfer()
      dt.setData('text/plain', 'texte collé')
      textarea.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }))
    })
    await page.waitForTimeout(300)
    await expect(page.locator('img[alt="Image jointe 1"]')).toHaveCount(0)
  })
})
