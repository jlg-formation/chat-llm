import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderHook } from '@testing-library/react'
import { Chat } from '@/components/Chat'
import { updateConfig } from '@/store/configStore'
import { clearSkills, updateSkill } from '@/store/skillsStore'
import { resetUsage, useUsage } from '@/store/usageStore'
import { sendMessage } from '@/services/llm'
import { callMcpTool } from '@/services/mcp'
import { makeConfig } from '../fixtures'
import type { LLMResult } from '@/services/llm'

vi.mock('@/services/llm', () => ({ sendMessage: vi.fn() }))
vi.mock('@/services/mcp', () => ({ callMcpTool: vi.fn() }))
vi.mock('mermaid', () => ({
  default: { initialize: vi.fn(), parse: vi.fn(), render: vi.fn() },
}))

const mockSend = vi.mocked(sendMessage)
const mockCallTool = vi.mocked(callMcpTool)

function textResult(content: string, extra: Partial<LLMResult> = {}): LLMResult {
  return { type: 'text', content, ...extra } as LLMResult
}

async function sendText(text: string) {
  const user = userEvent.setup()
  await user.type(screen.getByRole('textbox', { name: 'Message' }), text)
  await user.click(screen.getByRole('button', { name: 'Envoyer' }))
}

beforeEach(async () => {
  vi.clearAllMocks()
  mockSend.mockResolvedValue(textResult('ok'))
  resetUsage()
  await clearSkills()
  updateConfig(makeConfig({ streamEnabled: true }))
})

describe('Chat basic conversation', () => {
  it('shows the empty state initially', () => {
    render(<Chat />)
    expect(screen.getByText('Commencez une conversation')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Nouvelle discussion/ })).not.toBeInTheDocument()
  })

  it('streams tokens into the assistant message', async () => {
    mockSend.mockImplementation(async (_c, _m, _s, _r, _t, onToken) => {
      onToken?.('Bon')
      onToken?.('jour')
      return textResult('Bonjour')
    })
    render(<Chat />)
    await sendText('Salut')
    expect(await screen.findByText('Bonjour')).toBeInTheDocument()
    expect(screen.getByText('Salut')).toBeInTheDocument()
    expect(mockSend).toHaveBeenCalledTimes(1)
  })

  it('shows the full text when streaming is disabled', async () => {
    updateConfig(makeConfig({ streamEnabled: false }))
    mockSend.mockResolvedValue(textResult('Reponse complete'))
    render(<Chat />)
    await sendText('Question')
    expect(await screen.findByText('Reponse complete')).toBeInTheDocument()
  })

  it('shows an error message when the request fails', async () => {
    mockSend.mockRejectedValue(new Error('boom'))
    render(<Chat />)
    await sendText('Question')
    expect(await screen.findByText('Erreur : boom')).toBeInTheDocument()
  })

  it('stops generation and keeps the message when aborted', async () => {
    mockSend.mockImplementation(
      (...args) =>
        new Promise((_resolve, reject) => {
          const signal = args[6] as AbortSignal
          signal.addEventListener('abort', () => {
            const err = new Error('aborted')
            err.name = 'AbortError'
            reject(err)
          })
        }),
    )
    const user = userEvent.setup()
    render(<Chat />)
    await sendText('Longue question')
    await user.click(await screen.findByRole('button', { name: 'Arrêter la génération' }))
    expect(await screen.findByRole('button', { name: 'Envoyer' })).toBeInTheDocument()
    expect(screen.queryByText(/Erreur/)).not.toBeInTheDocument()
  })

  it('resets the conversation with "Nouvelle discussion"', async () => {
    updateConfig(makeConfig({ streamEnabled: false }))
    const user = userEvent.setup()
    render(<Chat />)
    await sendText('Salut')
    await screen.findByText('ok')
    await user.click(screen.getByRole('button', { name: /Nouvelle discussion/ }))
    expect(screen.getByText('Commencez une conversation')).toBeInTheDocument()
  })

  it('passes the system prompt and usage to the stores', async () => {
    updateConfig(makeConfig({ streamEnabled: false, systemPrompt: 'Sois bref' }))
    mockSend.mockResolvedValue(textResult('ok', { usage: { promptTokens: 3, completionTokens: 4 } }))
    render(<Chat />)
    await sendText('Salut')
    await screen.findByText('ok')
    expect(mockSend.mock.calls[0][2]).toContain('Sois bref')
    const { result } = renderHook(() => useUsage())
    expect(result.current[0]).toEqual({ promptTokens: 3, completionTokens: 4 })
  })

  it('marks the message as JSON when a JSON schema is configured', async () => {
    updateConfig(makeConfig({ streamEnabled: false, jsonSchema: '{"type":"object"}' }))
    mockSend.mockResolvedValue(textResult('{"ok":true}'))
    const { container } = render(<Chat />)
    await sendText('Donne du JSON')
    await waitFor(() => expect(container.querySelector('pre')).not.toBeNull())
    expect(container.querySelector('pre')?.textContent).toContain('"ok": true')
  })

  it('passes the previous LM Studio response id and clears it on reset', async () => {
    updateConfig(makeConfig({ streamEnabled: false }, { provider: 'lmstudio', apiFormat: 'lmstudio_chat' }))
    mockSend.mockResolvedValue(textResult('A', { responseId: 'r1' }))
    const user = userEvent.setup()
    render(<Chat />)
    await sendText('premier')
    await screen.findByText('A')
    await sendText('second')
    await waitFor(() => expect(mockSend).toHaveBeenCalledTimes(2))
    expect(mockSend.mock.calls[1][7]).toBe('r1')

    await user.click(screen.getByRole('button', { name: /Nouvelle discussion/ }))
    await sendText('troisieme')
    await waitFor(() => expect(mockSend).toHaveBeenCalledTimes(3))
    expect(mockSend.mock.calls[2][7]).toBeUndefined()
  })
})

