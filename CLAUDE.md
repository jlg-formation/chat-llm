# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commandes essentielles

```bash
bun run dev      # Serveur de développement (http://localhost:5173/chat-llm/)
bun run build    # Build de production (output : dist/) — tsc -b puis vite build
bun run lint     # ESLint sur tout le projet
bun run test     # Tests Playwright (nécessite le serveur dev lancé)
bun run test:ui  # Tests Playwright en mode UI interactif
bun run preview  # Prévisualise le build dist/ en local
npx tsc --noEmit # Vérification TypeScript sans compilation
```

Le projet utilise **bun** comme gestionnaire de paquets (présence de `bun.lock`). Les commandes `npm run …` fonctionnent aussi mais préférer `bun run …`.

## Architecture

Application React 100 % front-end (aucun backend). Deux contraintes structurantes : **verbatimModuleSyntax** est activé (tous les imports de types doivent utiliser `import type`), et la `base` Vite est `/chat-llm/` pour GitHub Pages.

### Stores (pattern observer maison, sans Redux ni Zustand)

- `src/store/configStore.ts` — configuration persistée en **localStorage**. Expose `useConfig()` (hook React) et `updateConfig()` (appel direct). Gère la migration depuis l'ancien format `apiKey` à plat vers `apiKeys: Record<Provider, string>`.
- `src/store/httpStore.ts` — log des échanges HTTP (non persisté, oldest-first). `addExchange()` / `updateExchange()` couvrent les échanges LLM et MCP (`type: 'llm' | 'mcp'`). `useHttpExchanges()` consommé par la sidebar droite.
- `src/store/skillsStore.ts` — CRUD skills en **IndexedDB** via `localforage`. Les skills sont des ZIP décompressés dont le contenu est stocké dans `files: Record<string, string>`. `parseSkillFrontmatter()` extrait `name` et `description` depuis le frontmatter YAML de `SKILL.md`.
- `src/store/usageStore.ts` — compteur de tokens (promptTokens, completionTokens) cumulés sur la conversation. `addUsage()` appelé après chaque appel LLM ; `resetUsage()` déclenché manuellement ou à la réinitialisation de la conversation. Non persisté.
- `src/store/modelsStore.ts` — cache mémoire des listes de modèles récupérées dynamiquement, indexées par provider. `setCachedModels()` / `useModelsCache()`.

### Service LLM (`src/services/llm/`)

Refactorisé en répertoire. Point d'entrée public : `src/services/llm/index.ts` → `sendMessage()`.

**Quatre formats d'API** (`ApiFormat` dans `src/types.ts`) :

| `apiFormat` | Provider | Endpoint | Particularités |
|---|---|---|---|
| `responses` | OpenAI, OVH (2 modèles) | `POST /v1/responses` | SSE events `response.output_text.delta` / `response.completed`, champ `input`, `instructions` |
| `chat_completions` | OVH, Ollama (compat.) | `POST /v1/chat/completions` | Format OpenAI standard, `messages` |
| `ollama_chat` | Ollama | `POST /api/chat` | Format natif Ollama, `think: false` forcé |
| `lmstudio_chat` | LM Studio | `POST /api/v1/chat` | Stateful : envoie seulement le dernier message utilisateur + `previous_response_id` ; MCP via `integrations` (format natif, pas de tool loop) |

Le streaming est géré par `parseSSEStream()` (générateur async, `src/services/llm/parsers.ts`). LM Studio utilise `parseSSEStreamWithEvents()` car il envoie des `event:` explicites.

`sendMessage()` retourne `LLMResult` :
- `{ type: 'text'; content: string; usage?: TokenUsage; responseId?: string }`
- `{ type: 'tool_calls'; calls: LLMToolCall[]; responseId?: string; rawAssistantMsg?: unknown; usage?: TokenUsage }`

**OVH** : seuls `gpt-oss-20b` et `gpt-oss-120b` supportent le format `responses`. `fetchModels()` OVH utilise le header `X-Auth-Token` (pas `Authorization: Bearer`).

### Service modèles (`src/services/models.ts`)

