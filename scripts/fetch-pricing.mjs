#!/usr/bin/env node
/**
 * Génère src/data/{openai,anthropic,mistral,ovh,google}-pricing.json.
 * Sources : grilles officielles pour Anthropic, Mistral, OVH et Google (LiteLLM en complément
 * pour le contexte Anthropic) ; LiteLLM seul pour OpenAI (gpt-* non dépréciés).
 * Les résultats sont figés dans le repo : on relance ce script de temps en temps.
 * Usage : bun run pricing  (ou : node scripts/fetch-pricing.mjs)
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const LITELLM_URL =
  'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json'
const ANTHROPIC_URL = 'https://platform.claude.com/docs/en/about-claude/pricing.md'
const MISTRAL_DOCS = 'https://docs.mistral.ai'
const OVH_URL = 'https://www.ovhcloud.com/en/public-cloud/ai-endpoints/catalog/'
const GOOGLE_URL = 'https://ai.google.dev/gemini-api/docs/pricing.md.txt'

const DATA_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../src/data')

async function getText(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`)
  return res.text()
}

// « $0.15 » (USD par million de tokens) → USD par token, sans erreur d'arrondi flottant.
const perToken = (usdPerMillion) => Number(`${usdPerMillion}e-6`)

// « 1M » / « 256k » → nombre de tokens.
function parseContext(text) {
  const m = /^([\d.]+)\s*([kKmM])$/.exec(text.trim())
  if (!m) return undefined
  return Math.round(Number(m[1]) * (m[2].toLowerCase() === 'm' ? 1e6 : 1e3))
}

const acceptsText = (inputs, outputs) => inputs.includes('text') && outputs.includes('text')

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

function fromLitellm(all, litellmProvider, accept) {
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

// Anthropic : tableau « Model pricing » de la doc officielle ; l'id se déduit du nom.
async function fromAnthropic(all) {
  const md = await getText(ANTHROPIC_URL)
  const section = /## Model pricing\n([\s\S]*?)\n## /.exec(md)?.[1] ?? ''
  const out = {}
  for (const line of section.split('\n')) {
    if (!line.startsWith('| Claude ')) continue
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim())
    const [label, input, , , , output] = cells
    if (/retired/i.test(label)) continue
    const tier = /\(for prompts (up to|over) ([\d,]+) tokens\)/.exec(label)
    const name = label.replace(/\s*\(.*$/, '')
    const id = name.toLowerCase().replace(/\./g, '-').replace(/\s+/g, '-')
    const prompt = /\$([\d.]+)/.exec(input)?.[1]
    const completion = /\$([\d.]+)/.exec(output)?.[1]
    if (!prompt || !completion) continue

    if (tier?.[1] === 'over') {
      out[id] = {
        ...out[id],
        longContext: {
          threshold: Number(tier[2].replace(/,/g, '')),
          pricingPrompt: perToken(prompt),
          pricingCompletion: perToken(completion),
        },
      }
      continue
    }
    const contextLength = all[id]?.max_input_tokens
    out[id] = {
      pricingPrompt: perToken(prompt),
      pricingCompletion: perToken(completion),
      ...(contextLength ? { contextLength } : {}),
      ...out[id],
    }
  }
  return out
}

// Mistral : tableau officiel des prix (sections chat), puis fiche de chaque modèle pour
// les alias d'API (« -latest »), le contexte et les modalités.
async function fromMistral() {
  const pricing = await getText(`${MISTRAL_DOCS}/inference/pricing.md`)
  const models = []
  for (const block of pricing.split(/\n## /)) {
    if (!/^(Generalist|Code) models/.test(block)) continue
    const rowRe = /^\| \[[^\]]*\]\(\/models\/([^)]+)\) \| `([^`]*)` \| (.*?) \|$/gm
    for (const [, slug, apiName, price] of block.matchAll(rowRe)) {
      const input = /Input \$([\d.]+) \/M Tokens/.exec(price)?.[1]
      const output = /Output \$([\d.]+) \/M Tokens/.exec(price)?.[1]
      if (input && output) models.push({ slug, apiName, input, output })
    }
  }

  const out = {}
  await Promise.all(
    models.map(async ({ slug, apiName, input, output }) => {
      const page = await getText(`${MISTRAL_DOCS}/models/${slug}.md`)
      const list = (label) =>
        (new RegExp(`^- ${label}: (.*)$`, 'm').exec(page)?.[1] ?? '')
          .split(',')
          .map((s) => s.trim().replace(/`/g, ''))
          .filter(Boolean)
      if (!acceptsText(list('Input'), list('Output'))) return
      const names = new Set([apiName, ...list('API names')])
      const contextLength = parseContext(list('Context length')[0] ?? '')
      for (const name of names) {
        out[name] = {
          pricingPrompt: perToken(input),
          pricingCompletion: perToken(output),
          ...(contextLength ? { contextLength } : {}),
        }
      }
    }),
  )
  return out
}

// OVH : catalogue AI Endpoints (JSON embarqué dans la page), modèles texte → texte uniquement.
async function fromOvh() {
  const html = (await getText(OVH_URL)).replaceAll('\\"', '"')
  const out = {}
  for (const chunk of html.split('"available":').slice(1)) {
    const id = /"id":"([^"]+)"/.exec(chunk)?.[1]
    if (!/"category_v2":"Text Generation"/.test(chunk)) continue
    const list = (key) =>
      (new RegExp(`"${key}":\\[([^\\]]*)\\]`).exec(chunk)?.[1] ?? '')
        .split(',')
        .map((s) => s.replace(/"/g, '').trim())
        .filter(Boolean)
    if (!id || !acceptsText(list('input_modality'), list('output_modality'))) continue
    if (list('output_modality').some((o) => o !== 'text')) continue

    const prices = {}
    for (const [, price, unit] of chunk.matchAll(
      /"price":([\d.]+),[^}]*?"price_unit":"million_(input|output)_tokens"/g,
    ))
      prices[unit] = price
    if (!prices.input || !prices.output) continue

    const contextK = /"context_size_k":(\d+)/.exec(chunk)?.[1]
    const entry = {
      pricingPrompt: perToken(prices.input),
      pricingCompletion: perToken(prices.output),
      ...(contextK ? { contextLength: Number(contextK) * 1000 } : {}),
    }
    // L'id d'API peut être le slug du catalogue ou un alias sans préfixe d'organisation.
    const aliases = list('aliases').map((a) => a.split('/').pop())
    for (const key of new Set([id, ...aliases])) out[key] = entry
  }
  return out
}

// Google : onglet « Standard » (palier payant) des fiches texte Gemini ; la première valeur de
// chaque ligne est le prix en vigueur (les hausses datées suivent « starting … »).
const GOOGLE_NON_CHAT =
  /image|tts|live|audio|embedding|robotics|omni|decision|transcribe|translate|genie|lyria|gemma|banana|veo|imagen|aqa|computer|deep-research|learnlm|-exp-/
// Colonne payante d'une ligne du tableau (la colonne gratuite est la ligne intermédiaire).
const googleRow = (std, label) =>
  new RegExp(`\\* ${label}[^\\n]*\\n\\s*\\*[^\\n]*\\n\\s*\\* ([^\\n]*(?:\\n\\s+\\$[^\\n]*)*)`).exec(
    std,
  )?.[1] ?? ''

async function fromGoogle(all) {
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

// OpenAI : série gpt-* seulement (ni série o, ni fine-tunes), hors modèles déjà dépréciés.
const isCurrentGpt = (id, m) =>
  id.startsWith('gpt-') &&
  !(m.deprecation_date && m.deprecation_date <= new Date().toISOString().slice(0, 10))

const PROVIDERS = [
  {
    name: 'OpenAI',
    file: 'openai-pricing.json',
    build: async (all) => fromLitellm(all, 'openai', isCurrentGpt),
  },
  {
    name: 'Anthropic',
    file: 'anthropic-pricing.json',
    build: (all) => fromAnthropic(all),
  },
  { name: 'Mistral', file: 'mistral-pricing.json', build: () => fromMistral() },
  { name: 'OVH', file: 'ovh-pricing.json', build: () => fromOvh() },
  {
    name: 'Google',
    file: 'google-pricing.json',
    build: (all) => fromGoogle(all),
  },
]

console.log(`\nRécupération de LiteLLM…\n${LITELLM_URL}\n`)
let all
try {
  all = JSON.parse(await getText(LITELLM_URL))
} catch (e) {
  console.error(`Échec du téléchargement : ${e.message}`)
  process.exit(1)
}

mkdirSync(DATA_DIR, { recursive: true })
let failed = false

for (const { name, file, build } of PROVIDERS) {
  try {
    const table = await build(all)
    const sorted = Object.fromEntries(Object.entries(table).sort(([a], [b]) => a.localeCompare(b)))
    const count = Object.keys(sorted).length
    if (count === 0) throw new Error('aucun modèle trouvé — schéma source modifié ?')

    writeFileSync(resolve(DATA_DIR, file), JSON.stringify(sorted, null, 2) + '\n')
    console.log(`✅ ${count} modèles ${name} écrits dans src/data/${file}`)
  } catch (e) {
    console.error(`❌ ${name} : ${e.message} (fichier inchangé)`)
    failed = true
  }
}

if (failed) process.exit(1)
