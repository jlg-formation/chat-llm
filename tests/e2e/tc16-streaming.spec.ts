import { test, expect } from '@playwright/test'
import { setConfig, mockOpenAIResponsesSSE, mockOpenAIResponsesNonStreaming } from './helpers'

test.describe('TC-16 · Streaming vs mode complet', () => {

  test('mode streaming — la réponse arrive progressivement', async ({ page }) => {
    await setConfig(page, { streamEnabled: true })

    await page.route('**/v1/responses', async route => {
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
        body: mockOpenAIResponsesSSE('Réponse en streaming.'),
      })
    })

    await page.goto('/')
    await page.getByRole('textbox', { name: 'Message' }).fill('Test stream')
    await page.getByRole('textbox', { name: 'Message' }).press('Enter')

    await expect(page.locator('main').getByText('Réponse en streaming.', { exact: true })).toBeVisible({ timeout: 15_000 })
  })

  test('mode non-streaming — la réponse arrive en bloc', async ({ page }) => {
    await setConfig(page, { streamEnabled: false })

    await page.route('**/v1/responses', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockOpenAIResponsesNonStreaming('Réponse complète.')),
      })
    })

    await page.goto('/')
    await page.getByRole('textbox', { name: 'Message' }).fill('Test non-stream')
    await page.getByRole('textbox', { name: 'Message' }).press('Enter')

    await expect(page.locator('main').getByText('Réponse complète.', { exact: true })).toBeVisible({ timeout: 15_000 })
  })

  test('le header affiche Stream ON quand le streaming est activé', async ({ page }) => {
    await setConfig(page, { streamEnabled: true })
    await page.goto('/')
    await expect(page.locator('header')).toContainText('Stream ON')
  })

  test('le header affiche Stream OFF quand le streaming est désactivé', async ({ page }) => {
    await setConfig(page, { streamEnabled: false })
    await page.goto('/')
    await expect(page.locator('header')).toContainText('Stream OFF')
  })
})
