import type { Page, Route } from '@playwright/test'

// Corps JSON de requête inspectés librement dans les assertions
// oxlint-disable-next-line typescript/no-explicit-any
export type Json = any

export const GOOGLE_CONFIG = {
  llm: {
    provider: 'google',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    apiFormat: 'google_interactions',
    model: 'gemini-3-flash-preview',
    apiKeys: { google: 'AIza-test-key' },
  },
}

export interface GoogleStep {
  type: 'model_output' | 'function_call'
  text?: string
  id?: string
  name?: string
  arguments?: Record<string, unknown>
}

export interface CapturedRequest {
  url: string
  headers: Record<string, string>
  body: Json
}

const toContent = (steps: GoogleStep[]) =>
  steps.map((s) =>
    s.type === 'model_output'
      ? { type: 'model_output', content: [{ type: 'text', text: s.text }] }
      : {
          type: 'function_call',
          id: s.id,
          name: s.name,
          arguments: s.arguments,
        },
  )

/** Réponse non-streaming de l'Interactions API. */
export function googleInteraction(
  steps: GoogleStep[],
  id = 'int_test',
  usage = {
    total_input_tokens: 10,
    total_output_tokens: 5,
    total_thought_tokens: 0,
  },
) {
  return {
    id,
    status: steps.some((s) => s.type === 'function_call') ? 'requires_action' : 'completed',
    steps: toContent(steps),
    usage,
  }
}

const sse = (event: string, data: Record<string, unknown>) =>
  `event: ${event}\ndata: ${JSON.stringify({ event_type: event, ...data })}\n\n`

/** Flux SSE de l'Interactions API pour une réponse texte. */
export function googleTextSSE(text: string, id = 'int_test'): string {
  return (
    sse('step.start', { index: 0, step: { type: 'model_output' } }) +
    sse('step.delta', { index: 0, delta: { type: 'text', text } }) +
    sse('step.stop', { index: 0 }) +
    sse('interaction.completed', {
      interaction: {
        id,
        usage: {
          total_input_tokens: 10,
          total_output_tokens: 5,
          total_thought_tokens: 0,
        },
      },
    }) +
    'event: done\ndata: [DONE]\n\n'
  )
}

/**
 * Intercepte les appels à l'Interactions API. `handler` reçoit la requête et renvoie
 * la liste de steps à produire (texte ou appels de fonction).
 */
export async function interceptGoogle(
  page: Page,
  handler: (req: CapturedRequest) => GoogleStep[],
): Promise<CapturedRequest[]> {
  const requests: CapturedRequest[] = []
  await page.route('**/v1beta/interactions**', async (route: Route) => {
    const req = route.request()
    const captured: CapturedRequest = {
      url: req.url(),
      headers: req.headers(),
      body: req.postDataJSON(),
    }
    requests.push(captured)
    const steps = handler(captured)
    if (captured.body.stream) {
      const text = steps.map((s) => s.text ?? '').join('')
      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Access-Control-Allow-Origin': '*',
        },
        body: googleTextSSE(text),
      })
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(googleInteraction(steps)),
      })
    }
  })
  return requests
}
