import { Sliders } from 'lucide-react'
import { useConfig } from '../../store/configStore'
import { type SamplingMode } from '../../types'
import { Accordion } from './Accordion'

export function SamplingSection() {
  const [config, update] = useConfig()
  const { llm } = config

  function setMode(mode: SamplingMode) {
    update({ llm: { ...llm, samplingMode: mode } })
  }

  return (
    <Accordion title="Sampling" icon={<Sliders className="w-4 h-4 text-purple-500" />}>
      <div className="space-y-4">

        {/* Temperature XOR Top-P */}
        <div>
          <div className="flex flex-col gap-1.5">
            {([
              { mode: 'default'     as SamplingMode, label: 'Réglage défaut', hint: 'Aucun paramètre envoyé — l\'API décide' },
              { mode: 'temperature' as SamplingMode, label: 'Temperature',    hint: 'Créativité aléatoire' },
              { mode: 'top_p'       as SamplingMode, label: 'Top-P (nucleus)', hint: 'Filtrage par masse de probabilité' },
            ]).map(({ mode, label, hint }) => {
              const active = llm.samplingMode === mode
              return (
                <button
                  key={mode}
                  onClick={() => setMode(mode)}
                  className={`w-full text-left px-3 py-2 rounded-md border transition-colors ${
                    active
                      ? 'bg-purple-50 border-purple-400 text-purple-700'
                      : 'bg-white border-gray-200 text-gray-500 hover:border-purple-300 hover:text-gray-700'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-3 h-3 rounded-full border-2 shrink-0 ${
                      active ? 'border-purple-500 bg-purple-500' : 'border-gray-300'
                    }`} />
                    <div>
                      <div className="text-xs font-semibold leading-tight">{label}</div>
                      <div className="text-xs opacity-60 leading-tight">{hint}</div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Slider valeur active */}
          {llm.samplingMode === 'temperature' && (
            <div className="mt-3">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Temperature</span>
                <span className="font-mono font-semibold text-purple-700">{llm.temperature.toFixed(2)}</span>
              </div>
              <input
                type="range" min={0} max={2} step={0.01}
                value={llm.temperature}
                onChange={e => update({ llm: { ...llm, temperature: parseFloat(e.target.value) } })}
                className="w-full accent-purple-500"
              />
              <div className="flex justify-between text-xs text-gray-300 mt-0.5">
                <span>0 — déterministe</span>
                <span>2 — aléatoire</span>
              </div>
            </div>
          )}
          {llm.samplingMode === 'top_p' && (
            <div className="mt-3">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Top-P</span>
                <span className="font-mono font-semibold text-purple-700">{llm.topP.toFixed(2)}</span>
              </div>
              <input
                type="range" min={0} max={1} step={0.01}
                value={llm.topP}
                onChange={e => update({ llm: { ...llm, topP: parseFloat(e.target.value) } })}
                className="w-full accent-purple-500"
              />
              <div className="flex justify-between text-xs text-gray-300 mt-0.5">
                <span>0 — très concentré</span>
                <span>1 — tous les tokens</span>
              </div>
            </div>
          )}
        </div>

        {/* Max tokens */}
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
