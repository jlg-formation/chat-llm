import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProviderSection } from '@/components/sidebar/ProviderSection'
import { SamplingSection } from '@/components/sidebar/SamplingSection'
import { ThinkingSection } from '@/components/sidebar/ThinkingSection'
import { UsageSection } from '@/components/sidebar/UsageSection'
import { ThinkingBlock } from '@/components/chat/ThinkingBlock'
import { ChatMessageView } from '@/components/chat/ChatMessage'
import { buildToolMessages } from '@/components/chat/toolMessages'
import { updateConfig, getConfig } from '@/store/configStore'
import { setCachedModels } from '@/store/modelsStore'
import { addUsage, resetUsage } from '@/store/usageStore'
import { fetchModels } from '@/services/models'
import { makeConfig, makeMessage } from '../../fixtures'
import type { ModelInfo } from '@/services/models'

vi.mock('@/services/models', () => ({ fetchModels: vi.fn() }))

const user = userEvent.setup()

const anthropic = (llm = {}) =>
  makeConfig(
    {},
    {
      provider: 'anthropic',
      apiFormat: 'anthropic_messages',
      model: 'claude-haiku-5-5',
      baseUrl: 'https://api.anthropic.com',
      ...llm,
    },
  )

beforeEach(() => {
  vi.mocked(fetchModels).mockReset()
  setCachedModels('anthropic', undefined as unknown as ModelInfo[])
  resetUsage()
  updateConfig(makeConfig())
})

