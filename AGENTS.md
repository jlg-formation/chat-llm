# Agent Instructions: Chat Pédagogique IA

**Purpose**: Pedagogical LLM chat application (100% frontend) that exposes HTTP exchanges, SSE streaming, structured output, skills, and tool calling for developer training.

**Tech Stack**: React 19 + TypeScript + Vite + Playwright (E2E only). **Package manager: bun** (not npm).

## Quick Start

```bash
bun install              # Install deps (uses bun.lock)
bun run dev              # Dev server → http://localhost:5173/chat-llm/
bun run build            # Type-check + build → dist/
bun run lint             # oxlint check
bun run test:unit        # Vitest unit tests
bun run format           # oxfmt
bun run test             # Playwright E2E (headless)
bun run test:ui          # Playwright interactive mode
```

**Key Constraint**: `verbatimModuleSyntax: true` — all type-only imports must use `import type { ... } from '...'`.

---

## Architecture Overview

### Custom Observer Store Pattern

**No Redux, Zustand, or Context API.** Instead, 5 lightweight stores with observer subscriptions:

| Store         | Purpose                                                    | Persistence                             |
| ------------- | ---------------------------------------------------------- | --------------------------------------- |
| `configStore` | LLM config, API keys, system prompt, MCP servers, sampling | localStorage: `chat_pedagogique_config` |
| `httpStore`   | HTTP exchange log (LLM + MCP)                              | None (in-memory, cleared on reset)      |
| `skillsStore` | Skill CRUD (ZIP files)                                     | IndexedDB: `chat_pedagogique/skills`    |
| `usageStore`  | Token counter (prompt + completion)                        | None (in-memory)                        |
| `modelsStore` | Provider model lists cache                                 | None (in-memory cache)                  |

Each exposes: `getState()`, `setState()`, `useHook()` — hooks re-render on global update via listener notification.

**Migration Logic**: `configStore` auto-upgrades old formats on load (e.g., flat `mcpUrl` → `mcpServers[]`).

### LLM Service Polymorphism (5 API Formats)

The app **unifies 5 incompatible LLM APIs** behind `sendMessage()`:

| Provider      | Format                           | Endpoint                                                 | Key Trait                                                               |
| ------------- | -------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------- |
| **OpenAI**    | `responses`                      | `POST /v1/responses`                                     | Custom SSE events (`response.output_text.delta`)                        |
| **Anthropic** | `anthropic_messages`             | `POST /v1/messages`                                      | `x-api-key`, adaptive thinking, `tool_use`/`tool_result` content blocks |
| **Mistral**   | `chat_completions` / `responses` | `POST {base}/chat/completions` / `POST {base}/responses` | Base URL includes `/v1`; `max_tokens`, no `stream_options`              |
| **OVH AI**    | `chat_completions`               | `POST /v1/chat/completions`                              | OpenAI-compatible, 2 models only (`gpt-oss-20b`, `-120b`)               |
| **LM Studio** | `lmstudio_chat`                  | `POST /v1/chat`                                          | Stateful (sends `previous_response_id`), native MCP via `integrations`  |
| **Ollama**    | `ollama_chat`                    | `POST /api/chat`                                         | Native Ollama, `think: false` forced                                    |

Anthropic also offers an OpenAI-compatible mode (`chat_completions` on `/v1/chat/completions`), see [ADR 004](docs/adr/004-provider-anthropic-double-format.md).

Mistral reuses `chat_completions` (default) and `responses` with local tool loop, see [ADR 005](docs/adr/005-provider-mistral-deux-formats.md).

**Each format has distinct**:

- Message/tool serialization (Responses uses `input` field; Chat Completions uses `messages` array)
- Streaming parse logic (event types differ)
- Sampling parameter handling (placement and naming)

**Format Detection**: Via `config.llm.apiFormat` (explicit) or heuristic fallback (OpenAI → `responses`, others → `chat_completions`).

