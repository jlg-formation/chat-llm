import { useState, useEffect } from 'react'
import type { AppConfig, McpServer, McpTool } from '../types'
import { DEFAULT_CONFIG } from '../types'

const LS_KEY = 'chat_pedagogique_config'

function loadConfig(): AppConfig {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return DEFAULT_CONFIG
    const saved = JSON.parse(raw)
    // Migration : ancien format avec apiKey à plat → apiKeys par provider
    if (saved.llm && typeof saved.llm.apiKey === 'string') {
      saved.llm.apiKeys = {
        ...DEFAULT_CONFIG.llm.apiKeys,
        [saved.llm.provider ?? 'openai']: saved.llm.apiKey,
      }
      delete saved.llm.apiKey
    }
    // Migration : si pas d'apiFormat, dériver depuis le provider sauvegardé
    if (saved.llm && !saved.llm.apiFormat) {
      saved.llm.apiFormat = saved.llm.provider === 'openai' ? 'responses' : 'chat_completions'
    }
    // Migration : champs MCP plats → tableau mcpServers
    if (typeof saved.mcpUrl === 'string' && !Array.isArray(saved.mcpServers)) {
      const legacyServer: McpServer = {
        id: crypto.randomUUID(),
        name: (saved.mcpName as string) || 'Serveur MCP',
        url: saved.mcpUrl,
        enabled: (saved.mcpEnabled as boolean) ?? false,
        tools: (saved.mcpTools as McpTool[]) ?? [],
      }
      saved.mcpServers = saved.mcpUrl ? [legacyServer] : []
      delete saved.mcpUrl
      delete saved.mcpName
      delete saved.mcpEnabled
      delete saved.mcpTools
    }
    return {
      ...DEFAULT_CONFIG,
      ...(saved as Partial<AppConfig>),
      llm: { ...DEFAULT_CONFIG.llm, ...saved.llm, apiKeys: { ...DEFAULT_CONFIG.llm.apiKeys, ...saved.llm?.apiKeys } },
      mcpServers: Array.isArray(saved.mcpServers) ? (saved.mcpServers as McpServer[]) : DEFAULT_CONFIG.mcpServers,
    }
  } catch {
    return DEFAULT_CONFIG
  }
}

function saveConfig(config: AppConfig) {
  localStorage.setItem(LS_KEY, JSON.stringify(config))
}

let globalConfig = loadConfig()
const listeners = new Set<() => void>()

export function getConfig(): AppConfig {
  return globalConfig
}

export function updateConfig(partial: Partial<AppConfig>) {
  globalConfig = { ...globalConfig, ...partial }
  saveConfig(globalConfig)
  listeners.forEach(l => l())
}

export function useConfig(): [AppConfig, (partial: Partial<AppConfig>) => void] {
  const [config, setConfig] = useState<AppConfig>(globalConfig)

  useEffect(() => {
    const handler = () => setConfig({ ...globalConfig })
    listeners.add(handler)
    return () => { listeners.delete(handler) }
  }, [])

  return [config, updateConfig]
}
