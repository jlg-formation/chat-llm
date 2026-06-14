import { useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

const CW = 14 // largeur du gutter chevron en px
const PAD = 6  // padding de base du conteneur (p-1.5 = 6px)

function Primitive({ value }: { value: unknown }) {
  if (value === null) return <span className="text-gray-400">null</span>
  if (value === undefined) return <span className="text-gray-400">undefined</span>
  if (typeof value === 'boolean') return <span className="text-purple-600">{String(value)}</span>
  if (typeof value === 'number') return <span className="text-blue-600">{value}</span>
  if (typeof value === 'string') return <span className="text-green-700">"{value}"</span>
  return <span>{String(value)}</span>
}

function JsonNode({ value, prefix, suffix, depth = 0 }: {
  value: unknown
  prefix?: ReactNode
  suffix?: ReactNode
  depth?: number
}) {
  const [open, setOpen] = useState(true)

  // Le chevron est sorti du flux (position:absolute) et positionné
  // à x=0 du conteneur racine quel que soit le niveau d'imbrication.
  // left = -(padding_racine + depth*CW + CW) ramène le bouton au bord gauche.
  const chevronStyle: React.CSSProperties = {
    position: 'absolute',
    left: -(PAD + (depth + 1) * CW),
    top: '50%',
    transform: 'translateY(-50%)',
    width: CW,
    height: CW,
  }

  const chevronBtn = (btnOpen: boolean, onClick: () => void) => (
    <button
      onClick={onClick}
      style={chevronStyle}
      className="flex items-center justify-center text-gray-400 hover:text-gray-700"
    >
      {btnOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
    </button>
  )

  if (Array.isArray(value)) {
    if (value.length === 0) return (
      <div>{prefix}<span className="text-gray-500">[]</span>{suffix}</div>
    )
    return (
      <>
        <div style={{ position: 'relative' }}>
          {chevronBtn(open, () => setOpen(o => !o))}
          <span>
            {prefix}<span className="text-gray-500">[</span>
            {!open && (
              <span className="text-gray-400 cursor-pointer" onClick={() => setOpen(true)}>
                {value.length}…]{suffix}
              </span>
            )}
          </span>
        </div>
        {open && (
          <>
            <div style={{ paddingLeft: CW }}>
              {value.map((item, i) => (
                <JsonNode
                  key={i}
                  value={item}
                  depth={depth + 1}
                  suffix={i < value.length - 1 ? <span className="text-gray-400">,</span> : null}
                />
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
        <div style={{ position: 'relative' }}>
          {chevronBtn(open, () => setOpen(o => !o))}
          <span>
            {prefix}<span className="text-gray-500">{'{'}</span>
            {!open && (
              <span className="text-gray-400 cursor-pointer" onClick={() => setOpen(true)}>
                …{'}'}{suffix}
              </span>
            )}
          </span>
        </div>
        {open && (
          <>
            <div style={{ paddingLeft: CW }}>
              {entries.map(([k, v], i) => (
                <JsonNode
                  key={k}
                  value={v}
                  depth={depth + 1}
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
    <div
      className="font-mono text-xs bg-gray-50 rounded leading-relaxed overflow-x-auto"
      style={{ padding: PAD, paddingLeft: PAD + CW }}
    >
      <JsonNode value={parsed} depth={0} />
    </div>
  )
}
