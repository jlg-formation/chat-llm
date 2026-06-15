import { MessageSquare } from 'lucide-react'
import { useConfig } from '../../store/configStore'
import { Accordion } from './Accordion'

export function SystemPromptSection() {
  const [config, update] = useConfig()

  return (
    <Accordion title="Prompt Système" icon={<MessageSquare className="w-4 h-4 text-purple-500" />}>
      <div>
        <textarea
          value={config.systemPrompt}
          onChange={e => update({ systemPrompt: e.target.value })}
          rows={5}
          aria-label="Prompt système"
          className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y font-mono"
          placeholder="Vous êtes un assistant pédagogique..."
        />
        <p className="text-xs text-gray-500 mt-1">
          Injecté en premier dans chaque requête. Les skills activés y sont également ajoutés automatiquement.
        </p>
      </div>
    </Accordion>
  )
}
