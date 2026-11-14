import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RightSidebar } from '@/components/RightSidebar'
import { addExchange, clearExchanges } from '@/store/httpStore'
import type { HttpExchange } from '@/types'

const llmExchange = {
  id: 'llm-1',
  type: 'llm',
  method: 'POST',
  url: 'https://api.test/v1',
  timestamp: Date.now(),
  requestHeaders: { 'Content-Type': 'application/json' },
  requestBody: { model: 'm' },
  responseStatus: 200,
  responseHeaders: { 'x-h': '1' },
  responseBody: { ok: true },
} as unknown as HttpExchange

const mcpExchange = {
  id: 'mcp-1',
  type: 'mcp',
  method: 'POST',
  url: 'http://mcp.test',
  timestamp: Date.now(),
  requestHeaders: {},
  requestBody: null,
  responseStatus: 500,
  error: 'boom',
} as unknown as HttpExchange

beforeEach(() => {
  clearExchanges()
})

describe('RightSidebar exchanges', () => {
  it('shows an empty state without exchanges', () => {
    render(<RightSidebar />)
    expect(screen.getByText('Les échanges HTTP apparaîtront ici')).toBeInTheDocument()
  })

  it('renders LLM and MCP exchanges with their status and error', () => {
    addExchange(llmExchange)
    addExchange(mcpExchange)
    render(<RightSidebar />)
    expect(screen.getByRole('button', { name: 'LLM POST https://api.test/v1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'MCP POST http://mcp.test' })).toBeInTheDocument()
    expect(screen.getByText('200')).toBeInTheDocument()
    expect(screen.getByText('500')).toBeInTheDocument()
    expect(screen.getByText('Erreur : boom')).toBeInTheDocument()
    expect(screen.getByText('Content-Type: application/json')).toBeInTheDocument()
  })

  it('collapses and expands an exchange card', () => {
    addExchange(llmExchange)
    addExchange(mcpExchange)
    render(<RightSidebar />)
    expect(screen.getAllByText('REQUÊTE')).toHaveLength(2)
    const llmButton = screen.getByRole('button', { name: 'LLM POST https://api.test/v1' })
    fireEvent.click(llmButton)
    expect(llmButton).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getAllByText('REQUÊTE')).toHaveLength(1)
    fireEvent.click(llmButton)
    expect(screen.getAllByText('REQUÊTE')).toHaveLength(2)
  })

  it('clears the inspector', () => {
    addExchange(llmExchange)
    render(<RightSidebar />)
    fireEvent.click(screen.getByRole('button', { name: "Vider l'inspecteur" }))
    expect(screen.getByText('Les échanges HTTP apparaîtront ici')).toBeInTheDocument()
  })

  it('scrolls to the newest exchange', () => {
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView')
    addExchange(llmExchange)
    render(<RightSidebar />)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('RightSidebar layout', () => {
  it('collapses to a narrow strip and expands back', () => {
    render(<RightSidebar />)
    fireEvent.click(screen.getByRole('button', { name: "Masquer l'inspecteur HTTP" }))
    expect(screen.queryByRole('complementary', { name: 'Inspecteur HTTP' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: "Afficher l'inspecteur HTTP" }))
    expect(screen.getByRole('complementary', { name: 'Inspecteur HTTP' })).toBeInTheDocument()
  })

  it('resizes by dragging the handle within the 200 to 800 px bounds', () => {
    const { container } = render(<RightSidebar />)
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.style.width).toBe('320px')
    const handle = screen.getByTitle('Redimensionner')

    fireEvent.mouseDown(handle, { clientX: 500 })
    fireEvent.mouseMove(window, { clientX: 400 })
    expect(wrapper.style.width).toBe('420px')
    expect(document.body.style.cursor).toBe('col-resize')

    fireEvent.mouseMove(window, { clientX: 0 })
    expect(wrapper.style.width).toBe('800px')

    fireEvent.mouseUp(window)
    expect(document.body.style.cursor).toBe('')
    fireEvent.mouseMove(window, { clientX: 2000 })
    expect(wrapper.style.width).toBe('800px')

    fireEvent.mouseDown(handle, { clientX: 0 })
    fireEvent.mouseMove(window, { clientX: 1000 })
    expect(wrapper.style.width).toBe('200px')
    fireEvent.mouseUp(window)
  })
})
