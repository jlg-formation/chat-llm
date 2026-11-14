import { test, expect } from '@playwright/test'
import { setConfig } from './helpers'

test.describe('TC-03 · Chargement dynamique des modèles', () => {

  test('les modèles Ollama se chargent et apparaissent dans le sélecteur', async ({ page }) => {
    await setConfig(page, {
      llm: { provider: 'ollama', baseUrl: 'http://localhost:11434', model: '', apiFormat: 'chat_completions' },
    })
    await page.route('http://localhost:11434/api/tags', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ models: [{ name: 'llama3:8b' }, { name: 'mistral:7b' }] }),
    }))

    await page.goto('/')

    await page.getByRole('button', { name: /Charger/i }).first().click()

    await expect(page.locator('select[aria-label="Modèle"] option[value="llama3:8b"]')).toHaveCount(1, { timeout: 5_000 })
    await expect(page.locator('select[aria-label="Modèle"] option[value="mistral:7b"]')).toHaveCount(1, { timeout: 5_000 })
  })

  test('le bouton "Actualiser" recharge la liste depuis l\'API', async ({ page }) => {
    await setConfig(page, {
      llm: { provider: 'ollama', baseUrl: 'http://localhost:11434', model: '', apiFormat: 'chat_completions' },
    })
    let callCount = 0
    await page.route('http://localhost:11434/api/tags', route => {
      callCount++
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ models: [{ name: `modele-v${callCount}` }] }),
      })
    })

    await page.goto('/')

    // Premier chargement
    await page.getByRole('button', { name: /Charger/i }).first().click()
    await expect(page.locator('option[value="modele-v1"]')).toHaveCount(1, { timeout: 5_000 })

    // Second chargement via "Actualiser"
    await page.getByRole('button', { name: /Actualiser/i }).first().click()
    await expect(page.locator('option[value="modele-v2"]')).toHaveCount(1, { timeout: 5_000 })
    expect(callCount).toBe(2)
  })

  test('une erreur de connexion affiche un message d\'erreur dans la UI', async ({ page }) => {
    await setConfig(page, {
      llm: { provider: 'ollama', baseUrl: 'http://localhost:11434', model: '', apiFormat: 'chat_completions' },
    })
    await page.route('http://localhost:11434/api/tags', route => route.abort('failed'))

    await page.goto('/')
    await page.getByRole('button', { name: /Charger/i }).first().click()

    await expect(page.locator('.text-red-500').first()).toBeVisible({ timeout: 5_000 })
  })
})
