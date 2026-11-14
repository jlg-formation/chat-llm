import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChatInput } from './ChatInput'

beforeEach(() => {
  // requestAnimationFrame est utilisé pour repositionner le curseur de l'historique
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0)
    return 0
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function getTextarea() {
  return screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement
}

describe('ChatInput sending', () => {
  it('disables the send button while the input is empty', () => {
    render(<ChatInput onSend={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeDisabled()
  })

  it('sends the trimmed text on Enter and clears the field', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} />)
    await user.type(getTextarea(), '  Bonjour  {Enter}')
    expect(onSend).toHaveBeenCalledWith('Bonjour', [])
    expect(getTextarea().value).toBe('')
  })

  it('sends on click of the send button', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} />)
    await user.type(getTextarea(), 'Salut')
    await user.click(screen.getByRole('button', { name: 'Envoyer' }))
    expect(onSend).toHaveBeenCalledWith('Salut', [])
  })

  it('inserts a newline on Shift+Enter without sending', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} />)
    await user.type(getTextarea(), 'a{Shift>}{Enter}{/Shift}b')
    expect(onSend).not.toHaveBeenCalled()
    expect(getTextarea().value).toBe('a\nb')
  })

  it('does not send whitespace-only input', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} />)
    await user.type(getTextarea(), '   {Enter}')
    expect(onSend).not.toHaveBeenCalled()
  })
})

describe('ChatInput history', () => {
  it('navigates previously sent messages with ArrowUp and ArrowDown', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} />)
    await user.type(getTextarea(), 'first{Enter}')
    await user.type(getTextarea(), 'second{Enter}')

    await user.keyboard('{ArrowUp}')
    expect(getTextarea().value).toBe('second')
    await user.keyboard('{ArrowUp}')
    expect(getTextarea().value).toBe('first')
    await user.keyboard('{ArrowUp}')
    expect(getTextarea().value).toBe('first')
    await user.keyboard('{ArrowDown}')
    expect(getTextarea().value).toBe('second')
    await user.keyboard('{ArrowDown}')
    expect(getTextarea().value).toBe('')
    await user.keyboard('{ArrowDown}')
    expect(getTextarea().value).toBe('')
  })

  it('keeps the draft when leaving history', async () => {
    const user = userEvent.setup()
    render(<ChatInput onSend={vi.fn()} />)
    await user.type(getTextarea(), 'old{Enter}')
    await user.type(getTextarea(), 'brouillon')
    await user.keyboard('{ArrowUp}')
    expect(getTextarea().value).toBe('old')
    await user.keyboard('{ArrowDown}')
    expect(getTextarea().value).toBe('brouillon')
  })

  it('does not navigate history when the cursor is on a line after a newline', async () => {
    const user = userEvent.setup()
    render(<ChatInput onSend={vi.fn()} />)
    await user.type(getTextarea(), 'l1{Shift>}{Enter}{/Shift}l2')
    await user.keyboard('{ArrowUp}')
    expect(getTextarea().value).toBe('l1\nl2')
  })

  it('ignores ArrowDown in multi-line text while browsing history', async () => {
    const user = userEvent.setup()
    render(<ChatInput onSend={vi.fn()} />)
    await user.type(getTextarea(), 'first{Enter}')
    await user.keyboard('{ArrowUp}')
    expect(getTextarea().value).toBe('first')
    await user.keyboard('{Shift>}{Enter}{/Shift}')
    await user.keyboard('{ArrowLeft}')
    await user.keyboard('{ArrowDown}')
    expect(getTextarea().value).toBe('first\n')
  })
})

describe('ChatInput disabled state', () => {
  it('shows a stop button while disabled and calls onStop', async () => {
    const user = userEvent.setup()
    const onStop = vi.fn()
    render(<ChatInput onSend={vi.fn()} onStop={onStop} disabled />)
    expect(getTextarea()).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Arrêter la génération' }))
    expect(onStop).toHaveBeenCalledTimes(1)
  })

  it('shows a disabled send button when disabled without onStop', () => {
    render(<ChatInput onSend={vi.fn()} disabled />)
    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeDisabled()
  })
})

describe('ChatInput images', () => {
  const pngFile = () => new File(['png-bytes'], 'photo.png', { type: 'image/png' })

  it('attaches an image from the file input and sends it', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    const { container } = render(<ChatInput onSend={onSend} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, pngFile())
    expect(await screen.findByAltText('Image jointe 1')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Envoyer' }))
    expect(onSend).toHaveBeenCalledWith('', [
      expect.objectContaining({ mimeType: 'image/png' }),
    ])
  })

  it('removes an attached image', async () => {
    const user = userEvent.setup()
    const { container } = render(<ChatInput onSend={vi.fn()} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, pngFile())
    await screen.findByAltText('Image jointe 1')
    await user.click(screen.getByRole('button', { name: "Supprimer l'image 1" }))
    expect(screen.queryByAltText('Image jointe 1')).not.toBeInTheDocument()
  })

  it('ignores non-image files selected in the file input', async () => {
    const { container } = render(<ChatInput onSend={vi.fn()} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, {
      target: { files: [new File(['texte'], 'notes.txt', { type: 'text/plain' })] },
    })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('does nothing when the file input changes without files', () => {
    const { container } = render(<ChatInput onSend={vi.fn()} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [] } })
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('opens the file picker from the add-image button', async () => {
    const user = userEvent.setup()
    const { container } = render(<ChatInput onSend={vi.fn()} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const clickSpy = vi.spyOn(input, 'click')
    await user.click(screen.getByRole('button', { name: 'Ajouter une image' }))
    expect(clickSpy).toHaveBeenCalled()
  })

  it('attaches a pasted image', async () => {
    render(<ChatInput onSend={vi.fn()} />)
    const file = pngFile()
    fireEvent.paste(getTextarea(), {
      clipboardData: { items: [{ type: 'image/png', getAsFile: () => file }] },
    })
    expect(await screen.findByAltText('Image jointe 1')).toBeInTheDocument()
  })

  it('ignores pasted items that are not images', () => {
    render(<ChatInput onSend={vi.fn()} />)
    fireEvent.paste(getTextarea(), {
      clipboardData: { items: [{ type: 'text/plain', getAsFile: () => null }] },
    })
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('ignores image paste items that provide no file', async () => {
    render(<ChatInput onSend={vi.fn()} />)
    fireEvent.paste(getTextarea(), {
      clipboardData: { items: [{ type: 'image/png', getAsFile: () => null }] },
    })
    await waitFor(() => expect(screen.queryByRole('img')).not.toBeInTheDocument())
  })
})
