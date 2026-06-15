import { test, expect } from '@playwright/test'
import { setConfig } from './helpers'

const OVH_BASE = 'https://oai.endpoints.kepler.ai.cloud.ovh.net'
const OLLAMA_BASE = 'http://localhost:11434'

function chatCompletionsResponse(text: string) {
  return JSON.stringify({
    choices: [{ message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 5, completion_tokens: 5 },
  })
}

function ollamaResponse(text: string) {
  return JSON.stringify({
    message: { role: 'assistant', content: text },
    done: true,
    prompt_eval_count: 5,
    eval_count: 5,
  })
}

test.describe('TC-30 · Prompt système — format Chat Completions', () => {

  test('OVH Chat Completions : le prompt système est dans messages[0] avec role "system"', async ({ page }) => {
    const systemPrompt = 'Tu es un expert pédagogique.'
    await setConfig(page, {
      streamEnabled: false,
      systemPrompt,
      llm: { provider: 'ovh', baseUrl: OVH_BASE, model: 'gpt-oss-20b', apiFormat: 'chat_completions' },
    })

    let capturedBody: Record<string, unknown> | null = null
    await page.route('**/v1/chat/completions', async route => {
      capturedBody = await route.request().postDataJSON() as Record<string, unknown>
      await route.fulfill({ status: 200, contentType: 'application/json', body: chatCompletionsResponse('OK.') })
    })

    await page.goto('/')
    await page.getByRole('textbox', { name: 'Message' }).fill('Bonjour')
    await page.getByRole('textbox', { name: 'Message' }).press('Enter')
    await page.waitForFunction(() => document.querySelector('main')?.textContent?.includes('OK.'), { timeout: 10_000 })

    const messages = capturedBody?.messages as Array<Record<string, unknown>>
    expect(messages).toBeDefined()
    expect(messages[0].role).toBe('system')
    expect(messages[0].content).toContain(systemPrompt)
  })

  test('OVH Chat Completions : sans prompt système, messages[0] a le role "user"', async ({ page }) => {
    await setConfig(page, {
      streamEnabled: false,
      systemPrompt: '',
      llm: { provider: 'ovh', baseUrl: OVH_BASE, model: 'gpt-oss-20b', apiFormat: 'chat_completions' },
    })

    let capturedBody: Record<string, unknown> | null = null
    await page.route('**/v1/chat/completions', async route => {
      capturedBody = await route.request().postDataJSON() as Record<string, unknown>
      await route.fulfill({ status: 200, contentType: 'application/json', body: chatCompletionsResponse('OK.') })
    })

    await page.goto('/')
    await page.getByRole('textbox', { name: 'Message' }).fill('Bonjour')
    await page.getByRole('textbox', { name: 'Message' }).press('Enter')
    await page.waitForFunction(() => document.querySelector('main')?.textContent?.includes('OK.'), { timeout: 10_000 })

    const messages = capturedBody?.messages as Array<Record<string, unknown>>
    expect(messages).toBeDefined()
    expect(messages[0].role).toBe('user')
  })

  test('Ollama : le prompt système est dans messages[0] avec role "system"', async ({ page }) => {
    const systemPrompt = 'Tu es un assistant Ollama.'
    await setConfig(page, {
      streamEnabled: false,
      systemPrompt,
      llm: { provider: 'ollama', baseUrl: OLLAMA_BASE, model: 'llama3:8b', apiFormat: 'chat_completions' },
    })

    let capturedBody: Record<string, unknown> | null = null
    await page.route('**/api/chat', async route => {
      capturedBody = await route.request().postDataJSON() as Record<string, unknown>
      await route.fulfill({ status: 200, contentType: 'application/json', body: ollamaResponse('OK.') })
    })

    await page.goto('/')
    await page.getByRole('textbox', { name: 'Message' }).fill('Salut')
    await page.getByRole('textbox', { name: 'Message' }).press('Enter')
    await page.waitForFunction(() => document.querySelector('main')?.textContent?.includes('OK.'), { timeout: 10_000 })

    const messages = capturedBody?.messages as Array<Record<string, unknown>>
    expect(messages).toBeDefined()
    expect(messages[0].role).toBe('system')
    expect(messages[0].content).toContain(systemPrompt)
  })
})
