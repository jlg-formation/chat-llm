import { describe, it, expect } from 'vitest'
import { DEFAULT_CONFIG } from '@/types'
import type { AppConfig } from '@/types'
import {
  buildSequentialPrompt,
  parseRunSubAgentsArgs,
  resolveSubAgentTarget,
  runSubAgents,
  subAgentTools,
  SUBAGENT_MAX_TASKS,
} from '@/services/subAgents'

function cfg(overrides: Partial<AppConfig['llm']> = {}, extra: Partial<AppConfig> = {}): AppConfig {
  return {
    ...DEFAULT_CONFIG,
    subAgentsEnabled: true,
    llm: { ...DEFAULT_CONFIG.llm, ...overrides },
    ...extra,
  }
}

describe('parseRunSubAgentsArgs', () => {
  it('accepte une liste de tâches valide avec mode par défaut parallel', () => {
    const r = parseRunSubAgentsArgs({ tasks: [{ prompt: 'a' }, { prompt: 'b', model: 'x' }] })
    expect(r).toEqual({
      mode: 'parallel',
      tasks: [
        { prompt: 'a', provider: undefined, model: undefined },
        { prompt: 'b', provider: undefined, model: 'x' },
      ],
    })
  })

  it('refuse tasks vide, trop long, prompt manquant ou mode invalide', () => {
    expect(typeof parseRunSubAgentsArgs({ tasks: [] })).toBe('string')
    expect(
      typeof parseRunSubAgentsArgs({
        tasks: Array.from({ length: SUBAGENT_MAX_TASKS + 1 }, () => ({ prompt: 'p' })),
      }),
    ).toBe('string')
    expect(typeof parseRunSubAgentsArgs({ tasks: [{ prompt: '  ' }] })).toBe('string')
    expect(typeof parseRunSubAgentsArgs({ mode: 'x', tasks: [{ prompt: 'p' }] })).toBe('string')
    expect(typeof parseRunSubAgentsArgs({ tasks: [{ prompt: 'p', provider: 'inconnu' }] })).toBe(
      'string',
    )
  })
})

describe('resolveSubAgentTarget', () => {
  it('reprend modèle et format du parent quand le provider ne change pas', () => {
    const config = cfg({ provider: 'openai', model: 'gpt-x', apiFormat: 'chat_completions' })
    expect(resolveSubAgentTarget({ prompt: 'p' }, config)).toMatchObject({
      provider: 'openai',
      model: 'gpt-x',
      apiFormat: 'chat_completions',
    })
  })

  it('utilise le format par défaut du provider demandé', () => {
    const config = cfg({ provider: 'openai', model: 'gpt-x', apiFormat: 'responses' })
    expect(resolveSubAgentTarget({ prompt: 'p', provider: 'anthropic' }, config)).toMatchObject({
      provider: 'anthropic',
      apiFormat: 'anthropic_messages',
    })
  })

  it('refuse lmstudio et ollama', () => {
    const config = cfg({ provider: 'openai' })
    expect(typeof resolveSubAgentTarget({ prompt: 'p', provider: 'lmstudio' }, config)).toBe(
      'string',
    )
    expect(typeof resolveSubAgentTarget({ prompt: 'p', provider: 'ollama' }, config)).toBe('string')
  })
})

describe('subAgentTools', () => {
  it('ne déclare rien quand le sous-agent est désactivé', () => {
    const config = cfg({ provider: 'openai', apiFormat: 'responses' }, { subAgentsEnabled: false })
    expect(subAgentTools(config, 'responses')).toEqual([])
  })

  it('déclare run_subagents dans la forme du format courant uniquement', () => {
    const config = cfg({ provider: 'openai', apiFormat: 'responses' })
    const [tool] = subAgentTools(config, 'responses') as Array<{ name: string }>
    expect(tool.name).toBe('run_subagents')
    expect(subAgentTools(config, 'chat_completions')).toEqual([])
  })

  it('utilise la forme Chat Completions (function) et Anthropic (input_schema)', () => {
    const cc = cfg({ provider: 'mistral', apiFormat: 'chat_completions' })
    const [ccTool] = subAgentTools(cc, 'chat_completions') as Array<{ function: { name: string } }>
    expect(ccTool.function.name).toBe('run_subagents')

    const an = cfg({ provider: 'anthropic', apiFormat: 'anthropic_messages' })
    const [anTool] = subAgentTools(an, 'anthropic_messages') as Array<{ input_schema: unknown }>
    expect(anTool.input_schema).toBeDefined()
  })
})

describe('buildSequentialPrompt', () => {
  it("ajoute le résultat précédent ou l'erreur", () => {
    expect(buildSequentialPrompt('suite')).toBe('suite')
    const ok = buildSequentialPrompt('suite', {
      index: 0,
      provider: 'openai',
      model: 'm',
      status: 'ok',
      content: 'R',
    })
    expect(ok).toContain('R')
    expect(ok).toContain('suite')
    const ko = buildSequentialPrompt('suite', {
      index: 0,
      provider: 'openai',
      model: 'm',
      status: 'error',
      error: 'boom',
    })
    expect(ko).toContain('boom')
  })
})

describe('runSubAgents', () => {
  const config = cfg({ provider: 'openai', model: 'gpt-x', apiFormat: 'responses' })

  it('exécute en parallèle et isole les erreurs par tâche', async () => {
    const args = parseRunSubAgentsArgs({
      tasks: [{ prompt: 'ok' }, { prompt: 'ko' }, { prompt: 'x', provider: 'ollama' }],
    })
    if (typeof args === 'string') throw new Error(args)
    const results = await runSubAgents(
      args,
      config,
      async (_c, prompt) => {
        if (prompt === 'ko') throw new Error('boom')
        return `echo:${prompt}`
      },
      new AbortController().signal,
    )
    expect(results[0]).toMatchObject({ index: 0, status: 'ok', content: 'echo:ok' })
    expect(results[1]).toMatchObject({ index: 1, status: 'error', error: 'boom' })
    expect(results[2]).toMatchObject({ index: 2, status: 'error' })
  })

  it('exécute en séquence et transmet le résultat précédent', async () => {
    const args = parseRunSubAgentsArgs({
      mode: 'sequential',
      tasks: [{ prompt: 'A' }, { prompt: 'B' }],
    })
    if (typeof args === 'string') throw new Error(args)
    const seen: string[] = []
    const results = await runSubAgents(
      args,
      config,
      async (_c, prompt) => {
        seen.push(prompt)
        return prompt === 'A' ? 'RA' : 'RB'
      },
      new AbortController().signal,
    )
    expect(seen[1]).toContain('RA')
    expect(results.map((r) => r.content)).toEqual(['RA', 'RB'])
  })

  it('passe un sous-agent sans prompt système ni sortie structurée', async () => {
    const args = parseRunSubAgentsArgs({ tasks: [{ prompt: 'p' }] })
    if (typeof args === 'string') throw new Error(args)
    let received: AppConfig | undefined
    await runSubAgents(
      args,
      { ...cfg({ provider: 'openai', apiFormat: 'responses' }), jsonSchema: '{}' },
      async (c) => {
        received = c
        return ''
      },
      new AbortController().signal,
    )
    expect(received?.subAgentsEnabled).toBe(false)
    expect(received?.jsonSchema).toBe('')
    expect(received?.llm.showThinking).toBe(false)
  })
})
