import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { JsonTree } from '@/components/JsonTree'

describe('JsonTree', () => {
  it('renders primitive values with their type', () => {
    render(<JsonTree value={{ a: 1, b: 'x', c: true, d: null }} />)
    expect(screen.getByText('"a"')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('"x"')).toBeInTheDocument()
    expect(screen.getByText('true')).toBeInTheDocument()
    expect(screen.getByText('null')).toBeInTheDocument()
  })

  it('renders undefined and other values as text', () => {
    render(<JsonTree value={undefined} />)
    expect(screen.getByText('undefined')).toBeInTheDocument()
  })

  it('parses JSON strings', () => {
    render(<JsonTree value={'{"k":[1,2]}'} />)
    expect(screen.getByText('"k"')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('keeps non-JSON strings as plain strings', () => {
    render(<JsonTree value="pas du json" />)
    expect(screen.getByText('"pas du json"')).toBeInTheDocument()
  })

  it('renders empty arrays and objects', () => {
    render(<JsonTree value={{ list: [], obj: {} }} />)
    expect(screen.getByText('[]')).toBeInTheDocument()
    expect(screen.getByText('{}')).toBeInTheDocument()
  })

  it('collapses and expands arrays', () => {
    render(<JsonTree value={[10, 20]} />)
    expect(screen.getByText('20')).toBeInTheDocument()
    fireEvent.click(document.querySelector('button')!)
    expect(screen.queryByText('20')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('2…]'))
    expect(screen.getByText('20')).toBeInTheDocument()
  })

  it('collapses and expands objects', () => {
    render(<JsonTree value={{ a: 1 }} />)
    expect(screen.getByText('"a"')).toBeInTheDocument()
    fireEvent.click(document.querySelector('button')!)
    expect(screen.queryByText('"a"')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('…}'))
    expect(screen.getByText('"a"')).toBeInTheDocument()
  })
})
