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
  | { type: 'text'; content: string }
  | { type: 'tool_calls'; calls: LLMToolCall[]; responseId?: string; rawAssistantMsg?: unknown }
