import { useState } from 'react'
import { Network, RefreshCw } from 'lucide-react'
import { Toggle } from './Toggle'
import { useConfig } from '../../store/configStore'
import { Accordion } from './Accordion'
import { fetchMcpTools, connectMcp, disconnectMcp } from '../../services/llm'
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
          <Toggle
            checked={config.mcpEnabled}
            onChange={async () => {
              const enabling = !config.mcpEnabled
              if (!config.mcpUrl) { update({ mcpEnabled: enabling }); return }
              setLoading(true)
              setError('')
              try {
                if (enabling) {
                  await connectMcp(config.mcpUrl)
                  const tools = await fetchMcpTools(config.mcpUrl)
                  update({ mcpEnabled: true, mcpTools: tools })
                } else {
                  await disconnectMcp(config.mcpUrl)
                  update({ mcpEnabled: false, mcpTools: [] })
                }
              } catch (e) {
                setError(`Erreur : ${(e as Error).message}`)
              } finally {
                setLoading(false)
              }
            }}
            color="teal"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Alias du serveur</label>
          <input
            type="text"
            value={config.mcpName}
            onChange={e => update({ mcpName: e.target.value })}
            className="w-full text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
            placeholder="Mon serveur MCP"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">URL du serveur MCP (Streamable HTTP)</label>
          <div className="flex gap-2">
            <input
              type="url"
              value={config.mcpUrl}
              onChange={e => update({ mcpUrl: e.target.value })}
              className="flex-1 text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
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
              <div key={tool.name} className="flex items-start gap-2">
                <Toggle checked={tool.enabled} onChange={() => toggleTool(tool)} color="teal" size="sm" />
                <div className="min-w-0">
                  <div className={`font-mono text-xs ${tool.enabled ? 'text-gray-800' : 'text-gray-400'}`}>
                    {tool.name}
                  </div>
                  <div className="text-xs text-gray-400">{tool.description}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Accordion>
  )
}
