import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import JSZip from 'jszip'
import { SkillsSection } from '@/components/sidebar/SkillsSection'
import { clearSkills, updateSkill, loadSkills } from '@/store/skillsStore'

const user = userEvent.setup()

// L'accordéon « Skills » est fermé par défaut
async function renderOpen() {
  const result = render(<SkillsSection />)
  await user.click(screen.getByRole('button', { name: 'Skills' }))
  return result
}

beforeEach(async () => {
  await clearSkills()
})

describe('SkillsSection', () => {
  it('shows an empty state without skills', async () => {
    await renderOpen()
    expect(await screen.findByText('Aucun skill chargé')).toBeInTheDocument()
  })

  it('lists stored skills and toggles them', async () => {
    await updateSkill({ id: 'k1', name: 'pdf', enabled: true, files: {} } as never)
    await renderOpen()
    expect(await screen.findByText('pdf')).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox'))
    await waitFor(async () => {
      const skills = await loadSkills()
      expect(skills[0].enabled).toBe(false)
    })
  })

  it('deletes a skill', async () => {
    await updateSkill({ id: 'k1', name: 'pdf', enabled: true, files: {} } as never)
    await renderOpen()
    await screen.findByText('pdf')
    await user.click(screen.getByTitle('Supprimer'))
    expect(await screen.findByText('Aucun skill chargé')).toBeInTheDocument()
  })

  it('imports a skill from a valid ZIP archive', async () => {
    const zip = new JSZip()
    zip.file('demo/SKILL.md', '---\nname: demo\ndescription: Démo\n---\nContenu')
    const bytes = await zip.generateAsync({ type: 'arraybuffer' })
    const file = new File([bytes], 'demo.zip', { type: 'application/zip' })

    const { container } = await renderOpen()
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })
    expect(await screen.findByText('demo')).toBeInTheDocument()
  })

  it('shows an error when the imported file is not a valid archive', async () => {
    const { container } = await renderOpen()
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['pas un zip'], 'x.zip')] } })
    expect(await screen.findByText(/Erreur import/)).toBeInTheDocument()
  })

  it('ignores the file input when no file is selected', async () => {
    const { container } = await renderOpen()
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [] } })
    expect(screen.queryByText(/Erreur import/)).not.toBeInTheDocument()
  })

  it('opens the file picker from the upload button', async () => {
    const { container } = await renderOpen()
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    let clicked = false
    input.click = () => {
      clicked = true
    }
    await user.click(screen.getByRole('button', { name: /Charger un skill/ }))
    expect(clicked).toBe(true)
  })
})
