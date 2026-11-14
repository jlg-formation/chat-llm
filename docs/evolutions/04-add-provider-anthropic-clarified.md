# Évolution 04 — Ajout du provider Anthropic (Claude)

## Contexte

Chat Pédagogique IA est une application 100 % frontend (React 19 + TypeScript + Vite) qui expose les échanges HTTP, le streaming SSE, le structured output, les skills et le tool calling. Elle unifie aujourd'hui 4 providers (OpenAI, OVH AI, LM Studio, Ollama) derrière `sendMessage()`, chacun avec son format d'API (`responses`, `chat_completions`, `lmstudio_chat`, `ollama_chat`).

La demande initiale : « ne pas avoir seulement OpenAI comme provider, mais aussi Anthropic ».

## Objectif

Ajouter **Anthropic (Claude)** comme provider sélectionnable, avec une **parité fonctionnelle complète** par rapport à OpenAI : chat, streaming, images, system prompt, skills, structured output, tool calling via MCP, comptage de tokens et coût estimé, inspection HTTP.

## Périmètre fonctionnel

### 1. Provider et formats d'API

- Ajouter `'anthropic'` au type `Provider` dans `src/types.ts`.
- Deux formats d'API sont proposés, **au choix de l'utilisateur** :
  - **API native Messages** (`POST /v1/messages`) : nouveau `ApiFormat` `'anthropic_messages'`. Format par défaut.
  - **Mode compatible OpenAI** : réutilise le format existant `chat_completions` sur l'endpoint de compatibilité d'Anthropic (`https://api.anthropic.com/v1/`). Limites assumées, imposées par Anthropic : pas de blocs de réflexion dans la réponse, pas de prompt caching, `response_format` limité à `json_schema` avec `strict: true`, `n` = 1.
- Le sélecteur de format dans `ProviderSection` doit proposer ces deux options pour Anthropic. La heuristique de repli (`helpers.ts`) renvoie `anthropic_messages` pour ce provider.

### 2. Authentification et accès navigateur

- Appel **direct depuis le navigateur**, sans proxy.
- Clé API stockée dans `apiKeys.anthropic` (localStorage, comme les autres providers) et envoyée via le header `x-api-key`.
- Headers obligatoires : `anthropic-version: 2026-10-21` (dernière version, recommandée par Anthropic) et `anthropic-dangerous-direct-browser-access: true`.
- La base URL reste modifiable dans l'UI comme pour les autres providers (valeur par défaut : l'API publique Anthropic).

### 3. Liste des modèles

- Récupération dynamique via `GET /v1/models` dans `fetchModels()` (`src/services/models.ts`), normalisée vers `ModelInfo`, mise en cache dans `modelsStore`.
- **Liste statique de repli** (même principe que `STATIC_OPENAI_MODELS` dans `ProviderSection.tsx`) utilisée quand la liste dynamique est indisponible (pas de clé, erreur réseau). Les 4 derniers modèles, par ordre croissant de capacité et de prix :

  | Modèle                        | ID API              | Entrée / sortie ($ par million de tokens)                  |
  | ----------------------------- | ------------------- | ---------------------------------------------------------- |
  | Claude Haiku 5.5 (**défaut**) | `claude-haiku-5-5`  | 0,10 / 0,50 (prompt ≤ 100 000 tokens), 0,50 / 2,50 au-delà |
  | Claude Sonnet 5.5             | `claude-sonnet-5-5` | 2 / 10                                                     |
  | Claude Opus 5.5               | `claude-opus-5-5`   | 4 / 20                                                     |
  | Claude Fable 5.2              | `claude-fable-5-2`  | 8 / 40                                                     |

- Le modèle par défaut du provider Anthropic est le moins cher : Haiku 5.5.

### 4. Paramètres de sampling

- `max_tokens` est obligatoire côté Anthropic : si `config.llm.maxTokens` est `null`, injecter la valeur par défaut **4096** dans le body. Les tokens de réflexion comptent dans `max_tokens` : l'utilisateur peut relever la valeur dans `SamplingSection` si les réponses sont tronquées (`stop_reason: max_tokens`).
- `temperature` et `top_p` : les 4 modèles retenus (famille 5.x) les rejettent avec une erreur 400 dès qu'ils sont non par défaut, et la version d'API `2026-10-21` les supprime. Pour Anthropic, ils ne sont **jamais envoyés** et leurs contrôles sont désactivés dans `SamplingSection`. Cela remplace la décision initiale de borner la température à 0–1.
- Les noms et la position des champs sont propres au format `anthropic_messages` (à gérer dans `bodyBuilders.ts`).

### 5. Structured output

- Utiliser le **structured output natif** d'Anthropic avec le JSON Schema saisi dans `JsonSchemaSection` (pas de contournement par tool forcé).
- Applicable au format `anthropic_messages`. En mode compatible OpenAI, `response_format` n'accepte que `json_schema` avec `strict: true` (le champ `strict: false` envoyé par défaut pour les autres providers doit être forcé à `true`).

### 6. Extended thinking

