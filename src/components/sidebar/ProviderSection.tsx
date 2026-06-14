import { Server } from 'lucide-react'
import { useConfig } from '../../store/configStore'
import { type Provider, type ApiFormat, PROVIDER_DEFAULTS } from '../../types'
import { Accordion } from './Accordion'

interface ModelOption {
  id: string
  label: string
  price: string
}

const OPENAI_MODELS: ModelOption[] = [
  { id: 'gpt-5.4-nano',  label: 'GPT-5.4 nano',  price: '$0.20 / $1.25 per 1M tok' },
  { id: 'gpt-5.4-mini',  label: 'GPT-5.4 mini',  price: '$0.75 / $4.50 per 1M tok' },
  { id: 'gpt-5.4',       label: 'GPT-5.4',        price: '$2.50 / $15 per 1M tok' },
  { id: 'gpt-5.4-pro',   label: 'GPT-5.4 pro',   price: '$30 / $180 per 1M tok' },
  { id: 'gpt-5.5',       label: 'GPT-5.5',        price: '$5 / $30 per 1M tok' },
  { id: 'gpt-5.5-pro',   label: 'GPT-5.5 pro',   price: '$30 / $180 per 1M tok' },
]

// ✦ = supporte aussi /v1/responses
const OVH_MODELS: ModelOption[] = [
  { id: 'gpt-oss-20b',                        label: 'gpt-oss-20b ✦',                        price: '$0.05 / $0.18 per 1M tok' },
  { id: 'gpt-oss-120b',                       label: 'gpt-oss-120b ✦',                       price: '$0.09 / $0.47 per 1M tok' },
  { id: 'Mistral-7B-Instruct-v0.3',           label: 'Mistral-7B-Instruct-v0.3',             price: '$0.11 per 1M tok' },
  { id: 'Mistral-Nemo-Instruct-2407',         label: 'Mistral-Nemo-Instruct-2407',           price: '$0.14 per 1M tok' },
  { id: 'Mistral-Small-3.2-24B-Instruct-2506', label: 'Mistral-Small-3.2-24B-Instruct-2506', price: '$0.10 / $0.31 per 1M tok' },
  { id: 'Llama-3.1-8B-Instruct',             label: 'Llama-3.1-8B-Instruct',               price: '$0.11 per 1M tok' },
  { id: 'Meta-Llama-3_3-70B-Instruct',        label: 'Meta-Llama-3.3-70B-Instruct',          price: '$0.74 per 1M tok' },
  { id: 'Qwen3-32B',                          label: 'Qwen3-32B',                            price: '$0.09 / $0.25 per 1M tok' },
  { id: 'Qwen3.5-9B',                         label: 'Qwen3.5-9B',                           price: '$0.12 / $0.18 per 1M tok' },
  { id: 'Qwen3.5-397B-A17B',                  label: 'Qwen3.5-397B-A17B',                    price: '$0.71 / $4.25 per 1M tok' },
  { id: 'Qwen3.6-27B',                        label: 'Qwen3.6-27B',                          price: '$0.47 / $3.19 per 1M tok' },
  { id: 'Qwen3-Coder-30B-A3B-Instruct',       label: 'Qwen3-Coder-30B-A3B-Instruct',         price: '$0.07 / $0.26 per 1M tok' },
  { id: 'Qwen2.5-VL-72B-Instruct',            label: 'Qwen2.5-VL-72B-Instruct',             price: '$1.01 per 1M tok' },
]

function getApiInfo(provider: Provider, apiFormat: ApiFormat): { label: string; endpoint: string; color: string } {
  if (provider === 'ollama')   return { label: 'API Ollama native',    endpoint: 'POST /api/chat',            color: 'bg-orange-50 text-orange-700 border-orange-200' }
  if (provider === 'lmstudio') return { label: 'API Chat Completions', endpoint: 'POST /v1/chat/completions', color: 'bg-blue-50 text-blue-700 border-blue-200' }
  if (apiFormat === 'responses') return { label: 'API Responses',      endpoint: 'POST /v1/responses',        color: 'bg-violet-50 text-violet-700 border-violet-200' }
  return { label: 'API Chat Completions', endpoint: 'POST /v1/chat/completions', color: 'bg-blue-50 text-blue-700 border-blue-200' }
}

export function ProviderSection() {
  const [config, update] = useConfig()
  const { llm } = config
  const api = getApiInfo(llm.provider, llm.apiFormat)

  const DEFAULT_MODEL: Record<Provider, string> = {
    openai: 'gpt-5.4-nano',
    ovh: 'gpt-oss-20b',
    lmstudio: '',
    ollama: '',
  }

  function handleProviderChange(provider: Provider) {
    update({
      llm: {
        ...llm,
        provider,
        baseUrl: PROVIDER_DEFAULTS[provider].baseUrl,
        apiFormat: (provider === 'openai' || provider === 'ovh') ? llm.apiFormat : 'chat_completions',
        model: DEFAULT_MODEL[provider],
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

        {(llm.provider === 'openai' || llm.provider === 'ovh') && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">Format API</label>
            <div className="flex flex-col gap-1.5">
              {([
                { fmt: 'responses'        as ApiFormat, path: '/v1/responses',        name: 'API Responses' },
                { fmt: 'chat_completions' as ApiFormat, path: '/v1/chat/completions', name: 'API Chat Completions' },
              ]).map(({ fmt, path, name }) => {
                const active = llm.apiFormat === fmt
                return (
                  <button
                    key={fmt}
                    onClick={() => update({ llm: { ...llm, apiFormat: fmt } })}
                    className={`w-full text-left px-3 py-2 rounded-md border transition-colors ${
                      active
                        ? 'bg-blue-50 border-blue-500 text-blue-700'
                        : 'bg-white border-gray-200 text-gray-500 hover:border-blue-300 hover:text-gray-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-3 h-3 rounded-full border-2 shrink-0 ${active ? 'border-blue-500 bg-blue-500' : 'border-gray-300'}`} />
                      <div>
                        <div className="text-xs font-semibold leading-tight">{name}</div>
                        <div className="text-xs font-mono opacity-70 leading-tight">{path}</div>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
            {llm.provider === 'ovh' && llm.apiFormat === 'responses' && (
              <p className="text-xs text-amber-600 mt-1">Supporté uniquement par gpt-oss-20b et gpt-oss-120b</p>
            )}
          </div>
        )}

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
          ) : llm.provider === 'ovh' ? (
            <select
              value={OVH_MODELS.some(m => m.id === llm.model) ? llm.model : '__custom__'}
              onChange={e => {
                if (e.target.value !== '__custom__') update({ llm: { ...llm, model: e.target.value } })
              }}
              className="w-full text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {OVH_MODELS.map(m => (
                <option key={m.id} value={m.id}>{m.label} — {m.price}</option>
              ))}
              {!OVH_MODELS.some(m => m.id === llm.model) && (
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
