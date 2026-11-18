export type Provider =
  | "openai"
  | "anthropic"
  | "mistral"
  | "ovh"
  | "lmstudio"
  | "ollama";

export type ApiFormat =
  | "responses"
  | "chat_completions"
  | "lmstudio_chat"
  | "ollama_chat"
  | "anthropic_messages";

export interface LLMConfig {
  provider: Provider;
  baseUrl: string;
  apiKeys: Record<Provider, string>;
  model: string;
  apiFormat: ApiFormat;
  temperature: number | null;
  topP: number | null;
  maxTokens: number | null;
  // Anthropic : demande les résumés de réflexion (display: summarized)
  showThinking: boolean;
  // OpenAI Responses : null = non modifié (défaut medium si supporté), 'api_default' = champ non envoyé
  reasoningEffort: ReasoningEffort | "api_default" | null;
  // OpenAI Responses : affiche le résumé du raisonnement
  showReasoning: boolean;
}

export type ReasoningEffort =
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

export interface AppConfig {
  llm: LLMConfig;
  streamEnabled: boolean;
  systemPrompt: string;
  jsonSchema: string;
  mcpServers: McpServer[];
  // Outils exécutés côté fournisseur (OpenAI Responses, Anthropic Messages)
  hostedTools: {
    webSearch: boolean;
    imageGeneration: boolean;
    imageModel: string;
    imageSize: string;
  };
}

export interface WebSource {
  url: string;
  title?: string;
}

export interface HostedActivity {
  searches: string[];
  sources: WebSource[];
  images: MessageImage[];
}

export interface McpTool {
  name: string;
  description: string;
  enabled: boolean;
  inputSchema?: unknown;
}

export interface McpServer {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  tools: McpTool[];
  token?: string;
}

export interface Skill {
  id: string;
  name: string;
  enabled: boolean;
  files: Record<string, string>;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  // Tokens image facturés à part (tool_usage.image_gen), hors promptTokens/completionTokens
  imageInputTokens?: number;
  imageOutputTokens?: number;
}

type MessageRole =
  | "user"
  | "assistant"
  | "system"
  | "tool_call"
  | "tool_result";

export interface MessageImage {
  dataUrl: string;
  mimeType: string;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  images?: MessageImage[];
  isStreaming?: boolean;
  isJson?: boolean;
  isError?: boolean;
  // Réflexion affichée (Anthropic, OpenAI résumé)
  thinking?: string;
  // Bloc de réflexion replié par défaut (résumé OpenAI)
  thinkingClosed?: boolean;
  // Pour tool_call
  toolCallId?: string;
  toolName?: string;
  toolArgs?: string;
  // Regroupe les appels d'une même itération de la boucle d'outils
  toolTurnId?: string;
  // Blocs thinking/redacted_thinking bruts à rejouer (Anthropic), portés par le 1er tool_call du tour
  thinkingBlocks?: unknown[];
  // Blocs assistant bruts à rejouer tels quels (Anthropic pause_turn)
  rawContent?: unknown[];
  // Pour tool_result
  toolCallResultId?: string;
  // Recherche web hébergée (OpenAI) : requêtes et sources de la réponse
  webSearches?: string[];
  sources?: WebSource[];
  // Images produites par l'outil image_generation (distinctes des images jointes)
  generatedImages?: MessageImage[];
}

export interface HttpExchange {
  id: string;
  timestamp: number;
  type: "llm" | "mcp";
  method: string;
  url: string;
  requestHeaders: Record<string, string>;
  requestBody: unknown;
  responseStatus?: number;
  responseHeaders?: Record<string, string>;
  responseBody?: unknown;
  error?: string;
}

export const ANTHROPIC_VERSION = "2026-10-21";

export const PROVIDER_DEFAULTS: Record<
  Provider,
  { label: string; baseUrl: string; needsKey: boolean }
> = {
  openai: {
    label: "OpenAI",
    baseUrl: "https://api.openai.com",
    needsKey: true,
  },
  anthropic: {
    label: "Anthropic",
    baseUrl: "https://api.anthropic.com",
    needsKey: true,
  },
  mistral: {
    label: "Mistral AI",
    baseUrl: "https://api.mistral.ai/v1",
    needsKey: true,
  },
  ovh: {
    label: "OVH AI Endpoints",
    baseUrl: "https://oai.endpoints.kepler.ai.cloud.ovh.net",
    needsKey: true,
  },
  lmstudio: {
    label: "LM Studio",
    baseUrl: "http://localhost:1234",
    needsKey: false,
  },
  ollama: {
    label: "Ollama",
    baseUrl: "http://localhost:11434",
    needsKey: false,
  },
};

export const DEFAULT_CONFIG: AppConfig = {
  llm: {
    provider: "openai",
    baseUrl: PROVIDER_DEFAULTS.openai.baseUrl,
    apiKeys: {
      openai: "",
      anthropic: "",
      mistral: "",
      ovh: "",
      lmstudio: "",
      ollama: "",
    },
    model: "gpt-6-luna",
    apiFormat: "responses",
    temperature: null,
    topP: null,
    maxTokens: null,
    showThinking: false,
    reasoningEffort: null,
    showReasoning: true,
  },
  streamEnabled: true,
  systemPrompt: "",
  jsonSchema: "",
  mcpServers: [],
  hostedTools: {
    webSearch: false,
    imageGeneration: false,
    imageModel: "gpt-image-2.6-flare",
    imageSize: "640x1024",
  },
};
