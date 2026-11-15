# ADR 005 — Provider Mistral : Chat Completions et API Responses, sans MCP natif

- **Statut** : accepté
- **Date** : 2026-11-15
- **Décideur** : Jean-Louis GUENEGO

## Contexte

L'évolution 05 ajoute Mistral AI comme provider cloud français, avec une parité fonctionnelle avec les autres providers cloud (chat, streaming, images, structured output, tool calling MCP, usage et coût). Mistral expose `POST /v1/chat/completions` et `POST /v1/responses` (stateless, compatible avec l'API Responses d'OpenAI).

## Décision

- Aucun nouvel `ApiFormat` : `chat_completions` (défaut) et `responses` sont réutilisés. Les particularités de Mistral sont des branches `isMistral()` dans `helpers.ts` et `bodyBuilders.ts`.
- La base URL par défaut est `https://api.mistral.ai/v1` (elle inclut `/v1`, contrairement aux autres providers). `getEndpoint()` et `fetchModels()` n'ajoutent donc pas `/v1` pour Mistral.
- Authentification `Authorization: Bearer`, appel direct depuis le navigateur.
- `chat_completions` : `max_tokens` (et non `max_completion_tokens`) et pas de `stream_options`, Mistral rejetant les champs inconnus ; l'usage arrive dans le dernier chunk. `responses` : `store: false`, sans `previous_response_id` ni `conversation`, l'historique complet étant renvoyé à chaque appel.
- Boucle d'outils locale pour les deux formats ; le MCP natif, les agents et l'API Conversations de Mistral ne sont pas utilisés.
- Liste de repli : `mistral-small-latest` (défaut) et `mistral-large-latest`. `mistral-medium-latest` est écarté car Mistral Medium 3.5 est déprécié depuis le 31/10/2026 au profit de Large 4. Tarifs statiques dans `src/data/mistral-pricing.json`.
- La liste dynamique (`GET {base}/models`) écarte les modèles dont `capabilities.completion_chat` vaut `false`.

## Raisons

- Réutiliser les formats existants montre qu'un provider peut se brancher sans nouveau parser, et permet de comparer Chat Completions et Responses chez un même provider.
- La boucle locale garde les échanges MCP visibles dans l'inspecteur HTTP.

## Conséquences

- Le CORS de `api.mistral.ai`, les événements SSE de `/v1/responses` et le format des ids d'appel d'outil sont à vérifier manuellement avec une vraie clé : les tests automatisés utilisent des réponses mockées.
- Un modèle absent de `mistral-pricing.json` (variante datée, liste dynamique) s'affiche sans coût estimé.
- Tout nouveau `Record<Provider, …>` doit inclure `mistral`.
