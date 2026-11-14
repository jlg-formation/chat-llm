import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Footer } from './Footer'

describe('Footer', () => {
  it('renders the privacy statement', () => {
    render(<Footer />)
    expect(screen.getByRole('contentinfo')).toHaveTextContent('aucune donnée transmise à des tiers')
  })
})
