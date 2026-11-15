import { useState } from 'react'
import { Brain, ChevronDown, ChevronRight } from 'lucide-react'

interface Props {
  content: string
  isStreaming?: boolean
}

export function ThinkingBlock({ content, isStreaming }: Props) {
  const [toggled, setToggled] = useState<boolean | null>(null)
  // Ouvert pendant la réflexion, sauf choix explicite de l'utilisateur
  const open = toggled ?? !!isStreaming

  return (
    <div className="text-xs rounded-lg border border-purple-200 bg-purple-50 overflow-hidden">
      <button
        onClick={() => setToggled(!open)}
        aria-expanded={open}
        className="flex items-center gap-1.5 px-3 py-1.5 text-purple-600 hover:text-purple-800 w-full"
      >
        <Brain className="w-3 h-3 shrink-0" />
        <span className="font-medium">Réflexion</span>
        {open ? (
          <ChevronDown className="w-3 h-3 ml-auto" />
        ) : (
          <ChevronRight className="w-3 h-3 ml-auto" />
        )}
      </button>
      {open && (
        <pre className="px-3 pb-2 pt-1 text-gray-600 whitespace-pre-wrap font-sans border-t border-purple-200 bg-white max-h-64 overflow-y-auto">
          {content}
        </pre>
      )}
    </div>
  )
}
