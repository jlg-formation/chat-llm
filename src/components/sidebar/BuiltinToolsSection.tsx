import { Wrench } from 'lucide-react'
import { Accordion } from './Accordion'
import { Toggle } from './Toggle'
import { useConfig } from '../../store/configStore'

export function BuiltinToolsSection() {
  const [config, update] = useConfig()
  const subAgentsAvailable = config.llm.provider !== 'lmstudio' && config.llm.provider !== 'ollama'

  return (
    <Accordion title="Outils intégrés" icon={<Wrench className="w-4 h-4 text-indigo-500" />}>
      <div className="space-y-3">
        <div
          className={`flex items-start justify-between gap-3 ${subAgentsAvailable ? '' : 'opacity-50 pointer-events-none'}`}
          aria-disabled={!subAgentsAvailable}
        >
          <div>
            <p className="text-sm text-gray-700">Sous-agents</p>
            <p className="text-xs text-gray-400">
              Outil run_subagents : lance jusqu'à 5 sous-agents en parallèle ou en séquence.
            </p>
          </div>
          <Toggle
            checked={config.subAgentsEnabled}
            onChange={() => update({ subAgentsEnabled: !config.subAgentsEnabled })}
            color="teal"
          />
        </div>
        {!subAgentsAvailable && (
          <p className="text-xs text-amber-600">Non disponible avec LM Studio et Ollama.</p>
        )}
      </div>
    </Accordion>
  )
}
