import { describe, it, expect, vi } from 'vitest'

const LS_KEY = 'chat_pedagogique_config'

async function loadStore(saved: unknown) {
  vi.resetModules()
  localStorage.setItem(LS_KEY, JSON.stringify(saved))
  return import('@/store/configStore')
}

describe('configStore with Mistral', () => {
  it('adds an empty mistral key to older configs', async () => {
    const store = await loadStore({
      llm: {
        provider: 'openai',
        apiKeys: { openai: 'sk', ovh: '', lmstudio: '', ollama: '' },
      },
    })
    const { llm } = store.getConfig()
    expect(llm.apiKeys.mistral).toBe('')
    expect(llm.apiKeys.openai).toBe('sk')
  })

  it('derives chat_completions for a saved mistral provider without apiFormat', async () => {
    const store = await loadStore({ llm: { provider: 'mistral' } })
    expect(store.getConfig().llm.apiFormat).toBe('chat_completions')
  })
})