`fetchModels(provider, baseUrl, apiKey)` récupère la liste de modèles pour chaque provider (endpoints différents, shapes différentes) et normalise vers `ModelInfo`. LM Studio utilise `/api/v1/models` avec une shape propre. Les résultats sont mis en cache dans `modelsStore`. OpenAI a une liste statique de repli (`STATIC_OPENAI_MODELS` dans `ProviderSection.tsx`).

### Service MCP (`src/services/mcp.ts`)

Client JSON-RPC over HTTP (protocole MCP 2025-11-25). Sessions maintenues en mémoire (`sessions: Map<string, McpSession>`) — déjà multi-serveur (clé = URL). Sur une erreur 404, la session est supprimée et la prochaine requête force une ré-initialisation.

Fonctions publiques : `connectMcp()`, `disconnectMcp()`, `fetchMcpTools()`, `callMcpTool()`. Tous les échanges MCP sont loggés dans `httpStore` avec `type: 'mcp'`.

LM Studio gère le MCP nativement via le champ `integrations` du corps de requête (pas via la boucle agentique) — `buildLmStudioChatBody()` dans `bodyBuilders.ts` génère une entrée par serveur actif.

### Skills et function calling

Les skills actifs sont injectés dans le prompt système sous forme de **frontmatter uniquement** (name + description). Le contenu détaillé est accessible via l'outil `get_skill_details` que le LLM peut appeler.

La boucle agentique tourne dans `Chat.tsx` (max **100** itérations) :
1. `sendMessage()` → si `tool_calls` : résoudre les outils localement
2. Ajouter des messages `tool_call` + `tool_result` dans l'historique
3. Rappeler `sendMessage()` avec l'historique complet
4. Répéter jusqu'à `type: 'text'`

LM Studio court-circuite cette boucle : le MCP est délégué au serveur via `integrations`, non résolu localement.

Les messages `tool_call` / `tool_result` sont sérialisés selon le format :
- Responses API → `{type: "function_call"}` + `{type: "function_call_output"}` dans `input`
- Chat Completions / Ollama → `{role: "assistant", tool_calls: [...]}` + `{role: "tool"}` dans `messages`

### Types centraux (`src/types.ts`)

- `Provider` : `'openai' | 'ovh' | 'lmstudio' | 'ollama'`
- `ApiFormat` : `'responses' | 'chat_completions' | 'lmstudio_chat' | 'ollama_chat'`
- `LLMConfig` contient `temperature`, `topP`, `maxTokens` (tous `number | null` — `null` = non envoyé à l'API)
- `MessageRole` : `'user' | 'assistant' | 'system' | 'tool_call' | 'tool_result'`
- `McpServer` : `{ id, name, url, enabled, tools: McpTool[] }` — `AppConfig.mcpServers` est un tableau de ces objets. Migration automatique depuis l'ancien format à plat (`mcpUrl`, `mcpEnabled`…) dans `configStore`.
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
- **McpSection** : liste de cartes de serveurs MCP (chacune : toggle enable, alias, URL + rafraîchir, liste d'outils avec toggle par outil). Bouton "Ajouter un serveur". Les cartes sont expand/collapse indépendants. `resolveToolCall` dans `Chat.tsx` itère les serveurs actifs pour dispatcher l'appel au bon (first-match-wins).
- La sidebar droite a une largeur réglable par drag (200–800 px), état local non persisté.
- La sidebar gauche a un bouton "Reset" avec confirmation (2 clics, timeout 3 s) qui vide localStorage + IndexedDB.

### Structured Output

Activé via le champ JSON Schema dans la sidebar gauche. Envoyé dans `text.format` (Responses API) ou `response_format` (Chat Completions) avec `strict: false`.

## Déploiement

Push sur `main` → GitHub Actions (`.github/workflows/deploy.yml`) build et déploie sur GitHub Pages via l'API `actions/deploy-pages`. Requires **Settings → Pages → Source = GitHub Actions** activé sur le dépôt.

## Documentation

Les décisions architecturales significatives sont tracées dans `docs/adr/` au format ADR (un fichier par décision, numérotés `NNN-titre-kebab-case.md`). Voir [`docs/adr/README.md`](docs/adr/README.md) pour le format et l'index. Toute nouvelle décision technique importante (choix de librairie, refactoring structurant, abandon d'une approche) doit y être documentée.
