import { Server } from 'lucide-react'
import { useConfig } from '../../store/configStore'
import { type Provider, PROVIDER_DEFAULTS } from '../../types'
import { Accordion } from './Accordion'

interface OpenAIModel {
  id: string
  label: string
  price: string
}

const OPENAI_MODELS: OpenAIModel[] = [
  { id: 'gpt-5.4-nano',  label: 'GPT-5.4 nano',  price: '$0.20 / $1.25 per 1M tok' },
  { id: 'gpt-5.4-mini',  label: 'GPT-5.4 mini',  price: '$0.75 / $4.50 per 1M tok' },
  { id: 'gpt-5.4',       label: 'GPT-5.4',        price: '$2.50 / $15 per 1M tok' },
  { id: 'gpt-5.4-pro',   label: 'GPT-5.4 pro',   price: '$30 / $180 per 1M tok' },
  { id: 'gpt-5.5',       label: 'GPT-5.5',        price: '$5 / $30 per 1M tok' },
  { id: 'gpt-5.5-pro',   label: 'GPT-5.5 pro',   price: '$30 / $180 per 1M tok' },
]

const API_INFO: Record<Provider, { label: string; endpoint: string; color: string }> = {
  openai:   { label: 'API Responses',         endpoint: 'POST /v1/responses',        color: 'bg-violet-50 text-violet-700 border-violet-200' },
  ovh:      { label: 'API Chat Completions',   endpoint: 'POST /v1/chat/completions', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  lmstudio: { label: 'API Chat Completions',   endpoint: 'POST /v1/chat/completions', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  ollama:   { label: 'API Ollama native',      endpoint: 'POST /api/chat',            color: 'bg-orange-50 text-orange-700 border-orange-200' },
}

export function ProviderSection() {
  const [config, update] = useConfig()
  const { llm } = config
  const api = API_INFO[llm.provider]

  function handleProviderChange(provider: Provider) {
    update({
      llm: {
        ...llm,
        provider,
        baseUrl: PROVIDER_DEFAULTS[provider].baseUrl,
      },
    })
  }

  return (
    <Accordion title="Provider LLM" icon={<Server className="w-4 h-4 text-blue-500" />} defaultOpen>
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Provider</label>
          <select
            value={llm.provider}
            onChange={e => handleProviderChange(e.target.value as Provider)}
            className="w-full text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            {Object.entries(PROVIDER_DEFAULTS).map(([key, val]) => (
              <option key={key} value={key}>{val.label}</option>
            ))}
          </select>
        </div>

        <div className={`border rounded-md px-3 h-9 flex items-center gap-2 text-xs ${api.color}`}>
          <span className="font-semibold shrink-0">{api.label}</span>
          <span className="font-mono opacity-75 truncate">{api.endpoint}</span>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">URL de base</label>
          <input
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
          <label className="block text-xs text-gray-500 mb-1">
            Clé API <span className="text-gray-400">(propre à {PROVIDER_DEFAULTS[llm.provider].label})</span>
          </label>
          <input
            type="password"
            value={llm.apiKeys[llm.provider]}
            onChange={e => update({ llm: { ...llm, apiKeys: { ...llm.apiKeys, [llm.provider]: e.target.value } } })}
            className="w-full text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={PROVIDER_DEFAULTS[llm.provider].needsKey ? 'sk-...' : '(optionnel)'}
            autoComplete="off"
          />
          <p className="text-xs text-amber-600 mt-1">Stockée en clair dans localStorage</p>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Modèle</label>
          {llm.provider === 'openai' ? (
            <select
              value={OPENAI_MODELS.some(m => m.id === llm.model) ? llm.model : '__custom__'}
              onChange={e => {
                if (e.target.value !== '__custom__') update({ llm: { ...llm, model: e.target.value } })
              }}
              className="w-full text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {OPENAI_MODELS.map(m => (
                <option key={m.id} value={m.id}>{m.label} — {m.price}</option>
              ))}
              {!OPENAI_MODELS.some(m => m.id === llm.model) && (
                <option value="__custom__">{llm.model} (personnalisé)</option>
              )}
            </select>
          ) : (
            <input
              type="text"
              value={llm.model}
              onChange={e => update({ llm: { ...llm, model: e.target.value } })}
              className="w-full text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="llama3, mistral..."
            />
          )}
        </div>
      </div>
    </Accordion>
  )
}