- Sur les modèles retenus, la réflexion est **adaptative** : elle est active par défaut, ne se règle pas par un budget de tokens (`budget_tokens` renvoie une erreur 400) et ne peut pas être désactivée sur Sonnet 5.5, Opus 5.5 et Fable 5.2. Un simple toggle on/off n'est donc pas réalisable.
- Le réglage, placé dans `SamplingSection`, est un toggle **« Afficher la réflexion »** : envoie `thinking: { type: "adaptive", display: "summarized" }` (sinon `display: "omitted"`, valeur par défaut Anthropic, qui renvoie des blocs vides). Pas de sélecteur d'`effort` dans ce périmètre.
- Quand activé, les blocs de réflexion (streaming via `thinking_delta`, et non-streaming) sont **affichés dans le chat** (`ChatMessage.tsx`) et visibles dans l'inspecteur HTTP.
- Les blocs `thinking` (avec `signature`) et `redacted_thinking` doivent être conservés tels quels dans l'historique renvoyé pendant la boucle d'outils.
- Non disponible en mode compatible OpenAI (la réponse ne contient pas la réflexion) : le toggle y est désactivé.

### 7. Tool calling et MCP

- Boucle agentique **locale** (`Chat.tsx`) avec le client MCP existant : les outils sont exposés au format Anthropic (`tools` avec `input_schema`), les appels reviennent en blocs `tool_use`, les résultats sont renvoyés en blocs `tool_result` dans un message `user`.
- Le connecteur MCP natif d'Anthropic (`mcp_servers`) n'est **pas** utilisé.
- Opus 5.5, Sonnet 5.5 et Fable 5.2 rejettent `tool_choice` forcé (`any` / `tool`) : n'utiliser que `auto`.
- Le tool `get_skill_details` des skills fonctionne via la même boucle.

### 8. Streaming

- Parser SSE dédié aux événements Anthropic (`message_start`, `content_block_start`, `content_block_delta`, `message_delta`, `message_stop`, etc.), réutilisant `parseSSEEvents()` de `src/services/sse.ts`.
- Parité streaming ON / OFF : le chemin non-streaming doit être implémenté et testé.

### 9. Images

- Les images collées dans le chat sont envoyées au format de blocs `image` d'Anthropic (base64 avec `media_type`).

### 10. Usage et coût

- Lecture des tokens (`input_tokens` / `output_tokens`) depuis les réponses Anthropic, alimentant `usageStore`.
- **Pricing statique** : ajouter un fichier de tarifs pour les 4 modèles du tableau ci-dessus (sur le modèle de `src/data/openai-pricing.json`), consommé par `src/services/pricing.ts` pour le coût estimé dans `UsageSection`. Pas de script de mise à jour automatique dans ce périmètre.
- Haiku 5.5 a un tarif à deux paliers selon la longueur du prompt (seuil 100 000 tokens) : le calcul doit en tenir compte, ou à défaut utiliser le palier bas et l'indiquer.
- Un modèle absent du fichier de tarifs (liste dynamique) s'affiche sans coût estimé.

## Hors périmètre

- Connecteur MCP natif d'Anthropic (`mcp_servers`).
- Proxy CORS ou backend intermédiaire.
- Script automatique de mise à jour des tarifs Anthropic.
- Autres fonctionnalités propres à Anthropic non listées ci-dessus (prompt caching, batch, files API, computer use…).

## Utilisateurs cibles

Les développeurs en formation qui utilisent l'application pour observer les échanges HTTP et comparer le comportement des providers LLM. Ils fournissent leur propre clé API Anthropic.

## Contraintes techniques

- Stack existante : React 19, TypeScript (`verbatimModuleSyntax: true` → `import type`), Vite, bun, oxlint, Playwright, Vitest.
- Application 100 % frontend : pas de backend.
- Stores observer existants (`configStore`, `modelsStore`, `usageStore`, `httpStore`) : pas de nouvelle librairie d'état.
- `configStore` : ajouter `anthropic` à `apiKeys` et gérer la migration des configs existantes (clé absente = chaîne vide).
- Fichiers limités à 300 lignes (oxlint) : prévoir un fichier dédié pour le parser et le builder Anthropic (par ex. `parsersAnthropic.ts`) plutôt que d'alourdir les fichiers existants.
- Toute décision technique structurante (ex. choix du double format) doit être tracée dans `docs/adr/`.

## Critères de succès

1. Anthropic est sélectionnable dans `ProviderSection`, avec saisie de clé, choix du format (natif / compatible OpenAI) et liste de modèles (dynamique avec repli statique).
2. Un message texte, avec et sans streaming, produit une réponse affichée correctement ; les échanges apparaissent dans l'inspecteur HTTP avec les headers Anthropic attendus.
3. Les images, le system prompt, les skills et le structured output fonctionnent avec Anthropic.
4. Une boucle d'appels d'outils MCP aboutit (`tool_use` → `tool_result` → réponse finale).
5. Le toggle « Afficher la réflexion » affiche les blocs de réflexion dans le chat (format natif).
6. Les tokens et le coût estimé s'affichent dans `UsageSection`.
7. `max_tokens` est toujours envoyé ; `temperature` et `top_p` ne sont jamais envoyés à Anthropic.
8. Tests E2E Playwright (fetch mocké, sans clé réelle) et tests unitaires Vitest ajoutés ; `bun run lint`, `bun run build`, `bun run test` et `bun run test:unit` passent, couverture Vitest ≥ 80 %.
9. `AGENTS.md` / README mis à jour (nouveau provider et format).

## Points en suspens

Aucun point bloquant : toutes les décisions nécessaires à l'implémentation sont prises.
