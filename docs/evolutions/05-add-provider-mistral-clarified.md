# Évolution 05 — Ajout du provider Mistral AI

## Contexte

Chat Pédagogique IA est une application 100 % frontend (React 19 + TypeScript + Vite) qui expose les échanges HTTP, le streaming SSE, le structured output, les skills et le tool calling. Elle unifie aujourd'hui 5 providers (OpenAI, Anthropic, OVH AI, LM Studio, Ollama) derrière `sendMessage()`, chacun avec son format d'API.

La demande initiale : « comme on a fait avec Anthropic, ajouter Mistral, le français, pour avoir un exemple de provider français en plus d'OVH ».

## Objectif

Ajouter **Mistral AI** comme provider sélectionnable, avec une **parité fonctionnelle** avec les autres providers cloud : chat, streaming, images, system prompt, skills, structured output, tool calling via MCP, comptage de tokens et coût estimé, inspection HTTP. La démarche suit celle de l'évolution 04 (Anthropic).

## Périmètre fonctionnel

### 1. Provider et position dans la liste

- Ajouter `'mistral'` au type `Provider` dans `src/types.ts`.
- Dans la liste des providers de `ProviderSection`, Mistral est en **3ᵉ position** (après OpenAI et Anthropic, avant OVH).

### 2. Formats d'API (deux, au choix de l'utilisateur)

- **`chat_completions`** (format existant) sur `POST {baseUrl}/chat/completions`. **Format par défaut.** Réutilise les builders et parsers existants, avec les adaptations propres à Mistral.
- **API Responses** de Mistral (`POST {baseUrl}/responses`) : réutilise le format existant **`responses`** (aucun nouvel `ApiFormat`). API **stateless**, compatible avec l'API Responses d'OpenAI. Elle remplace l'API Conversations initialement envisagée (stateful, orientée agents, documentation non accessible) : la doc Mistral de référence expose désormais `/v1/responses`.
- Contraintes Mistral sur `/v1/responses` à respecter dans le body : `store` absent ou `false`, `previous_response_id` et `conversation` absents ou `null`, `background` à `false`, `truncation` à `"disabled"`. L'historique complet est renvoyé dans `input` à chaque appel (comme pour OpenAI dans l'application).
- Le sélecteur de format dans `ProviderSection` propose ces deux options pour Mistral. La heuristique de repli (`helpers.ts`) renvoie `chat_completions` pour ce provider.
- Les détails d'API (champs, événements SSE exacts, structure des items) sont à valider contre la doc Mistral et des appels réels pendant l'implémentation, la page de référence ne détaillant pas les événements SSE.

### 3. Authentification et accès navigateur

- Appel **direct depuis le navigateur**, sans proxy.
- Clé API stockée dans `apiKeys.mistral` (localStorage) et envoyée via `Authorization: Bearer`.
- Base URL modifiable dans l'UI, valeur par défaut `https://api.mistral.ai/v1`.

### 4. Liste des modèles

- Récupération dynamique via `GET /v1/models` dans `fetchModels()` (`src/services/models.ts`), normalisée vers `ModelInfo`, mise en cache dans `modelsStore`.
- **Liste statique de repli** (clé absente ou erreur réseau) :
  - `mistral-small-latest` (**défaut**, le moins cher)
  - `mistral-medium-latest`
  - `mistral-large-latest`
- Les modèles de raisonnement (Magistral) et spécialisés (Codestral, Pixtral, Ministral) ne sont pas dans la liste de repli ; ils restent sélectionnables s'ils apparaissent dans la liste dynamique.

### 5. Paramètres de sampling

- `temperature`, `top_p` et `max_tokens` sont gérés comme pour OpenAI (`null` = non envoyé), avec les contrôles habituels de `SamplingSection`.
- Noms de champs : `max_tokens` en `chat_completions`, `max_output_tokens` en `responses`.
- Pas de paramètre propre à Mistral ajouté (pas de `random_seed`, `reasoning`, etc.).

### 6. Structured output

- Supporté via le JSON Schema saisi dans `JsonSchemaSection`, avec `strict: false` par défaut :
  - `chat_completions` : `response_format: { type: "json_schema", json_schema: { name, schema, strict } }`.
  - `responses` : `text.format` (`type: "json_schema"`), comme pour OpenAI.

### 7. Tool calling et MCP

