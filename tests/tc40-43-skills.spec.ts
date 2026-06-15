import { test, expect, type Page } from '@playwright/test'
import JSZip from 'jszip'
import { setConfig } from './helpers'

/** Crée un buffer ZIP valide contenant un SKILL.md avec frontmatter. */
async function makeSkillZip(skillName: string): Promise<Buffer> {
  const zip = new JSZip()
  const folder = zip.folder(skillName)!
  folder.file('SKILL.md', [
    '---',
    `name: ${skillName}`,
    'description: Skill de test E2E.',
    '---',
    '',
    `# ${skillName}`,
    '',
    'Contenu de test du skill.',
  ].join('\n'))
  return Buffer.from(await zip.generateAsync({ type: 'nodebuffer' }))
}

/** Importe un skill et vérifie qu'il apparaît dans la liste. */
async function importSkill(page: Page, skillName: string) {
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Charger un skill (.zip)' }).click(),
  ])
  await fileChooser.setFiles({
    name: `${skillName}.zip`,
    mimeType: 'application/zip',
    buffer: await makeSkillZip(skillName),
  })
  await expect(page.getByRole('region', { name: 'Skills' }).getByText(skillName)).toBeVisible({ timeout: 5_000 })
}

test.describe('TC-40 · Import d\'un skill ZIP', () => {

  test.beforeEach(async ({ page }) => {
    await setConfig(page, { streamEnabled: false })
    await page.goto('/')
    await page.getByRole('button', { name: 'Skills' }).click()
  })

  test('le skill importé apparaît dans la liste avec son nom', async ({ page }) => {
    await importSkill(page, 'mon-skill-e2e')
    await expect(page.getByRole('region', { name: 'Skills' }).getByText('mon-skill-e2e')).toBeVisible()
  })

  test('le skill persiste après rechargement de la page (IndexedDB)', async ({ page }) => {
    await importSkill(page, 'skill-persistant')
    await page.reload()
    await page.getByRole('button', { name: 'Skills' }).click()
    await expect(page.getByRole('region', { name: 'Skills' }).getByText('skill-persistant')).toBeVisible({ timeout: 5_000 })
  })
})

test.describe('TC-41 · Activation/désactivation d\'un skill', () => {

  test('le skill actif injecte l\'outil get_skill_details dans la requête LLM', async ({ page }) => {
    await setConfig(page, { streamEnabled: false })
    await page.goto('/')
    await page.getByRole('button', { name: 'Skills' }).click()
    await importSkill(page, 'skill-actif')

    let capturedBody: Record<string, unknown> | null = null
    await page.route('**/v1/responses', async route => {
      capturedBody = await route.request().postDataJSON() as Record<string, unknown>
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          id: 'r', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'OK' }] }],
          usage: { input_tokens: 5, output_tokens: 1 },
        }),
      })
    })

    await page.getByRole('textbox', { name: 'Message' }).fill('Test')
    await page.getByRole('textbox', { name: 'Message' }).press('Enter')
    await page.waitForFunction(() => document.querySelector('main')?.textContent?.includes('OK'), { timeout: 10_000 })

    // Le skill actif doit ajouter l'outil get_skill_details dans la requête
    const tools = capturedBody?.tools as Array<Record<string, unknown>> | undefined
    const hasSkillTool = tools?.some(t =>
      t.name === 'get_skill_details' || (t.function as Record<string, unknown>)?.name === 'get_skill_details'
    )
    expect(hasSkillTool).toBe(true)
  })

  test('désactiver le skill retire l\'outil de la requête LLM', async ({ page }) => {
    await setConfig(page, { streamEnabled: false })
    await page.goto('/')
    await page.getByRole('button', { name: 'Skills' }).click()
    await importSkill(page, 'skill-desactiver')

    // Désactiver le skill via son toggle (checkbox dans la ligne du skill)
    const skillRow = page.getByRole('region', { name: 'Skills' }).locator('div').filter({ hasText: 'skill-desactiver' }).first()
    await skillRow.locator('input[type="checkbox"]').click({ force: true })

    // Vérifier que le skill est maintenant désactivé (fond gris au lieu de jaune)
    await expect(skillRow).not.toHaveClass(/border-yellow-200/, { timeout: 3_000 })

    let capturedBody: Record<string, unknown> | null = null
    await page.route('**/v1/responses', async route => {
      capturedBody = await route.request().postDataJSON() as Record<string, unknown>
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          id: 'r', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'OK' }] }],
          usage: { input_tokens: 5, output_tokens: 1 },
        }),
      })
    })

    await page.getByRole('textbox', { name: 'Message' }).fill('Test')
    await page.getByRole('textbox', { name: 'Message' }).press('Enter')
    await page.waitForFunction(() => document.querySelector('main')?.textContent?.includes('OK'), { timeout: 10_000 })

    const tools = capturedBody?.tools as unknown[] | undefined
    expect(!tools || tools.length === 0).toBe(true)
  })
})

test.describe('TC-42 · Appel de l\'outil get_skill_details', () => {

  test('le contenu du skill est retourné en tool_result lors d\'un tool call', async ({ page }) => {
    await setConfig(page, { streamEnabled: false })
    await page.goto('/')
    await page.getByRole('button', { name: 'Skills' }).click()
    await importSkill(page, 'skill-details')

    let callCount = 0
    await page.route('**/v1/responses', async route => {
      callCount++
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: callCount === 1
          ? JSON.stringify({
              id: 'r1',
              output: [{ type: 'function_call', call_id: 'c1', name: 'get_skill_details', arguments: '{"name":"skill-details"}' }],
              usage: { input_tokens: 10, output_tokens: 5 },
            })
          : JSON.stringify({
              id: 'r2',
              output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Contenu transmis.' }] }],
              usage: { input_tokens: 20, output_tokens: 5 },
            }),
      })
    })

    await page.getByRole('textbox', { name: 'Message' }).fill('Détails du skill')
    await page.getByRole('textbox', { name: 'Message' }).press('Enter')

    await expect(page.locator('main').getByText('Résultat outil')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('main').getByText('Contenu transmis.')).toBeVisible({ timeout: 5_000 })
  })
})

test.describe('TC-43 · Suppression d\'un skill', () => {

  test('le skill supprimé disparaît et ne persiste plus après rechargement', async ({ page }) => {
    await setConfig(page, { streamEnabled: false })
    await page.goto('/')
    await page.getByRole('button', { name: 'Skills' }).click()
    await importSkill(page, 'skill-a-supprimer')

    await page.getByRole('button', { name: 'Supprimer' }).first().click()

    await expect(page.getByRole('region', { name: 'Skills' }).getByText('skill-a-supprimer')).not.toBeVisible({ timeout: 3_000 })

    await page.reload()
    await page.getByRole('button', { name: 'Skills' }).click()
    await expect(page.getByRole('region', { name: 'Skills' }).getByText('skill-a-supprimer')).not.toBeVisible({ timeout: 3_000 })
  })
})
