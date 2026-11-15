import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Accordion } from '@/components/sidebar/Accordion'
import { Toggle } from '@/components/sidebar/Toggle'
import { StreamSection } from '@/components/sidebar/StreamSection'
import { SamplingSection } from '@/components/sidebar/SamplingSection'
import { SystemPromptSection } from '@/components/sidebar/SystemPromptSection'
import { JsonSchemaSection } from '@/components/sidebar/JsonSchemaSection'
import { UsageSection } from '@/components/sidebar/UsageSection'
import { updateConfig, getConfig } from '@/store/configStore'
import { addUsage, resetUsage } from '@/store/usageStore'
import { setCachedModels } from '@/store/modelsStore'
import { makeConfig } from '../../fixtures'
import type { ModelInfo } from '@/services/models'

const user = userEvent.setup()

beforeEach(() => {
  updateConfig(makeConfig())
})

describe('Accordion', () => {
  it('toggles its region open and closed', async () => {
    render(
      <Accordion title="Section test">
        <p>Contenu</p>
      </Accordion>,
    )
    const button = screen.getByRole('button', { name: 'Section test' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Contenu')).not.toBeInTheDocument()
    await user.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('region', { name: 'Section test' })).toHaveTextContent('Contenu')
  })

  it('can start open and displays an icon', () => {
    render(
      <Accordion title="Ouvert" icon={<span>ICON</span>} defaultOpen>
        <p>Visible</p>
      </Accordion>,
    )
    expect(screen.getByText('ICON')).toBeInTheDocument()
    expect(screen.getByText('Visible')).toBeInTheDocument()
  })
})

describe('Toggle', () => {
  it('reflects its checked state and calls onChange', async () => {
    const onChange = vi.fn()
    render(<Toggle checked={false} onChange={onChange} />)
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement
    expect(checkbox.checked).toBe(false)
    await user.click(checkbox)
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('applies the requested color and size', () => {
    const { container } = render(<Toggle checked onChange={() => {}} color="yellow" size="sm" />)
    expect(container.innerHTML).toContain('peer-checked:bg-yellow-500')
    expect(container.innerHTML).toContain('w-7')
  })
})

describe('StreamSection', () => {
  it('toggles streaming mode', async () => {
    render(<StreamSection />)
    await user.click(screen.getByRole('button', { name: 'Mode Stream' }))
    expect(screen.getByText('Activé (SSE)')).toBeInTheDocument()
    await user.click(screen.getByRole('switch', { name: 'Mode stream' }))
    expect(getConfig().streamEnabled).toBe(false)
    expect(screen.getByText('Désactivé (HTTP classique)')).toBeInTheDocument()
  })
})

describe('SamplingSection', () => {
  it('enables and edits temperature, then disables it back to null', async () => {
    render(<SamplingSection />)
    await user.click(screen.getByRole('button', { name: 'Sampling' }))
    const toggle = screen.getByRole('switch', { name: 'Activer Temperature' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')

    await user.click(toggle)
    expect(getConfig().llm.temperature).toBe(1)

    const slider = screen.getByRole('slider', { name: 'Temperature' })
    fireEvent.change(slider, { target: { value: '0.5' } })
    expect(getConfig().llm.temperature).toBe(0.5)

    await user.click(screen.getByRole('switch', { name: 'Activer Temperature' }))
    expect(getConfig().llm.temperature).toBeNull()
  })

  it('enables top-p', async () => {
    render(<SamplingSection />)
    await user.click(screen.getByRole('button', { name: 'Sampling' }))
    await user.click(screen.getByRole('switch', { name: 'Activer Top-P (nucleus)' }))
    expect(getConfig().llm.topP).toBe(0.9)
  })

  it('edits max tokens and treats empty or zero as unlimited', async () => {
    render(<SamplingSection />)
    await user.click(screen.getByRole('button', { name: 'Sampling' }))
    const input = screen.getByRole('spinbutton')
    await user.type(input, '512')
    expect(getConfig().llm.maxTokens).toBe(512)
    await user.clear(input)
    expect(getConfig().llm.maxTokens).toBeNull()
    await user.type(input, '0')
    expect(getConfig().llm.maxTokens).toBeNull()
  })
})

describe('SystemPromptSection', () => {
  it('stores the system prompt', async () => {
    render(<SystemPromptSection />)
    await user.click(screen.getByRole('button', { name: 'Prompt Système' }))
    await user.type(screen.getByRole('textbox', { name: 'Prompt système' }), 'Sois bref')
    expect(getConfig().systemPrompt).toBe('Sois bref')
  })
})

describe('JsonSchemaSection', () => {
  it('reports an invalid JSON schema', async () => {
    render(<JsonSchemaSection />)
    await user.click(screen.getByRole('button', { name: 'Structured Output' }))
    const textarea = screen.getByRole('textbox', { name: 'Schéma JSON' })
    await user.click(textarea)
    await user.paste('{ pas valide')
    expect(screen.getByText('JSON invalide')).toBeInTheDocument()
    expect(textarea).toHaveAttribute('aria-invalid', 'true')
  })

  it('accepts a valid JSON schema', async () => {
    render(<JsonSchemaSection />)
    await user.click(screen.getByRole('button', { name: 'Structured Output' }))
    const textarea = screen.getByRole('textbox', { name: 'Schéma JSON' })
    await user.click(textarea)
    await user.paste('{"type":"object"}')
    expect(screen.queryByText('JSON invalide')).not.toBeInTheDocument()
    expect(textarea).toHaveAttribute('aria-invalid', 'false')
  })
})

describe('UsageSection', () => {
  beforeEach(() => {
    resetUsage()
    for (const p of ['openai', 'ovh', 'lmstudio', 'ollama'] as const) {
      setCachedModels(p, undefined as unknown as ModelInfo[])
    }
  })

  it('renders nothing when no tokens were used', () => {
    const { container } = render(<UsageSection />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows token counts with k suffixes', () => {
    addUsage({ promptTokens: 1500, completionTokens: 500 })
    render(<UsageSection />)
    expect(screen.getByText('2.0k')).toBeInTheDocument()
    expect(screen.getByText('1.5k')).toBeInTheDocument()
    expect(screen.getByText('500')).toBeInTheDocument()
  })

  it('shows M suffix for millions of tokens', () => {
    addUsage({ promptTokens: 2_000_000, completionTokens: 0 })
    render(<UsageSection />)
    expect(screen.getAllByText('2.0M').length).toBeGreaterThan(0)
  })

  it('estimates the cost from loaded model pricing without context window', async () => {
    updateConfig(makeConfig({}, { provider: 'openai', model: 'gpt-x' }))
    setCachedModels('openai', [
      {
        id: 'gpt-x',
        pricingPrompt: 0.000001,
        pricingCompletion: 0.000002,
        contextLength: 128000,
      } as ModelInfo,
    ])
    addUsage({ promptTokens: 1500, completionTokens: 500 })
    render(<UsageSection />)
    expect(screen.getByText('$0.002500')).toBeInTheDocument()
    expect(screen.getByText('Input · $0.001500')).toBeInTheDocument()
    expect(screen.getByText('Output · $0.001000')).toBeInTheDocument()
    expect(screen.queryByText(/Fenêtre de contexte/)).not.toBeInTheDocument()
  })

  it('draws a donut that handles zero prompt or completion tokens', async () => {
    addUsage({ promptTokens: 0, completionTokens: 10 })
    const { container } = render(<UsageSection />)
    expect(container.querySelector('circle[fill="#86efac"]')).not.toBeNull()
  })

  it('draws the donut for zero completion tokens', async () => {
    addUsage({ promptTokens: 10, completionTokens: 0 })
    const { container } = render(<UsageSection />)
    expect(container.querySelector('circle[fill="#93c5fd"]')).not.toBeNull()
  })

  it('resets the counter', async () => {
    addUsage({ promptTokens: 10, completionTokens: 10 })
    const { container } = render(<UsageSection />)
    await user.click(screen.getByRole('button', { name: 'Réinitialiser le compteur' }))
    expect(container).toBeEmptyDOMElement()
  })
})
