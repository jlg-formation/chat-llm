# ADR 002 — Client MCP : support de la réponse text/event-stream (Streamable HTTP)

- **Statut** : accepté
- **Date** : 2026-06-21
- **Décideur** : Jean-Louis GUENEGO

## Contexte

Le client MCP ([ADR 001](001-mcp-client-pas-de-sdk-officiel.md)) appelait `resp.json()` sur toute réponse HTTP. Un serveur MCP conforme au transport Streamable HTTP peut répondre à une requête POST en `text/event-stream` (SSE), ce qui cassait la connexion, la liste d'outils et les appels d'outils.

## Décision

- `mcpPost` branche sur le `Content-Type` de la réponse : `application/json` (comportement existant) ou `text/event-stream`.
- Le flux SSE est lu par un parser générique `src/services/sse.ts` (`parseSSEEvents`), indépendant des formats LLM.
- `readSSEResponse` retient le message JSON-RPC dont l'`id` correspond à la requête (les notifications serveur intercalées sont ignorées).
- Les ids JSON-RPC sont incrémentés (`nextRpcId()`) au lieu d'un `id: 1` fixe.
- Un timeout de 15 s (`AbortController`) interrompt les requêtes bloquées (erreur `MCP timeout (15000 ms)`).
- La déconnexion envoie `DELETE` avec `Mcp-Session-Id` (si une session existe) au lieu de `shutdown` / `exit`, qui sont des méthodes LSP et non MCP.
- L'inspecteur HTTP affiche les en-têtes (dont `content-type`) et le corps JSON-RPC reconstruit, à l'image du streaming LLM. Les événements SSE bruts ne sont pas affichés.
- Le parser `src/services/llm/parsers.ts` n'est pas modifié, pour éviter toute régression sur les formats LLM.

## Raisons

- La spécification impose au client d'accepter les deux types de réponse ; forcer `application/json` via `Accept` n'est pas conforme.
- Un parser séparé évite de complexifier `parseSSEStream` (qui ne gère que `data: ` et le sentinelle `[DONE]`).
- La reconstruction JSON-RPC dans l'inspecteur reste lisible pour un public pédagogique, sans exposer le détail du transport.

## Conséquences

- **Contraintes CORS** : le serveur distant doit exposer `Mcp-Session-Id` (`Access-Control-Expose-Headers`), sinon le navigateur ne peut pas lire la session et la déconnexion n'envoie pas de `DELETE`.
- Les serveurs doivent aussi autoriser `Authorization`, `Mcp-Session-Id` et `MCP-Protocol-Version` dans les en-têtes CORS.
- Un serveur qui ne répond jamais bloque l'appel au plus 15 s, puis une erreur est affichée.
- Tests : `tests/tc50-53-mcp.spec.ts` (mock mis à jour, déconnexion en `DELETE`) et `tests/tc94-mcp-streamable-http.spec.ts` (réponses SSE, inspecteur, timeout, appel d'outil).
- Hors périmètre : l'intégration LM Studio (`integrations` dans `bodyBuilders.ts`) n'est pas modifiée.
