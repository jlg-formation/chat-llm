import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import mermaid from 'mermaid'
import { ChatMessageView } from '@/components/chat/ChatMessage'
import { makeMessage } from '../../fixtures'

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    parse: vi.fn(),
    render: vi.fn(),
  },
}))

const SVG = '<svg width="10" height="10"><text>DIAG</text></svg>'

beforeEach(() => {
  vi.mocked(mermaid.parse).mockResolvedValue(true as never)
  vi.mocked(mermaid.render).mockResolvedValue({ svg: SVG } as never)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ChatMessageView text messages', () => {
  it('renders user messages as plain text', () => {
    render(<ChatMessageView message={makeMessage({ role: 'user', content: 'Ma question' })} />)
    expect(screen.getByText('Ma question')).toBeInTheDocument()
  })

  it('renders attached images for user messages', () => {
    render(
      <ChatMessageView
        message={makeMessage({
          role: 'user',
          content: 'Voir',
          images: [{ dataUrl: 'data:image/png;base64,AAA', mimeType: 'image/png' }],
        })}
      />,
    )
    expect(screen.getByAltText('image jointe')).toHaveAttribute('src', 'data:image/png;base64,AAA')
  })

  it('renders assistant markdown and opens links in a new tab', () => {
    render(
      <ChatMessageView
        message={makeMessage({ role: 'assistant', content: '**gras** [site](https://example.com)' })}
      />,
    )
    expect(screen.getByText('gras').tagName).toBe('STRONG')
    const link = screen.getByRole('link', { name: 'site' })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('renders inline code', () => {
    render(<ChatMessageView message={makeMessage({ role: 'assistant', content: 'Use `npm`' })} />)
    expect(screen.getByText('npm').tagName).toBe('CODE')
  })

  it('shows a loader while streaming without content', () => {
    const { container } = render(
      <ChatMessageView message={makeMessage({ role: 'assistant', isStreaming: true })} />,
    )
    expect(container.querySelector('.animate-bounce')).not.toBeNull()
  })

  it('shows a streaming cursor after partial content', () => {
    const { container } = render(
      <ChatMessageView message={makeMessage({ role: 'assistant', content: 'En cours', isStreaming: true })} />,
    )
    expect(screen.getByText('En cours')).toBeInTheDocument()
    expect(container.querySelector('.animate-pulse')).not.toBeNull()
  })

  it('does not render an empty bubble for a finished empty assistant message', () => {
    const { container } = render(<ChatMessageView message={makeMessage({ role: 'assistant' })} />)
    expect(container.querySelector('.animate-bounce')).toBeNull()
    expect(container.querySelector('.prose-chat')).toBeNull()
  })
})

describe('ChatMessageView XML blocks', () => {
  it('renders a closed XML block collapsed and expands it on click', async () => {
    const user = userEvent.setup()
    render(
      <ChatMessageView message={makeMessage({ role: 'assistant', content: '<think>reflexion</think>Reponse' })} />,
    )
    expect(screen.queryByText('reflexion')).not.toBeInTheDocument()
    await user.click(screen.getByText('<think>'))
    expect(screen.getByText('reflexion')).toBeInTheDocument()
    expect(screen.getByText('Reponse')).toBeInTheDocument()
  })

  it('shows a token estimate for an unclosed XML block', () => {
    render(
      <ChatMessageView message={makeMessage({ role: 'assistant', content: '<think>partial text', isStreaming: true })} />,
    )
    expect(screen.getByText('~3 tokens')).toBeInTheDocument()
  })

  it('expands an unclosed XML block to show its content', async () => {
    const user = userEvent.setup()
    render(
      <ChatMessageView message={makeMessage({ role: 'assistant', content: '<think>partial text', isStreaming: true })} />,
    )
    await user.click(screen.getByText('<think>'))
    expect(screen.getByText('partial text')).toBeInTheDocument()
  })
})

describe('ChatMessageView JSON responses', () => {
  it('pretty-prints valid JSON responses', () => {
    const { container } = render(
      <ChatMessageView message={makeMessage({ role: 'assistant', content: '{"ok":true}', isJson: true })} />,
    )
    expect(container.querySelector('pre')?.textContent).toContain('"ok": true')
  })

  it('falls back to raw text when the JSON is invalid', () => {
    render(<ChatMessageView message={makeMessage({ role: 'assistant', content: 'pas json', isJson: true })} />)
    expect(screen.getByText('pas json')).toBeInTheDocument()
  })
})

describe('ChatMessageView tool messages', () => {
  it('shows the tool name for a tool call and expands its pretty JSON arguments', async () => {
    const user = userEvent.setup()
    render(
      <ChatMessageView
        message={makeMessage({ role: 'tool_call', content: '{"a":1}', toolName: 'calc' })}
      />,
    )
    expect(screen.getByText('calc')).toBeInTheDocument()
    await user.click(screen.getByText('Appel outil :').closest('button')!)
    expect(screen.getByText(/"a": 1/)).toBeInTheDocument()
  })

  it('shows raw arguments when a tool call is not valid JSON', async () => {
    const user = userEvent.setup()
    render(
      <ChatMessageView message={makeMessage({ role: 'tool_call', content: 'brut', toolName: 'x' })} />,
    )
    await user.click(screen.getByText('Appel outil :').closest('button')!)
    expect(screen.getByText('brut')).toBeInTheDocument()
  })

  it('expands a tool result on click', async () => {
    const user = userEvent.setup()
    render(
      <ChatMessageView message={makeMessage({ role: 'tool_result', content: '42' })} />,
    )
    expect(screen.queryByText('42')).not.toBeInTheDocument()
    await user.click(screen.getByText('Résultat outil').closest('button')!)
    expect(screen.getByText('42')).toBeInTheDocument()
  })
})

describe('ChatMessageView mermaid', () => {
  const diagram = '```mermaid\ngraph TD\nA-->B\n```'

  it('renders a mermaid diagram and opens it in a modal', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <ChatMessageView message={makeMessage({ role: 'assistant', content: diagram })} />,
    )
    const trigger = await screen.findByTitle('Cliquer pour agrandir')
    expect(mermaid.render).toHaveBeenCalled()
    await user.click(trigger)
    expect(screen.getAllByText('DIAG')).toHaveLength(2)

    // Clic dans la modale : reste ouverte
    await user.click(screen.getAllByText('DIAG')[1])
    expect(screen.getAllByText('DIAG')).toHaveLength(2)

    // Clic sur le fond : fermeture
    fireEvent.click(container.ownerDocument.querySelector('.fixed')!)
    expect(screen.getAllByText('DIAG')).toHaveLength(1)
  })

  it('closes the modal with the Escape key', async () => {
    const user = userEvent.setup()
    render(<ChatMessageView message={makeMessage({ role: 'assistant', content: diagram })} />)
    await user.click(await screen.findByTitle('Cliquer pour agrandir'))
    expect(screen.getAllByText('DIAG')).toHaveLength(2)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getAllByText('DIAG')).toHaveLength(1)
  })

  it('falls back to the raw code when rendering fails', async () => {
    vi.mocked(mermaid.parse).mockRejectedValueOnce(new Error('syntax'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { container } = render(
      <ChatMessageView message={makeMessage({ role: 'assistant', content: diagram })} />,
    )
    await waitFor(() => expect(container.querySelector('pre')).not.toBeNull())
    expect(container.querySelector('pre')?.textContent).toContain('graph TD')
    expect(errorSpy).toHaveBeenCalled()
  })

  it('renders mermaid code as plain code while streaming', () => {
    render(<ChatMessageView message={makeMessage({ role: 'assistant', content: diagram, isStreaming: true })} />)
    expect(screen.queryByTitle('Cliquer pour agrandir')).not.toBeInTheDocument()
    expect(mermaid.parse).not.toHaveBeenCalled()
  })
})
