import { GitBranch, Radio, Wifi, WifiOff } from 'lucide-react'
import { useConfig } from '../store/configStore'
import { PROVIDER_DEFAULTS } from '../types'

export function Header() {
  const [config] = useConfig()
  const providerLabel = PROVIDER_DEFAULTS[config.llm.provider].label

  return (
    <header className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 shadow-sm shrink-0">
      <div className="flex items-center gap-3">
        <Radio className="w-6 h-6 text-blue-600" />
        <span className="text-lg font-semibold text-gray-900">Chat Pédagogique IA</span>
      </div>

      <div className="flex items-center gap-4 text-sm text-gray-600">
        <div className="flex items-center gap-1.5 bg-blue-50 text-blue-700 px-3 py-1 rounded-full">
          <span className="font-medium">{providerLabel}</span>
          {config.llm.model && (
            <span className="text-blue-500 text-xs">/ {config.llm.model}</span>
          )}
        </div>

        <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
          config.streamEnabled
            ? 'bg-green-50 text-green-700'
            : 'bg-gray-100 text-gray-600'
        }`}>
          {config.streamEnabled
            ? <><Wifi className="w-3.5 h-3.5" /> Stream ON</>
            : <><WifiOff className="w-3.5 h-3.5" /> Stream OFF</>
          }
        </div>

        <a
          href="https://github.com/jlg-formation/chat-llm"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-gray-500 hover:text-gray-900 transition-colors"
          title="Code source sur GitHub"
        >
          <GitBranch className="w-5 h-5" />
        </a>
      </div>
    </header>
  )
}
