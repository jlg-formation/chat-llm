import { useState, useEffect } from 'react'
import mermaid from 'mermaid'
import { useEscapeKey } from './useEscapeKey'

mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
})

let mermaidCounter = 0

function expandSvg(svg: string): string {
  // Supprime les attributs width/height fixes pour que le SVG s'étire librement
  return svg
    .replace(/(<svg[^>]*)\swidth="[^"]*"/i, '$1')
    .replace(/(<svg[^>]*)\sheight="[^"]*"/i, '$1')
}

function MermaidModal({ svg, onClose }: { svg: string; onClose: () => void }) {
  useEscapeKey(onClose)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-[90vw] max-h-[90vh] overflow-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="[&>svg]:w-full [&>svg]:h-auto"
          dangerouslySetInnerHTML={{ __html: expandSvg(svg) }}
        />
      </div>
    </div>
  )
}

export function MermaidBlock({ code }: { code: string }) {
  const [result, setResult] = useState<{ svg: string } | { error: true } | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    mermaid
      .parse(code)
      .then(() => {
        const id = `mermaid-${++mermaidCounter}`
        return mermaid.render(id, code)
      })
      .then(({ svg: rendered }) => {
        setResult({ svg: rendered })
      })
      .catch((err) => {
        console.error('[Mermaid render error]', err)
        setResult({ error: true })
      })
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
