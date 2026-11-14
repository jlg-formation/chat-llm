# ADR 004 — Provider Anthropic : API Messages native et mode compatible OpenAI

- **Statut** : accepté
- **Date** : 2026-11-14
- **Décideur** : Jean-Louis GUENEGO

## Contexte

L'évolution 04 ajoute Anthropic (Claude) avec une parité fonctionnelle complète (chat, streaming, images, structured output, tool calling MCP, usage et coût). Anthropic expose deux surfaces : l'API Messages native (`/v1/messages`) et un endpoint compatible OpenAI (`/v1/chat/completions`) aux capacités réduites.

## Décision

- Deux formats au choix de l'utilisateur : `anthropic_messages` (défaut, nouveau `ApiFormat`) et `chat_completions` réutilisé sur l'endpoint de compatibilité.
- Appel direct depuis le navigateur : `x-api-key`, `anthropic-version: 2026-10-21` et `anthropic-dangerous-direct-browser-access: true`, quel que soit le format.
- Sampling : `temperature` et `top_p` ne sont jamais envoyés (rejetés par les modèles 5.x), `max_tokens` l'est toujours (défaut 4096).
- Réflexion adaptative (non désactivable) : seul l'affichage se règle (`thinking.display` = `summarized` ou `omitted`, réglage `LLMConfig.showThinking`). Indisponible en mode compatible.
- Structured output natif via `output_config.format` (le schéma interne de `{ name, schema }` est extrait) ; `strict: true` forcé en mode compatible.
- Boucle d'outils locale (pas de `mcp_servers`). Les blocs `thinking` / `redacted_thinking` sont conservés bruts dans `ChatMessage.thinkingBlocks` et rejoués avec les `tool_use`. Les messages d'une même itération partagent `ChatMessage.toolTurnId` pour que le builder les regroupe en un message assistant et un message user.
- Parser dédié (`parsersAnthropic.ts`) : le streaming assemble des blocs, puis passe par la même fonction que le non-streaming pour garantir la parité.
- Tarifs statiques (`src/data/anthropic-pricing.json`) ; le palier tarifaire de Haiku 5.5 (> 100 000 tokens de prompt) n'est pas appliqué car `usageStore` ne cumule que des totaux : le palier bas est utilisé et signalé.

## Raisons

- Le format natif est le seul à exposer réflexion, signatures et structured output natif, ce qui est l'intérêt pédagogique ; le mode compatible permet de comparer les deux surfaces.
- Regrouper par `toolTurnId` est nécessaire car Anthropic exige tous les `tool_result` d'un tour dans un unique message user, alors que l'historique de l'application stocke un message par appel.
- Un fichier dédié évite de dépasser 300 lignes dans `bodyBuilders.ts` et `parsers.ts`.

## Conséquences

- Le CORS de l'endpoint de compatibilité n'est pas garanti : à vérifier manuellement avec une vraie clé.
- Les réflexions des tours intermédiaires de la boucle d'outils ne sont pas affichées dans le chat (visibles dans l'inspecteur HTTP).
- Les messages d'outils créés avant cette évolution n'ont pas de `toolTurnId` : ils sont regroupés ensemble, sans incidence car l'historique n'est pas persisté.
- Tout nouveau `Record<Provider, …>` doit inclure `anthropic`.
