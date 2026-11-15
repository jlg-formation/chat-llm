import type { Page, Route } from '@playwright/test'
import type { CapturedRequest, Json } from './anthropicMock'

export const MISTRAL_BASE = 'https://api.mistral.ai/v1'

export const MISTRAL_CONFIG = {
  llm: {
    provider: 'mistral',
    baseUrl: MISTRAL_BASE,
    apiFormat: 'chat_completions',
    model: 'mistral-small-latest',
    apiKeys: { mistral: 'mist-test-key' },
  },
}

export type MistralAnswer =
  | { text: string }
  | { tool: { id: string; name: string; args: Record<string, unknown> } }

interface Usage {
  prompt: number
  completion: number
}

const data = (obj: unknown) => `data: ${JSON.stringify(obj)}\n\n`
const event = (type: string, obj: Record<string, unknown>) => data({ type, ...obj })

function chatJson(a: MistralAnswer, u: Usage) {
  const usage = { prompt_tokens: u.prompt, completion_tokens: u.completion }
  if ('tool' in a)
    return {
      choices: [
        {
          finish_reason: 'tool_calls',
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: a.tool.id,
                type: 'function',
                function: {
                  name: a.tool.name,
                  arguments: JSON.stringify(a.tool.args),
                },
              },
            ],
          },
        },
      ],
      usage,
    }
  return {
    choices: [
      {
        finish_reason: 'stop',
        message: { role: 'assistant', content: a.text },
      },
    ],
    usage,
  }
}

function chatSSE(a: MistralAnswer, u: Usage): string {
  const usage = { prompt_tokens: u.prompt, completion_tokens: u.completion }
  if ('tool' in a)
    return (
      data({
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: a.tool.id,
                  type: 'function',
                  function: {
                    name: a.tool.name,
                    arguments: JSON.stringify(a.tool.args),
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage,
      }) + 'data: [DONE]\n\n'
    )
  return (
    data({
      choices: [{ index: 0, delta: { content: a.text }, finish_reason: null }],
    }) +
    data({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage }) +
    'data: [DONE]\n\n'
  )
}

function responsesJson(a: MistralAnswer, u: Usage) {
  const usage = { input_tokens: u.prompt, output_tokens: u.completion }
  if ('tool' in a)
    return {
      id: 'resp_test',
      output: [
        {
          type: 'function_call',
          call_id: a.tool.id,
          name: a.tool.name,
          arguments: JSON.stringify(a.tool.args),
        },
      ],
      usage,
    }
  return {
    id: 'resp_test',
    output: [
      {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: a.text }],
      },
    ],
    usage,
  }
}

function responsesSSE(a: MistralAnswer, u: Usage): string {
  const completed = event('response.completed', {
    response: {
      id: 'resp_test',
      usage: { input_tokens: u.prompt, output_tokens: u.completion },
    },
  })
  if ('tool' in a)
    return (
      event('response.output_item.added', {
        item: {
          type: 'function_call',
          id: 'fc_1',
          call_id: a.tool.id,
          name: a.tool.name,
        },
      }) +
      event('response.function_call_arguments.delta', {
        item_id: 'fc_1',
        delta: JSON.stringify(a.tool.args),
      }) +
      completed
    )
  return event('response.output_text.delta', { delta: a.text }) + completed
}

/**
 * Intercepte POST {base}/chat/completions et {base}/responses ;
 * `respond(body, n)` renvoie la n-ième réponse. Retourne la liste (mutable) des requêtes reçues.
 */
export async function interceptMistral(
  page: Page,
  respond: (body: Json, n: number) => MistralAnswer,
  usage: Usage = { prompt: 10, completion: 5 },
): Promise<CapturedRequest[]> {
  const requests: CapturedRequest[] = []
  const handler = (responses: boolean) => async (route: Route) => {
    const body = route.request().postDataJSON() as Json
    requests.push({ headers: route.request().headers(), body })
    const answer = respond(body, requests.length)
    const cors = { 'Access-Control-Allow-Origin': '*' }
    if (body.stream) {
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', ...cors },
        body: responses ? responsesSSE(answer, usage) : chatSSE(answer, usage),
      })
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: cors,
        body: JSON.stringify(responses ? responsesJson(answer, usage) : chatJson(answer, usage)),
      })
    }
  }
  await page.route(`${MISTRAL_BASE}/chat/completions`, handler(false))
  await page.route(`${MISTRAL_BASE}/responses`, handler(true))
  return requests
}
