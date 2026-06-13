export type Provider = 'openai' | 'ovh' | 'lmstudio' | 'ollama'

export interface LLMConfig {
  provider: Provider
  baseUrl: string
  apiKeys: Record<Provider, string>
  model: string
}

export interface AppConfig {
  llm: LLMConfig
  streamEnabled: boolean
  systemPrompt: string
  jsonSchema: string
  mcpUrl: string
  mcpEnabled: boolean
  mcpTools: McpTool[]
}

export interface McpTool {
  name: string
  description: string
  enabled: boolean
  inputSchema?: unknown
}

export interface Skill {
  id: string
  name: string
  enabled: boolean
  files: Record<string, string>
}

export type MessageRole = 'user' | 'assistant' | 'system'

export interface MessageImage {
  dataUrl: string
  mimeType: string
}

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  images?: MessageImage[]
  isStreaming?: boolean
  isJson?: boolean
}

export interface HttpExchange {
  id: string
  timestamp: number
  type: 'llm' | 'mcp'
  method: string
  url: string
  requestHeaders: Record<string, string>
  requestBody: unknown
  responseStatus?: number
  responseHeaders?: Record<string, string>
  responseBody?: unknown
  error?: string
}

export const PROVIDER_DEFAULTS: Record<Provider, { label: string; baseUrl: string; needsKey: boolean }> = {
  openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com', needsKey: true },
  ovh: { label: 'OVH AI Endpoints', baseUrl: 'https://oai.endpoints.kepler.ai.cloud.ovh.net', needsKey: true },
  lmstudio: { label: 'LM Studio', baseUrl: 'http://localhost:1234', needsKey: false },
  ollama: { label: 'Ollama', baseUrl: 'http://localhost:11434', needsKey: false },
}

export const DEFAULT_CONFIG: AppConfig = {
  llm: {
    provider: 'openai',
    baseUrl: PROVIDER_DEFAULTS.openai.baseUrl,
    apiKeys: { openai: '', ovh: '', lmstudio: '', ollama: '' },
    model: 'gpt-5.4-nano',
  },
  streamEnabled: true,
  systemPrompt: '',
  jsonSchema: '',
  mcpUrl: '',
  mcpEnabled: false,
  mcpTools: [],
}
