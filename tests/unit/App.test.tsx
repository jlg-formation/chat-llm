import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from '@/App'

describe('App', () => {
  it('renders the header, the three panels and the footer', () => {
    render(<App />)
    expect(screen.getByText('Conversation')).toBeInTheDocument()
    expect(screen.getByRole('link')).toHaveAttribute('target', '_blank')
    expect(screen.getByText('Serveurs MCP')).toBeInTheDocument()
  })
})
