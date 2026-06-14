import { Sliders } from 'lucide-react'
import { useConfig } from '../../store/configStore'
import { Accordion } from './Accordion'

interface SliderFieldProps {
  label: string
  hint: string
  min: number
  max: number
  step: number
  defaultValue: number
  value: number | null
  leftLabel: string
  rightLabel: string
  onChange: (v: number | null) => void
}

function SliderField({ label, hint, min, max, step, defaultValue, value, leftLabel, rightLabel, onChange }: SliderFieldProps) {
  const enabled = value !== null
  return (
    <div className={`rounded-md border px-3 py-2 transition-colors ${enabled ? 'border-purple-300 bg-purple-50' : 'border-gray-200 bg-white'}`}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className={`text-xs font-semibold leading-tight ${enabled ? 'text-purple-700' : 'text-gray-600'}`}>{label}</div>
          <div className="text-xs text-gray-400 leading-tight">{hint}</div>
        </div>
        <button
          onClick={() => onChange(enabled ? null : defaultValue)}
          className={`relative shrink-0 inline-flex h-5 w-9 items-center rounded-full transition-colors ${enabled ? 'bg-purple-500' : 'bg-gray-300'}`}
          title={enabled ? 'Désactiver' : 'Activer'}
        >
          <span className={`absolute h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
        </button>
      </div>
      <div className={`mt-2 transition-opacity ${enabled ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>{label}</span>
          <span className="font-mono font-semibold text-purple-700">{(value ?? defaultValue).toFixed(2)}</span>
        </div>
        <input
          type="range" min={min} max={max} step={step}
          value={value ?? defaultValue}
          onChange={e => onChange(parseFloat(e.target.value))}
          className="w-full accent-purple-500"
        />
        <div className="flex justify-between text-xs text-gray-300 mt-0.5">
          <span>{leftLabel}</span>
          <span>{rightLabel}</span>
        </div>
      </div>
    </div>
  )
}

export function SamplingSection() {
  const [config, update] = useConfig()
  const { llm } = config

  return (
    <Accordion title="Sampling" icon={<Sliders className="w-4 h-4 text-purple-500" />}>
      <div className="space-y-2">
        <SliderField
          label="Temperature"
          hint="Créativité aléatoire"
          min={0} max={2} step={0.01} defaultValue={1}
          leftLabel="0 — déterministe" rightLabel="2 — aléatoire"
          value={llm.temperature}
          onChange={v => update({ llm: { ...llm, temperature: v } })}
        />
        <SliderField
          label="Top-P (nucleus)"
          hint="Masse de probabilité"
          min={0} max={1} step={0.01} defaultValue={0.9}
          leftLabel="0 — concentré" rightLabel="1 — tous les tokens"
          value={llm.topP}
          onChange={v => update({ llm: { ...llm, topP: v } })}
        />

        <div>
          <label className="block text-xs text-gray-500 mb-1">
            Max tokens en sortie
            <span className="ml-1 text-gray-400">(vide = illimité)</span>
          </label>
          <input
            type="number"
            min={1}
            step={256}
            value={llm.maxTokens ?? ''}
            onChange={e => {
              const val = e.target.value === '' ? null : parseInt(e.target.value, 10)
              update({ llm: { ...llm, maxTokens: val && val > 0 ? val : null } })
            }}
            placeholder="ex : 1024"
            className="w-full text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-400"
          />
        </div>
      </div>
    </Accordion>
  )
}
