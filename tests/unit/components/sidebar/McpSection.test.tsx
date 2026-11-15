import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { McpSection } from '@/components/sidebar/McpSection'
import { updateConfig, getConfig } from '@/store/configStore'
import { connectMcp, disconnectMcp, fetchMcpTools } from '@/services/mcp'
import { makeConfig } from '../../fixtures'
import type { McpServer } from '@/types'

vi.mock('@/services/mcp', () => ({
  connectMcp: vi.fn(),
  disconnectMcp: vi.fn(),
  fetchMcpTools: vi.fn(),
  callMcpTool: vi.fn(),
}))

const user = userEvent.setup()

function seed(servers: Partial<McpServer>[]) {
  updateConfig(
    makeConfig({
      mcpServers: servers.map((s, i) => ({
        id: `s${i + 1}`,
        name: 'srv',
        url: 'http://mcp.test',
        enabled: false,
        tools: [],
        ...s,
      })),
    }),
  )
}

// L'accordéon « Serveurs MCP » est fermé par défaut
async function renderOpen() {
  render(<McpSection />)
  await user.click(screen.getByRole('button', { name: 'Serveurs MCP' }))
}

beforeEach(() => {
  vi.mocked(connectMcp).mockReset().mockResolvedValue(undefined)
  vi.mocked(disconnectMcp).mockReset().mockResolvedValue(undefined)
  vi.mocked(fetchMcpTools).mockReset().mockResolvedValue([])
  updateConfig(makeConfig())
})

describe('McpSection server list', () => {
  it('shows an empty state without servers', async () => {
    await renderOpen()
    expect(screen.getByText('Aucun serveur MCP configuré')).toBeInTheDocument()
  })

  it('adds a server and edits its alias, URL and token', async () => {
    await renderOpen()
    await user.click(screen.getByRole('button', { name: /Ajouter un serveur/ }))
    expect(getConfig().mcpServers).toHaveLength(1)
    expect(screen.getByText('Sans nom')).toBeInTheDocument()

    await user.type(screen.getByPlaceholderText('Mon serveur MCP'), 'demo')
    await user.type(screen.getByPlaceholderText('http://localhost:8000'), 'http://mcp.test')
    await user.type(screen.getByPlaceholderText('Optionnel'), 'tok')
    const server = getConfig().mcpServers[0]
    expect(server.name).toBe('demo')
    expect(server.url).toBe('http://mcp.test')
    expect(server.token).toBe('tok')
  })

  it('enables a server without URL without connecting', async () => {
    seed([{ url: '' }])
    await renderOpen()
    await user.click(screen.getByRole('checkbox'))
    expect(getConfig().mcpServers[0].enabled).toBe(true)
    expect(connectMcp).not.toHaveBeenCalled()
  })

  it('connects and loads tools when enabling a server with a URL', async () => {
    seed([{}])
    vi.mocked(fetchMcpTools).mockResolvedValue([
      { name: 'calc', description: 'Calcule', enabled: true },
      { name: 'rm', description: '', enabled: false },
    ] as never)
    await renderOpen()
    await user.click(screen.getByRole('checkbox'))
    await waitFor(() => expect(getConfig().mcpServers[0].enabled).toBe(true))
    expect(connectMcp).toHaveBeenCalled()
    expect(screen.getByText('1/2')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Développer' }))
    expect(screen.getByText('Calcule')).toBeInTheDocument()
  })

  it('disconnects and clears tools when disabling a server', async () => {
    seed([{ enabled: true, tools: [{ name: 'calc', description: '', enabled: true }] }])
    await renderOpen()
    await user.click(screen.getByRole('checkbox'))
    await waitFor(() => expect(getConfig().mcpServers[0].enabled).toBe(false))
    expect(disconnectMcp).toHaveBeenCalled()
    expect(getConfig().mcpServers[0].tools).toEqual([])
  })

  it('shows an error when the connection fails', async () => {
    seed([{}])
    vi.mocked(connectMcp).mockRejectedValue(new Error('refus'))
    await renderOpen()
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Développer' }))
    expect(await screen.findByText('Erreur : refus')).toBeInTheDocument()
    expect(getConfig().mcpServers[0].enabled).toBe(false)
  })

  it('toggles an individual tool', async () => {
    seed([{ enabled: true, tools: [{ name: 'calc', description: '', enabled: true }] }])
    await renderOpen()
    await user.click(screen.getByRole('button', { name: 'Développer' }))
    const toolToggle = screen.getAllByRole('checkbox')[1]
    await user.click(toolToggle)
    expect(getConfig().mcpServers[0].tools[0].enabled).toBe(false)
    expect(screen.getByText('0/1')).toBeInTheDocument()
  })

  it('expands and collapses a server card', async () => {
    seed([{ name: 'alpha' }])
    await renderOpen()
    expect(screen.queryByDisplayValue('alpha')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Développer' }))
    expect(screen.getByDisplayValue('alpha')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Réduire' }))
    expect(screen.queryByDisplayValue('alpha')).not.toBeInTheDocument()
    await user.click(screen.getByText('alpha'))
    expect(screen.getByDisplayValue('alpha')).toBeInTheDocument()
  })
})

describe('McpSection tool refresh and removal', () => {
  it('reloads tools from the server', async () => {
    seed([{}])
    vi.mocked(fetchMcpTools).mockResolvedValue([
      { name: 'x', description: '', enabled: true },
    ] as never)
    await renderOpen()
    await user.click(screen.getByRole('button', { name: 'Développer' }))
    await user.click(screen.getByRole('button', { name: 'Recharger les outils' }))
    expect(await screen.findByText('x')).toBeInTheDocument()
    expect(fetchMcpTools).toHaveBeenCalled()
  })

  it('shows an error when reloading tools fails', async () => {
    seed([{}])
    vi.mocked(fetchMcpTools).mockRejectedValue(new Error('fail'))
    await renderOpen()
    await user.click(screen.getByRole('button', { name: 'Développer' }))
    await user.click(screen.getByRole('button', { name: 'Recharger les outils' }))
    expect(await screen.findByText('Erreur : fail')).toBeInTheDocument()
  })

  it('disables the reload button when there is no URL', async () => {
    seed([{ url: '' }])
    await renderOpen()
    await user.click(screen.getByRole('button', { name: 'Développer' }))
    expect(screen.getByRole('button', { name: 'Recharger les outils' })).toBeDisabled()
  })

  it('removes a connected server and disconnects it first', async () => {
    seed([{ enabled: true }])
    await renderOpen()
    await user.click(screen.getByRole('button', { name: 'Supprimer ce serveur' }))
    await waitFor(() => expect(getConfig().mcpServers).toEqual([]))
    expect(disconnectMcp).toHaveBeenCalled()
  })

  it('removes a disabled server without disconnecting', async () => {
    seed([{ enabled: false }])
    await renderOpen()
    await user.click(screen.getByRole('button', { name: 'Supprimer ce serveur' }))
    await waitFor(() => expect(getConfig().mcpServers).toEqual([]))
    expect(disconnectMcp).not.toHaveBeenCalled()
  })
})
