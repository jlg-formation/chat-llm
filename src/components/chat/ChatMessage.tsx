import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/github.css'
import { useState, useEffect } from 'react'
import type { ChatMessage as ChatMessageType } from '../../types'
import { User, Bot, Wrench, ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import mermaid from 'mermaid'

mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose' })

let mermaidCounter = 0

function expandSvg(svg: string): string {
  // Supprime les attributs width/height fixes pour que le SVG s'étire librement
  return svg
    .replace(/(<svg[^>]*)\swidth="[^"]*"/i, '$1')
    .replace(/(<svg[^>]*)\sheight="[^"]*"/i, '$1')
}

function MermaidModal({ svg, onClose }: { svg: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-[90vw] max-h-[90vh] overflow-auto p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="[&>svg]:w-full [&>svg]:h-auto" dangerouslySetInnerHTML={{ __html: expandSvg(svg) }} />
      </div>
    </div>
  )
}

function MermaidBlock({ code }: { code: string }) {
  const [result, setResult] = useState<{ svg: string } | { error: true } | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    mermaid.parse(code)
      .then(() => {
        const id = `mermaid-${++mermaidCounter}`
        return mermaid.render(id, code)
      })
      .then(({ svg: rendered }) => { setResult({ svg: rendered }) })
      .catch((err) => { console.error('[Mermaid render error]', err); setResult({ error: true }) })
  }, [code])

  if (!result) return null
  if ('error' in result) {
    return (
      <pre className="bg-gray-50 border border-gray-200 rounded-md p-3 text-xs text-gray-500 overflow-x-auto whitespace-pre-wrap font-mono">
        {code}
      </pre>
    )
  }
  return (
    <>
      <div
        className="flex justify-center my-2 overflow-hidden cursor-zoom-in rounded-lg border border-gray-200 bg-gray-50 hover:border-blue-300 hover:bg-blue-50 transition-colors"
        title="Cliquer pour agrandir"
        onClick={() => setOpen(true)}
        dangerouslySetInnerHTML={{ __html: result.svg }}
      />
      {open && <MermaidModal svg={result.svg} onClose={() => setOpen(false)} />}
    </>
  )
}

// ─── Parseur de blocs XML (ex: <think>…</think>) ─────────────────────────────

interface Segment {
  type: 'text' | 'xml'
  content: string
  tag?: string
  unclosed?: boolean
}

function parseXmlBlocks(content: string): Segment[] {
  const segments: Segment[] = []
  const re = /<(\w+)>([\s\S]*?)<\/\1>/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = re.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: content.slice(lastIndex, match.index) })
    }
    segments.push({ type: 'xml', tag: match[1], content: match[2] })
    lastIndex = re.lastIndex
  }

  const remaining = content.slice(lastIndex)
  const openTag = remaining.match(/^<(\w+)>([\s\S]*)$/)
  if (openTag) {
    segments.push({ type: 'xml', tag: openTag[1], content: openTag[2], unclosed: true })
  } else if (remaining) {
    segments.push({ type: 'text', content: remaining })
  }

  return segments
}

function XmlBlock({ tag, content, unclosed }: { tag: string; content: string; unclosed?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`text-xs rounded-lg overflow-hidden mb-2 transition-all ${
      unclosed
        ? 'border-2 border-indigo-300 bg-indigo-50 shadow-sm shadow-indigo-100'
        : 'border border-gray-200 bg-gray-50'
    }`}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 px-3 py-1.5 w-full font-mono ${
          unclosed ? 'text-indigo-600 hover:text-indigo-800' : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        {open ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
        {unclosed && <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin-charge" />}
        <span className={unclosed ? 'text-indigo-500 font-semibold' : 'text-gray-400'}>
          &lt;{tag}&gt;
        </span>
        {!open && (
          <span className={`ml-1 ${unclosed ? 'text-indigo-400' : 'text-gray-400'}`}>
            … {unclosed && <span className="text-indigo-300">~{Math.ceil(content.length / 4)} tokens</span>}
          </span>
        )}
      </button>
      {open && (
        <div className={`px-3 pb-2 whitespace-pre-wrap text-xs border-t max-h-64 overflow-y-auto font-mono ${
          unclosed
            ? 'border-indigo-200 bg-indigo-50 text-indigo-800'
            : 'border-gray-200 bg-white text-gray-600'
        }`}>
          {content}
          {unclosed && <span className="inline-block w-1.5 h-3 bg-indigo-400 animate-pulse ml-0.5 align-middle" />}
        </div>
      )}
    </div>
  )
}

interface Props {
  message: ChatMessageType
}

function JsonDisplay({ content }: { content: string }) {
  let formatted: string | null = null
  try { formatted = JSON.stringify(JSON.parse(content), null, 2) } catch { /* JSON invalide */ }
  if (formatted !== null) {
    return (
      <pre className="bg-gray-100 border border-gray-200 rounded-md p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap">
        {formatted}
      </pre>
    )
  }
  return <span className="text-gray-700">{content}</span>
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
                {parseXmlBlocks(message.content).map((seg, i) =>
                  seg.type === 'xml' ? (
                    <XmlBlock key={i} tag={seg.tag!} content={seg.content} unclosed={seg.unclosed} />
                  ) : (
                    <ReactMarkdown
                      key={i}
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[[rehypeHighlight, { ignoreMissing: true }]]}
                      components={{
                        code({ className, children }) {
                          const lang = /language-(\w+)/.exec(className ?? '')?.[1]
                          if (lang === 'mermaid' && !message.isStreaming) {
                            return <MermaidBlock code={String(children).trimEnd()} />
                          }
                          return <code className={className}>{children}</code>
                        },
                      }}
                    >{seg.content}</ReactMarkdown>
                  )
                )}
                {message.isStreaming && !message.content.match(/<\w+>[\s\S]*$/) && (
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
