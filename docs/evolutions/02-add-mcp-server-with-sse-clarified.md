# Évolution 02 — Support des serveurs MCP en Streamable HTTP (SSE) — version clarifiée

Ce document précise la demande initiale ([02-add-mcp-server-with-sse.md](02-add-mcp-server-with-sse.md)) à partir de l'étude d'impact et des décisions prises. Il ne contient pas de code.

## Besoin

Permettre au chat pédagogique de dialoguer avec des serveurs MCP qui répondent en **Streamable HTTP**, c'est-à-dire dont les réponses POST peuvent arriver en `text/event-stream` (SSE), en plus du mode JSON actuel.

## Périmètre

Inclus :

- Lecture des réponses SSE dans le client MCP ([src/services/mcp.ts](../../src/services/mcp.ts)).
- Affichage de ces échanges dans l'inspecteur HTTP, sur le même modèle que le LLM en streaming.
- Fermeture de session par `DELETE`, conformément à la spec.
- Tests E2E avec un flux SSE simulé.

Exclus (pour cette évolution) :

- Ouverture du flux GET serveur vers client (notifications serveur). Un 405 de la part du serveur est toléré.
- Affichage des événements SSE intermédiaires dans l'inspecteur.
- Passage par `EventSource` (ne permet pas de faire un POST avec body et headers).
- Modification du backend LM Studio (`integrations`).

## Décisions

1. **Détection du mode par `Content-Type`** : `application/json` → comportement actuel ; `text/event-stream` → parsing SSE. Pas de champ de configuration `transport` dans l'UI.
2. **Header `Accept` inchangé** : `application/json, text/event-stream`. La spec impose d'annoncer les deux, et c'est le serveur qui choisit le format de réponse.
3. **Lecture avec `fetch` + `ReadableStream`** et un parser SSE maison, en cohérence avec l'ADR 001 (pas de SDK officiel). Le parser LLM existant (`parseSSEStream`) est à réutiliser si son interface s'y prête, sinon à extraire.
4. **Identifiant JSON-RPC** : un compteur incrémental remplace l'`id: 1` fixe, afin d'associer la réponse à la bonne requête dans un flux.
5. **Timeout** via `AbortController` sur les appels MCP, pour qu'un flux bloqué ne fige pas l'interface.
6. **Inspecteur HTTP** (même modèle que le LLM en streaming) :
   - headers de réponse, dont `content-type: text/event-stream` ;
   - body = résultat reconstruit (message JSON-RPC correspondant à l'id de la requête) ;
   - pas d'affichage des événements intermédiaires.
7. **Fermeture de session** : `DELETE` sur l'URL du serveur avec `Mcp-Session-Id`, en remplacement de `shutdown` / `exit` (méthodes LSP, hors spec MCP).

## Prérequis

- **CORS côté serveur distant** : `Access-Control-Allow-Headers` doit autoriser `Mcp-Session-Id`, `MCP-Protocol-Version` et `Authorization` ; `Access-Control-Expose-Headers` doit exposer `Mcp-Session-Id`. Sans cela, la session est absente côté navigateur. Ce point ne dépend pas du client.
- Le serveur d'exemple [exemple-mcp/mcp.php](../../exemple-mcp/mcp.php) répond déjà en JSON et reste compatible sans modification.

## Critères d'acceptation

- Un serveur qui répond en JSON fonctionne exactement comme avant.
- Un serveur qui répond en SSE : `initialize`, `tools/list` et `tools/call` aboutissent, et les outils apparaissent dans la sidebar.
- L'inspecteur HTTP montre pour chaque appel SSE le `content-type`, le statut et le résultat reconstruit.
- Un flux qui ne se termine pas est interrompu par le timeout et remonte une erreur lisible dans l'inspecteur.
- La fermeture d'un serveur envoie un `DELETE` avec `Mcp-Session-Id`.
- Un test E2E couvre le flux SSE simulé (`initialize`, `notifications/initialized`, `tools/list`, `tools/call`).

## Points à vérifier avant codage

- Le commentaire de [src/services/llm/bodyBuilders.ts](../../src/services/llm/bodyBuilders.ts) mentionne `ephemeral_mcp`, alors que le code envoie `type: 'plugin'`. À vérifier auprès de la doc LM Studio, sans lien avec cette évolution.
- Choix à confirmer : garder `shutdown` / `exit` en plus du `DELETE` pour compatibilité, ou les supprimer.

## Suite

- Rédiger une ADR (`002-mcp-streamable-http.md`) au moment de l'implémentation, si le choix `fetch` + parser maison est validé.
- Option : ajouter un serveur de test Streamable HTTP dans `exemple-mcp/` pour valider de bout en bout.
