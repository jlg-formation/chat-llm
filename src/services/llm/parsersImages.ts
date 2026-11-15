import type { MessageImage } from '../../types'

/** Images de l'outil image_generation : `result` contient le base64 de `image_generation_call`. */
export function collectGeneratedImages(output: unknown[] | undefined): MessageImage[] {
  const images: MessageImage[] = []
  for (const item of output ?? []) {
    const it = item as Record<string, unknown>
    if (it.type !== 'image_generation_call' || typeof it.result !== 'string') continue
    const format = typeof it.output_format === 'string' ? it.output_format : 'png'
    images.push({
      dataUrl: `data:image/${format};base64,${it.result}`,
      mimeType: `image/${format}`,
    })
  }
  return images
}

const LARGE_STRING_MIN = 200
const BASE64_RE = /^[A-Za-z0-9+/=]+$/

/** Copie d'un objet JSON où les chaînes base64 volumineuses sont remplacées par un marqueur. */
export function truncateLargeStrings(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.length > LARGE_STRING_MIN && BASE64_RE.test(value)
      ? `[base64 tronqué, ${value.length} car.]`
      : value
  }
  if (Array.isArray(value)) return value.map(truncateLargeStrings)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, truncateLargeStrings(v)]))
  }
  return value
}
