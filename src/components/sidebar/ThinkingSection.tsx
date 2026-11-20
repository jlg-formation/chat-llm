import { Brain } from 'lucide-react'
import { useConfig } from '../../store/configStore'
import { getReasoningEfforts } from '../../services/llm/reasoningCapabilities'
import type { ReasoningEffort } from '../../types'
import { Accordion } from './Accordion'

interface SwitchProps {
  label: string
  description: string
  on: boolean
  disabled: boolean
  onToggle: () => void
}

function Switch({ label, description, on, disabled, onToggle }: SwitchProps) {
  const active = on && !disabled
  return (
    <div
      className={`rounded-md border px-3 py-2 ${active ? 'border-purple-300 bg-purple-50' : 'border-gray-200 bg-white'} ${disabled ? 'opacity-50' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <div
            className={`text-xs font-semibold leading-tight ${active ? 'text-purple-700' : 'text-gray-600'}`}
          >
            {label}
          </div>
          <div className="text-xs text-gray-400 leading-tight">{description}</div>
        </div>
        <button
          onClick={onToggle}
          disabled={disabled}
          role="switch"
          aria-checked={active}
          aria-label={label}
          className={`relative shrink-0 inline-flex h-5 w-9 items-center rounded-full transition-colors ${active ? 'bg-purple-500' : 'bg-gray-300'}`}
        >
          <span
            className={`absolute h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${active ? 'translate-x-4.5' : 'translate-x-0.5'}`}
          />
        </button>
      </div>
    </div>
  )
}

const API_DEFAULT = 'api_default'

const EFFORT_LABELS: Record<ReasoningEffort, string> = {
  none: 'none',
  minimal: 'minimal',
  low: 'low',
  medium: 'medium',
  high: 'high',
  xhigh: 'xhigh',
  max: 'max',
}

export function ThinkingSection() {
  const [config, update] = useConfig()
  const { llm } = config
  const isAnthropic = llm.provider === 'anthropic'
  const isGoogle = llm.apiFormat === 'google_interactions'
  const isOpenAiResponses = llm.provider === 'openai' && llm.apiFormat === 'responses'
  const efforts = isOpenAiResponses || isGoogle ? getReasoningEfforts(llm.model) : null
  // Sans choix : OpenAI envoie medium, Google laisse le défaut du modèle
  const nullDefault: ReasoningEffort | null = isGoogle ? null : 'medium'

  let effortHint = 'Modèle non listé : paramètre non envoyé'
  if (!isOpenAiResponses && !isGoogle)
    effortHint = 'Disponible avec OpenAI (responses) et Google (Interactions)'
  else if (efforts) effortHint = isGoogle ? 'Vide = défaut du modèle' : 'Vide = medium'

  // Un choix devenu invalide (changement de modèle) n'est pas envoyé : on l'affiche comme défaut API
  let selectValue: string = API_DEFAULT
  if (efforts) {
    if (llm.reasoningEffort === null)
      selectValue = nullDefault && efforts.includes(nullDefault) ? nullDefault : API_DEFAULT
    else if (llm.reasoningEffort !== API_DEFAULT && efforts.includes(llm.reasoningEffort))
      selectValue = llm.reasoningEffort
  }

  return (
    <Accordion title="Thinking" icon={<Brain className="w-4 h-4 text-purple-500" />}>
      <div className="space-y-2">
        <div className="rounded-md border border-gray-200 bg-white px-3 py-2">
          <label htmlFor="reasoning-effort" className="block text-xs font-semibold text-gray-600">
            Effort de raisonnement
          </label>
          <div className="text-xs text-gray-400 leading-tight mb-1">{effortHint}</div>
          <select
            id="reasoning-effort"
            disabled={!efforts}
            value={efforts ? selectValue : API_DEFAULT}
            onChange={(e) => {
              const value = e.target.value
              update({
                llm: {
                  ...llm,
                  reasoningEffort: value === API_DEFAULT ? API_DEFAULT : (value as ReasoningEffort),
                },
              })
            }}
            className="w-full text-sm border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-purple-400 disabled:opacity-50"
          >
            {efforts?.map((level) => (
              <option key={level} value={level}>
                {EFFORT_LABELS[level]}
                {level === 'medium' ? ' (défaut)' : ''}
              </option>
            ))}
            <option value={API_DEFAULT}>Défaut API (non envoyé)</option>
          </select>
        </div>

        <Switch
          label="Afficher le résumé de réflexion"
          description={
            isOpenAiResponses
              ? 'Résumé de raisonnement OpenAI (reasoning.summary)'
              : 'Disponible uniquement avec OpenAI (format responses)'
          }
          on={llm.showReasoning}
          disabled={!isOpenAiResponses}
          onToggle={() => update({ llm: { ...llm, showReasoning: !llm.showReasoning } })}
        />

        {(isAnthropic || isGoogle) && (
          <Switch
            label="Afficher la réflexion"
            description={
              isGoogle
                ? efforts
                  ? 'Résumés de réflexion Google (thinking_summaries)'
                  : 'Modèle non listé : résumés non demandés'
                : llm.apiFormat === 'anthropic_messages'
                  ? 'Réflexion adaptative (display: summarized)'
                  : 'Indisponible en mode OpenAI compatible'
            }
            on={llm.showThinking}
            disabled={isGoogle ? !efforts : llm.apiFormat !== 'anthropic_messages'}
            onToggle={() => update({ llm: { ...llm, showThinking: !llm.showThinking } })}
          />
        )}
      </div>
    </Accordion>
  )
}
