#!/usr/bin/env node
/**
 * Lighthouse CI — échoue si un score descend sous les seuils définis.
 * Usage : node scripts/lighthouse-ci.js [url]
 * Exemple : node scripts/lighthouse-ci.js http://localhost:5173/chat-llm/
 */

import { launch } from 'chrome-launcher'
import lighthouse from 'lighthouse'

const THRESHOLDS = {
  accessibility: 100,
  'best-practices': 100,
  seo: 100,
  performance: 50, // seuil bas : en dev le score est ~54, en prod ~90+
}

const url = process.argv[2] ?? 'http://localhost:5173/chat-llm/'

console.log(`\nLighthouse CI — ${url}\n`)

const chrome = await launch({ chromeFlags: ['--headless', '--no-sandbox'] })

let lhr
try {
  const result = await lighthouse(url, {
    port: chrome.port,
    onlyCategories: Object.keys(THRESHOLDS),
    output: 'json',
  })
  lhr = result.lhr
} finally {
  await chrome.kill()
}

let failed = false
for (const [category, threshold] of Object.entries(THRESHOLDS)) {
  const score = Math.round((lhr.categories[category]?.score ?? 0) * 100)
  const ok = score >= threshold
  const icon = ok ? '✅' : '❌'
  console.log(`${icon}  ${category.padEnd(16)} ${score} / ${threshold}`)
  if (!ok) failed = true
}

console.log()
if (failed) {
  console.error('Lighthouse CI : scores insuffisants — voir détails ci-dessus.')
  process.exit(1)
} else {
  console.log('Lighthouse CI : tous les seuils sont atteints.')
}
