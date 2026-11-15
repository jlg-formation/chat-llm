import { describe, expect, it } from 'vitest'
import { estimateImageCost } from '@/services/imagePricing'

describe('estimateImageCost', () => {
  it('calcule le coût des tokens image à 30 $/M pour les ids 2.6 officiels', () => {
    expect(estimateImageCost('gpt-image-2.6-flare', 1_000_000)).toBeCloseTo(30)
    expect(estimateImageCost('gpt-image-2.6-sunburst', 1000)).toBeCloseTo(0.03)
  })

  it('renvoie undefined sans répartition des tokens image', () => {
    expect(estimateImageCost('gpt-image-2.6-flare', undefined)).toBeUndefined()
  })

  it('renvoie undefined pour un modèle sans prix connu (ex. gpt-image-1.5)', () => {
    expect(estimateImageCost('gpt-image-1.5', 1000)).toBeUndefined()
  })
})
