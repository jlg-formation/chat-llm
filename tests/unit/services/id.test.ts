import { describe, it, expect } from 'vitest'
import { genId } from '@/services/id'

describe('genId', () => {
  it('returns a non-empty string', () => {
    expect(genId().length).toBeGreaterThan(0)
  })
})