- Boucle agentique **locale** (`Chat.tsx`) avec le client MCP existant, pour les **deux formats**. Le MCP natif de Mistral (connecteurs / agents côté serveur) n'est **pas** utilisé.
- Le tool `get_skill_details` des skills fonctionne via la même boucle.
- Sérialisation des appels et résultats d'outils propre à chaque format (chat_completions : `tool_calls` / rôle `tool` ; responses : items `function_call` / `function_call_output`), réutilisant les builders existants.

### 8. Streaming

- Parité streaming ON / OFF pour les deux formats : chemin non-streaming implémenté et testé.
- `chat_completions` : SSE standard avec sentinelle `data: [DONE]`. `responses` : événements SSE de type Responses, réutilisant le parser existant ; à vérifier que les noms d'événements Mistral sont identiques à ceux d'OpenAI.

### 9. Images

- **Hypothèse retenue : tous les modèles Mistral acceptent la vision** (VLM). Aucune table de capacités par modèle, aucune désactivation de l'envoi d'image selon le modèle.
- Les images collées sont envoyées en `image_url` (data URL base64) en `chat_completions`, et au format de contenu d'image du format `responses` (comme pour OpenAI).

### 10. Usage et coût

- Lecture des tokens (`prompt_tokens` / `completion_tokens` en `chat_completions`, `input_tokens` / `output_tokens` en `responses`) alimentant `usageStore`.
- **Pricing statique** : fichier `src/data/mistral-pricing.json` pour les 3 modèles de la liste de repli (sur le modèle de `anthropic-pricing.json`), consommé par `src/services/pricing.ts`. Pas d'ajout à `scripts/fetch-pricing.mjs`.
- Un modèle absent du fichier de tarifs s'affiche sans coût estimé.

## Hors périmètre

- MCP natif / agents / connecteurs / API Conversations côté Mistral.
- Proxy CORS ou backend intermédiaire.
- Script automatique de mise à jour des tarifs Mistral.
- Modèles de raisonnement (Magistral) avec affichage de la réflexion, OCR, embeddings, fine-tuning, batch, files API.
- Paramètres de sampling propres à Mistral (`random_seed`, pénalités…).

## Utilisateurs cibles

Les développeurs en formation qui utilisent l'application pour observer les échanges HTTP et comparer le comportement des providers LLM. Ils fournissent leur propre clé API Mistral.

## Contraintes techniques

- Stack existante : React 19, TypeScript (`verbatimModuleSyntax: true` → `import type`), Vite, bun, oxlint, Playwright, Vitest.
- Application 100 % frontend, stores observer existants : pas de nouvelle librairie.
- `configStore` : ajouter `mistral` à `apiKeys` et gérer la migration des configs existantes (clé absente = chaîne vide).
- Fichiers limités à 300 lignes (oxlint) : si les adaptations Mistral alourdissent `bodyBuilders.ts` ou les parsers, les isoler dans un fichier dédié.
- Décision structurante (choix des deux formats `chat_completions` + `responses`, absence de MCP natif) tracée dans un nouvel ADR `docs/adr/005-…`.

## Critères de succès

1. Mistral est sélectionnable en 3ᵉ position dans `ProviderSection`, avec saisie de clé, choix du format (chat_completions / responses) et liste de modèles (dynamique avec repli statique).
2. Un message texte, avec et sans streaming, produit une réponse correcte dans les deux formats ; l'inspecteur HTTP montre les échanges attendus (header `Authorization: Bearer`).
3. Le system prompt, les skills, le structured output et les images fonctionnent avec tous les modèles Mistral.
4. Une boucle d'appels d'outils MCP aboutit dans les deux formats.
5. Tokens et coût estimé s'affichent dans `UsageSection` pour les 3 modèles de repli.
6. Tests E2E Playwright (fetch mocké, sans clé réelle) et tests unitaires Vitest ajoutés ; `bun run lint`, `bun run build`, `bun run test` et `bun run test:unit` passent, couverture Vitest ≥ 80 %.
7. ADR créé ; `AGENTS.md` et README mis à jour (nouveau provider et format).

## Points en suspens

- Les événements SSE exacts de `/v1/responses` chez Mistral (non détaillés dans la page de référence) et la structure des items : à valider lors de l'implémentation.
- Vérifier que le body `responses` existant n'envoie pas de champ refusé par Mistral (`store`, `previous_response_id`, etc.).
