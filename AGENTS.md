# Agent Instructions: Chat Pédagogique IA

**Purpose**: Pedagogical LLM chat application (100% frontend) that exposes HTTP exchanges, SSE streaming, structured output, skills, and tool calling for developer training.

**Tech Stack**: React 19 + TypeScript + Vite + Playwright (E2E only). **Package manager: bun** (not npm).

## Quick Start

```bash
bun install              # Install deps (uses bun.lock)
bun run dev              # Dev server → http://localhost:5173/chat-llm/
bun run build            # Type-check + build → dist/
bun run lint             # ESLint check
bun run test             # Playwright E2E (headless)
bun run test:ui          # Playwright interactive mode
```

**Key Constraint**: `verbatimModuleSyntax: true` — all type-only imports must use `import type { ... } from '...'`.

---

## Architecture Overview

### Custom Observer Store Pattern

**No Redux, Zustand, or Context API.** Instead, 5 lightweight stores with observer subscriptions:

| Store | Purpose | Persistence |
|-------|---------|------------|
| `configStore` | LLM config, API keys, system prompt, MCP servers, sampling | localStorage: `chat_pedagogique_config` |
| `httpStore` | HTTP exchange log (LLM + MCP) | None (in-memory, cleared on reset) |
| `skillsStore` | Skill CRUD (ZIP files) | IndexedDB: `chat_pedagogique/skills` |
| `usageStore` | Token counter (prompt + completion) | None (in-memory) |
| `modelsStore` | Provider model lists cache | None (in-memory cache) |

Each exposes: `getState()`, `setState()`, `useHook()` — hooks re-render on global update via listener notification.

**Migration Logic**: `configStore` auto-upgrades old formats on load (e.g., flat `mcpUrl` → `mcpServers[]`).

### LLM Service Polymorphism (4 API Formats)

The app **unifies 4 incompatible LLM APIs** behind `sendMessage()`:

| Provider | Format | Endpoint | Key Trait |
|----------|--------|----------|-----------|
| **OpenAI** | `responses` | `POST /v1/responses` | Custom SSE events (`response.output_text.delta`) |
| **OVH AI** | `chat_completions` | `POST /v1/chat/completions` | OpenAI-compatible, 2 models only (`gpt-oss-20b`, `-120b`) |
| **LM Studio** | `lmstudio_chat` | `POST /v1/chat` | Stateful (sends `previous_response_id`), native MCP via `integrations` |
| **Ollama** | `ollama_chat` | `POST /api/chat` | Native Ollama, `think: false` forced |

**Each format has distinct**:
- Message/tool serialization (Responses uses `input` field; Chat Completions uses `messages` array)
- Streaming parse logic (event types differ)
- Sampling parameter handling (placement and naming)

**Format Detection**: Via `config.llm.apiFormat` (explicit) or heuristic fallback (OpenAI → `responses`, others → `chat_completions`).

See [CLAUDE.md](CLAUDE.md#service-llm-srcservicesllm) for detailed format specs.

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
- **LM Studio**: Explicit `event:` headers (parsed by `parseSSEStreamWithEvents()`)

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
const MAX_TOOL_ITERATIONS = 100
```

If LLM recursively calls tools, loop stops at 100 **with no error message**. Users see 100 tool_call messages but no "limit reached" notification.

**Mitigation**: E2E tests verify ceiling (tc91-agentic-loop.spec.ts).

### Streaming vs Non-Streaming Duality

Body builders reuse code; **response parsing differs significantly**. Bug in non-streaming path surfaces only when toggle is OFF.

### Tool Message Serialization Variance

| Format | Tool Call | Tool Result |
|--------|-----------|-------------|
| **Responses API** | `{ type: 'function_call', ... }` in `input` | `{ type: 'function_call_output', ... }` in `input` |
| **Chat Completions** | `{ role: 'assistant', tool_calls: [...] }` | `{ role: 'tool', tool_call_id: ..., content: ... }` |
| **Ollama** | Same as Chat Completions | Same as Chat Completions |

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
- **[src/services/pricing.ts](src/services/pricing.ts)**: Token cost calculation

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

- **[tests/helpers.ts](tests/helpers.ts)**: Shared test utilities (fetch interception, config injection)
- **[tests/tc*.spec.ts](tests/)**: E2E tests organized by feature (tcXX = test case XX)

### Documentation

- **[CLAUDE.md](CLAUDE.md)**: Comprehensive architecture deep-dive (stores, formats, MCP, skills)
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
4. Document in CLAUDE.md (if non-obvious)
5. Add test in [tests/tc05-sampling.spec.ts](tests/tc05-sampling.spec.ts)

### ✅ Handle a New MCP Tool Error

1. Check error in [src/services/mcp.ts](src/services/mcp.ts) (`callMcpTool()`)
2. If 404: session auto-expires, next call re-initializes
3. If other error: add to `httpStore` for visibility
4. Tool resolution in [src/components/Chat.tsx](src/components/Chat.tsx) (`resolveToolCall()`)
5. Test with [tests/tc50-53-mcp.spec.ts](tests/tc50-53-mcp.spec.ts)

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

1. Use [tests/helpers.ts](tests/helpers.ts) for common patterns: `interceptLLM()`, `setConfig()`, etc.
2. Use `page.route()` for fetch mocking (order matters: register before navigate)
3. Use `addInitScript()` to pre-populate localStorage before `goto()`
4. Mock LLM responses with realistic SSE or JSON
5. Name file: `tcXX-description.spec.ts` (check last tcXX number in tests/ folder)
6. Run: `bun run test:ui` for interactive debugging

---

## Performance & Constraints

- **Max tool iterations**: 100 (hardcoded, silent stop)
- **Max file size (ESLint)**: 300 lines per file (warning, not error)
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

Otherwise, this file + [CLAUDE.md](CLAUDE.md) + [ADRs](docs/adr/) provide sufficient context.

---

## Reference

- **Codebase**: React 19 + TypeScript + Tailwind CSS
- **Testing**: Playwright E2E (no unit tests)
- **State**: Custom observer stores (5 independent stores)
- **Deployment**: GitHub Pages (Vite, base: `/chat-llm/`)
- **Package Manager**: **bun** (via `bun.lock`)
- **Key ADR**: [001-mcp-client-pas-de-sdk-officiel.md](docs/adr/001-mcp-client-pas-de-sdk-officiel.md) — why custom MCP client instead of official SDK
