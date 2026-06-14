import { useEffect, useRef, useState } from 'react'
import { Zap, Upload, Trash2 } from 'lucide-react'
import { Toggle } from './Toggle'
import { Accordion } from './Accordion'
import type { Skill } from '../../types'
import { loadSkills, importSkillFromZip, updateSkill, deleteSkill } from '../../store/skillsStore'

export function SkillsSection() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function refresh() {
    setSkills(await loadSkills())
  }

  useEffect(() => { loadSkills().then(setSkills) }, [])

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    try {
      await importSkillFromZip(file)
      await refresh()
    } catch (err) {
      setError(`Erreur import : ${(err as Error).message}`)
    } finally {
      e.target.value = ''
    }
  }

  async function toggleSkill(skill: Skill) {
    const updated = { ...skill, enabled: !skill.enabled }
    await updateSkill(updated)
    await refresh()
  }

  async function removeSkill(id: string) {
    await deleteSkill(id)
    await refresh()
  }

  return (
    <Accordion title="Skills" icon={<Zap className="w-4 h-4 text-yellow-500" />}>
      <div className="space-y-3">
        <input ref={fileRef} type="file" accept=".zip" className="hidden" onChange={handleImport} />
        <button
          onClick={() => fileRef.current?.click()}
          className="w-full flex items-center justify-center gap-2 text-sm border border-dashed border-blue-400 text-blue-600 rounded-md py-2 hover:bg-blue-50 transition-colors"
        >
          <Upload className="w-4 h-4" />
          Charger un skill (.zip)
        </button>

        {error && <p className="text-xs text-red-500">{error}</p>}

        {skills.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-2">Aucun skill chargé</p>
        )}

        <div className="space-y-2">
          {skills.map(skill => (
            <div
              key={skill.id}
              className={`flex items-center gap-2 p-2 rounded-md border ${
                skill.enabled ? 'border-yellow-200 bg-yellow-50' : 'border-gray-200 bg-gray-50'
              }`}
            >
              <span className="flex-1 text-sm font-medium text-gray-700 truncate">{skill.name}</span>
              <Toggle checked={skill.enabled} onChange={() => toggleSkill(skill)} color="yellow" />
              <button
                onClick={() => removeSkill(skill.id)}
                className="text-gray-300 hover:text-red-500 transition-colors"
                title="Supprimer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        <p className="text-xs text-gray-500">
          Les skills activés sont injectés dans le prompt système selon la spec{' '}
          <a href="https://agentskills.io" target="_blank" rel="noopener noreferrer" className="underline">agentskills.io</a>.
        </p>
      </div>
    </Accordion>
  )
}
