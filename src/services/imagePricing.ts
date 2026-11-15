import openaiImagePricing from '../data/openai-image-pricing.json'

export interface ImagePricing {
  textInputPerMillion: number
  imageInputPerMillion: number
  imageOutputPerMillion: number
}

const IMAGE_PRICING = (openaiImagePricing as { models: Record<string, ImagePricing> }).models

/** Tarifs par million de tokens ; undefined si le modèle n'est pas tarifé. */
export function getImagePricing(model: string): ImagePricing | undefined {
  return IMAGE_PRICING[model]
}

/** Coût estimé des tokens de sortie image ; undefined si le prix ou la répartition des tokens manque. */
export function estimateImageCost(
  model: string,
  imageOutputTokens: number | undefined,
): number | undefined {
  const price = IMAGE_PRICING[model]?.imageOutputPerMillion
  if (price === undefined || imageOutputTokens === undefined) return undefined
  return (imageOutputTokens * price) / 1_000_000
}
