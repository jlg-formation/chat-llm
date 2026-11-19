# ADR 008 — Provider Google : Interactions API native et mode compatible OpenAI

- **Statut** : accepté
- **Date** : 2026-11-16
- **Décideur** : Jean-Louis Guenego

## Contexte

Le provider Google n'exposait que l'endpoint OpenAI-compatible (`/v1beta/openai/chat/completions`). Le but pédagogique de l'application est d'exposer le fonctionnement réel des API, y compris les `steps` produits par l'Interactions API (`POST /v1beta/interactions`), que le mode compatible OpenAI masque.

## Décision

Ajouter le format `google_interactions` en parallèle du format `chat_completions` existant, sans le retirer :

- `ApiFormatSelector` propose deux options pour Google : « Interactions API (natif) » et « OpenAI compatible ».
- L'endpoint natif est dérivé de la base configurée en retirant le suffixe `/openai` (la base stockée reste inchangée), avec `?alt=sse` en streaming.
- L'authentification utilise l'en-tête `x-goog-api-key`.
- Le body est construit par `bodyBuildersGoogleInteractions.ts`, et la réponse analysée par `parsersGoogleInteractions.ts` (événements SSE nommés `step.*` / `interaction.completed`, ou tableau `steps` en non-streaming).
- Le format est stateful : `previous_interaction_id` est porté par `lmStudioResponseIdRef`, avec `store: true`. Seul le tour courant (ou les `function_result`) est envoyé. Ce mécanisme est identique à celui de LM Studio.

## Raisons

- Exposer les `steps` (texte, réflexion, appels de fonction) tels que renvoyés par l'API, ce qui est l'objectif pédagogique.
- Garder le mode OpenAI compatible évite de casser les usages existants et permet de comparer les deux approches.
- Un historique côté serveur évite de renvoyer les signatures de réflexion et les appels de fonction à chaque tour.

## Conséquences

- Changer de provider en cours de discussion rompt la chaîne `previous_interaction_id`, comme pour LM Studio.
- Les noms de champs d'usage diffèrent de `extractUsage` (`total_input_tokens`, `total_output_tokens`, `total_thought_tokens`) : le parseur a son propre mapping, et les tokens de réflexion sont comptés en sortie.
- Les formats des événements de streaming sont à valider contre la documentation Google à chaque évolution de l'API (le parseur tolère les événements inconnus).
