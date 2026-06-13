interface ToggleProps {
  checked: boolean
  onChange: () => void
  color?: 'teal' | 'yellow'
  size?: 'sm' | 'md'
}

export function Toggle({ checked, onChange, color = 'teal', size = 'md' }: ToggleProps) {
  const track = size === 'md'
    ? 'w-10 h-6'
    : 'w-7 h-4'
  const thumb = size === 'md'
    ? 'w-4 h-4 top-1 left-1 peer-checked:translate-x-4'
    : 'w-2.5 h-2.5 top-[3px] left-[3px] peer-checked:translate-x-3'
  const bg = color === 'teal'
    ? 'peer-checked:bg-teal-500'
    : 'peer-checked:bg-yellow-500'

  return (
    <label className="relative inline-flex items-center cursor-pointer">
      <input type="checkbox" className="sr-only peer" checked={checked} onChange={onChange} />
      <div className={`${track} ${bg} bg-gray-300 rounded-full transition-colors duration-200`} />
      <div className={`absolute ${thumb} bg-white rounded-full shadow transition-transform duration-200`} />
    </label>
  )
}
