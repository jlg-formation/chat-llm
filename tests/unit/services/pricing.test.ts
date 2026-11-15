import { describe, it, expect } from 'vitest'
import pricing from '@/data/openai-pricing.json'
import { getStaticPricing, getDefaultOpenAiModels } from '@/services/pricing'

const table = pricing as Record<
  string,
  { pricingPrompt?: number; pricingCompletion?: number; contextLength?: number }
>
const someKey = Object.keys(table)[0]

describe('getStaticPricing', () => {
  it('returns the entry for an exact model id', () => {
    expect(getStaticPricing(someKey)).toEqual(table[someKey])
  })

  it('falls back to the longest known prefix for dated variants', () => {
    expect(getStaticPricing(`${someKey}-2099-01-01`)).toEqual(table[someKey])
  })

  it('returns undefined for unknown models', () => {
    expect(getStaticPricing('unknown-model-xyz')).toBeUndefined()
  })
})

describe('getDefaultOpenAiModels', () => {
  it('lists default OpenAI models with their pricing when known', () => {
    const models = getDefaultOpenAiModels()
    expect(models.length).toBeGreaterThan(0)
    expect(models[0]).toHaveProperty('id')
    expect(models.every((m) => typeof m.id === 'string')).toBe(true)
  })
})
