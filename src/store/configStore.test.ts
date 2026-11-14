import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { DEFAULT_CONFIG } from '../types'

const LS_KEY = 'chat_pedagogique_config'

// configStore charge sa config à l'import : on réimporte le module pour chaque scénario.
async function loadStore(saved?: unknown) {
  vi.resetModules()
  localStorage.clear()
  if (saved !== undefined) localStorage.setItem(LS_KEY, typeof saved === 'string' ? saved : JSON.stringify(saved))
  return import('./configStore')
}

describe('configStore loading', () => {
  it('uses the defaults when nothing is stored', async () => {
    const store = await loadStore()
    expect(store.getConfig()).toEqual(DEFAULT_CONFIG)
  })

  it('falls back to the defaults on corrupted JSON', async () => {
    const store = await loadStore('{not json')
    expect(store.getConfig()).toEqual(DEFAULT_CONFIG)
  })

  it('migrates a flat apiKey into apiKeys for the saved provider', async () => {
    const store = await loadStore({ llm: { provider: 'ovh', apiKey: 'k1', apiFormat: 'chat_completions', model: 'gpt-oss-20b' } })
    const config = store.getConfig()
    expect(config.llm.apiKeys.ovh).toBe('k1')
    expect(config.llm).not.toHaveProperty('apiKey')
  })

  it('migrates a flat apiKey to openai when no provider is saved', async () => {
    const store = await loadStore({ llm: { apiKey: 'k2' } })
    expect(store.getConfig().llm.apiKeys.openai).toBe('k2')
  })

  it('derives apiFormat from the provider when missing', async () => {
    const openai = await loadStore({ llm: { provider: 'openai' } })
    expect(openai.getConfig().llm.apiFormat).toBe('responses')
    const ollama = await loadStore({ llm: { provider: 'ollama' } })
    expect(ollama.getConfig().llm.apiFormat).toBe('chat_completions')
  })

  it('migrates flat MCP fields into mcpServers', async () => {
    const store = await loadStore({ mcpUrl: 'http://mcp', mcpName: 'Docs', mcpEnabled: true, mcpTools: [] })
    const servers = store.getConfig().mcpServers
    expect(servers).toHaveLength(1)
    expect(servers[0]).toMatchObject({ name: 'Docs', url: 'http://mcp', enabled: true, tools: [] })
    expect(store.getConfig()).not.toHaveProperty('mcpUrl')
  })

  it('creates no server when the legacy MCP url is empty', async () => {
    const store = await loadStore({ mcpUrl: '' })
    expect(store.getConfig().mcpServers).toEqual([])
  })

  it('uses default names and disabled state for legacy MCP without optional fields', async () => {
    const store = await loadStore({ mcpUrl: 'http://mcp' })
    expect(store.getConfig().mcpServers[0]).toMatchObject({ name: 'Serveur MCP', enabled: false, tools: [] })
  })

  it('resets an unknown provider to the default one', async () => {
    const store = await loadStore({ llm: { provider: 'unknown-provider', apiFormat: 'responses', baseUrl: 'http://old' } })
    const llm = store.getConfig().llm
    expect(llm.provider).toBe(DEFAULT_CONFIG.llm.provider)
    expect(llm.apiFormat).toBe(DEFAULT_CONFIG.llm.apiFormat)
    expect(llm.baseUrl).toBe(DEFAULT_CONFIG.llm.baseUrl)
  })

  it('ignores a non-array mcpServers value', async () => {
    const store = await loadStore({ mcpServers: 'nope' })
    expect(store.getConfig().mcpServers).toEqual(DEFAULT_CONFIG.mcpServers)
  })
})

describe('configStore updates', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('merges partial updates, persists them and notifies hooks', async () => {
    const store = await loadStore()
    const { result } = renderHook(() => store.useConfig())
    act(() => result.current[1]({ streamEnabled: false }))
    expect(result.current[0].streamEnabled).toBe(false)
    expect(store.getConfig().streamEnabled).toBe(false)
    expect(JSON.parse(localStorage.getItem(LS_KEY) ?? '{}').streamEnabled).toBe(false)
  })

  it('stops notifying hooks after unmount', async () => {
    const store = await loadStore()
    const { result, unmount } = renderHook(() => store.useConfig())
    unmount()
    act(() => store.updateConfig({ streamEnabled: false }))
    expect(result.current[0].streamEnabled).toBe(DEFAULT_CONFIG.streamEnabled)
  })
})
