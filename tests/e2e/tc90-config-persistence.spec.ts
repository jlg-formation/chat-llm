import { test, expect } from '@playwright/test'
import { setConfig, LS_KEY } from './helpers'

test.describe('TC-90 · Persistance de la configuration', () => {

  test('le provider et le modèle sont restaurés après rechargement', async ({ page }) => {
    await setConfig(page, { llm: { provider: 'ovh', model: 'gpt-oss-20b' } })
    await page.goto('/')
    await page.reload()

    const badge = page.locator('header .bg-blue-50')
    await expect(badge).toContainText('OVH')
    await expect(badge).toContainText('gpt-oss-20b')
  })

  test('le prompt système est restauré après rechargement', async ({ page }) => {
    const prompt = 'Tu es un assistant pédagogique.'
    await setConfig(page, { systemPrompt: prompt })
    await page.goto('/')

    await page.getByRole('button', { name: 'Prompt Système' }).click()
    await expect(page.getByRole('textbox', { name: 'Prompt système' })).toHaveValue(prompt)

    await page.reload()

    await page.getByRole('button', { name: 'Prompt Système' }).click()
    await expect(page.getByRole('textbox', { name: 'Prompt système' })).toHaveValue(prompt)
  })

  test('le mode streaming est restauré après rechargement', async ({ page }) => {
    await setConfig(page, { streamEnabled: false })
    await page.goto('/')
    await expect(page.locator('header')).toContainText('Stream OFF')

    await page.reload()
    await expect(page.locator('header')).toContainText('Stream OFF')
  })

  test('la clé API est restaurée après rechargement', async ({ page }) => {
    await setConfig(page, { llm: { provider: 'openai', apiKeys: { openai: 'sk-test-persisted', ovh: '', lmstudio: '', ollama: '' } } })
    await page.goto('/')
    await page.reload()

    const saved = await page.evaluate((key: string) => {
      const raw = localStorage.getItem(key)
      if (!raw) return null
      const config = JSON.parse(raw) as { llm?: { apiKeys?: { openai?: string } } }
      return config.llm?.apiKeys?.openai ?? null
    }, LS_KEY)

    expect(saved).toBe('sk-test-persisted')
  })

  test('le JSON Schema est restauré après rechargement', async ({ page }) => {
    const schema = '{"type":"object","properties":{"name":{"type":"string"}}}'
    await setConfig(page, { jsonSchema: schema })
    await page.goto('/')

    await page.getByRole('button', { name: 'Structured Output' }).click()
    await expect(page.getByRole('textbox', { name: 'Schéma JSON' })).toHaveValue(schema)

    await page.reload()
    await page.getByRole('button', { name: 'Structured Output' }).click()
    await expect(page.getByRole('textbox', { name: 'Schéma JSON' })).toHaveValue(schema)
  })
})
