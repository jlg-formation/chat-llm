import { ChevronRight, ChevronLeft, Trash2, ArrowRight, ArrowLeft } from 'lucide-react'
import { useState, useRef, useCallback, useEffect } from 'react'
import { useHttpExchanges } from '../store/httpStore'
import type { HttpExchange } from '../types'

const MIN_WIDTH = 200
const MAX_WIDTH = 800
const DEFAULT_WIDTH = 320

function formatJson(val: unknown): string {
  if (val === null || val === undefined) return ''
  if (typeof val === 'string') {
    try { return JSON.stringify(JSON.parse(val), null, 2) } catch { return val }
  }
  return JSON.stringify(val, null, 2)
}

function ExchangeCard({ exchange }: { exchange: HttpExchange }) {
  const [open, setOpen] = useState(true)
  const isLlm = exchange.type === 'llm'

  const borderColor = isLlm ? 'border-blue-200' : 'border-green-200'
  const headerBg = isLlm ? 'bg-blue-50' : 'bg-green-50'
  const badgeClass = isLlm
    ? 'bg-blue-100 text-blue-700'
    : 'bg-green-100 text-green-700'

  return (
    <div className={`border ${borderColor} rounded-lg overflow-hidden text-xs`}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center gap-2 px-3 py-2 ${headerBg} text-left`}
      >
        <span className={`px-1.5 py-0.5 rounded text-xs font-bold uppercase ${badgeClass}`}>
          {isLlm ? 'LLM' : 'MCP'}
        </span>
        <span className="font-mono text-gray-600 truncate flex-1">{exchange.method} {exchange.url}</span>
        <span className="text-gray-400 text-xs">{new Date(exchange.timestamp).toLocaleTimeString()}</span>
        {open ? <ChevronLeft className="w-3 h-3 text-gray-400 shrink-0" /> : <ChevronRight className="w-3 h-3 text-gray-400 shrink-0" />}
      </button>

      {open && (
        <div className="divide-y divide-gray-100">
          {/* Requête */}
          <div className="px-3 py-2 space-y-1">
            <div className="flex items-center gap-1 font-semibold text-gray-500 mb-1">
              <ArrowRight className="w-3 h-3 text-blue-400" />
              REQUÊTE
            </div>
            <div className="text-gray-500 font-medium mt-1">Headers :</div>
            <pre className="font-mono text-gray-700 whitespace-pre-wrap break-all bg-gray-50 rounded p-1.5 leading-relaxed">
              {Object.entries(exchange.requestHeaders).map(([k, v]) => `${k}: ${v}`).join('\n')}
            </pre>
            {exchange.requestBody !== null && (
              <>
                <div className="text-gray-500 font-medium mt-1">Body :</div>
                <pre className="font-mono text-gray-700 whitespace-pre-wrap break-all bg-gray-50 rounded p-1.5 leading-relaxed">
                  {formatJson(exchange.requestBody)}
                </pre>
              </>
            )}
          </div>

          {/* Réponse */}
          {exchange.responseStatus !== undefined && (
            <div className="px-3 py-2 space-y-1">
              <div className="flex items-center gap-1 font-semibold text-gray-500 mb-1">
                <ArrowLeft className="w-3 h-3 text-green-400" />
                RÉPONSE
                <span className={`ml-1 px-1.5 py-0.5 rounded font-bold ${
                  exchange.responseStatus < 300 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>
                  {exchange.responseStatus}
                </span>
              </div>
              {exchange.responseHeaders && Object.keys(exchange.responseHeaders).length > 0 && (
                <>
                  <div className="text-gray-500 font-medium">Headers :</div>
                  <pre className="font-mono text-gray-700 whitespace-pre-wrap break-all bg-gray-50 rounded p-1.5 leading-relaxed">
                    {Object.entries(exchange.responseHeaders).map(([k, v]) => `${k}: ${v}`).join('\n')}
                  </pre>
                </>
              )}
              {exchange.responseBody !== undefined && (
                <>
                  <div className="text-gray-500 font-medium mt-1">Body :</div>
                  <pre className="font-mono text-gray-700 whitespace-pre-wrap break-all bg-gray-50 rounded p-1.5 leading-relaxed">
                    {formatJson(exchange.responseBody)}
                  </pre>
                </>
              )}
            </div>
          )}

          {exchange.error && (
            <div className="px-3 py-2">
              <p className="text-red-600 font-medium">Erreur : {exchange.error}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function RightSidebar() {
  const [exchanges, clear] = useHttpExchanges()
  const [collapsed, setCollapsed] = useState(false)
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const dragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [exchanges])

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true
    startX.current = e.clientX
    startWidth.current = width
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      const delta = startX.current - ev.clientX
      setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth.current + delta)))
    }
    const onMouseUp = () => {
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [width])

  if (collapsed) {
    return (
      <div className="shrink-0 w-8 bg-white border-l border-gray-200 flex flex-col items-center py-3">
        <button
          onClick={() => setCollapsed(false)}
          className="text-gray-400 hover:text-gray-700 transition-colors"
          title="Afficher l'inspecteur HTTP"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>
    )
  }

  return (
    <div className="flex shrink-0 min-h-0" style={{ width }}>
      {/* Poignée de redimensionnement */}
      <div
        onMouseDown={onMouseDown}
        className="w-1 shrink-0 cursor-col-resize hover:bg-blue-400 active:bg-blue-500 transition-colors bg-gray-200"
        title="Redimensionner"
      />
    <aside className="flex-1 bg-white border-l border-gray-200 flex flex-col min-h-0 overflow-hidden">
      <div className="flex items-center justify-between px-3 h-10 border-b border-gray-200 bg-gray-50 shrink-0">
        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Inspecteur HTTP</span>
        <div className="flex items-center gap-2">
          {exchanges.length > 0 && (
            <button onClick={clear} className="text-gray-400 hover:text-red-500 transition-colors" title="Vider">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button onClick={() => setCollapsed(true)} className="text-gray-400 hover:text-gray-700 transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {exchanges.length === 0 && (
          <div className="text-center text-gray-400 py-8">
            <p className="text-xs">Les échanges HTTP apparaîtront ici</p>
            <p className="text-xs mt-1">
              <span className="inline-block w-2 h-2 rounded-sm bg-blue-200 mr-1" />LLM
              <span className="inline-block w-2 h-2 rounded-sm bg-green-200 mx-1 ml-3" />MCP
            </p>
          </div>
        )}
        {exchanges.map(ex => (
          <ExchangeCard key={ex.id} exchange={ex} />
        ))}
        <div ref={bottomRef} />
      </div>
    </aside>
    </div>
  )
}
