import localforage from 'localforage'
import JSZip from 'jszip'
import type { Skill } from '../types'

const store = localforage.createInstance({ name: 'chat_pedagogique', storeName: 'skills' })

export async function loadSkills(): Promise<Skill[]> {
  const keys = await store.keys()
  const skills: Skill[] = []
  for (const key of keys) {
    const skill = await store.getItem<Skill>(key)
    if (skill) skills.push(skill)
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name))
}

export async function importSkillFromZip(file: File): Promise<Skill> {
  const zip = await JSZip.loadAsync(file)
  const files: Record<string, string> = {}
  let skillName = ''

  for (const [path, zipEntry] of Object.entries(zip.files)) {
    if (zipEntry.dir) {
      const parts = path.split('/')
      if (parts.length === 2 && parts[1] === '') {
        skillName = parts[0]
      }
      continue
    }
    const content = await zipEntry.async('string')
    files[path] = content
  }

  if (!skillName) {
    const firstPath = Object.keys(files)[0]
    skillName = firstPath?.split('/')[0] ?? 'skill'
  }

  const skill: Skill = {
    id: `skill_${Date.now()}`,
    name: skillName,
    enabled: true,
    files,
  }

  await store.setItem(skill.id, skill)
  return skill
}

export async function updateSkill(skill: Skill): Promise<void> {
  await store.setItem(skill.id, skill)
}

export async function deleteSkill(id: string): Promise<void> {
  await store.removeItem(id)
}

export function getSkillContent(skill: Skill): string {
  const mainKey = Object.keys(skill.files).find(k =>
    k.toLowerCase().endsWith('skill.md')
  )
  if (mainKey) return skill.files[mainKey]
  const firstMd = Object.keys(skill.files).find(k => k.endsWith('.md'))
  if (firstMd) return skill.files[firstMd]
  return ''
}