describe('Chat tool calls', () => {
  it('resolves MCP tool calls and sends the result back to the model', async () => {
    updateConfig(
      makeConfig({
        streamEnabled: false,
        mcpServers: [
          {
            id: 's1',
            name: 'srv',
            url: 'http://srv',
            enabled: true,
            tools: [{ name: 'calc', description: '', enabled: true }],
          },
        ],
      }),
    )
    mockSend
      .mockResolvedValueOnce({
        type: 'tool_calls',
        calls: [{ id: 'c1', name: 'calc', args: { x: 1 }, rawArgs: '{"x":1}' }],
      } as LLMResult)
      .mockResolvedValueOnce(textResult('Fini'))
    mockCallTool.mockResolvedValue('42')

    const user = userEvent.setup()
    render(<Chat />)
    await sendText('Calcule')
    expect(await screen.findByText('Fini')).toBeInTheDocument()
    expect(mockCallTool).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }), 'calc', { x: 1 })
    expect(screen.getByText('calc')).toBeInTheDocument()

    await user.click(screen.getByText('Résultat outil').closest('button')!)
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('loads skill details for get_skill_details and injects skills into the prompt', async () => {
    await updateSkill({
      id: 'k1',
      name: 'pdf',
      enabled: true,
      files: { 'pdf/SKILL.md': '---\nname: pdf\ndescription: Lire des PDF\n---\nInstructions pdf' },
    } as never)
    updateConfig(makeConfig({ streamEnabled: false }))
    mockSend
      .mockResolvedValueOnce({
        type: 'tool_calls',
        calls: [{ id: 'c1', name: 'get_skill_details', args: { name: 'pdf' }, rawArgs: '{"name":"pdf"}' }],
      } as LLMResult)
      .mockResolvedValueOnce(textResult('Termine'))

    render(<Chat />)
    await sendText('Lis un PDF')
    expect(await screen.findByText('Termine')).toBeInTheDocument()
    const [, , systemPrompt, skillRefs] = mockSend.mock.calls[0]
    expect(systemPrompt).toContain('Lire des PDF')
    expect(skillRefs).toEqual([expect.objectContaining({ name: 'pdf', description: 'Lire des PDF' })])
    // Le second appel reçoit le résultat du skill dans l'historique
    expect(mockSend.mock.calls[1][1]).toEqual(
      expect.arrayContaining([expect.objectContaining({ role: 'tool_result', content: expect.stringContaining('Instructions pdf') })]),
    )
  })

  it('reports an unknown skill to the model', async () => {
    updateConfig(makeConfig({ streamEnabled: false }))
    mockSend
      .mockResolvedValueOnce({
        type: 'tool_calls',
        calls: [{ id: 'c1', name: 'get_skill_details', args: { name: 'absent' }, rawArgs: '{}' }],
      } as LLMResult)
      .mockResolvedValueOnce(textResult('Fin'))
    render(<Chat />)
    await sendText('Question')
    await screen.findByText('Fin')
    expect(mockSend.mock.calls[1][1]).toEqual(
      expect.arrayContaining([expect.objectContaining({ content: 'Skill "absent" non trouvé.' })]),
    )
  })

  it('stops the tool loop after the maximum number of iterations', async () => {
    updateConfig(makeConfig({ streamEnabled: false }))
    mockSend.mockResolvedValue({
      type: 'tool_calls',
      calls: [{ id: 'c', name: 'get_skill_details', args: { name: 'x' }, rawArgs: '{}' }],
    } as LLMResult)
    render(<Chat />)
    await sendText('Boucle')
    await waitFor(() => expect(mockSend).toHaveBeenCalledTimes(101), { timeout: 20000 })
  }, 30000)
})
