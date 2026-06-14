import type { TokenUsage } from '../../types'

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
  | { type: 'text'; content: string; usage?: TokenUsage; responseId?: string }
  | { type: 'tool_calls'; calls: LLMToolCall[]; responseId?: string; rawAssistantMsg?: unknown; usage?: TokenUsage }
