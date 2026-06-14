import { Radio, Wifi, WifiOff } from 'lucide-react'
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
          <svg viewBox="0 0 98 96" className="w-5 h-5 fill-current" aria-hidden="true"><path fillRule="evenodd" clipRule="evenodd" d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z"/></svg>
        </a>
      </div>
    </header>
  )
}
