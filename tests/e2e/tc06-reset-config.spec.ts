import { test, expect, type Page } from '@playwright/test'
import JSZip from 'jszip'
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

async function clickReset(page: Page) {
  const resetBtn = page.getByRole('button', { name: 'Réinitialiser toute la configuration' })
  await resetBtn.click()
  await expect(resetBtn).toContainText('Confirmer ?', { timeout: 3_000 })
  await resetBtn.click()
  await expect(resetBtn).toContainText('Reset')
}

async function makeSkillZip(skillName: string): Promise<Buffer> {
  const zip = new JSZip()
  zip.folder(skillName)!.file('SKILL.md', `---\nname: ${skillName}\ndescription: Skill de test.\n---\n`)
  return Buffer.from(await zip.generateAsync({ type: 'nodebuffer' }))
}

test.describe('TC-06b · Reset des skills et serveurs MCP', () => {

  test('le reset supprime les skills (UI + IndexedDB)', async ({ page }) => {
    await setConfig(page)
    await page.goto('/')
    await page.getByRole('button', { name: 'Skills' }).click()
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: 'Charger un skill (.zip)' }).click(),
    ])
    await fileChooser.setFiles({ name: 'skill-reset.zip', mimeType: 'application/zip', buffer: await makeSkillZip('skill-reset') })
    const skillsRegion = page.getByRole('region', { name: 'Skills' })
    await expect(skillsRegion.getByText('skill-reset')).toBeVisible({ timeout: 5_000 })

    await clickReset(page)

    await page.getByRole('button', { name: 'Skills' }).click()
    await expect(skillsRegion.getByText('Aucun skill chargé')).toBeVisible()

    await page.reload()
    await page.getByRole('button', { name: 'Skills' }).click()
    await expect(skillsRegion.getByText('Aucun skill chargé')).toBeVisible()
    await expect(skillsRegion.getByText('skill-reset')).toHaveCount(0)
  })

  test('le reset supprime les serveurs MCP configurés', async ({ page }) => {
    await setConfig(page, {
      mcpServers: [{ id: 'srv-1', name: 'Serveur à effacer', url: 'http://localhost:9999', enabled: false, tools: [] }],
    })
    await page.goto('/')
    await page.getByRole('button', { name: 'Serveurs MCP' }).click()
    await expect(page.getByText('Serveur à effacer')).toBeVisible()

    await clickReset(page)

    await page.getByRole('button', { name: 'Serveurs MCP' }).click()
    await expect(page.getByText('Aucun serveur MCP configuré')).toBeVisible()
    await expect(page.getByText('Serveur à effacer')).toHaveCount(0)

    const saved = await page.evaluate((key: string) => localStorage.getItem(key), LS_KEY)
    expect(JSON.parse(saved ?? '{}').mcpServers ?? []).toHaveLength(0)
  })
})
