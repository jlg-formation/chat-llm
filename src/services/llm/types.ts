import type { HostedActivity, TokenUsage } from '../../types'

export interface SkillRef {
  name: string
  description: string
}

export interface LLMToolCall {
  id: string
  name: string
  args: Record<string, unknown>
  rawArgs: string
}

export type LLMResult =
  | {
      type: 'text'
      content: string
      usage?: TokenUsage
      responseId?: string
      thinking?: string
      hosted?: HostedActivity
      // Contenu brut à renvoyer tel quel quand le serveur met la réponse en pause (Anthropic)
      pausedContent?: unknown[]
    }
  | {
      type: 'tool_calls'
      calls: LLMToolCall[]
      responseId?: string
      rawAssistantMsg?: unknown
      usage?: TokenUsage
      thinking?: string
      // Blocs bruts (thinking, recherche web serveur) à rejouer avec les tool_use (Anthropic)
      thinkingBlocks?: unknown[]
      hosted?: HostedActivity
    }
