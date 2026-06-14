import { BarChart2 } from 'lucide-react'
import { useUsage } from '../../store/usageStore'
import { useModelsCache } from '../../store/modelsStore'
import { useConfig } from '../../store/configStore'
import { Accordion } from './Accordion'
import type { ModelInfo } from '../../services/models'

// Pricing statique de repli pour les modèles OpenAI connus
const OPENAI_STATIC_PRICING: Record<string, Pick<ModelInfo, 'pricingPrompt' | 'pricingCompletion' | 'contextLength'>> = {
  'gpt-5.4-nano':  { pricingPrompt: 0.20e-6, pricingCompletion: 1.25e-6 },
  'gpt-5.4-mini':  { pricingPrompt: 0.75e-6, pricingCompletion: 4.50e-6 },
  'gpt-5.4':       { pricingPrompt: 2.50e-6, pricingCompletion: 15e-6   },
  'gpt-5.4-pro':   { pricingPrompt: 30e-6,   pricingCompletion: 180e-6  },
  'gpt-5.5':       { pricingPrompt: 5e-6,    pricingCompletion: 30e-6   },
  'gpt-5.5-pro':   { pricingPrompt: 30e-6,   pricingCompletion: 180e-6  },
}

function polarToCart(cx: number, cy: number, r: number, angleDeg: number): [number, number] {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]
}

function slicePath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  if (Math.abs(endDeg - startDeg) >= 360) endDeg = startDeg + 359.9
  const [x1, y1] = polarToCart(cx, cy, r, startDeg)
  const [x2, y2] = polarToCart(cx, cy, r, endDeg)
  const large = endDeg - startDeg > 180 ? 1 : 0
  return `M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function fmtCost(usd: number): string {
  return `$${usd.toFixed(6)}`
}

export function UsageSection() {
  const [usage, reset] = useUsage()
  const [config] = useConfig()
  const models = useModelsCache(config.llm.provider)

  const { promptTokens, completionTokens } = usage
  const total = promptTokens + completionTokens

  const modelInfo = models?.find(m => m.id === config.llm.model)
    ?? OPENAI_STATIC_PRICING[config.llm.model]
  const costPrompt = modelInfo?.pricingPrompt !== undefined ? promptTokens * modelInfo.pricingPrompt : undefined
  const costCompletion = modelInfo?.pricingCompletion !== undefined ? completionTokens * modelInfo.pricingCompletion : undefined
  const costTotal = costPrompt !== undefined && costCompletion !== undefined ? costPrompt + costCompletion : undefined

  if (total === 0) return null

  const promptRatio = total > 0 ? promptTokens / total : 0.5
  const promptDeg = promptRatio * 360

  return (
    <Accordion title="Usage de la conversation" icon={<BarChart2 className="w-4 h-4 text-indigo-500" />} defaultOpen>
      <div className="space-y-3">
        <div className="flex items-center gap-4">
          {/* Camembert SVG */}
          <svg viewBox="0 0 100 100" className="w-20 h-20 shrink-0">
            {total === 0 ? (
              <circle cx="50" cy="50" r="40" fill="#e5e7eb" />
            ) : promptTokens === 0 ? (
              <circle cx="50" cy="50" r="40" fill="#86efac" />
            ) : completionTokens === 0 ? (
              <circle cx="50" cy="50" r="40" fill="#93c5fd" />
            ) : (
              <>
                <path d={slicePath(50, 50, 40, 0, promptDeg)} fill="#93c5fd" />
                <path d={slicePath(50, 50, 40, promptDeg, 360)} fill="#86efac" />
              </>
            )}
            {/* Trou central (donut) */}
            <circle cx="50" cy="50" r="22" fill="white" />
            <text x="50" y="54" textAnchor="middle" fontSize="11" fontWeight="600" fill="#374151">
              {fmt(total)}
            </text>
          </svg>

          {/* Légende */}
          <div className="flex-1 space-y-1.5 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: '#93c5fd' }} />
              <span className="text-gray-600">Input</span>
              <span className="ml-auto font-mono font-semibold text-gray-800">{fmt(promptTokens)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: '#86efac' }} />
              <span className="text-gray-600">Output</span>
              <span className="ml-auto font-mono font-semibold text-gray-800">{fmt(completionTokens)}</span>
            </div>
          </div>
        </div>

        {/* Coût total bien visible */}
        {costTotal !== undefined && (
          <div className="rounded-lg bg-indigo-50 border border-indigo-100 px-3 py-2">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-indigo-500 font-medium">Coût total estimé</span>
              <span className="text-base font-bold font-mono text-indigo-700">{fmtCost(costTotal)}</span>
            </div>
            <div className="mt-1 flex justify-between text-xs text-indigo-300">
              <span>Input · {fmtCost(costPrompt!)}</span>
              <span>Output · {fmtCost(costCompletion!)}</span>
            </div>
          </div>
        )}

        {modelInfo?.contextLength && (
          <div className="text-xs text-gray-400 flex items-center gap-1">
            <span>Fenêtre de contexte :</span>
            <span className="font-mono font-medium text-gray-600">{fmt(modelInfo.contextLength)} tokens</span>
            <span className="ml-auto text-gray-300">({Math.round((total / modelInfo.contextLength) * 100)}% utilisé)</span>
          </div>
        )}

        <button
          onClick={reset}
          className="w-full text-xs text-gray-400 hover:text-red-500 transition-colors text-center py-0.5"
        >
          Réinitialiser le compteur
        </button>
      </div>
    </Accordion>
  )
}
