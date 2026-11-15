import { describe, expect, it } from 'vitest'
import { parseNonStreamingResponse } from '@/services/llm/parsers'
import { collectGeneratedImages, truncateLargeStrings } from '@/services/llm/parsersImages'

describe('collectGeneratedImages', () => {
  it('extrait les images image_generation_call en data URL', () => {
    const images = collectGeneratedImages([
      { type: 'message', content: [] },
      {
        type: 'image_generation_call',
        id: 'ig_1',
        status: 'completed',
        result: 'QUJD',
      },
    ])
    expect(images).toEqual([{ dataUrl: 'data:image/png;base64,QUJD', mimeType: 'image/png' }])
  })

  it('respecte output_format quand il est fourni', () => {
    const images = collectGeneratedImages([
      { type: 'image_generation_call', result: 'QUJD', output_format: 'webp' },
    ])
    expect(images[0]?.mimeType).toBe('image/webp')
    expect(images[0]?.dataUrl.startsWith('data:image/webp;base64,')).toBe(true)
  })

  it('ignore les appels sans résultat et les undefined', () => {
    expect(
      collectGeneratedImages([{ type: 'image_generation_call', status: 'generating' }]),
    ).toEqual([])
    expect(collectGeneratedImages(undefined)).toEqual([])
  })
})

describe('truncateLargeStrings', () => {
  it('remplace les base64 volumineux et garde le reste intact', () => {
    const big = 'A'.repeat(500)
    const out = truncateLargeStrings({
      result: big,
      text: 'bonjour',
      list: [big],
    }) as Record<string, unknown>
    expect(out.result).toBe('[base64 tronqué, 500 car.]')
    expect(out.text).toBe('bonjour')
    expect(out.list).toEqual(['[base64 tronqué, 500 car.]'])
  })

  it('ne touche pas aux chaînes non base64 longues', () => {
    const text = 'Phrase avec espaces. '.repeat(20)
    expect(truncateLargeStrings(text)).toBe(text)
  })
})

describe('parseNonStreamingResponse with generated images', () => {
  it('remonte les images et les tokens image dans le résultat', () => {
    const result = parseNonStreamingResponse(
      {
        id: 'resp_1',
        output: [
          { type: 'image_generation_call', result: 'QUJD' },
          {
            type: 'message',
            content: [{ type: 'output_text', text: 'Voici.' }],
          },
        ],
        usage: {
          input_tokens: 10,
          output_tokens: 1200,
        },
        tool_usage: {
          image_gen: { output_tokens_details: { image_tokens: 1000 } },
        },
      },
      true,
      false,
    )
    expect(result.type).toBe('text')
    expect(result.hosted?.images).toEqual([
      { dataUrl: 'data:image/png;base64,QUJD', mimeType: 'image/png' },
    ])
    expect(result.usage).toEqual({
      promptTokens: 10,
      completionTokens: 1200,
      imageOutputTokens: 1000,
    })
  })

  it("n'ajoute pas imageOutputTokens si le détail est absent", () => {
    const result = parseNonStreamingResponse(
      {
        id: 'resp_2',
        output: [],
        usage: { input_tokens: 1, output_tokens: 2 },
      },
      true,
      false,
    )
    expect(result.usage).toEqual({ promptTokens: 1, completionTokens: 2 })
  })
})
