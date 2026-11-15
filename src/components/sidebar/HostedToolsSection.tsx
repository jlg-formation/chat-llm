import { Globe } from 'lucide-react'
import { Accordion } from './Accordion'
import { Toggle } from './Toggle'
import { useConfig } from '../../store/configStore'
import { webSearchAvailable } from '../../services/llm/helpers'

export function HostedToolsSection() {
  const [config, update] = useConfig()
  const available = webSearchAvailable(config)

  return (
    <Accordion title="Outils hébergés" icon={<Globe className="w-4 h-4 text-indigo-500" />}>
      <div className="space-y-3">
        <div
          className={`flex items-start justify-between gap-3 ${available ? '' : 'opacity-50 pointer-events-none'}`}
          aria-disabled={!available}
        >
          <div>
            <p className="text-sm text-gray-700">Recherche web</p>
            <p className="text-xs text-gray-400">
              Exécutée par le fournisseur. Facturée à chaque recherche.
            </p>
          </div>
          <Toggle
            checked={config.hostedTools.webSearch}
            onChange={() =>
              update({
                hostedTools: { ...config.hostedTools, webSearch: !config.hostedTools.webSearch },
              })
            }
            color="teal"
          />
        </div>
        {!available && (
          <p className="text-xs text-amber-600">
            Disponible avec OpenAI (API Responses) et Anthropic (API Messages).
          </p>
        )}
      </div>
    </Accordion>
  )
}
