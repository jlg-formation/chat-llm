import { useEffect, useState } from 'react'
import { Code, X } from 'lucide-react'

// Rendu via img : le navigateur n'exécute pas les scripts d'un SVG chargé ainsi.
function svgToDataUrl(svg: string): string {
  const root = svg.match(/<svg\b[^>]*>/i)?.[0] ?? ''
  const src = /\sxmlns=/.test(root)
    ? svg
    : svg.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"')
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(src)}`
}

function SvgModal({ svg, src, onClose }: { svg: string; src: string; onClose: () => void }) {
  const [showCode, setShowCode] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-[90vw] max-h-[90vh] overflow-auto p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-end gap-1 mb-2">
          <button
            type="button"
            onClick={() => setShowCode((s) => !s)}
            aria-label="Voir le code source"
            aria-pressed={showCode}
            title="Voir le code source"
            className={`p-1.5 rounded-md hover:bg-gray-100 ${showCode ? 'text-blue-600' : 'text-gray-500 hover:text-gray-900'}`}
          >
            <Code className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            title="Fermer"
            className="p-1.5 rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {showCode ? (
          <pre className="bg-gray-50 border border-gray-200 rounded-md p-3 text-xs font-mono overflow-auto whitespace-pre-wrap break-all">
            {svg}
          </pre>
        ) : (
          <img src={src} alt="Image SVG" className="w-full h-auto" />
        )}
      </div>
    </div>
  )
}

export function SvgImage({ svg }: { svg: string }) {
  const [open, setOpen] = useState(false)
  const src = svgToDataUrl(svg)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Cliquer pour agrandir"
        className="block w-full my-2 cursor-zoom-in rounded-lg border border-gray-200 bg-white p-2 hover:border-blue-300 transition-colors"
      >
        <img src={src} alt="Image SVG" className="w-full h-auto" />
      </button>
      {open && <SvgModal svg={svg} src={src} onClose={() => setOpen(false)} />}
    </>
  )
}
