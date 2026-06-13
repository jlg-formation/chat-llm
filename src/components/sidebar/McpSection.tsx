import { useState } from 'react'
import { Network, RefreshCw, ToggleLeft, ToggleRight } from 'lucide-react'
import { useConfig } from '../../store/configStore'
import { Accordion } from './Accordion'
import { fetchMcpTools } from '../../services/llm'
import type { McpTool } from '../../types'

export function McpSection() {
  const [config, update] = useConfig()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleFetchTools() {
    if (!config.mcpUrl) return
    setLoading(true)
    setError('')
    try {
      const tools = await fetchMcpTools(config.mcpUrl)
      update({ mcpTools: tools })
    } catch (e) {
      setError(`Erreur : ${(e as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  function toggleTool(tool: McpTool) {
    const updated = config.mcpTools.map(t =>
      t.name === tool.name ? { ...t, enabled: !t.enabled } : t
    )
    update({ mcpTools: updated })
  }

  return (
    <Accordion title="Serveur MCP" icon={<Network className="w-4 h-4 text-teal-500" />}>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-700">MCP activé</span>
          <button
            onClick={() => update({ mcpEnabled: !config.mcpEnabled })}
            className="text-gray-400"
          >
            {config.mcpEnabled
              ? <ToggleRight className="w-5 h-5 text-teal-500" />
              : <ToggleLeft className="w-5 h-5" />
            }
          </button>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">URL du serveur MCP (Streamable HTTP)</label>
          <div className="flex gap-2">
            <input
              type="url"
              value={config.mcpUrl}
              onChange={e => update({ mcpUrl: e.target.value })}
              className="flex-1 text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="http://localhost:8000"
            />
            <button
              onClick={handleFetchTools}
              disabled={!config.mcpUrl || loading}
              className="p-1.5 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-40 transition-colors"
              title="Charger les outils"
            >
              <RefreshCw className={`w-4 h-4 text-gray-600 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        {config.mcpTools.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-gray-500 font-medium">Outils disponibles :</p>
            {config.mcpTools.map(tool => (
              <div key={tool.name} className="flex items-center gap-2 text-sm">
                <button onClick={() => toggleTool(tool)} className="shrink-0">
                  {tool.enabled
                    ? <ToggleRight className="w-4 h-4 text-teal-500" />
                    : <ToggleLeft className="w-4 h-4 text-gray-400" />
                  }
                </button>
                <span className={`font-mono text-xs ${tool.enabled ? 'text-gray-800' : 'text-gray-400'}`}>
                  {tool.name}
                </span>
                <span className="text-xs text-gray-400 truncate">{tool.description}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Accordion>
  )
}
