import { useRef, useState, useEffect, type KeyboardEvent, type ClipboardEvent } from 'react'
import { Send, Square, Plus, X } from 'lucide-react'
import type { MessageImage } from '../../types'

interface Props {
  onSend: (text: string, images: MessageImage[]) => void
  onStop?: () => void
  disabled?: boolean
}

export function ChatInput({ onSend, onStop, disabled }: Props) {
  const [text, setText] = useState('')
  const [images, setImages] = useState<MessageImage[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`
    }
  }, [text])

  useEffect(() => {
    if (!disabled) textareaRef.current?.focus()
  }, [disabled])

  function handleSend() {
    if (!text.trim() && images.length === 0) return
    onSend(text.trim(), images)
    setText('')
    setImages([])
  }

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  async function addImageFile(file: File) {
    if (!file.type.startsWith('image/')) return
    const dataUrl = await readFileAsDataUrl(file)
    setImages(imgs => [...imgs, { dataUrl, mimeType: file.type }])
  }

  function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  async function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    for (const f of files) await addImageFile(f)
    e.target.value = ''
  }

  async function handlePaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const items = Array.from(e.clipboardData.items)
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) await addImageFile(file)
      }
    }
  }

  function removeImage(i: number) {
    setImages(imgs => imgs.filter((_, idx) => idx !== i))
  }

  return (
    <div className="border-t border-gray-200 bg-white px-4 py-3">
      {images.length > 0 && (
        <div className="flex gap-2 flex-wrap mb-2">
          {images.map((img, i) => (
            <div key={i} className="relative">
              <img src={img.dataUrl} alt={`Image jointe ${i + 1}`} className="h-16 w-16 object-cover rounded-md border border-gray-200" />
              <button
                onClick={() => removeImage(i)}
                aria-label={`Supprimer l'image ${i + 1}`}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center"
              >
                <X className="w-2.5 h-2.5" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          multiple
          className="hidden"
          onChange={handleFileInput}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={disabled}
          className="p-2 rounded-md text-gray-500 hover:bg-gray-100 transition-colors disabled:opacity-40 shrink-0"
          aria-label="Ajouter une image"
        >
          <Plus className="w-5 h-5" aria-hidden="true" />
        </button>

        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKey}
          onPaste={handlePaste}
          disabled={disabled}
          rows={1}
          aria-label="Message"
          className="flex-1 resize-none border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 leading-snug"
          placeholder="Écrivez votre message... (Entrée pour envoyer, Maj+Entrée pour saut de ligne)"
          style={{ minHeight: '42px' }}
        />

        {disabled && onStop ? (
          <button
            onClick={onStop}
            className="p-2.5 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors shrink-0"
            aria-label="Arrêter la génération"
          >
            <Square className="w-4 h-4 fill-current" aria-hidden="true" />
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={disabled || (!text.trim() && images.length === 0)}
            className="p-2.5 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            aria-label="Envoyer"
          >
            <Send className="w-4 h-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  )
}
