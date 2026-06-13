# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commandes essentielles

```bash
npm run dev      # Serveur de développement (http://localhost:5173/chat-llm/)
npm run build    # Build de production (output : dist/)
npx tsc --noEmit # Vérification TypeScript sans compilation
```

## Architecture

Application React 100 % front-end (aucun backend). Deux contraintes structurantes : **verbatimModuleSyntax** est activé (tous les imports de types doivent utiliser `import type`), et la `base` Vite est `/chat-llm/` pour GitHub Pages.

### Stores (pattern observer maison, sans Redux ni Zustand)

- `src/store/configStore.ts` — configuration persistée en **localStorage**. Expose `useConfig()` (hook React) et `updateConfig()` (appel direct). Les listeners sont notifiés à chaque mise à jour.
- `src/store/httpStore.ts` — log des échanges HTTP (non persisté, oldest-first). `addExchange()` / `updateExchange()` sont appelés par le service LLM ; `useHttpExchanges()` est consommé par la sidebar droite.
- `src/store/skillsStore.ts` — CRUD skills en **IndexedDB** via `localforage`. Les skills sont des ZIP décompressés dont le contenu est stocké dans `files: Record<string, string>`. `parseSkillFrontmatter()` extrait `name` et `description` depuis le frontmatter YAML du fichier `SKILL.md`.

### Service LLM (`src/services/llm.ts`)

Un seul point d'entrée public : `sendMessage()`. Il adapte le format de la requête selon le provider :
- **OpenAI** → `POST /v1/responses` (API Responses, champ `input`, events SSE `response.output_text.delta` / `response.completed`)
- **OVH / LM Studio** → `POST /v1/chat/completions` (format OpenAI standard)
- **Ollama** → `POST /api/chat` (format natif)

Le streaming est géré par `parseSSEStream()` (générateur async). Chaque appel enregistre l'échange dans `httpStore` avec les headers pédagogiques tronqués (clé API masquée).

`sendMessage()` retourne un type union `LLMResult` :
- `{ type: 'text'; content: string }` — réponse finale
- `{ type: 'tool_calls'; calls: LLMToolCall[] }` — le LLM a demandé un outil

### Skills et function calling

Les skills actifs sont injectés dans le prompt système sous forme de **frontmatter uniquement** (name + description). Le contenu détaillé est accessible via l'outil `get_skill_details` que le LLM peut appeler s'il en a besoin.

La boucle agentique tourne dans `Chat.tsx` (max 5 itérations) :
1. `sendMessage()` → si `tool_calls` : résoudre les outils localement
2. Ajouter des messages `tool_call` + `tool_result` dans l'historique
3. Rappeler `sendMessage()` avec l'historique complet
4. Répéter jusqu'à `type: 'text'`

Les messages `tool_call` / `tool_result` sont sérialisés selon le provider :
- Responses API → `{type: "function_call"}` + `{type: "function_call_output"}` dans `input`
- Chat Completions → `{role: "assistant", tool_calls: [...]}` + `{role: "tool"}` dans `messages`

### Types centraux (`src/types.ts`)

`LLMConfig.apiKeys` est un `Record<Provider, string>` — une clé par provider, pas une clé globale. `DEFAULT_CONFIG` prépositionne sur `gpt-5.4-nano`. Le `configStore` gère la migration depuis l'ancien format `apiKey` à plat.

`MessageRole` inclut `'user' | 'assistant' | 'system' | 'tool_call' | 'tool_result'`. Les messages `tool_call` portent `toolCallId`, `toolName`, `toolArgs` ; les messages `tool_result` portent `toolCallResultId`.

### Layout

```
App
├── Header          — provider actif, modèle, stream on/off, lien GitHub
├── LeftSidebar     — accordéons de configuration (6 sections)
│   └── sidebar/    — ProviderSection, StreamSection, SystemPromptSection,
│                     JsonSchemaSection, SkillsSection, McpSection
│                     Toggle.tsx — composant interrupteur CSS réutilisable
├── Chat            — historique + ChatInput (textarea auto-resize, paste image)
│   └── chat/       — ChatMessageView (Markdown via react-markdown + rendu
│                     tool_call/tool_result dépliables), ChatInput
├── RightSidebar    — inspecteur HTTP redimensionnable (drag sur la poignée gauche),
│                     ordre chronologique + auto-scroll vers le bas
└── Footer
```

La sidebar droite a une largeur réglable par drag (200–800 px). L'état de largeur est local au composant (non persisté).

### Modèles OpenAI disponibles

Définis dans `ProviderSection.tsx` (`OPENAI_MODELS`) : uniquement la famille GPT-5.x (5.4-nano, 5.4-mini, 5.4, 5.4-pro, 5.5, 5.5-pro) avec prix input/output affichés. Pour les autres providers, le modèle est un champ texte libre.

### Structured Output

Activé via le champ JSON Schema dans la sidebar gauche. Envoyé dans `text.format` (Responses API) ou `response_format` (Chat Completions) avec `strict: false` pour ne pas imposer que `required` liste toutes les propriétés.

## Déploiement

Push sur `main` → GitHub Actions (`.github/workflows/deploy.yml`) build et déploie sur GitHub Pages via l'API `actions/deploy-pages`. Requires **Settings → Pages → Source = GitHub Actions** activé sur le dépôt.
