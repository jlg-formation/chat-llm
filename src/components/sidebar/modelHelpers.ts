import type { Provider, ApiFormat } from '../../types'
import type { ModelInfo } from '../../services/models'

const OVH_MODELS_RESPONSES_SUPPORTED = new Set(['gpt-oss-20b', 'gpt-oss-120b'])

export function supportsFormat(provider: Provider, model: string, fmt: ApiFormat): boolean {
  if (provider !== 'ovh') return true
  if (fmt === 'responses') return OVH_MODELS_RESPONSES_SUPPORTED.has(model)
  return true
}

export function modelLabel(m: ModelInfo): string {
  let label = m.id
  const parts: string[] = []
  if (m.contextLength)
    parts.push(
      `${m.contextLength >= 1000 ? Math.round(m.contextLength / 1000) + 'k' : m.contextLength} ctx`,
    )
  if (m.pricingPrompt !== undefined && m.pricingCompletion !== undefined) {
    const pIn = (m.pricingPrompt * 1_000_000).toFixed(2)
    const pOut = (m.pricingCompletion * 1_000_000).toFixed(2)
    parts.push(`$${pIn}/$${pOut} /Mtok`)
  } else if (m.pricingPrompt !== undefined) {
    parts.push(`$${(m.pricingPrompt * 1_000_000).toFixed(2)}/Mtok`)
  }
  if (parts.length > 0) label += ` — ${parts.join(', ')}`
  return label
}

// Filtre les modèles OVH pertinents pour le chat (exclut embeddings, audio, image, modération)
export function isOvhChatModel(m: ModelInfo): boolean {
  const id = m.id.toLowerCase()
  if (
    id.includes('embed') ||
    id.includes('whisper') ||
    id.includes('diffusion') ||
    id.includes('ppl') ||
    id.includes('bge') ||
    id.includes('tts') ||
    id.includes('nvr-') ||
    id.includes('guard') ||
    id.includes('rerank')
  )
    return false
  if (m.maxCompletionTokens === 0 && m.contextLength === 0) return false
  return true
}

const OPENAI_NON_CHAT_PARTS = [
  'audio',
  'realtime',
  'image',
  'transcribe',
  'tts',
  'search',
  'instruct',
  'deep-research',
  'computer-use',
  'moderation',
]

// Modèles gpt-* texte → texte (images en entrée tolérées) ; exclut audio, image, recherche, complétion seule.
export function isOpenAiChatModel(m: ModelInfo): boolean {
  return m.id.startsWith('gpt-') && !OPENAI_NON_CHAT_PARTS.some((part) => m.id.includes(part))
}
