# ADR 001 — Client MCP : ne pas utiliser le SDK TypeScript officiel

- **Statut** : accepté
- **Date** : 2026-06-21
- **Décideur** : Jean-Louis GUENEGO

## Contexte

Le projet est un chat pédagogique 100 % front-end (navigateur, sans backend). Il intègre un client MCP maison ([src/services/mcp.ts](../../src/services/mcp.ts), ~150 lignes) qui implémente le protocole MCP 2025-11-25 via JSON-RPC over HTTP. Ce client gère : handshake `initialize` / `notifications/initialized`, `tools/list`, `tools/call`, `shutdown` / `exit`, gestion de session (`Mcp-Session-Id`), et expiration de session (404 → ré-init automatique).

La question posée : serait-il pertinent de remplacer ce client maison par le SDK TypeScript officiel Anthropic (`@modelcontextprotocol/sdk`) ?

## Décision

**Non.** On conserve le client maison.

## Raisons

1. **Incompatibilité navigateur.** Le SDK officiel est centré Node.js. Son transport principal (`StdioClientTransport`) utilise `child_process` et ne peut pas fonctionner dans un navigateur. Le `StreamableHTTPClientTransport` est théoriquement compatible, mais le SDK n'est pas conçu ni testé en priorité pour un contexte browser-only. Le bundler Vite risque de tirer des dépendances Node.js parasites.

2. **Intégration `httpStore` non négociable.** Toute la valeur pédagogique de la sidebar droite (inspecteur HTTP) repose sur l'interception de chaque échange MCP via `addExchange` / `updateExchange`. Avec le SDK, il faudrait wrapper le transport ou intercepter `fetch` globalement — plus fragile que l'implémentation directe actuelle.

3. **Surface utilisée minuscule.** On n'utilise que 4 méthodes JSON-RPC. Le SDK (`~200 KB+`) apporterait du poids bundle pour une surface d'API à 5 %.

4. **Code existant suffisant.** 150 lignes, bien délimitées, faciles à faire évoluer si le protocole change.

## Conséquences

- Le client reste maintenu à la main en cas d'évolution du protocole MCP.
- Si le projet évolue vers un backend Node.js (ex. proxy MCP) ou doit supporter des serveurs stdio, la décision devra être réévaluée — le SDK deviendrait alors pertinent côté backend.