See [Detailed Reference](#detailed-reference) for detailed format specs.

### Agentic Tool Loop

Located in `src/components/Chat.tsx`:

1. Send message via `sendMessage()` → get `LLMResult` (type: `'text'` | `'tool_calls'`)
2. If `tool_calls`: resolve **all tools in parallel** via `Promise.all()` (dispatch to MCP servers or tools store)
3. Append `tool_call` + `tool_result` messages to history
4. Resend full history → repeat
5. **Max: 100 iterations** (safety against infinite loops; silent stop, no warning)

**LM Studio Special**: Previous response ID stored in React useRef, passed through loop to maintain statefulness.

### Streaming Architecture

- **Protocol**: Server-Sent Events (SSE) with token-by-token callback
- **Parser**: `parseSSEStream()` generator (buffered line processing, handles chunked UTF-8)
- **Responses API**: Custom events (`response.output_text.delta`, `response.completed`)
- **Chat Completions / Ollama**: Standard `text/event-stream` with `data: [DONE]` sentinel
- **LM Studio**: Explicit `event:` headers (parsed by `parseSSEEvents()` from `src/services/sse.ts`, shared with `parseSSEStream()` and the MCP client)

### MCP Client (Custom JSON-RPC over HTTP)

**Not using official SDK** (see [ADR 001](docs/adr/001-mcp-client-pas-de-sdk-officiel.md)). Custom ~150-line implementation:

- Session-aware: `Mcp-Session-Id` header, auto-initialize on 404
- Public API: `connectMcp()`, `disconnectMcp()`, `fetchMcpTools()`, `callMcpTool()`
- All exchanges logged in `httpStore` for transparency
- **LM Studio delegates MCP natively** via `integrations` field (no local tool loop)

---

## Key Conventions & Pitfalls

### API Format Edge Cases

```typescript
// Risk: Mismatched format + provider
provider: 'openai', apiFormat: 'chat_completions'  // Wrong! No validation.
```

**Gotcha**: No type validation linking provider to format. Users can select incompatible pairs → wrong headers/body structure sent.

### Config Migration Complexity

**Old format**: Flat fields (`mcpUrl`, `mcpName`, `mcpEnabled`, flat `apiKey`)
**New format**: Nested structures (`mcpServers[]`, `apiKeys: Record<Provider, string>`)

Migration runs on first load; old fields deleted. **Risk**: Downgrading app version loses migrated data.

### LM Studio Statefulness

Unlike other providers, LM Studio maintains context via `previous_response_id` per response. Stored in `lmStudioResponseIdRef`.

**Gotcha**: Switching providers mid-chat **breaks context**. No mechanism to preserve state across provider flips.

### Tool Iteration Silent Ceiling

```typescript
const MAX_TOOL_ITERATIONS = 100;
```

If LLM recursively calls tools, loop stops at 100 **with no error message**. Users see 100 tool_call messages but no "limit reached" notification.

**Mitigation**: E2E tests verify ceiling (tc91-agentic-loop.spec.ts).

### Streaming vs Non-Streaming Duality

Body builders reuse code; **response parsing differs significantly**. Bug in non-streaming path surfaces only when toggle is OFF.

### Tool Message Serialization Variance

| Format               | Tool Call                                   | Tool Result                                         |
| -------------------- | ------------------------------------------- | --------------------------------------------------- |
| **Responses API**    | `{ type: 'function_call', ... }` in `input` | `{ type: 'function_call_output', ... }` in `input`  |
| **Chat Completions** | `{ role: 'assistant', tool_calls: [...] }`  | `{ role: 'tool', tool_call_id: ..., content: ... }` |
| **Ollama**           | Same as Chat Completions                    | Same as Chat Completions                            |
| **Anthropic**        | `tool_use` block in an `assistant` message  | `tool_result` block in a `user` message             |

**Anthropic**: all calls of one loop iteration go into ONE assistant message (preceded by the raw `thinking` / `redacted_thinking` blocks, kept in `ChatMessage.thinkingBlocks`) and all results into ONE user message. Messages of the same iteration share `ChatMessage.toolTurnId`; `bodyBuildersAnthropic.ts` groups on it. Sending `temperature`/`top_p` is a 400 on the 5.x models: they are never sent and `max_tokens` is always set (default 4096).

**Gotcha**: Wrong serialization → tool loop fails silently (LLM doesn't recognize result).

### Skill System (agentskills.io spec)

- Skills are ZIP files containing a directory with `SKILL.md` + optional files
- **Frontmatter** in `SKILL.md`: `name`, `description` extracted via regex
- Only name+description injected into system prompt; full content lazy-loaded via `get_skill_details` tool
- Stored in IndexedDB (vs localStorage) to support large volumes
- ZIP directory detection: assumes first level contains the skill files

**Gotcha**: Brittle frontmatter regex; YAML must be exact format.

### MCP Session Expiration (404 Handling)

When MCP server returns 404, it signals session expired. Custom client:

1. Auto-deletes session from in-memory `sessions: Map`
2. Next tool call forces re-initialize (`initialize` request)
3. Retries transparently

**Risk**: If server is actually broken (not expired), retries waste time. No user notification of retry.

---

## File Navigation Guide

### Core Services

- **[src/services/llm/index.ts](src/services/llm/index.ts)**: Public API (`sendMessage()`)
- **[src/services/llm/bodyBuilders.ts](src/services/llm/bodyBuilders.ts)**: Format-specific message building
- **[src/services/llm/parsers.ts](src/services/llm/parsers.ts)**: SSE streaming parser
- **[src/services/llm/parsersLmStudio.ts](src/services/llm/parsersLmStudio.ts)**: LM Studio event parser
- **[src/services/llm/helpers.ts](src/services/llm/helpers.ts)**: Endpoint detection, format heuristic
- **[src/services/mcp.ts](src/services/mcp.ts)**: MCP JSON-RPC client
- **[src/services/models.ts](src/services/models.ts)**: Model list fetching (provider-specific shapes)
- **[src/services/pricing.ts](src/services/pricing.ts)**: Token cost calculation (static tables per provider, regenerated by `bun run pricing`, see [ADR 006](docs/adr/006-tarifs-sources-officielles-par-provider.md))

### Store Layer

- **[src/store/configStore.ts](src/store/configStore.ts)**: Config + migration logic
- **[src/store/httpStore.ts](src/store/httpStore.ts)**: HTTP exchange logging
- **[src/store/skillsStore.ts](src/store/skillsStore.ts)**: Skill CRUD + ZIP parsing + IndexedDB
- **[src/store/usageStore.ts](src/store/usageStore.ts)**: Token counting
- **[src/store/modelsStore.ts](src/store/modelsStore.ts)**: Model cache

### Components

- **[src/components/Chat.tsx](src/components/Chat.tsx)**: **Agentic loop** (most complex logic), message building
- **[src/components/LeftSidebar.tsx](src/components/LeftSidebar.tsx)**: Config UI orchestrator
- **[src/components/RightSidebar.tsx](src/components/RightSidebar.tsx)**: HTTP inspector + resizable drag
- **[src/components/chat/ChatMessage.tsx](src/components/chat/ChatMessage.tsx)**: Markdown rendering + Mermaid modal
- **[src/components/sidebar/](src/components/sidebar/)**: 8 accordion sections (ProviderSection, StreamSection, etc.)

### Type Definitions

- **[src/types.ts](src/types.ts)**: Central hub — `Provider`, `ApiFormat`, `AppConfig`, `LLMResult`, `McpServer`, etc.
- **[src/services/llm/types.ts](src/services/llm/types.ts)**: `LLMResult`, `LLMToolCall`

### Testing

- **[tests/e2e/helpers.ts](tests/e2e/helpers.ts)**: Shared E2E utilities (fetch interception, config injection)
- **[tests/e2e/tc\*.spec.ts](tests/e2e/)**: E2E tests organized by feature (tcXX = test case XX)
- **[tests/unit/](tests/unit/)**: Vitest unit tests, mirroring `src/` (`@/` alias → `src/`); shared setup/fixtures in `tests/unit/setup.ts` and `tests/unit/fixtures.ts`

### Documentation

- **[docs/adr/](docs/adr/)**: Architectural decision records (numbered NNNNN-kebab-case.md)
- **[docs/adr/README.md](docs/adr/README.md)**: ADR index and format guide

---

## Common Tasks & Where to Look

### ✅ Add a New Provider

1. **Type definitions**: Add to `Provider` enum in [src/types.ts](src/types.ts)
2. **API format**: Add `ApiFormat` variant (e.g., `'my_custom_api'`)
3. **Body builder**: Add format handler in [src/services/llm/bodyBuilders.ts](src/services/llm/bodyBuilders.ts)
4. **Parser**: Add streaming/non-streaming logic to [src/services/llm/parsers.ts](src/services/llm/parsers.ts)
5. **Model fetching**: Add endpoint in [src/services/models.ts](src/services/models.ts)
6. **UI section**: Add to `ProviderSection.tsx` or create new sidebar section
7. **Tests**: Add `tcXX-new-provider.spec.ts` with fetch mocking

### ✅ Fix a Streaming Bug

1. Check if it's **format-specific** (Responses vs Chat Completions vs LM Studio vs Ollama)
2. Test **with streaming ON and OFF** — bug might be in non-streaming path
3. Enable `config.debug = true` (if implemented) or inspect `httpStore`
4. Parser is in: [src/services/llm/parsers.ts](src/services/llm/parsers.ts) (general) or [src/services/llm/parsersLmStudio.ts](src/services/llm/parsersLmStudio.ts) (LM Studio)
5. Check event types: Responses uses `response.output_text.delta`; Chat Completions uses standard OpenAI format

### ✅ Add a Sampling Parameter

1. Add to `LLMConfig` in [src/types.ts](src/types.ts) (e.g., `frequencyPenalty?: number | null`)
2. Add UI slider in [src/components/sidebar/SamplingSection.tsx](src/components/sidebar/SamplingSection.tsx)
3. Inject into body in [src/services/llm/bodyBuilders.ts](src/services/llm/bodyBuilders.ts) — **format-specific field names differ**
4. Document in AGENTS.md (if non-obvious)
5. Add test in [tests/e2e/tc05-sampling.spec.ts](tests/e2e/tc05-sampling.spec.ts)

### ✅ Handle a New MCP Tool Error

1. Check error in [src/services/mcp.ts](src/services/mcp.ts) (`callMcpTool()`)
2. If 404: session auto-expires, next call re-initializes
3. If other error: add to `httpStore` for visibility
4. Tool resolution in [src/components/Chat.tsx](src/components/Chat.tsx) (`resolveToolCall()`)
5. Test with [tests/e2e/tc50-53-mcp.spec.ts](tests/e2e/tc50-53-mcp.spec.ts)

### ✅ Add a New Config Field

1. Add to `AppConfig` interface in [src/types.ts](src/types.ts)
2. Update `DEFAULT_CONFIG` in [src/store/configStore.ts](src/store/configStore.ts)
3. Handle migration in `configStore.ts` (if replacing old field)
4. Create sidebar section in [src/components/sidebar/](src/components/sidebar/) (or extend existing)
5. Connect via `useConfig()` hook in your component
6. Persist via `updateConfig()`

### ✅ Debug State Race Condition

1. Check listener cleanup in component `useEffect` (return unsubscribe function)
2. Use `getState()` for synchronous reads; prefer hooks for reactive updates
3. Verify state updates via `setState()` are total replacements (merge logic in-component)
4. Watch `httpStore` for timing clues (request/response order)

### ✅ Create a New E2E Test

1. Use [tests/e2e/helpers.ts](tests/e2e/helpers.ts) for common patterns: `interceptLLM()`, `setConfig()`, etc.
2. Use `page.route()` for fetch mocking (order matters: register before navigate)
3. Use `addInitScript()` to pre-populate localStorage before `goto()`
4. Mock LLM responses with realistic SSE or JSON
5. Name file: `tcXX-description.spec.ts` (check last tcXX number in tests/e2e/ folder)
6. Run: `bun run test:ui` for interactive debugging

---

## Performance & Constraints

- **Max tool iterations**: 100 (hardcoded, silent stop)
- **Max file size (oxlint)**: 300 lines per file (warning, not error)
- **IndexedDB size**: Browser-dependent (typically 50+ MB); skills stored as text
- **localStorage key**: `chat_pedagogique_config` (~50KB typical)
- **SSE timeout**: 15s in tests; prod may vary
- **Vite base**: `/chat-llm/` (GitHub Pages)

---

## Deployment

**GitHub Actions** automatically builds and deploys on push to `main`:

1. Run `bun run build` (type-check + Vite)
2. Output: `dist/` folder
3. GitHub Actions deploys via Pages API

**Requirement**: Settings → Pages → Source = "GitHub Actions"

**Preview locally**: `bun run preview` → `http://localhost:4173/chat-llm/`

---

## When to Create Separate Instructions

Consider creating domain-specific agent instructions (`/create-agent ...`) if:

- **LLM Service Domain**: Adding multi-format provider complexity (new format class, shared builder refactor)
- **MCP/Tool Calling**: Handling complex tool orchestration, error recovery, or new MCP protocol versions
- **Skills System**: Large-scale skill management UI, ZIP extraction optimization, or frontmatter parser rewrite
- **E2E Testing**: Writing extensive test suites or fixing flaky tests with environment-specific issues

Otherwise, this file + [ADRs](docs/adr/) provide sufficient context.

---

## Reference

- **Codebase**: React 19 + TypeScript + Tailwind CSS
- **Testing**: Vitest (unit tests in `tests/unit/`) + Playwright E2E (`tests/e2e/`)
- **State**: Custom observer stores (5 independent stores)
- **Deployment**: GitHub Pages (Vite, base: `/chat-llm/`)
- **Package Manager**: **bun** (via `bun.lock`)
- **Key ADR**: [001-mcp-client-pas-de-sdk-officiel.md](docs/adr/001-mcp-client-pas-de-sdk-officiel.md) — why custom MCP client instead of official SDK

---

## Detailed Reference

### Commandes complémentaires

```bash
npx tsc --noEmit # Vérification TypeScript sans compilation
bun run preview  # Prévisualise le build dist/ en local
```

Les commandes `npm run …` fonctionnent aussi, mais préférer `bun run …`.

### Formats d'API (`ApiFormat` dans `src/types.ts`)

| `apiFormat`          | Provider                | Endpoint                    | Particularités                                                                                                                                                                                              |
| -------------------- | ----------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `responses`          | OpenAI, OVH (2 modèles) | `POST /v1/responses`        | SSE events `response.output_text.delta` / `response.completed`, champ `input`, `instructions`                                                                                                               |
| `chat_completions`   | OVH, Ollama (compat.)   | `POST /v1/chat/completions` | Format OpenAI standard, `messages`                                                                                                                                                                          |
| `ollama_chat`        | Ollama                  | `POST /api/chat`            | Format natif Ollama, `think: false` forcé                                                                                                                                                                   |
| `anthropic_messages` | Anthropic               | `POST /v1/messages`         | Headers `x-api-key` + `anthropic-version` + `anthropic-dangerous-direct-browser-access` ; `system` séparé, `max_tokens` obligatoire, `thinking` adaptatif, `output_config.format` pour le structured output |
| `lmstudio_chat`      | LM Studio               | `POST /api/v1/chat`         | Stateful : envoie seulement le dernier message utilisateur + `previous_response_id` ; MCP via `integrations` (format natif, pas de tool loop)                                                               |

`sendMessage()` retourne `LLMResult` :

- `{ type: 'text'; content: string; usage?: TokenUsage; responseId?: string; thinking?: string }`
- `{ type: 'tool_calls'; calls: LLMToolCall[]; responseId?: string; rawAssistantMsg?: unknown; usage?: TokenUsage; thinking?: string; thinkingBlocks?: unknown[] }`

`thinking` / `thinkingBlocks` ne sont remplis que par le format `anthropic_messages` (réflexion affichée via `LLMConfig.showThinking` ; `sendMessage()` accepte un callback `onThinking` en dernier paramètre).

**OVH** : seuls `gpt-oss-20b` et `gpt-oss-120b` supportent le format `responses`. `fetchModels()` OVH utilise le header `X-Auth-Token` (pas `Authorization: Bearer`).

### Service modèles (`src/services/models.ts`)

`fetchModels(provider, baseUrl, apiKey)` récupère la liste de modèles pour chaque provider (endpoints différents, shapes différentes) et normalise vers `ModelInfo`. LM Studio utilise `/api/v1/models` avec une shape propre. Les résultats sont mis en cache dans `modelsStore`. OpenAI et Anthropic ont une liste statique de repli (`getDefaultOpenAiModels()` / `getDefaultAnthropicModels()` dans `src/services/pricing.ts`, tarifs dans `src/data/*-pricing.json`). Anthropic : `GET /v1/models` avec `x-api-key` ; Haiku 5.5 a un palier tarifaire au-delà de 100 000 tokens de prompt, non appliqué dans `UsageSection` (le palier bas est utilisé et signalé).

### Détails MCP

Protocole MCP 2025-11-25. Sessions maintenues en mémoire (`sessions: Map<string, McpSession>`), déjà multi-serveur (clé = URL). `buildLmStudioChatBody()` dans `bodyBuilders.ts` génère une entrée `integrations` par serveur actif. `resolveToolCall` dans `Chat.tsx` itère les serveurs actifs pour dispatcher l'appel au bon (first-match-wins).

### Types centraux (`src/types.ts`)

- `Provider` : `'openai' | 'anthropic' | 'mistral' | 'ovh' | 'lmstudio' | 'ollama'`
- `ApiFormat` : `'responses' | 'chat_completions' | 'lmstudio_chat' | 'ollama_chat' | 'anthropic_messages'`
- `LLMConfig` contient `temperature`, `topP`, `maxTokens` (tous `number | null` — `null` = non envoyé à l'API) et `showThinking` (Anthropic)
- `MessageRole` : `'user' | 'assistant' | 'system' | 'tool_call' | 'tool_result'`
- `McpServer` : `{ id, name, url, enabled, tools: McpTool[] }` — `AppConfig.mcpServers` est un tableau de ces objets
- `DEFAULT_CONFIG` prépositionne sur `openai` / `gpt-5.4-nano` / format `responses`, `mcpServers: []`

### Layout

```
App
├── Header          — provider actif, modèle, stream on/off, lien GitHub
├── LeftSidebar     — accordéons de configuration (8 sections)
│   └── sidebar/    — ProviderSection, StreamSection, SamplingSection,
│                     SystemPromptSection, JsonSchemaSection, SkillsSection,
│                     McpSection, UsageSection (visible seulement si total > 0)
│                     Accordion.tsx — composant accordéon réutilisable
│                     Toggle.tsx — composant interrupteur CSS réutilisable
├── Chat            — historique + ChatInput (textarea auto-resize, paste image)
│   └── chat/       — ChatMessage.tsx (composant ChatMessageView : Markdown via
│                     react-markdown + highlight.js, tool_call/tool_result dépliables,
│                     zoom Mermaid en modale), ChatInput
├── RightSidebar    — inspecteur HTTP redimensionnable (drag sur la poignée gauche),
│                     ordre chronologique + auto-scroll vers le bas, JsonTree.tsx
└── Footer
```

- **SamplingSection** : sliders Temperature (0–2), Top-P (0–1), champ Max tokens — tous désactivables (valeur `null`)
- **UsageSection** : donut SVG prompt/completion tokens, coût estimé en USD (pricing live depuis `modelsStore` ou statique de repli), bouton reset. Se masque quand `total === 0`.
- **McpSection** : liste de cartes de serveurs MCP (toggle enable, alias, URL + rafraîchir, outils avec toggle par outil). Bouton "Ajouter un serveur". Cartes expand/collapse indépendantes.
- La sidebar droite a une largeur réglable par drag (200–800 px), état local non persisté.
- La sidebar gauche a un bouton "Reset" avec confirmation (2 clics, timeout 3 s) qui vide localStorage + IndexedDB.

### Structured Output

Activé via le champ JSON Schema dans la sidebar gauche. Envoyé dans `text.format` (Responses API) ou `response_format` (Chat Completions) avec `strict: false`.

### Documentation des décisions

Les décisions architecturales significatives sont tracées dans `docs/adr/` au format ADR (un fichier par décision, numérotés `NNN-titre-kebab-case.md`). Voir [`docs/adr/README.md`](docs/adr/README.md). Toute nouvelle décision technique importante (choix de librairie, refactoring structurant, abandon d'une approche) doit y être documentée.