describe('ProviderSection with Anthropic', () => {
  it('switches to Anthropic with the native format, Haiku and the static model list', async () => {
    render(<ProviderSection />)
    await user.selectOptions(screen.getByLabelText('Provider'), 'anthropic')
    const cfg = getConfig().llm
    expect(cfg).toMatchObject({
      provider: 'anthropic',
      apiFormat: 'anthropic_messages',
      model: 'claude-haiku-5-5',
      baseUrl: 'https://api.anthropic.com',
    })
    for (const id of [
      'claude-haiku-5-5',
      'claude-sonnet-5-5',
      'claude-opus-5-5',
      'claude-fable-5-2',
    ])
      expect(screen.getByRole('option', { name: new RegExp(id) })).toBeInTheDocument()
    expect(screen.getByLabelText('URL de base')).toBeEnabled()
    expect(screen.getByLabelText(/Clé API/)).toHaveAttribute('placeholder', 'sk-ant-...')
  })

  it('offers native and OpenAI-compatible formats', async () => {
    updateConfig(anthropic())
    render(<ProviderSection />)
    expect(screen.getByRole('radio', { name: /API Messages/ })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await user.click(screen.getByRole('radio', { name: /OpenAI compatible/ }))
    expect(getConfig().llm.apiFormat).toBe('chat_completions')
  })

  it('falls back to the responses format when leaving Anthropic for OpenAI', async () => {
    updateConfig(anthropic())
    render(<ProviderSection />)
    await user.selectOptions(screen.getByLabelText('Provider'), 'openai')
    expect(getConfig().llm.apiFormat).toBe('responses')
  })

  it('loads dynamic models and enriches them with static pricing', async () => {
    updateConfig(anthropic())
    vi.mocked(fetchModels).mockResolvedValueOnce([{ id: 'claude-sonnet-5-5' }, { id: 'claude-x' }])
    render(<ProviderSection />)
    await user.click(screen.getByRole('button', { name: /Charger/ }))
    expect(
      await screen.findByRole('option', {
        name: /claude-sonnet-5-5.*\$2\.00\/\$10\.00/,
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'claude-x' })).toBeInTheDocument()
  })
})

describe('SamplingSection with Anthropic', () => {
  it('disables temperature and top-p and documents the max_tokens default', async () => {
    updateConfig(anthropic())
    render(<SamplingSection />)
    await user.click(screen.getByRole('button', { name: 'Sampling' }))
    expect(screen.getByRole('switch', { name: 'Activer Temperature' })).toBeDisabled()
    expect(screen.getByRole('switch', { name: 'Activer Top-P (nucleus)' })).toBeDisabled()
    expect(screen.getByText(/vide = 4096/)).toBeInTheDocument()
  })

  it('toggles the thinking display', async () => {
    updateConfig(anthropic())
    render(<ThinkingSection />)
    await user.click(screen.getByRole('button', { name: 'Thinking' }))
    const toggle = screen.getByRole('switch', {
      name: 'Afficher la réflexion',
    })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    await user.click(toggle)
    expect(getConfig().llm.showThinking).toBe(true)
    expect(toggle).toHaveAttribute('aria-checked', 'true')
  })

  it('disables the thinking toggle in OpenAI-compatible mode', async () => {
    updateConfig(anthropic({ apiFormat: 'chat_completions', showThinking: true }))
    render(<ThinkingSection />)
    await user.click(screen.getByRole('button', { name: 'Thinking' }))
    const toggle = screen.getByRole('switch', {
      name: 'Afficher la réflexion',
    })
    expect(toggle).toBeDisabled()
    expect(toggle).toHaveAttribute('aria-checked', 'false')
  })

  it('hides the thinking toggle for other providers', async () => {
    render(<ThinkingSection />)
    await user.click(screen.getByRole('button', { name: 'Thinking' }))
    expect(screen.queryByRole('switch', { name: 'Afficher la réflexion' })).not.toBeInTheDocument()
  })
})

describe('UsageSection with Anthropic', () => {
  it('estimates the cost without showing the pricing tier', async () => {
    updateConfig(anthropic())
    addUsage({ promptTokens: 1_000_000, completionTokens: 1_000_000 })
    render(<UsageSection />)
    expect(screen.getByText('$0.600000')).toBeInTheDocument()
    expect(screen.queryByText(/Palier/)).not.toBeInTheDocument()
  })

  it('shows no cost for a model absent from the pricing file', () => {
    updateConfig(anthropic({ model: 'claude-inconnu' }))
    addUsage({ promptTokens: 10, completionTokens: 10 })
    render(<UsageSection />)
    expect(screen.queryByText('Coût total estimé')).not.toBeInTheDocument()
  })
})

describe('thinking display', () => {
  it('ThinkingBlock is open while streaming and collapsible', async () => {
    render(<ThinkingBlock content="je réfléchis" isStreaming />)
    expect(screen.getByText('je réfléchis')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Réflexion/ }))
    expect(screen.queryByText('je réfléchis')).not.toBeInTheDocument()
  })

  it('ThinkingBlock is collapsed by default once finished', async () => {
    render(<ThinkingBlock content="fini" />)
    expect(screen.queryByText('fini')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Réflexion/ }))
    expect(screen.getByText('fini')).toBeInTheDocument()
  })

  it('renders the thinking block above the answer and no spinner while thinking', () => {
    const { rerender } = render(
      <ChatMessageView
        message={makeMessage({
          role: 'assistant',
          content: 'Réponse',
          thinking: 'pensée',
        })}
      />,
    )
    expect(screen.getByRole('button', { name: /Réflexion/ })).toBeInTheDocument()
    expect(screen.getByText('Réponse')).toBeInTheDocument()

    rerender(
      <ChatMessageView
        message={makeMessage({
          role: 'assistant',
          content: '',
          thinking: 'pensée',
          isStreaming: true,
        })}
      />,
    )
    expect(screen.getByText('pensée')).toBeInTheDocument()
  })
})

describe('buildToolMessages', () => {
  it('shares a turn id and attaches thinking blocks to the first call only', () => {
    const blocks = [{ type: 'thinking', thinking: 'x', signature: 's' }]
    const msgs = buildToolMessages(
      [
        {
          call: { id: 'a', name: 'n1', args: {}, rawArgs: '{}' },
          content: 'r1',
        },
        {
          call: { id: 'b', name: 'n2', args: {}, rawArgs: '{}' },
          content: 'r2',
        },
      ],
      blocks,
    )
    expect(msgs.map((m) => m.role)).toEqual([
      'tool_call',
      'tool_result',
      'tool_call',
      'tool_result',
    ])
    expect(new Set(msgs.map((m) => m.toolTurnId)).size).toBe(1)
    expect(msgs[0].thinkingBlocks).toBe(blocks)
    expect(msgs[2].thinkingBlocks).toBeUndefined()
    expect(msgs[3].toolCallResultId).toBe('b')
  })
})
