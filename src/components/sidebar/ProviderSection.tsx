import { Server, RefreshCw, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { useConfig } from '../../store/configStore'
import { type Provider, type ApiFormat, PROVIDER_DEFAULTS } from '../../types'
import { Accordion } from './Accordion'
import { fetchModels } from '../../services/models'
import { setCachedModels, useModelsCache } from '../../store/modelsStore'
import type { ModelInfo } from '../../services/models'

const OVH_MODELS_RESPONSES_SUPPORTED = new Set(['gpt-oss-20b', 'gpt-oss-120b'])

function supportsFormat(provider: Provider, model: string, fmt: ApiFormat): boolean {
  if (provider !== 'ovh') return true
  if (fmt === 'responses') return OVH_MODELS_RESPONSES_SUPPORTED.has(model)
  return true
}

function modelLabel(m: ModelInfo): string {
  let label = m.id
  const parts: string[] = []
  if (m.contextLength) parts.push(`${m.contextLength >= 1000 ? Math.round(m.contextLength / 1000) + 'k' : m.contextLength} ctx`)
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

const STATIC_OPENAI_MODELS: ModelInfo[] = [
  { id: 'gpt-5.4-nano',  pricingPrompt: 0.20e-6,  pricingCompletion: 1.25e-6  },
  { id: 'gpt-5.4-mini',  pricingPrompt: 0.75e-6,  pricingCompletion: 4.50e-6  },
  { id: 'gpt-5.4',       pricingPrompt: 2.50e-6,  pricingCompletion: 15e-6    },
  { id: 'gpt-5.4-pro',   pricingPrompt: 30e-6,    pricingCompletion: 180e-6   },
  { id: 'gpt-5.5',       pricingPrompt: 5e-6,     pricingCompletion: 30e-6    },
  { id: 'gpt-5.5-pro',   pricingPrompt: 30e-6,    pricingCompletion: 180e-6   },
]

// Filtre les modèles OVH pertinents pour le chat (exclut embeddings, audio, image)
function isOvhChatModel(m: ModelInfo): boolean {
  const id = m.id.toLowerCase()
  if (id.includes('embed') || id.includes('whisper') || id.includes('diffusion') || id.includes('ppl') || id.includes('bge')) return false
  if (m.maxCompletionTokens === 0 && m.contextLength === 0) return false
  return true
}

export function ProviderSection() {
  const [config, update] = useConfig()
  const { llm } = config
  const [loadingModels, setLoadingModels] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const cachedModels = useModelsCache(llm.provider)

  const DEFAULT_MODEL: Record<Provider, string> = {
    openai: 'gpt-5.4-nano',
    ovh: 'gpt-oss-20b',
    lmstudio: '',
    ollama: '',
  }

  function handleProviderChange(provider: Provider) {
    const defaultFormat: Record<Provider, ApiFormat> = {
      openai: llm.apiFormat === 'lmstudio_chat' || llm.apiFormat === 'ollama_chat' ? 'responses' : llm.apiFormat,
      ovh: llm.apiFormat === 'lmstudio_chat' || llm.apiFormat === 'ollama_chat' ? 'responses' : llm.apiFormat,
      lmstudio: 'lmstudio_chat',
      ollama: 'ollama_chat',
    }
    update({
      llm: {
        ...llm,
        provider,
        baseUrl: PROVIDER_DEFAULTS[provider].baseUrl,
        apiFormat: defaultFormat[provider],
        model: DEFAULT_MODEL[provider],
      },
    })
    setLoadError(null)
  }

  async function handleLoadModels() {
    setLoadingModels(true)
    setLoadError(null)
    try {
      const models = await fetchModels(llm.provider, llm.baseUrl, llm.apiKeys[llm.provider])
      setCachedModels(llm.provider, models)
    } catch (e) {
      setLoadError((e as Error).message)
    } finally {
      setLoadingModels(false)
    }
  }

  // Modèles à afficher dans la liste
  function getDisplayModels(): ModelInfo[] {
    if (llm.provider === 'openai') {
      if (cachedModels) {
        // Depuis l'API : on garde les gpt-* récents uniquement
        const known = new Set(STATIC_OPENAI_MODELS.map(m => m.id))
        return cachedModels
          .filter(m => m.id.startsWith('gpt-') && !m.id.includes('audio') && !m.id.includes('realtime') && !m.id.includes('image') && !m.id.includes('transcribe') && !m.id.includes('tts') && !m.id.includes('search'))
          // Enrichir avec pricing statique si dispo
          .map(m => known.has(m.id) ? { ...m, ...STATIC_OPENAI_MODELS.find(s => s.id === m.id) } : m)
          .sort((a, b) => a.id.localeCompare(b.id))
      }
      return STATIC_OPENAI_MODELS
    }
    if (llm.provider === 'ovh') {
      const models = cachedModels ?? []
      return models.filter(isOvhChatModel)
    }
    return cachedModels ?? []
  }

  const displayModels = getDisplayModels()
  const showDropdown = llm.provider === 'openai' || llm.provider === 'ovh' || cachedModels !== undefined
  const modelInList = displayModels.some(m => m.id === llm.model)
  const currentModelInfo = cachedModels?.find(m => m.id === llm.model)
  const toolUseWarning = currentModelInfo?.supportsToolUse === false

  return (
    <Accordion title="Provider LLM" icon={<Server className="w-4 h-4 text-blue-500" />} defaultOpen>
      <div className="space-y-3">
        <div>
          <label htmlFor="provider-select" className="block text-xs text-gray-500 mb-1">Provider</label>
          <select
            id="provider-select"
            value={llm.provider}
            onChange={e => handleProviderChange(e.target.value as Provider)}
            className="w-full text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            {Object.entries(PROVIDER_DEFAULTS).map(([key, val]) => (
              <option key={key} value={key}>{val.label}</option>
            ))}
          </select>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-gray-500">Modèle</label>
            <button
              onClick={handleLoadModels}
              disabled={loadingModels}
              title="Charger les modèles depuis l'API"
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-500 transition-colors disabled:opacity-40"
            >
              <RefreshCw className={`w-3 h-3 ${loadingModels ? 'animate-spin' : ''}`} />
              {cachedModels ? 'Actualiser' : 'Charger'}
            </button>
          </div>

          {loadError && (
            <p className="text-xs text-red-500 mb-1">{loadError}</p>
          )}

          {showDropdown && displayModels.length > 0 ? (
            <select
              id="model-select"
              aria-label="Modèle"
              value={modelInList ? llm.model : '__custom__'}
              onChange={e => {
                if (e.target.value === '__custom__') return
                const newModel = e.target.value
                const apiFormat = supportsFormat(llm.provider, newModel, llm.apiFormat) ? llm.apiFormat : 'chat_completions'
                update({ llm: { ...llm, model: newModel, apiFormat } })
              }}
              className="w-full text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {displayModels.map(m => (
                <option key={m.id} value={m.id}>{modelLabel(m)}</option>
              ))}
              {!modelInList && (
                <option value="__custom__">{llm.model} (personnalisé)</option>
              )}
            </select>
          ) : (
            <input
              id="model-input"
              type="text"
              aria-label="Modèle"
              value={llm.model}
              onChange={e => update({ llm: { ...llm, model: e.target.value } })}
              className="w-full text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="llama3, mistral..."
            />
          )}
        </div>

        {toolUseWarning && (
          <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2">
            <TriangleAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 leading-snug">
              Ce modèle n'est pas entraîné pour le tool calling. Les skills et outils MCP risquent de ne pas fonctionner correctement.
            </p>
          </div>
        )}

        {(llm.provider === 'openai' || llm.provider === 'ovh' || llm.provider === 'lmstudio' || llm.provider === 'ollama') && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">Format API</label>
            <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Format API">
              {(llm.provider === 'lmstudio' ? [
                { fmt: 'lmstudio_chat'    as ApiFormat, path: '/api/v1/chat',         name: 'LM Studio Chat' },
                { fmt: 'chat_completions' as ApiFormat, path: '/v1/chat/completions', name: 'API Chat Completions' },
                { fmt: 'responses'        as ApiFormat, path: '/v1/responses',        name: 'API Responses' },
              ] : llm.provider === 'ollama' ? [
                { fmt: 'ollama_chat'      as ApiFormat, path: '/api/chat',            name: 'Ollama natif' },
                { fmt: 'chat_completions' as ApiFormat, path: '/v1/chat/completions', name: 'OpenAI compatible' },
              ] : [
                { fmt: 'responses'        as ApiFormat, path: '/v1/responses',        name: 'API Responses' },
                { fmt: 'chat_completions' as ApiFormat, path: '/v1/chat/completions', name: 'API Chat Completions' },
              ]).map(({ fmt, path, name }) => {
                const active = llm.apiFormat === fmt
                const disabled = !supportsFormat(llm.provider, llm.model, fmt)
                return (
                  <button
                    key={fmt}
                    role="radio"
                    aria-checked={active}
                    onClick={() => !disabled && update({ llm: { ...llm, apiFormat: fmt } })}
                    disabled={disabled}
                    className={`w-full text-left px-3 py-2 rounded-md border transition-colors ${
                      disabled
                        ? 'bg-gray-50 border-gray-200 text-gray-300 cursor-not-allowed'
                        : active
                          ? 'bg-blue-50 border-blue-500 text-blue-700'
                          : 'bg-white border-gray-200 text-gray-500 hover:border-blue-300 hover:text-gray-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-3 h-3 rounded-full border-2 shrink-0 ${
                        disabled ? 'border-gray-200' : active ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                      }`} />
                      <div>
                        <div className="text-xs font-semibold leading-tight">{name}</div>
                        <div className="text-xs font-mono opacity-70 leading-tight">{path}</div>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div>
          <label htmlFor="base-url" className="block text-xs text-gray-500 mb-1">URL de base</label>
          <input
            id="base-url"
            type="url"
            value={llm.baseUrl}
            onChange={e => update({ llm: { ...llm, baseUrl: e.target.value } })}
            disabled={llm.provider === 'openai'}
            className="w-full text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
            placeholder="https://..."
            autoComplete="off"
          />
        </div>

        <div>
          <label htmlFor="api-key" className="block text-xs text-gray-500 mb-1">
            Clé API <span className="text-gray-400">(propre à {PROVIDER_DEFAULTS[llm.provider].label})</span>
          </label>
          <input
            id="api-key"
            type="password"
            value={llm.apiKeys[llm.provider]}
            onChange={e => update({ llm: { ...llm, apiKeys: { ...llm.apiKeys, [llm.provider]: e.target.value } } })}
            className="w-full text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={PROVIDER_DEFAULTS[llm.provider].needsKey ? 'sk-...' : '(optionnel)'}
            autoComplete="off"
          />
          <p className="text-xs text-amber-600 mt-1">Stockée en clair dans localStorage</p>
        </div>

      </div>
    </Accordion>
  )
}
