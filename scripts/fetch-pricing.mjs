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
import { getText, perToken, parseContext, acceptsText, fromLitellm } from './pricing/lib.mjs'
import { fromGoogle } from './pricing/google.mjs'

const LITELLM_URL =
  'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json'
const ANTHROPIC_URL = 'https://platform.claude.com/docs/en/about-claude/pricing.md'
const MISTRAL_DOCS = 'https://docs.mistral.ai'
const OVH_URL = 'https://www.ovhcloud.com/en/public-cloud/ai-endpoints/catalog/'

const DATA_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../src/data')

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
