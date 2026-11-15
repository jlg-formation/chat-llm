import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { LeftSidebar } from '@/components/LeftSidebar'
import { updateConfig, getConfig } from '@/store/configStore'
import { disconnectMcp } from '@/services/mcp'
import { makeConfig } from '../fixtures'

vi.mock('@/services/mcp', () => ({
  connectMcp: vi.fn(),
  disconnectMcp: vi.fn(),
  fetchMcpTools: vi.fn(),
  callMcpTool: vi.fn(),
}))

beforeEach(() => {
  vi.mocked(disconnectMcp).mockResolvedValue(undefined)
  updateConfig(makeConfig())
})

describe('LeftSidebar', () => {
  it('lists every configuration section', () => {
    render(<LeftSidebar />)
    expect(screen.getByText('Configuration')).toBeInTheDocument()
    for (const title of [
      'Provider LLM',
      'Mode Stream',
      'Sampling',
      'Prompt Système',
      'Structured Output',
      'Skills',
      'Serveurs MCP',
    ]) {
      expect(screen.getByRole('button', { name: title })).toBeInTheDocument()
    }
  })

  it('requires a second click to confirm the reset and resets the configuration', async () => {
    updateConfig(
      makeConfig({
        mcpServers: [{ id: 's1', name: 'n', url: 'http://x', enabled: true, tools: [] }],
      }),
    )
    render(<LeftSidebar />)
    const resetButton = screen.getByRole('button', { name: 'Réinitialiser toute la configuration' })
    fireEvent.click(resetButton)
    expect(screen.getByText('Confirmer ?')).toBeInTheDocument()
    expect(getConfig().mcpServers).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser toute la configuration' }))
    await waitFor(() => expect(getConfig().mcpServers).toEqual([]))
    expect(disconnectMcp).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }))
    expect(screen.getByText('Reset')).toBeInTheDocument()
  })

  it('cancels the confirmation after three seconds', () => {
    vi.useFakeTimers()
    try {
      render(<LeftSidebar />)
      fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser toute la configuration' }))
      expect(screen.getByText('Confirmer ?')).toBeInTheDocument()
      act(() => {
        vi.advanceTimersByTime(3000)
      })
      expect(screen.getByText('Reset')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})
