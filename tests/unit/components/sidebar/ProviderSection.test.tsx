import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProviderSection } from '@/components/sidebar/ProviderSection'
import { updateConfig, getConfig } from '@/store/configStore'
import { setCachedModels } from '@/store/modelsStore'
import { fetchModels } from '@/services/models'
import { makeConfig } from '../../fixtures'
import type { ModelInfo } from '@/services/models'

vi.mock('@/services/models', () => ({ fetchModels: vi.fn() }))

const PROVIDERS = ['openai', 'anthropic', 'mistral', 'ovh', 'lmstudio', 'ollama'] as const

// Remet à zéro le cache des modèles (pas de méthode de purge exportée)
function resetModelsCache() {
  for (const p of PROVIDERS) setCachedModels(p, undefined as unknown as ModelInfo[])
}

const user = userEvent.setup()

beforeEach(() => {
  vi.mocked(fetchModels).mockReset()
  resetModelsCache()
  updateConfig(makeConfig())
})

describe('ProviderSection provider selection', () => {
  it('shows the OpenAI default model dropdown', () => {
    render(<ProviderSection />)
    const modelSelect = screen.getByRole('combobox', { name: 'Modèle' }) as HTMLSelectElement
    expect(modelSelect.value).toBe('gpt-6-luna')
    expect(screen.getByRole('option', { name: /gpt-5\.4-nano/ })).toBeInTheDocument()
    expect(screen.getByLabelText('URL de base')).toBeDisabled()
  })

  it('selects another OpenAI model', async () => {
    render(<ProviderSection />)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Modèle' }), 'gpt-5.4-nano')
    expect(getConfig().llm.model).toBe('gpt-5.4-nano')
  })

  it('switches to LM Studio with its default format and base URL', async () => {
    render(<ProviderSection />)
    await user.selectOptions(screen.getByLabelText('Provider'), 'lmstudio')
    const cfg = getConfig().llm
    expect(cfg.provider).toBe('lmstudio')
    expect(cfg.apiFormat).toBe('lmstudio_chat')
    expect(cfg.model).toBe('')
    expect(cfg.baseUrl).toBe('http://localhost:1234')

    const modelInput = screen.getByRole('textbox', { name: 'Modèle' })
    await user.type(modelInput, 'llama')
    expect(getConfig().llm.model).toBe('llama')
  })

  it('lets the user change the API format for LM Studio', async () => {
    updateConfig(makeConfig({}, { provider: 'lmstudio', apiFormat: 'lmstudio_chat', model: 'x' }))
    render(<ProviderSection />)
    await user.click(screen.getByRole('radio', { name: /API Responses/ }))
    expect(getConfig().llm.apiFormat).toBe('responses')
  })

  it('keeps a compatible format when switching to OpenAI from OVH', async () => {
    updateConfig(
      makeConfig({}, { provider: 'ovh', apiFormat: 'chat_completions', model: 'gpt-oss-20b' }),
    )
    render(<ProviderSection />)
    await user.selectOptions(screen.getByLabelText('Provider'), 'openai')
    expect(getConfig().llm.apiFormat).toBe('chat_completions')
  })

  it('falls back to the Responses format when switching from Ollama to OVH', async () => {
    updateConfig(makeConfig({}, { provider: 'ollama', apiFormat: 'ollama_chat', model: 'llama3' }))
    render(<ProviderSection />)
    await user.selectOptions(screen.getByLabelText('Provider'), 'ovh')
    const cfg = getConfig().llm
    expect(cfg.apiFormat).toBe('responses')
    expect(cfg.model).toBe('gpt-oss-20b')
  })

  it('edits the base URL and API key of a local provider', async () => {
    updateConfig(
      makeConfig(
        {},
        {
          provider: 'ollama',
          apiFormat: 'ollama_chat',
          model: 'llama3',
          baseUrl: 'http://localhost:11434',
        },
      ),
    )
    render(<ProviderSection />)
    const baseUrl = screen.getByLabelText('URL de base')
    expect(baseUrl).not.toBeDisabled()
    await user.clear(baseUrl)
    await user.type(baseUrl, 'http://autre:11434')
    expect(getConfig().llm.baseUrl).toBe('http://autre:11434')

    await user.type(screen.getByLabelText(/Clé API/), 'k')
    expect(getConfig().llm.apiKeys.ollama).toBe('k')
  })

  it('selects the Ollama and OpenAI-compatible formats', async () => {
    updateConfig(makeConfig({}, { provider: 'ollama', apiFormat: 'ollama_chat', model: 'llama3' }))
    setCachedModels('ollama', [{ id: 'llama3' } as ModelInfo])
    render(<ProviderSection />)
    expect(screen.getByRole('option', { name: 'llama3' })).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: /OpenAI compatible/ }))
    expect(getConfig().llm.apiFormat).toBe('chat_completions')
  })
})

