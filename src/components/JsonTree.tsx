import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

const TOGGLE_CLS = 'inline-flex items-center text-gray-400 hover:text-gray-700 align-middle'

function Primitive({ value }: { value: unknown }) {
  if (value === null) return <span className="text-gray-400">null</span>
  if (value === undefined) return <span className="text-gray-400">undefined</span>
  if (typeof value === 'boolean') return <span className="text-purple-600">{String(value)}</span>
  if (typeof value === 'number') return <span className="text-blue-600">{value}</span>
  if (typeof value === 'string') return <span className="text-green-700">"{value}"</span>
  return <span>{String(value)}</span>
}

function JsonNode({ value }: { value: unknown }) {
  const [open, setOpen] = useState(true)

  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-gray-500">[]</span>
    if (!open) return (
      <span>
        <button onClick={() => setOpen(true)} className={TOGGLE_CLS}>
          <ChevronRight className="w-3 h-3 shrink-0" />
        </button>
        <span className="text-gray-400 cursor-pointer" onClick={() => setOpen(true)}>[{value.length}…]</span>
      </span>
    )
    return (
      <>
        <button onClick={() => setOpen(false)} className={TOGGLE_CLS}>
          <ChevronDown className="w-3 h-3 shrink-0" />
        </button>
        <span className="text-gray-500">[</span>
        <div style={{ paddingLeft: '1ch' }}>
          {value.map((item, i) => (
            <div key={i}>
              <JsonNode value={item} />
              {i < value.length - 1 && <span className="text-gray-400">,</span>}
            </div>
          ))}
        </div>
        <span className="text-gray-500">]</span>
      </>
    )
  }

  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 0) return <span className="text-gray-500">{'{}'}</span>
    if (!open) return (
      <span>
        <button onClick={() => setOpen(true)} className={TOGGLE_CLS}>
          <ChevronRight className="w-3 h-3 shrink-0" />
        </button>
        <span className="text-gray-400 cursor-pointer" onClick={() => setOpen(true)}>{'{'}…{'}'}</span>
      </span>
    )
    return (
      <>
        <button onClick={() => setOpen(false)} className={TOGGLE_CLS}>
          <ChevronDown className="w-3 h-3 shrink-0" />
        </button>
        <span className="text-gray-500">{'{'}</span>
        <div style={{ paddingLeft: '1ch' }}>
          {entries.map(([k, v], i) => (
            <div key={k}>
              <span className="text-indigo-700">"{k}"</span>
              <span className="text-gray-500">: </span>
              <JsonNode value={v} />
              {i < entries.length - 1 && <span className="text-gray-400">,</span>}
            </div>
          ))}
        </div>
        <span className="text-gray-500">{'}'}</span>
      </>
    )
  }

  return <Primitive value={value} />
}

export function JsonTree({ value }: { value: unknown }) {
  const parsed = typeof value === 'string'
    ? (() => { try { return JSON.parse(value) } catch { return value } })()
    : value

  return (
    <div className="font-mono text-xs bg-gray-50 rounded p-1.5 leading-relaxed overflow-x-auto">
      <div style={{ paddingLeft: '1ch' }}>
        <JsonNode value={parsed} />
      </div>
    </div>
  )
}
