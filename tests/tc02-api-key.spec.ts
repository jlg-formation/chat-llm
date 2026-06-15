import { test, expect } from '@playwright/test'
import { setConfig, LS_KEY } from './helpers'

test.describe('TC-02 · Injection et masquage de la clé API', () => {

  test('le champ clé API est de type password (caractères masqués)', async ({ page }) => {
    await setConfig(page)
    await page.goto('/')

    // Le champ est lié à un label "Clé API"
    await expect(page.getByLabel(/Clé API/)).toHaveAttribute('type', 'password')
  })

  test("la clé injectée depuis l'environnement est présente dans localStorage", async ({ page }) => {
    const key = process.env.OPENAI_API_KEY ?? 'sk-test-from-env'
    await setConfig(page, {
      llm: { provider: 'openai', apiKeys: { openai: key, ovh: '', lmstudio: '', ollama: '' } },
    })
    await page.goto('/')

    const saved = await page.evaluate((lsKey: string) => {
      const raw = localStorage.getItem(lsKey)
      if (!raw) return null
      const config = JSON.parse(raw) as { llm?: { apiKeys?: { openai?: string } } }
      return config.llm?.apiKeys?.openai ?? null
    }, LS_KEY)

    expect(saved).toBe(key)
  })

  test("l'avertissement de stockage en clair est affiché", async ({ page }) => {
    await setConfig(page)
    await page.goto('/')

    await expect(page.getByText('Stockée en clair dans localStorage')).toBeVisible()
  })

  test("changer de provider affiche un champ de clé API vide si le provider n'a pas de clé configurée", async ({ page }) => {
    await setConfig(page, {
      llm: {
        provider: 'openai',
        apiKeys: { openai: 'sk-openai-key', ovh: '', lmstudio: '', ollama: '' },
      },
    })
    await page.goto('/')

    await page.getByRole('combobox', { name: 'Provider' }).selectOption('ovh')

    await expect(page.getByLabel(/Clé API/)).toHaveValue('')
  })

  test('la clé API est persistée après rechargement de page', async ({ page }) => {
    const key = 'sk-test-persisted-123'
    await setConfig(page, {
      llm: { provider: 'openai', apiKeys: { openai: key, ovh: '', lmstudio: '', ollama: '' } },
    })
    await page.goto('/')
    await page.reload()

    const saved = await page.evaluate((lsKey: string) => {
      const raw = localStorage.getItem(lsKey)
      if (!raw) return null
      const config = JSON.parse(raw) as { llm?: { apiKeys?: { openai?: string } } }
      return config.llm?.apiKeys?.openai ?? null
    }, LS_KEY)

    expect(saved).toBe(key)
  })
})
