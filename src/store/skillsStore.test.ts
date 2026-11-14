import { describe, it, expect, vi, beforeEach } from 'vitest'
import JSZip from 'jszip'
import type { Skill } from '../types'

const db = vi.hoisted(() => new Map<string, unknown>())

vi.mock('localforage', () => {
  const instance = {
    keys: async () => [...db.keys()],
    getItem: async (key: string) => db.get(key) ?? null,
    setItem: async (key: string, value: unknown) => { db.set(key, value) },
    removeItem: async (key: string) => { db.delete(key) },
    clear: async () => { db.clear() },
  }
  return { default: { createInstance: () => instance } }
})

import {
  loadSkills, importSkillFromZip, updateSkill, deleteSkill, clearSkills,
  getSkillContent, parseSkillFrontmatter,
} from './skillsStore'

async function zipFile(entries: Record<string, string>, dirs: string[] = []): Promise<File> {
  const zip = new JSZip()
  for (const dir of dirs) zip.folder(dir)
  for (const [path, content] of Object.entries(entries)) zip.file(path, content)
  const buffer = await zip.generateAsync({ type: 'uint8array' })
  return new File([buffer], 'skill.zip', { type: 'application/zip' })
}

const skill = (overrides: Partial<Skill> = {}): Skill => ({
  id: 'id-1', name: 'demo', enabled: true, files: {}, ...overrides,
})

beforeEach(() => {
  db.clear()
})

describe('skillsStore persistence', () => {
  it('lists skills sorted by name', async () => {
    db.set('b', skill({ id: 'b', name: 'zeta' }))
    db.set('a', skill({ id: 'a', name: 'alpha' }))
    expect((await loadSkills()).map(s => s.name)).toEqual(['alpha', 'zeta'])
  })

  it('skips keys holding no value', async () => {
    db.set('ghost', null)
    expect(await loadSkills()).toEqual([])
  })

  it('updates and deletes skills and clears everything', async () => {
    await updateSkill(skill({ id: 'x', name: 'x' }))
    expect(db.get('x')).toMatchObject({ name: 'x' })
    await deleteSkill('x')
    expect(db.has('x')).toBe(false)
    db.set('y', skill({ id: 'y' }))
    await clearSkills()
    expect(db.size).toBe(0)
  })
})

describe('importSkillFromZip', () => {
  it('uses the root folder name and stores text files', async () => {
    const file = await zipFile(
      { 'pdf-tools/SKILL.md': '---\nname: pdf\n---\nBody', 'pdf-tools/scripts/run.md': 'notes' },
      ['pdf-tools/'],
    )
    const imported = await importSkillFromZip(file)
    expect(imported.name).toBe('pdf-tools')
    expect(imported.enabled).toBe(true)
    expect(Object.keys(imported.files).sort()).toEqual(['pdf-tools/SKILL.md', 'pdf-tools/scripts/run.md'])
    expect(db.get(imported.id)).toEqual(imported)
  })

  it('falls back to the first file folder when no directory entry exists', async () => {
    const imported = await importSkillFromZip(await zipFile({ 'my-skill/SKILL.md': 'content' }))
    expect(imported.name).toBe('my-skill')
  })

  it('falls back to "skill" for an empty archive', async () => {
    const imported = await importSkillFromZip(await zipFile({}))
    expect(imported.name).toBe('skill')
    expect(imported.files).toEqual({})
  })
})

describe('getSkillContent', () => {
  it('prefers SKILL.md, case-insensitively', () => {
    const s = skill({ files: { 'a/notes.md': 'n', 'a/Skill.MD': 'main' } })
    expect(getSkillContent(s)).toBe('main')
  })

  it('falls back to the first markdown file', () => {
    expect(getSkillContent(skill({ files: { 'a/readme.md': 'r' } }))).toBe('r')
  })

  it('returns an empty string without markdown', () => {
    expect(getSkillContent(skill({ files: { 'a/data.json': '{}' } }))).toBe('')
  })
})

describe('parseSkillFrontmatter', () => {
  it('extracts name and description from the frontmatter', () => {
    const s = skill({ files: { 'demo/SKILL.md': '---\nname: Demo Skill\ndescription: Does things\n---\n# Body' } })
    expect(parseSkillFrontmatter(s)).toEqual({ name: 'Demo Skill', description: 'Does things' })
  })

  it('handles CRLF line endings', () => {
    const s = skill({ files: { 'SKILL.md': '---\r\nname: crlf\r\ndescription: win\r\n---\r\n' } })
    expect(parseSkillFrontmatter(s)).toEqual({ name: 'crlf', description: 'win' })
  })

  it('uses the skill name when the frontmatter lacks fields', () => {
    const s = skill({ name: 'fallback', files: { 'SKILL.md': '---\nother: x\n---' } })
    expect(parseSkillFrontmatter(s)).toEqual({ name: 'fallback', description: '' })
  })

  it('uses the skill name when there is no frontmatter', () => {
    const s = skill({ name: 'plain', files: { 'SKILL.md': '# Title only' } })
    expect(parseSkillFrontmatter(s)).toEqual({ name: 'plain', description: '' })
  })
})
