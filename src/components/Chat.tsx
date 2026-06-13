import { useRef, useEffect, useState } from 'react'
import type { ChatMessage as ChatMessageType, MessageImage } from '../types'
import { ChatMessageView } from './chat/ChatMessage'
import { ChatInput } from './chat/ChatInput'
import { useConfig } from '../store/configStore'
import { loadSkills, getSkillContent, parseSkillFrontmatter } from '../store/skillsStore'
import { sendMessage, sendToolResults } from '../services/llm'
import type { SkillRef, LLMToolCall } from '../services/llm'
import { Trash2 } from 'lucide-react'

const MAX_TOOL_ITERATIONS = 5

function genId() {
  return Math.random().toString(36).slice(2)
}

export function Chat() {
  const [config] = useConfig()
  const [messages, setMessages] = useState<ChatMessageType[]>([])
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

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

    const updateAssistant = (content: string, isStreaming: boolean, isJson = false) => {
      setMessages(prev => prev.map(m =>
        m.id === assistantId ? { ...m, content, isStreaming, isJson } : m
      ))
    }

    try {
      const { systemPrompt, skillRefs } = await buildSystemAndSkills()

      let finalContent = ''
      const onToken = (token: string) => {
        finalContent += token
        updateAssistant(finalContent, true)
      }

      let result = await sendMessage(config, newMessages, systemPrompt, skillRefs, onToken)

      let iterations = 0
      while (result.type === 'tool_calls' && iterations < MAX_TOOL_ITERATIONS) {
        iterations++
        finalContent = ''

        // Indicateur visuel pendant l'exécution du/des tool(s)
        const toolNames = result.calls.map(c => (c.args.name as string) ?? c.name).join(', ')
        updateAssistant(`⏳ Récupération du skill « ${toolNames} »…`, true)

        const toolResults = await Promise.all(
          result.calls.map(async call => ({
            callId: call.id,
            content: await resolveToolCall(call),
          }))
        )

        const prevCalls: LLMToolCall[] = result.calls
        const prevResponseId = result.responseId

        result = await sendToolResults(
          config, newMessages, systemPrompt, skillRefs,
          prevCalls, toolResults, prevResponseId,
          onToken,
        )
      }

      if (!config.streamEnabled && result.type === 'text') {
        finalContent = result.content
      }

      const isJson = !!config.jsonSchema && (() => {
        try { JSON.parse(finalContent); return true } catch { return false }
      })()

      updateAssistant(finalContent, false, isJson)
    } catch (err) {
      updateAssistant(`Erreur : ${(err as Error).message}`, false)
    } finally {
      setSending(false)
    }
  }

  return (
    <main className="flex-1 flex flex-col min-h-0 bg-gray-50">
      <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200">
        <span className="text-sm font-medium text-gray-600">Conversation</span>
        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Effacer
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

      <ChatInput onSend={handleSend} disabled={sending} />
    </main>
  )
}
