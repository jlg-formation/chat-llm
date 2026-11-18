# ADR 007 — Réflexion OpenAI : effort par table de capacités et résumé uniquement

- **Statut** : accepté
- **Date** : 2026-11-18
- **Décideur** : Jean-Louis GUENEGO

## Contexte

L'évolution 07 ajoute le réglage de l'effort de raisonnement (`reasoning.effort`, Responses API) et l'affichage du raisonnement. L'API OpenAI n'expose pas le raisonnement brut : seul le résumé (`reasoning.summary`) est disponible, en streaming (`response.reasoning_summary_text.delta`) ou dans les items `type: 'reasoning'` en non-streaming. Les niveaux acceptés varient selon le modèle (certains refusent `none` ou `minimal`).

## Décision

- Table de capacités figée dans le code : `src/services/llm/reasoningCapabilities.ts` associe chaque modèle à ses niveaux d'effort. Un modèle absent de la table n'envoie pas de champ `reasoning.effort`.
- Valeur par défaut : `medium` si le modèle le supporte. La valeur n'est persistée que si l'utilisateur la modifie. `api_default` omet le champ.
- Le corps Responses envoie `reasoning: { effort, summary: 'auto' }` pour les modèles de la table. Le paramètre de sampling `temperature` / `top_p` est retiré dès que l'effort n'est pas `none`.
- Seul le résumé est affiché. Le réglage et le toggle d'affichage vivent dans la section sidebar « Thinking ». Le toggle ne fait que masquer l'affichage : le résumé reste demandé à l'API.
- Le bloc de réflexion OpenAI est replié par défaut (`ChatMessage.thinkingClosed`). Le comportement Anthropic (ouvert pendant le streaming) reste inchangé.
- Le raisonnement affiché n'est jamais renvoyé à l'API dans les tours suivants.

## Raisons

- Une table statique évite un appel supplémentaire pour découvrir les niveaux acceptés, au prix d'une maintenance manuelle à chaque nouveau modèle.
- Afficher uniquement le résumé respecte la limite de l'API et évite de présenter comme « raisonnement brut » ce qui ne l'est pas.

## Conséquences

- Les entrées de la table au-delà des exceptions connues (refus de `none` / `minimal`) sont des hypothèses. Les noms de paramètre (`summary: 'auto'`) et les noms d'événements SSE doivent être validés avec une vraie clé API.
- Si OpenAI exige `include` (par exemple `reasoning.encrypted_content`) pour les appels d'outils en boucle, ce point reste à vérifier.
- Les tests automatisés utilisent des réponses mockées.
