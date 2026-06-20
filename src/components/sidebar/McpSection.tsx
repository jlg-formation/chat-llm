import { useState } from 'react'
import { Network, RefreshCw, Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import { Toggle } from './Toggle'
import { useConfig } from '../../store/configStore'
import { Accordion } from './Accordion'
import { fetchMcpTools, connectMcp, disconnectMcp } from '../../services/mcp'
import type { McpServer } from '../../types'

export function McpSection() {
  const [config, update] = useConfig()
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set())
  const [errorIds, setErrorIds] = useState<Map<string, string>>(new Map())
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  function updateServer(id: string, patch: Partial<McpServer>) {
    update({
      mcpServers: config.mcpServers.map(s => s.id === id ? { ...s, ...patch } : s),
    })
  }

  function addServer() {
    const id = crypto.randomUUID()
    update({
      mcpServers: [...config.mcpServers, { id, name: '', url: '', enabled: false, tools: [] }],
    })
    setExpandedIds(prev => new Set(prev).add(id))
  }

  async function removeServer(id: string) {
    const server = config.mcpServers.find(s => s.id === id)
    if (server?.enabled && server.url) {
      try { await disconnectMcp(server.url) } catch { /* ignore */ }
    }
    update({ mcpServers: config.mcpServers.filter(s => s.id !== id) })
  }

  async function toggleServer(server: McpServer) {
    const enabling = !server.enabled
    if (!server.url) { updateServer(server.id, { enabled: enabling }); return }
    setLoadingIds(prev => new Set(prev).add(server.id))
    setErrorIds(prev => { const m = new Map(prev); m.delete(server.id); return m })
    try {
      if (enabling) {
        await connectMcp(server.url)
        const tools = await fetchMcpTools(server.url)
        updateServer(server.id, { enabled: true, tools })
      } else {
        await disconnectMcp(server.url)
        updateServer(server.id, { enabled: false, tools: [] })
      }
    } catch (e) {
      setErrorIds(prev => new Map(prev).set(server.id, `Erreur : ${(e as Error).message}`))
    } finally {
      setLoadingIds(prev => { const s = new Set(prev); s.delete(server.id); return s })
    }
  }

  async function refreshTools(server: McpServer) {
    if (!server.url) return
    setLoadingIds(prev => new Set(prev).add(server.id))
    setErrorIds(prev => { const m = new Map(prev); m.delete(server.id); return m })
    try {
      const tools = await fetchMcpTools(server.url)
      updateServer(server.id, { tools })
    } catch (e) {
      setErrorIds(prev => new Map(prev).set(server.id, `Erreur : ${(e as Error).message}`))
    } finally {
      setLoadingIds(prev => { const s = new Set(prev); s.delete(server.id); return s })
    }
  }

  function toggleTool(serverId: string, toolName: string) {
    update({
      mcpServers: config.mcpServers.map(s =>
        s.id !== serverId ? s : {
          ...s,
          tools: s.tools.map(t => t.name === toolName ? { ...t, enabled: !t.enabled } : t),
        }
      ),
    })
  }

  function toggleExpanded(id: string) {
    setExpandedIds(prev => {
      const s = new Set(prev)
      if (s.has(id)) s.delete(id)
      else s.add(id)
      return s
    })
  }

  return (
    <Accordion title="Serveurs MCP" icon={<Network className="w-4 h-4 text-teal-500" />}>
      <div className="space-y-3">
        <button
          onClick={addServer}
          className="w-full flex items-center justify-center gap-2 text-sm border border-dashed border-teal-400 text-teal-600 rounded-md py-2 hover:bg-teal-50 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Ajouter un serveur
        </button>

        {config.mcpServers.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-1">Aucun serveur MCP configuré</p>
        )}

        {config.mcpServers.map(server => {
          const isExpanded = expandedIds.has(server.id)
          const isLoading = loadingIds.has(server.id)
          const error = errorIds.get(server.id)
          const enabledCount = server.tools.filter(t => t.enabled).length

          return (
            <div
              key={server.id}
              className={`border rounded-md ${server.enabled ? 'border-teal-300 bg-teal-50/30' : 'border-gray-200'}`}
            >
              {/* Header */}
              <div className="flex items-center gap-2 px-3 py-2">
                <Toggle
                  checked={server.enabled}
                  onChange={() => toggleServer(server)}
                  color="teal"
                  size="sm"
                />
                <span
                  className="flex-1 text-sm font-medium text-gray-700 truncate cursor-pointer select-none"
                  onClick={() => toggleExpanded(server.id)}
                >
                  {server.name || <span className="text-gray-400 italic font-normal">Sans nom</span>}
                </span>
                {server.tools.length > 0 && (
                  <span className="text-xs text-teal-600 bg-teal-100 rounded-full px-1.5 py-0.5 shrink-0">
                    {enabledCount}/{server.tools.length}
                  </span>
                )}
                <button
                  onClick={() => toggleExpanded(server.id)}
                  className="text-gray-400 hover:text-gray-600 shrink-0"
                  aria-label={isExpanded ? 'Réduire' : 'Développer'}
                >
                  {isExpanded
                    ? <ChevronDown className="w-4 h-4" />
                    : <ChevronRight className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => removeServer(server.id)}
                  className="text-gray-300 hover:text-red-500 transition-colors shrink-0"
                  title="Supprimer ce serveur"
                  aria-label="Supprimer ce serveur"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {/* Corps (expanded) */}
              {isExpanded && (
                <div className="px-3 pb-3 space-y-2 border-t border-gray-100 pt-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Alias</label>
                    <input
                      type="text"
                      value={server.name}
                      onChange={e => updateServer(server.id, { name: e.target.value })}
                      className="w-full text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
                      placeholder="Mon serveur MCP"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-gray-500 mb-1">URL (Streamable HTTP)</label>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={server.url}
                        onChange={e => updateServer(server.id, { url: e.target.value })}
                        className="flex-1 text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
                        placeholder="http://localhost:8000"
                      />
                      <button
                        onClick={() => refreshTools(server)}
                        disabled={!server.url || isLoading}
                        className="p-1.5 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-40 transition-colors"
                        title="Recharger les outils"
                        aria-label="Recharger les outils"
                      >
                        <RefreshCw className={`w-4 h-4 text-gray-600 ${isLoading ? 'animate-spin' : ''}`} />
                      </button>
                    </div>
                  </div>

                  {error && <p className="text-xs text-red-500">{error}</p>}

                  {server.tools.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs text-gray-500 font-medium">Outils disponibles :</p>
                      {server.tools.map(tool => (
                        <div key={tool.name} className="flex items-start gap-2">
                          <Toggle
                            checked={tool.enabled}
                            onChange={() => toggleTool(server.id, tool.name)}
                            color="teal"
                            size="sm"
                          />
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
              )}
            </div>
          )
        })}
      </div>
    </Accordion>
  )
}
