import { useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

const CW = 14 // largeur du chevron en px

function Chevron({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{ width: CW, flexShrink: 0 }}
      className="flex items-center justify-center text-gray-400 hover:text-gray-700"
    >
      {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
    </button>
  )
}

function Primitive({ value }: { value: unknown }) {
  if (value === null) return <span className="text-gray-400">null</span>
  if (value === undefined) return <span className="text-gray-400">undefined</span>
  if (typeof value === 'boolean') return <span className="text-purple-600">{String(value)}</span>
  if (typeof value === 'number') return <span className="text-blue-600">{value}</span>
  if (typeof value === 'string') return <span className="text-green-700">"{value}"</span>
  return <span>{String(value)}</span>
}

function JsonNode({ value, prefix, suffix }: { value: unknown; prefix?: ReactNode; suffix?: ReactNode }) {
  const [open, setOpen] = useState(true)

  if (Array.isArray(value)) {
    if (value.length === 0) return (
      <div>{prefix}<span className="text-gray-500">[]</span>{suffix}</div>
    )
    return (
      <>
        <div className="flex items-center">
          <Chevron open={open} onClick={() => setOpen(o => !o)} />
          <span>
            {prefix}<span className="text-gray-500">[</span>
            {!open && <span className="text-gray-400 cursor-pointer" onClick={() => setOpen(true)}>{value.length}…]{suffix}</span>}
          </span>
        </div>
        {open && (
          <>
            <div style={{ paddingLeft: CW }}>
              {value.map((item, i) => (
                <JsonNode key={i} value={item} suffix={i < value.length - 1 ? <span className="text-gray-400">,</span> : null} />
              ))}
            </div>
            <div><span className="text-gray-500">]</span>{suffix}</div>
          </>
        )}
      </>
    )
  }

  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 0) return (
      <div>{prefix}<span className="text-gray-500">{'{}'}</span>{suffix}</div>
    )
    return (
      <>
        <div className="flex items-center">
          <Chevron open={open} onClick={() => setOpen(o => !o)} />
          <span>
            {prefix}<span className="text-gray-500">{'{'}</span>
            {!open && <span className="text-gray-400 cursor-pointer" onClick={() => setOpen(true)}>…{'}'}{suffix}</span>}
          </span>
        </div>
        {open && (
          <>
            <div style={{ paddingLeft: CW }}>
              {entries.map(([k, v], i) => (
                <JsonNode
                  key={k}
                  value={v}
                  prefix={<><span className="text-indigo-700">"{k}"</span><span className="text-gray-500">: </span></>}
                  suffix={i < entries.length - 1 ? <span className="text-gray-400">,</span> : null}
                />
              ))}
            </div>
            <div><span className="text-gray-500">{'}'}</span>{suffix}</div>
          </>
        )}
      </>
    )
  }

  return <div>{prefix}<Primitive value={value} />{suffix}</div>
}

export function JsonTree({ value }: { value: unknown }) {
  const parsed = typeof value === 'string'
    ? (() => { try { return JSON.parse(value) } catch { return value } })()
    : value

  return (
    <div className="font-mono text-xs bg-gray-50 rounded p-1.5 leading-relaxed overflow-x-auto">
      <JsonNode value={parsed} />
    </div>
  )
}
