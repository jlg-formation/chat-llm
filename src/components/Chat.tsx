import { useRef, useEffect, useState } from 'react'
import type { ChatMessage as ChatMessageType, MessageImage } from '../types'
import { ChatMessageView } from './chat/ChatMessage'
import { ChatInput } from './chat/ChatInput'
import { useConfig } from '../store/configStore'
import { loadSkills, getSkillContent, parseSkillFrontmatter } from '../store/skillsStore'
import { sendMessage } from '../services/llm'
import { callMcpTool } from '../services/mcp'
import type { SkillRef, LLMToolCall } from '../services/llm'
import { SquarePen } from 'lucide-react'
import { addUsage, resetUsage } from '../store/usageStore'

const MAX_TOOL_ITERATIONS = 5

function genId() {
  return Math.random().toString(36).slice(2)
}

export function Chat() {
  const [config] = useConfig()
  const [messages, setMessages] = useState<ChatMessageType[]>([])
  const [sending, setSending] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const lmStudioResponseIdRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function buildSystemAndSkills(): Promise<{ systemPrompt: string; skillRefs: SkillRef[] }> {
    const skills = await loadSkills()
    const active = skills.filter(s => s.enabled)
    let systemPrompt = config.systemPrompt ?? ''

    if (active.length === 0) {
      return { systemPrompt, skillRefs: [] }
    }

    const skillRefs: SkillRef[] = active.map(s => parseSkillFrontmatter(s))

    const skillList = skillRefs
      .map(r => `- **${r.name}**${r.description ? ` : ${r.description}` : ''}`)
      .join('\n')

    systemPrompt +=
      `\n\n## Skills disponibles\n\n` +
      `Utilise l'outil \`get_skill_details\` pour obtenir les instructions complètes d'un skill si tu en as besoin avant de répondre.\n\n` +
      skillList

    return { systemPrompt, skillRefs }
  }

  async function resolveToolCall(call: LLMToolCall): Promise<string> {
    // Outils MCP — déléguer au serveur MCP si l'outil n'est pas get_skill_details
    if (call.name !== 'get_skill_details' && config.mcpEnabled && config.mcpUrl) {
      const mcpTool = config.mcpTools.find(t => t.name === call.name && t.enabled)
      if (mcpTool) {
        return callMcpTool(config.mcpUrl, call.name, call.args as Record<string, unknown>)
      }
    }

    const skillName = (call.args.name as string) ?? ''
    const skills = await loadSkills()
    const skill = skills.find(s => s.name === skillName || parseSkillFrontmatter(s).name === skillName)
    if (!skill) return `Skill "${skillName}" non trouvé.`
    return getSkillContent(skill)
  }

  async function handleSend(text: string, images: MessageImage[]) {
    const userMsg: ChatMessageType = {
      id: genId(),
      role: 'user',
      content: text,
      images: images.length > 0 ? images : undefined,
    }

    const assistantId = genId()
    const assistantMsg: ChatMessageType = {
      id: assistantId,
      role: 'assistant',
      content: '',
      isStreaming: true,
    }

    const newMessages = [...messages, userMsg]
    setMessages([...newMessages, assistantMsg])
    setSending(true)

    const ctrl = new AbortController()
    abortRef.current = ctrl

    const updateAssistant = (content: string, isStreaming: boolean, isJson = false) => {
      setMessages(prev => prev.map(m =>
        m.id === assistantId ? { ...m, content, isStreaming, isJson } : m
      ))
    }

    try {
      const { systemPrompt, skillRefs } = await buildSystemAndSkills()

      let apiMessages = [...newMessages]
      let finalContent = ''
      const onToken = (token: string) => {
        finalContent += token
        updateAssistant(finalContent, true)
      }

      const activeMcpTools = config.mcpEnabled ? config.mcpTools.filter(t => t.enabled) : []
      const prevId = config.llm.apiFormat === 'lmstudio_chat' ? lmStudioResponseIdRef.current : undefined
      let result = await sendMessage(config, apiMessages, systemPrompt, skillRefs, activeMcpTools, onToken, ctrl.signal, prevId)
      if (result.usage) addUsage(result.usage)
      if (result.responseId) lmStudioResponseIdRef.current = result.responseId

      let iterations = 0
      while (result.type === 'tool_calls' && iterations < MAX_TOOL_ITERATIONS) {
        iterations++
        finalContent = ''

        const toolResults = await Promise.all(
          result.calls.map(async call => ({
            call,
            content: await resolveToolCall(call),
          }))
        )

        // Construire les messages tool_call + tool_result et les ajouter à l'historique
        const toolMsgs: ChatMessageType[] = []
        for (const { call, content } of toolResults) {
          toolMsgs.push({
            id: genId(),
            role: 'tool_call',
            content: call.rawArgs,
            toolCallId: call.id,
            toolName: call.name,
            toolArgs: call.rawArgs,
          })
          toolMsgs.push({
            id: genId(),
            role: 'tool_result',
            content,
            toolCallResultId: call.id,
          })
        }

        apiMessages = [...apiMessages, ...toolMsgs]

        // Mettre à jour l'UI : insérer les messages tool avant le message assistant en cours
        setMessages(prev => {
          const withoutLast = prev.slice(0, -1)
          return [...withoutLast, ...toolMsgs, prev[prev.length - 1]]
        })

        updateAssistant('', true)

        result = await sendMessage(config, apiMessages, systemPrompt, skillRefs, activeMcpTools, onToken, ctrl.signal)
        if (result.usage) addUsage(result.usage)
      }

      if (!config.streamEnabled && result.type === 'text') {
        finalContent = result.content
      }

      const isJson = !!config.jsonSchema && (() => {
        try { JSON.parse(finalContent); return true } catch { return false }
      })()

      updateAssistant(finalContent, false, isJson)
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        // Arrêt demandé par l'utilisateur — on conserve le contenu partiel déjà affiché
        setMessages(prev => prev.map(m =>
          m.id === assistantId ? { ...m, isStreaming: false } : m
        ))
      } else {
        setMessages(prev => prev.map(m =>
          m.id === assistantId ? { ...m, content: `Erreur : ${(err as Error).message}`, isStreaming: false, isError: true } : m
        ))
      }
    } finally {
      abortRef.current = null
      setSending(false)
    }
  }

  return (
    <main className="flex-1 flex flex-col min-h-0 bg-gray-50">
      <div className="flex items-center justify-between px-4 h-10 bg-white border-b border-gray-200">
        <span className="text-sm font-medium text-gray-600">Conversation</span>
        {messages.length > 0 && (
          <button
            onClick={() => { setMessages([]); resetUsage(); lmStudioResponseIdRef.current = undefined }}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-blue-500 transition-colors"
          >
            <SquarePen className="w-3.5 h-3.5" />
            Nouvelle discussion
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 py-16">
            <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mb-4">
              <span className="text-3xl">💬</span>
            </div>
            <p className="text-sm font-medium text-gray-500">Commencez une conversation</p>
            <p className="text-xs text-gray-400 mt-1">Configurez votre provider LLM et envoyez un message</p>
          </div>
        )}

        {messages.map(msg => (
          <ChatMessageView key={msg.id} message={msg} />
        ))}
        <div ref={bottomRef} />
      </div>

      <ChatInput onSend={handleSend} onStop={() => abortRef.current?.abort()} disabled={sending} />
    </main>
  )
}