describe('ProviderSection Mistral', () => {
  it('applies Mistral defaults, fallback models and both formats', async () => {
    render(<ProviderSection />)
    await user.selectOptions(screen.getByLabelText('Provider'), 'mistral')
    const cfg = getConfig().llm
    expect(cfg.apiFormat).toBe('chat_completions')
    expect(cfg.model).toBe('ministral-3b-latest')
    expect(cfg.baseUrl).toBe('https://api.mistral.ai/v1')
    expect(screen.getByLabelText('URL de base')).toBeEnabled()
    expect(screen.getByRole('option', { name: /mistral-large-latest/ })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /API Chat Completions/ })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await user.click(screen.getByRole('radio', { name: /API Responses/ }))
    expect(getConfig().llm.apiFormat).toBe('responses')
  })

  it('resets the format to chat_completions when switching from Ollama', async () => {
    updateConfig(makeConfig({}, { provider: 'ollama', apiFormat: 'ollama_chat', model: 'llama3' }))
    render(<ProviderSection />)
    await user.selectOptions(screen.getByLabelText('Provider'), 'mistral')
    expect(getConfig().llm.apiFormat).toBe('chat_completions')
  })

  it('enriches loaded models with static pricing', async () => {
    updateConfig(
      makeConfig(
        {},
        {
          provider: 'mistral',
          apiFormat: 'chat_completions',
          model: 'mistral-small-latest',
          baseUrl: 'https://api.mistral.ai/v1',
        },
      ),
    )
    vi.mocked(fetchModels).mockResolvedValue([{ id: 'mistral-large-latest' } as ModelInfo])
    render(<ProviderSection />)
    await user.click(screen.getByRole('button', { name: /Charger/ }))
    expect(
      await screen.findByRole('option', {
        name: /mistral-large-latest — 1000k ctx, \$0\.70\/\$2\.10/,
      }),
    ).toBeInTheDocument()
    expect(fetchModels).toHaveBeenCalledWith('mistral', 'https://api.mistral.ai/v1', '')
  })
})

describe('ProviderSection model loading', () => {
  it('loads OpenAI models from the API and keeps only chat models', async () => {
    vi.mocked(fetchModels).mockResolvedValue([
      { id: 'gpt-5.4-nano' } as ModelInfo,
      { id: 'text-embedding-3' } as ModelInfo,
      { id: 'gpt-4o-audio-preview' } as ModelInfo,
    ])
    render(<ProviderSection />)
    await user.click(screen.getByRole('button', { name: /Charger/ }))
    expect(await screen.findByRole('button', { name: /Actualiser/ })).toBeInTheDocument()
    expect(fetchModels).toHaveBeenCalledWith('openai', expect.any(String), '')
    expect(screen.getByRole('option', { name: /gpt-5\.4-nano/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /text-embedding/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /audio/ })).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: /personnalisé/ })).toBeInTheDocument()
  })

  it('shows an error when loading models fails', async () => {
    vi.mocked(fetchModels).mockRejectedValue(new Error('Clé invalide'))
    render(<ProviderSection />)
    await user.click(screen.getByRole('button', { name: /Charger/ }))
    expect(await screen.findByText('Clé invalide')).toBeInTheDocument()
  })

  it('filters OVH models and labels them with context and pricing', () => {
    updateConfig(makeConfig({}, { provider: 'ovh', apiFormat: 'responses', model: 'gpt-oss-20b' }))
    setCachedModels('ovh', [
      {
        id: 'gpt-oss-20b',
        contextLength: 131072,
        pricingPrompt: 0.000001,
        pricingCompletion: 0.000002,
      } as ModelInfo,
      { id: 'tiny-chat', contextLength: 512, pricingPrompt: 0.0000005 } as ModelInfo,
      { id: 'bge-m3' } as ModelInfo,
      { id: 'whisper-large' } as ModelInfo,
      { id: 'llama', supportsToolUse: false } as ModelInfo,
    ])
    render(<ProviderSection />)
    expect(
      screen.getByRole('option', { name: /131k ctx, \$1\.00\/\$2\.00 \/Mtok/ }),
    ).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /512 ctx, \$0\.50\/Mtok/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /bge-m3/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /whisper/ })).not.toBeInTheDocument()
  })

  it('disables the responses format and warns for a model without tool use on OVH', async () => {
    updateConfig(makeConfig({}, { provider: 'ovh', apiFormat: 'responses', model: 'gpt-oss-20b' }))
    setCachedModels('ovh', [
      { id: 'gpt-oss-20b' } as ModelInfo,
      { id: 'llama', supportsToolUse: false } as ModelInfo,
    ])
    render(<ProviderSection />)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Modèle' }), 'llama')
    expect(getConfig().llm.apiFormat).toBe('chat_completions')
    expect(screen.getByRole('radio', { name: /API Responses/ })).toBeDisabled()
    expect(screen.getByText(/pas entraîné pour le tool calling/)).toBeInTheDocument()
  })

  it('shows the custom option when the current model is not in the list', () => {
    updateConfig(
      makeConfig({}, { provider: 'ovh', apiFormat: 'chat_completions', model: 'custom-x' }),
    )
    setCachedModels('ovh', [{ id: 'gpt-oss-20b' } as ModelInfo])
    render(<ProviderSection />)
    expect(screen.getByRole('option', { name: 'custom-x (personnalisé)' })).toBeInTheDocument()
  })
})
