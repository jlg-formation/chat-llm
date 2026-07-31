#!/usr/bin/env node
/**
 * Génère src/data/openai-pricing.json à partir de la base de prix LiteLLM.
 * L'API OpenAI /v1/models ne renvoie pas les tarifs : on les récupère ici, une
 * fois de temps en temps, et on fige le résultat dans le repo.
 * Usage : bun run pricing  (ou : node scripts/fetch-pricing.mjs)
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";

const OUT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../src/data/openai-pricing.json",
);

console.log(`\nRécupération des prix OpenAI depuis LiteLLM…\n${SOURCE}\n`);

const res = await fetch(SOURCE);
if (!res.ok) {
  console.error(`Échec du téléchargement : HTTP ${res.status}`);
  process.exit(1);
}
const all = await res.json();

const out = {};
for (const [id, m] of Object.entries(all)) {
  if (!m || typeof m !== "object") continue;
  if (m.litellm_provider !== "openai") continue;
  if (m.mode !== "chat") continue;
  if (m.input_cost_per_token == null || m.output_cost_per_token == null)
    continue;

  out[id] = {
    pricingPrompt: m.input_cost_per_token,
    pricingCompletion: m.output_cost_per_token,
    ...(m.max_input_tokens ? { contextLength: m.max_input_tokens } : {}),
  };
}

const sorted = Object.fromEntries(
  Object.entries(out).sort(([a], [b]) => a.localeCompare(b)),
);
const count = Object.keys(sorted).length;
if (count === 0) {
  console.error(
    "Aucun modèle OpenAI trouvé — schéma source modifié ? Abandon.",
  );
  process.exit(1);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(sorted, null, 2) + "\n");

console.log(`✅ ${count} modèles OpenAI écrits dans ${OUT}`);
