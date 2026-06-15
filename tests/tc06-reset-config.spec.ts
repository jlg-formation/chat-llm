import { test, expect } from '@playwright/test'
import { setConfig, LS_KEY } from './helpers'

test.describe('TC-06 · Reset complet de la configuration', () => {

  test.beforeEach(async ({ page }) => {
    await setConfig(page, {
      llm: { provider: 'ovh', model: 'gpt-oss-20b', apiKeys: { openai: 'sk-x', ovh: 'ovh-key', lmstudio: '', ollama: '' } },
      streamEnabled: false,
      systemPrompt: 'Mon prompt personnalisé',
    })
    await page.goto('/')
  })

  test('le reset remet la configuration par défaut', async ({ page }) => {
    const resetBtn = page.getByRole('button', { name: 'Réinitialiser toute la configuration' })

    // Premier clic → mode confirmation
    await resetBtn.click()
    await expect(resetBtn).toContainText('Confirmer ?', { timeout: 3_000 })

    // Second clic → reset effectif
    await resetBtn.click()

    await expect(page.locator('header .bg-blue-50')).toContainText('OpenAI', { timeout: 5_000 })

    const saved = await page.evaluate((key: string) => localStorage.getItem(key), LS_KEY)
    if (saved) {
      const config = JSON.parse(saved) as { llm?: { provider?: string } }
      expect(config.llm?.provider).toBe('openai')
    }
  })
})
