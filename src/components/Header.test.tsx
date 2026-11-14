import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Header } from './Header'
import { updateConfig, getConfig } from '../store/configStore'
import { makeConfig } from '../test/fixtures'

beforeEach(() => {
  updateConfig(makeConfig())
})

describe('Header', () => {
  it('shows the provider label, the model and the stream state', () => {
    updateConfig(makeConfig({ streamEnabled: true }, { provider: 'openai', model: 'gpt-5.4-nano' }))
    render(<Header />)
    expect(screen.getByText('OpenAI')).toBeInTheDocument()
    expect(screen.getByText(/gpt-5\.4-nano/)).toBeInTheDocument()
    expect(getConfig().streamEnabled).toBe(true)
  })

  it('omits the model when none is selected', () => {
    updateConfig(makeConfig({}, { provider: 'ollama', model: '' }))
    render(<Header />)
    expect(screen.getByText('Ollama')).toBeInTheDocument()
    expect(screen.queryByText('/')).not.toBeInTheDocument()
  })

  it('links to the GitHub repository', () => {
    render(<Header />)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })
})
