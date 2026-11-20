export async function getText(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`)
  return res.text()
}

// « $0.15 » (USD par million de tokens) → USD par token, sans erreur d'arrondi flottant.
export const perToken = (usdPerMillion) => Number(`${usdPerMillion}e-6`)

// « 1M » / « 256k » → nombre de tokens.
export function parseContext(text) {
  const m = /^([\d.]+)\s*([kKmM])$/.exec(text.trim())
  if (!m) return undefined
  return Math.round(Number(m[1]) * (m[2].toLowerCase() === 'm' ? 1e6 : 1e3))
}

export const acceptsText = (inputs, outputs) => inputs.includes('text') && outputs.includes('text')

// Premier palier « au-delà de N k tokens de prompt » (hors tarifs batch) de LiteLLM.
function litellmLongContext(m) {
  const tiers = []
  for (const key of Object.keys(m)) {
    const match = key.match(/^input_cost_per_token_above_(\d+)k_tokens$/)
    if (!match) continue
    const out = m[`output_cost_per_token_above_${match[1]}k_tokens`]
    if (typeof m[key] !== 'number' || typeof out !== 'number') continue
    tiers.push({
      threshold: Number(match[1]) * 1000,
      pricingPrompt: m[key],
      pricingCompletion: out,
    })
  }
  return tiers.sort((a, b) => a.threshold - b.threshold)[0]
}

export function fromLitellm(all, litellmProvider, accept) {
  const out = {}
  for (const [id, m] of Object.entries(all)) {
    if (!m || typeof m !== 'object') continue
    if (m.litellm_provider !== litellmProvider || m.mode !== 'chat') continue
    if (m.input_cost_per_token == null || m.output_cost_per_token == null) continue
    if (!accept(id, m)) continue
    const longContext = litellmLongContext(m)
    out[id] = {
      pricingPrompt: m.input_cost_per_token,
      pricingCompletion: m.output_cost_per_token,
      ...(m.max_input_tokens ? { contextLength: m.max_input_tokens } : {}),
      ...(longContext ? { longContext } : {}),
    }
  }
  return out
}
