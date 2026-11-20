import { getText, perToken, fromLitellm } from './lib.mjs'

export const GOOGLE_URL = 'https://ai.google.dev/gemini-api/docs/pricing.md.txt'

// Google : onglet « Standard » (palier payant) des fiches texte Gemini ; la première valeur de
// chaque ligne est le prix en vigueur (les hausses datées suivent « starting … »).
const GOOGLE_NON_CHAT =
  /image|tts|live|audio|embedding|robotics|omni|decision|transcribe|translate|genie|lyria|gemma|banana|veo|imagen|aqa|computer|deep-research|learnlm|-exp-/
// Colonne payante d'une ligne du tableau (la colonne gratuite est la ligne intermédiaire).
const googleRow = (std, label) =>
  new RegExp(`\\* ${label}[^\\n]*\\n\\s*\\*[^\\n]*\\n\\s*\\* ([^\\n]*(?:\\n\\s+\\$[^\\n]*)*)`).exec(
    std,
  )?.[1] ?? ''

export async function fromGoogle(all) {
  const md = await getText(GOOGLE_URL)
  const out = {}
  for (const block of md.split(/\n## /).slice(1)) {
    const id = /\{% id="([^"]+)" %\}/.exec(block.split('\n')[0])?.[1]
    if (!id || !/^gemini-/.test(id) || GOOGLE_NON_CHAT.test(id)) continue
    const start = block.indexOf('{% tab title="Standard" %}')
    if (start < 0) continue
    const rest = block.slice(start + 1)
    const end = rest.search(/\{% tab title=|\{% \/tabs %\}/)
    const std = end < 0 ? rest : rest.slice(0, end)
    const input = googleRow(std, 'Input price')
    const output = googleRow(std, 'Output price')
    const prompt = /\$([\d.]+)/.exec(input)?.[1]
    const completion = /\$([\d.]+)/.exec(output)?.[1]
    if (!prompt || !completion) continue
    const longIn = /\$([\d.]+),? prompts > 200k/.exec(input)?.[1]
    const longOut = /\$([\d.]+),? prompts > 200k/.exec(output)?.[1]
    const contextLength = all[`gemini/${id}`]?.max_input_tokens
    out[id] = {
      pricingPrompt: perToken(prompt),
      pricingCompletion: perToken(completion),
      ...(contextLength ? { contextLength } : {}),
      ...(longIn && longOut
        ? {
            longContext: {
              threshold: 200000,
              pricingPrompt: perToken(longIn),
              pricingCompletion: perToken(longOut),
            },
          }
        : {}),
    }
  }
  // Complément LiteLLM : chats absents de la page officielle (alias, versions récentes).
  const today = new Date().toISOString().slice(0, 10)
  const complement = fromLitellm(all, 'gemini', (key, m) => {
    const id = key.replace(/^gemini\//, '')
    return (
      /^gemini-/.test(id) &&
      !GOOGLE_NON_CHAT.test(id) &&
      !(m.deprecation_date && m.deprecation_date <= today)
    )
  })
  for (const [key, entry] of Object.entries(complement)) {
    const id = key.replace(/^gemini\//, '')
    if (!out[id]) out[id] = entry
  }
  return out
}
