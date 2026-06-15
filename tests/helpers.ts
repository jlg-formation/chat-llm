import type { Page, Route } from '@playwright/test'

export const LS_KEY = 'chat_pedagogique_config'

export const BASE_CONFIG = {
  llm: {
    provider: 'openai',
    baseUrl: 'https://api.openai.com',
    apiKeys: { openai: 'sk-test-key', ovh: '', lmstudio: '', ollama: '' },
    model: 'gpt-5.4-nano',
    apiFormat: 'responses',
    temperature: null,
    topP: null,
    maxTokens: null,
  },
  streamEnabled: false,
  systemPrompt: '',
  jsonSchema: '',
  mcpName: '',
  mcpUrl: '',
  mcpEnabled: false,
  mcpTools: [],
}

/** Injecte une config dans le localStorage avant le chargement de la page. */
export async function setConfig(page: Page, partial: Record<string, unknown> = {}) {
  const config = deepMerge(BASE_CONFIG, partial)
  await page.addInitScript(([key, value]: [string, string]) => {
    localStorage.setItem(key, value)
  }, [LS_KEY, JSON.stringify(config)])
}

function deepMerge(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const result = { ...base }
  for (const key of Object.keys(override)) {
    const bv = base[key]
    const ov = override[key]
    if (ov && typeof ov === 'object' && !Array.isArray(ov) && bv && typeof bv === 'object' && !Array.isArray(bv)) {
      result[key] = deepMerge(bv as Record<string, unknown>, ov as Record<string, unknown>)
    } else {
      result[key] = ov
    }
  }
  return result
}

// ─── Réponses mockées ─────────────────────────────────────────────────────────

/** Mock non-streaming pour l'API Responses OpenAI. */
export function mockOpenAIResponsesNonStreaming(text: string) {
  return {
    id: 'resp_test',
    output: [
      {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text }],
      },
    ],
    usage: { input_tokens: 10, output_tokens: text.split(' ').length },
  }
}

/** Mock streaming SSE pour l'API Responses OpenAI. */
export function mockOpenAIResponsesSSE(text: string): string {
  const lines = [
    `data: ${JSON.stringify({ type: 'response.output_text.delta', delta: text })}`,
    `data: ${JSON.stringify({
      type: 'response.completed',
      response: {
        id: 'resp_test',
        usage: { input_tokens: 10, output_tokens: text.split(' ').length },
      },
    })}`,
    'data: [DONE]',
    '',
  ]
  return lines.join('\n')
}

/** Intercepte les appels LLM et retourne une réponse mockée. */
export async function interceptLLM(page: Page, text = 'Réponse test.') {
  await page.route('**/v1/responses', async (route: Route) => {
    const body = await route.request().postDataJSON() as { stream?: boolean }
    if (body.stream) {
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', 'Access-Control-Allow-Origin': '*' },
        body: mockOpenAIResponsesSSE(text),
      })
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockOpenAIResponsesNonStreaming(text)),
      })
    }
  })
}
