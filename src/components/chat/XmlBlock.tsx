import { useState } from 'react'
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react'

export function XmlBlock({
  tag,
  content,
  unclosed,
}: {
  tag: string
  content: string
  unclosed?: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <div
      className={`text-xs rounded-lg overflow-hidden mb-2 transition-all ${
        unclosed
          ? 'border-2 border-indigo-300 bg-indigo-50 shadow-sm shadow-indigo-100'
          : 'border border-gray-200 bg-gray-50'
      }`}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 px-3 py-1.5 w-full font-mono ${
          unclosed ? 'text-indigo-600 hover:text-indigo-800' : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        {open ? (
          <ChevronDown className="w-3 h-3 shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 shrink-0" />
        )}
        {unclosed && <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin-charge" />}
        <span className={unclosed ? 'text-indigo-500 font-semibold' : 'text-gray-400'}>
          &lt;{tag}&gt;
        </span>
        {!open && (
          <span className={`ml-1 ${unclosed ? 'text-indigo-400' : 'text-gray-400'}`}>
            …{' '}
            {unclosed && (
              <span className="text-indigo-300">~{Math.ceil(content.length / 4)} tokens</span>
            )}
          </span>
        )}
      </button>
      {open && (
        <div
          className={`px-3 pb-2 whitespace-pre-wrap text-xs border-t max-h-64 overflow-y-auto font-mono ${
            unclosed
              ? 'border-indigo-200 bg-indigo-50 text-indigo-800'
              : 'border-gray-200 bg-white text-gray-600'
          }`}
        >
          {content}
          {unclosed && (
            <span className="inline-block w-1.5 h-3 bg-indigo-400 animate-pulse ml-0.5 align-middle" />
          )}
        </div>
      )}
    </div>
  )
}
