import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchModels } from '@/services/models'
import { getStaticPricing, getDefaultAnthropicModels } from '@/services/pricing'
import { jsonResponse } from '../fixtures'

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
})

describe('fetchModels for Anthropic', () => {
  it('calls /v1/models with the Anthropic headers', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [{ id: 'claude-haiku-5-5' }] }))
    expect(await fetchModels('anthropic', 'https://api.anthropic.com/', 'sk-ant')).toEqual([
      { id: 'claude-haiku-5-5' },
    ])
    expect(fetchMock).toHaveBeenCalledWith('https://api.anthropic.com/v1/models?limit=1000', {
      headers: {
        'x-api-key': 'sk-ant',
        'anthropic-version': '2026-10-21',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
    })
  })

  it('sends no auth headers without a key and tolerates an empty payload', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}))
    expect(await fetchModels('anthropic', 'http://a', '')).toEqual([])
    expect(fetchMock).toHaveBeenCalledWith('http://a/v1/models?limit=1000', {
      headers: {},
    })
  })

  it('throws on HTTP errors', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 401 }))
    await expect(fetchModels('anthropic', 'http://a', 'k')).rejects.toThrow('HTTP 401')
  })
})

describe('Anthropic pricing', () => {
  it('prices the four fallback models, cheapest first', () => {
    const models = getDefaultAnthropicModels()
    expect(models.map((m) => m.id)).toEqual([
      'claude-haiku-5-5',
      'claude-sonnet-5-5',
      'claude-opus-5-5',
      'claude-fable-5-2',
    ])
    const perMtok = models.map((m) => [m.pricingPrompt! * 1e6, m.pricingCompletion! * 1e6])
    const expected = [
      [0.1, 0.5],
      [2, 10],
      [4, 20],
      [8, 40],
    ]
    perMtok.forEach(([p, c], i) => {
      expect(p).toBeCloseTo(expected[i][0])
      expect(c).toBeCloseTo(expected[i][1])
    })
  })

  it('exposes the long-context tier of Haiku only', () => {
    expect(getStaticPricing('claude-haiku-5-5')?.longContext).toEqual({
      threshold: 100000,
      pricingPrompt: 5e-7,
      pricingCompletion: 0.0000025,
    })
    expect(getStaticPricing('claude-opus-5-5')?.longContext).toBeUndefined()
  })

  it('resolves dated variants and ignores unknown Claude models', () => {
    expect(getStaticPricing('claude-sonnet-5-5-20261001')?.pricingPrompt).toBe(0.000002)
    expect(getStaticPricing('claude-inconnu')).toBeUndefined()
  })
})
