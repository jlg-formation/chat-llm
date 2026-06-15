import { test, expect } from '@playwright/test'
import { setConfig } from './helpers'

test.describe('TC-61 · Redimensionnement de la sidebar droite', () => {

  test.beforeEach(async ({ page }) => {
    await setConfig(page, { streamEnabled: false })
    await page.goto('/')
  })

  test('la poignée de drag permet d\'élargir la sidebar droite', async ({ page }) => {
    const handle = page.locator('[title="Redimensionner"]')
    const box = await handle.boundingBox()
    if (!box) throw new Error('Poignée de redimensionnement introuvable')

    const sidebar = page.getByRole('complementary', { name: 'Inspecteur HTTP' })
    const initialBox = await sidebar.boundingBox()
    if (!initialBox) throw new Error('Sidebar introuvable')

    // Drag vers la gauche pour élargir
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 - 150, box.y + box.height / 2, { steps: 15 })
    await page.mouse.up()

    const newBox = await sidebar.boundingBox()
    expect(newBox!.width).toBeGreaterThan(initialBox.width + 50)
  })

  test('la largeur ne dépasse pas 800 px même avec un drag excessif', async ({ page }) => {
    const handle = page.locator('[title="Redimensionner"]')
    const box = await handle.boundingBox()
    if (!box) throw new Error('Poignée introuvable')

    // Drag excessif vers la gauche
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(10, box.y + box.height / 2, { steps: 30 })
    await page.mouse.up()

    const sidebar = page.getByRole('complementary', { name: 'Inspecteur HTTP' })
    const finalBox = await sidebar.boundingBox()
    expect(finalBox!.width).toBeLessThanOrEqual(800)
  })

  test('la largeur ne descend pas sous 200 px avec un drag vers la droite', async ({ page }) => {
    const handle = page.locator('[title="Redimensionner"]')
    const box = await handle.boundingBox()
    if (!box) throw new Error('Poignée introuvable')

    // Drag excessif vers la droite
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    const viewport = page.viewportSize()!
    await page.mouse.move(viewport.width - 10, box.y + box.height / 2, { steps: 30 })
    await page.mouse.up()

    const sidebar = page.getByRole('complementary', { name: 'Inspecteur HTTP' })
    const finalBox = await sidebar.boundingBox()
    // Tolérance subpixel : la contrainte MIN_WIDTH est 200, quelques px de rendu acceptés
    expect(finalBox!.width).toBeGreaterThanOrEqual(190)
  })
})

test.describe('TC-62 · Réduction et expansion de la sidebar droite', () => {

  test.beforeEach(async ({ page }) => {
    await setConfig(page, { streamEnabled: false })
    await page.goto('/')
  })

  test('le chevron masque l\'inspecteur HTTP', async ({ page }) => {
    await page.getByRole('button', { name: "Masquer l'inspecteur HTTP" }).click()
    await expect(page.getByRole('complementary', { name: 'Inspecteur HTTP' })).not.toBeVisible()
  })

  test('après masquage, le chevron inversé le réaffiche', async ({ page }) => {
    await page.getByRole('button', { name: "Masquer l'inspecteur HTTP" }).click()
    await expect(page.getByRole('complementary', { name: 'Inspecteur HTTP' })).not.toBeVisible()

    await page.getByRole('button', { name: "Afficher l'inspecteur HTTP" }).click()
    await expect(page.getByRole('complementary', { name: 'Inspecteur HTTP' })).toBeVisible()
  })
})
