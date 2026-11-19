import type { TokenUsage } from '../../types'
import { readLines } from '../sse'

// Ollama renvoie les arguments d'outil sous forme d'objet, les autres formats en chaîne JSON.
export function ollamaRawArgs(args: unknown): string {
  return typeof args === 'string' ? args : JSON.stringify(args ?? {})
}

export function ollamaUsage(obj: Record<string, unknown>): TokenUsage | undefined {
  if (obj.prompt_eval_count === undefined) return undefined
  return {
    promptTokens: (obj.prompt_eval_count as number) ?? 0,
    completionTokens: (obj.eval_count as number) ?? 0,
  }
}

export async function* parseNdjsonStream(response: Response): AsyncGenerator<string> {
  for await (const line of readLines(response.body!)) {
    const trimmed = line.trim()
    if (trimmed) yield trimmed
  }
}
