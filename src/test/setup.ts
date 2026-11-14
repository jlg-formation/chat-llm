import '@testing-library/jest-dom/vitest'
import { afterEach, beforeAll } from 'vitest'
import { cleanup } from '@testing-library/react'

beforeAll(() => {
  // jsdom n'implémente pas scrollIntoView (utilisé par Chat et RightSidebar)
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {}
  }
})

afterEach(() => {
  cleanup()
  localStorage.clear()
})
