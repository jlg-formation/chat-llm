import ReactMarkdown from 'react-markdown'
import { useState } from 'react'
import type { ChatMessage as ChatMessageType } from '../../types'
import { User, Bot, Wrench, ChevronDown, ChevronRight } from 'lucide-react'

interface Props {
  message: ChatMessageType
}

function JsonDisplay({ content }: { content: string }) {
  try {
    const parsed = JSON.parse(content)
    return (
      <pre className="bg-gray-100 border border-gray-200 rounded-md p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap">
        {JSON.stringify(parsed, null, 2)}
      </pre>
    )
  } catch {
    return <span className="text-gray-700">{content}</span>
  }
}

function ToolMessageView({ message }: Props) {
  const [open, setOpen] = useState(false)
  const isCall = message.role === 'tool_call'

  return (
    <div className="flex justify-center">
      <div className="text-xs rounded-lg border border-gray-200 bg-gray-50 overflow-hidden max-w-[90%]">
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-gray-500 hover:text-gray-700 w-full"
        >
          <Wrench className="w-3 h-3 shrink-0 text-amber-500" />
          {isCall
            ? <span>Appel outil : <span className="font-mono font-semibold text-amber-700">{message.toolName}</span></span>
            : <span className="text-green-700 font-medium">Résultat outil</span>
          }
          {open
            ? <ChevronDown className="w-3 h-3 ml-auto" />
            : <ChevronRight className="w-3 h-3 ml-auto" />
          }
        </button>
        {open && (
          <pre className="px-3 pb-2 font-mono text-gray-600 whitespace-pre-wrap break-all border-t border-gray-200 bg-white max-h-48 overflow-y-auto">
            {isCall
              ? (() => { try { return JSON.stringify(JSON.parse(message.content), null, 2) } catch { return message.content } })()
              : message.content
            }
          </pre>
        )}
      </div>
    </div>
  )
}

export function ChatMessageView({ message }: Props) {
  if (message.role === 'tool_call' || message.role === 'tool_result') {
    return <ToolMessageView message={message} />
  }

  const isUser = message.role === 'user'

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
        isUser ? 'bg-blue-500' : 'bg-gray-200'
      }`}>
        {isUser
          ? <User className="w-4 h-4 text-white" />
          : <Bot className="w-4 h-4 text-gray-600" />
        }
      </div>

      <div className={`max-w-[75%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-2`}>
        {message.images && message.images.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {message.images.map((img, i) => (
              <img
                key={i}
                src={img.dataUrl}
                alt="image jointe"
                className="max-h-40 rounded-md border border-gray-200 object-contain"
              />
            ))}
          </div>
        )}

        {message.content && (
          <div className={`rounded-2xl px-4 py-2.5 ${
            isUser
              ? 'bg-blue-500 text-white rounded-tr-sm'
              : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm shadow-sm'
          }`}>
            {message.isJson && !isUser ? (
              <JsonDisplay content={message.content} />
            ) : isUser ? (
              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
            ) : (
              <div className="prose-chat text-sm">
                <ReactMarkdown>{message.content}</ReactMarkdown>
                {message.isStreaming && (
                  <span className="inline-block w-1.5 h-4 bg-gray-400 animate-pulse ml-0.5 align-text-bottom" />
                )}
              </div>
            )}
          </div>
        )}

        {message.isStreaming && !message.content && (
          <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
            <div className="flex gap-1">
              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
