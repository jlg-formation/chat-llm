import { test, expect } from '@playwright/test'
import { setConfig } from './helpers'

const OVH_BASE = 'https://oai.endpoints.kepler.ai.cloud.ovh.net'
const OLLAMA_BASE = 'http://localhost:11434'

/** SSE Chat Completions (OVH / format OpenAI standard). */
function chatCompletionsSSE(text: string): string {
  return [
    `data: ${JSON.stringify({ choices: [{ delta: { content: text }, finish_reason: null }] })}`,
    `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5 } })}`,
    'data: [DONE]',
    '',
  ].join('\n')
}

/** Stream natif Ollama (NDJSON, une ligne JSON par chunk). */
function ollamaNdjson(text: string): string {
  return [
    JSON.stringify({ message: { role: 'assistant', content: text }, done: false }),
    JSON.stringify({ message: { role: 'assistant', content: '' }, done: true, prompt_eval_count: 10, eval_count: 5 }),
    '',
  ].join('\n')
}

test.describe('TC-16 · Streaming — format Chat Completions', () => {

  test('OVH Chat Completions en streaming affiche la réponse correctement', async ({ page }) => {
    await setConfig(page, {
      streamEnabled: true,
      llm: { provider: 'ovh', baseUrl: OVH_BASE, model: 'gpt-oss-20b', apiFormat: 'chat_completions' },
    })

    await page.route('**/v1/chat/completions', async route => {
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
        body: chatCompletionsSSE('Réponse OVH en streaming.'),
      })
    })

    await page.goto('/')
    await page.getByRole('textbox', { name: 'Message' }).fill('Test OVH stream')
    await page.getByRole('textbox', { name: 'Message' }).press('Enter')

    await expect(page.locator('main').getByText('Réponse OVH en streaming.', { exact: true })).toBeVisible({ timeout: 15_000 })
  })

  test('Ollama en streaming affiche la réponse correctement', async ({ page }) => {
    await setConfig(page, {
      streamEnabled: true,
      llm: { provider: 'ollama', baseUrl: OLLAMA_BASE, model: 'llama3:8b', apiFormat: 'ollama_chat' },
    })

    await page.route('**/api/chat', async route => {
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/x-ndjson' },
        body: ollamaNdjson('Réponse Ollama en streaming.'),
      })
    })

    await page.goto('/')
    await page.getByRole('textbox', { name: 'Message' }).fill('Test Ollama stream')
    await page.getByRole('textbox', { name: 'Message' }).press('Enter')

    await expect(page.locator('main').getByText('Réponse Ollama en streaming.', { exact: true })).toBeVisible({ timeout: 15_000 })
  })
})
