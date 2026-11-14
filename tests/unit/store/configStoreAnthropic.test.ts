import { describe, it, expect, vi } from 'vitest'

const LS_KEY = 'chat_pedagogique_config'

async function loadStore(saved: unknown) {
  vi.resetModules()
  localStorage.setItem(LS_KEY, JSON.stringify(saved))
  return import('@/store/configStore')
}

describe('configStore with Anthropic', () => {
  it('adds an empty anthropic key and showThinking=false to older configs', async () => {
    const store = await loadStore({
      llm: { provider: 'openai', apiKeys: { openai: 'sk', ovh: '', lmstudio: '', ollama: '' } },
    })
    const { llm } = store.getConfig()
    expect(llm.apiKeys.anthropic).toBe('')
    expect(llm.apiKeys.openai).toBe('sk')
    expect(llm.showThinking).toBe(false)
  })

  it('derives the native format for a saved anthropic provider without apiFormat', async () => {
    const store = await loadStore({ llm: { provider: 'anthropic' } })
    expect(store.getConfig().llm.apiFormat).toBe('anthropic_messages')
  })

  it('keeps a saved anthropic configuration', async () => {
    const store = await loadStore({
      llm: { provider: 'anthropic', apiFormat: 'chat_completions', model: 'claude-opus-5-5', showThinking: true },
    })
    expect(store.getConfig().llm).toMatchObject({
      provider: 'anthropic',
      apiFormat: 'chat_completions',
      model: 'claude-opus-5-5',
      showThinking: true,
    })
  })
})
