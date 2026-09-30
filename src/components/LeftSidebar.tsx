import { Settings, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { ProviderSection } from './sidebar/ProviderSection'
import { StreamSection } from './sidebar/StreamSection'
import { SystemPromptSection } from './sidebar/SystemPromptSection'
import { JsonSchemaSection } from './sidebar/JsonSchemaSection'
import { SkillsSection } from './sidebar/SkillsSection'
import { McpSection } from './sidebar/McpSection'
import { SamplingSection } from './sidebar/SamplingSection'
import { UsageSection } from './sidebar/UsageSection'
import { getConfig, updateConfig } from '../store/configStore'
import { clearSkills } from '../store/skillsStore'
import { disconnectMcp } from '../services/mcp'
import { DEFAULT_CONFIG } from '../types'

async function resetAll() {
  const activeServers = getConfig().mcpServers.filter(s => s.enabled && s.url)
  await Promise.allSettled(activeServers.map(s => disconnectMcp(s.url)))
  localStorage.clear()
  await clearSkills()
  updateConfig(DEFAULT_CONFIG)
}

export function LeftSidebar() {
  const [confirming, setConfirming] = useState(false)
  const [resetKey, setResetKey] = useState(0)

  async function handleReset() {
    if (!confirming) {
      setConfirming(true)
      setTimeout(() => setConfirming(false), 3000)
      return
    }
    setConfirming(false)
    await resetAll()
    setResetKey(k => k + 1)
  }

  return (
    <aside className="w-72 shrink-0 bg-white border-r border-gray-200 overflow-y-auto flex flex-col">
      <div className="flex items-center gap-2 px-4 h-10 shrink-0 border-b border-gray-200 bg-gray-50">
        <Settings className="w-4 h-4 text-gray-500" />
        <span className="text-sm font-semibold text-gray-700 flex-1">Configuration</span>
        <button
          onClick={handleReset}
          title="Réinitialiser toute la configuration"
          aria-label="Réinitialiser toute la configuration"
          className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${
            confirming
              ? 'bg-red-500 text-white hover:bg-red-600'
              : 'text-gray-400 hover:text-red-500 hover:bg-red-50'
          }`}
        >
          <RotateCcw className="w-3 h-3" />
          {confirming ? 'Confirmer ?' : 'Reset'}
        </button>
      </div>
      <ProviderSection />
      <StreamSection />
      <SamplingSection />
      <SystemPromptSection />
      <JsonSchemaSection />
      <SkillsSection key={`skills-${resetKey}`} />
      <McpSection key={`mcp-${resetKey}`} />
      <UsageSection />
    </aside>
  )
}
