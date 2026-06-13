import { useRef, useEffect, useState } from 'react'
import type { ChatMessage as ChatMessageType, MessageImage } from '../types'
import { ChatMessageView } from './chat/ChatMessage'
import { ChatInput } from './chat/ChatInput'
import { useConfig } from '../store/configStore'
import { loadSkills, getSkillContent } from '../store/skillsStore'
import { sendMessage } from '../services/llm'
import { Trash2 } from 'lucide-react'

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

  async function buildSystemWithSkills(): Promise<string> {
    const skills = await loadSkills()
    const active = skills.filter(s => s.enabled)
    let system = config.systemPrompt ?? ''
    if (active.length > 0) {
      const skillsText = active.map(s => {
        const content = getSkillContent(s)
        return `\n\n---\n## Skill: ${s.name}\n\n${content}`
      }).join('')
      system += skillsText
    }
    return system
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

    try {
      const systemWithSkills = await buildSystemWithSkills()
      let finalContent = ''

      const result = await sendMessage(
        config,
        newMessages,
        systemWithSkills,
        (token) => {
          finalContent += token
          setMessages(prev => prev.map(m =>
            m.id === assistantId
              ? { ...m, content: finalContent, isStreaming: true }
              : m
          ))
        }
      )

      if (!config.streamEnabled) finalContent = result

      const isJson = !!config.jsonSchema && (() => {
        try { JSON.parse(finalContent); return true } catch { return false }
      })()

      setMessages(prev => prev.map(m =>
        m.id === assistantId
          ? { ...m, content: finalContent, isStreaming: false, isJson }
          : m
      ))
    } catch (err) {
      const errMsg = (err as Error).message
      setMessages(prev => prev.map(m =>
        m.id === assistantId
          ? { ...m, content: `Erreur : ${errMsg}`, isStreaming: false }
          : m
      ))
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
