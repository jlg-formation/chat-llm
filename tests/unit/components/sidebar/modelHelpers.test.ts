import { describe, it, expect } from 'vitest'
import { isOpenAiChatModel, isOvhChatModel } from '@/components/sidebar/modelHelpers'

describe('isOpenAiChatModel', () => {
  it('keeps text chat models and drops audio, image, search and completion-only ones', () => {
    const keep = ['gpt-6-luna', 'gpt-5.4-mini', 'gpt-4o']
    const drop = [
      'gpt-4o-audio-preview',
      'gpt-realtime',
      'gpt-image-1',
      'gpt-4o-transcribe',
      'gpt-4o-mini-tts',
      'gpt-4o-search-preview',
      'gpt-3.5-turbo-instruct',
      'o3-deep-research',
      'text-embedding-3-small',
    ]
    expect(keep.every((id) => isOpenAiChatModel({ id }))).toBe(true)
    expect(drop.some((id) => isOpenAiChatModel({ id }))).toBe(false)
  })
})

describe('isOvhChatModel', () => {
  it('drops embeddings, speech, image and guard models', () => {
    const drop = [
      'bge-m3',
      'nvr-tts-en-us',
      'whisper-large-v3',
      'stable-diffusion-xl',
      'qwen-guard-gen-8b',
    ]
    expect(drop.some((id) => isOvhChatModel({ id }))).toBe(false)
    expect(isOvhChatModel({ id: 'gpt-oss-20b' })).toBe(true)
  })
})
