import { Wifi } from 'lucide-react'
import { useConfig } from '../../store/configStore'
import { Accordion } from './Accordion'

export function StreamSection() {
  const [config, update] = useConfig()

  return (
    <Accordion title="Mode Stream" icon={<Wifi className="w-4 h-4 text-green-500" />}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-700 font-medium">
            {config.streamEnabled ? 'Activé (SSE)' : 'Désactivé (HTTP classique)'}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {config.streamEnabled
              ? 'Réponses reçues progressivement via Server-Sent Events'
              : 'Réponse complète attendue en une seule requête HTTP'}
          </p>
        </div>
        <button
          onClick={() => update({ streamEnabled: !config.streamEnabled })}
          className={`relative shrink-0 inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            config.streamEnabled ? 'bg-green-500' : 'bg-gray-300'
          }`}
        >
          <span className={`absolute h-4 w-4 rounded-full bg-white shadow transition-transform ${
            config.streamEnabled ? 'translate-x-6' : 'translate-x-1'
          }`} />
        </button>
      </div>
    </Accordion>
  )
}
