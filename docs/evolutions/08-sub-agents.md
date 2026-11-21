# Évolution 08 : outil de lancement de sous-agents

## Demande

Ajouter un outil permettant à l'agent principal de lancer des sous-agents. Les sous-agents sont simples : pas de prompt système personnalisé. Ils héritent par défaut du modèle et du provider de l'agent qui les lance. L'appel de fonction peut optionnellement préciser un autre modèle et provider. L'agent principal fournit le prompt d'entrée de chaque sous-agent. Les sous-agents peuvent être lancés en parallèle ou en séquence.

## Contexte

- L'agent principal exécute déjà une boucle d'outils dans `src/components/Chat.tsx` (`resolveToolCall()`, `Promise.all()`, maximum 100 itérations).
- Un sous-agent serait un appel à `sendMessage()` (`src/services/llm/index.ts`) avec un historique réduit au prompt fourni, sans prompt système personnalisé.
- Le mode parallèle existe déjà pour les appels d'outils (`Promise.all()`). Le mode séquentiel demande une exécution ordonnée.

## Objectifs

1. Exposer un outil `run_subagents` (nom indicatif) au modèle, avec une liste de tâches.
2. Chaque tâche contient un prompt obligatoire et, en option, `provider` et `model`.
3. Sans `provider` ni `model`, le sous-agent reprend ceux de l'agent appelant.
4. Supporter un mode `parallel` et un mode `sequential`. En séquentiel, chaque sous-agent reçoit le résultat du sous-agent précédent.
5. Retourner à l'agent principal, pour chaque sous-agent, sa réponse (ou son erreur), dans un `tool_result` au format JSON structuré (point 9). Afficher les sous-agents à la fois dans le `tool_result` dépliable du chat et dans l'inspecteur HTTP (`RightSidebar`).
6. Journaliser les échanges HTTP des sous-agents dans `httpStore`, comme les autres appels.
7. Ne rien changer au comportement existant lorsque l'outil n'est pas utilisé.
8. Donner aux sous-agents les mêmes outils que l'agent principal (outils MCP, skills, outils hébergés si le provider cible est OpenAI), à l'exception de `run_subagents`.
9. Ajouter dans le panneau de configuration un switch pour activer ou désactiver l'outil `run_subagents`.
10. Afficher en direct la réponse en streaming de chaque sous-agent pendant son exécution.

## Hors périmètre (phase 1)

- Prompt système personnalisé par sous-agent.
- Sous-agents imbriqués (un sous-agent qui en lance d'autres) : interdit en v1, décision validée par l'utilisateur.
- Fournisseurs Ollama et LM Studio (formats `ollama_chat` et `lmstudio_chat`).
- Persistance ou affichage hiérarchique des sous-agents dans le chat.
- Historique partagé entre l'agent principal et les sous-agents.

## Fichiers concernés

| Fichier                               | Rôle de la modification                                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `src/types.ts`                        | Types `SubAgentTask`, `SubAgentResult` ; éventuel champ de configuration `subAgents`                    |
| `src/services/subAgents.ts`           | Nouveau module : définition de l'outil, exécution parallèle ou séquentielle, résolution provider/modèle |
| `src/services/llm/index.ts`           | Appel de `sendMessage()` pour chaque sous-agent, avec l'historique réduit au prompt                     |
| `src/components/Chat.tsx`             | Routage de l'outil `run_subagents` dans `resolveToolCall()`, ajout du `tool_result`                     |
| `src/components/chat/ChatMessage.tsx` | Affichage dépliable des réponses des sous-agents dans le `tool_result`                                  |
| `src/components/sidebar/`             | Switch d'activation de `run_subagents` (composant `Toggle.tsx` existant)                                |
| `src/services/llm/bodyBuilders.ts`    | Déclaration de l'outil dans le corps de requête, selon le format de chaque provider                     |
| `tests/unit/`                         | Tests Vitest : résolution du provider et du modèle, modes parallèle et séquentiel, erreurs              |
| `tests/e2e/tcXX-sub-agents.spec.ts`   | Scénario E2E avec réponses simulées (`tcXX` : prochain numéro libre)                                    |

## Points d'attention et recommandations

Chaque point porte une décision validée.

### 1. Déclaration d'outil selon le format

**Problème** : chaque format (`responses`, `chat_completions`, `anthropic_messages`, `ollama_chat`, `lmstudio_chat`) déclare et sérialise les outils différemment. LM Studio gère les outils via `integrations`, sans boucle locale.

**Recommandation** : déclarer `run_subagents` comme un outil de fonction local, traité par la boucle de `Chat.tsx`. Écrire une fonction de sérialisation par format, dans `subAgents.ts` ou un module dédié, qui produit la forme attendue :

| Format                | Forme de la déclaration                                             |
| --------------------- | ------------------------------------------------------------------- |
| `responses`           | `{ type: 'function', name, description, parameters }`               |
| `chat_completions`    | `{ type: 'function', function: { name, description, parameters } }` |
| `anthropic_messages`  | `{ name, description, input_schema }`                               |
| `google_interactions` | Forme à relever dans `bodyBuildersGoogleInteractions.ts`            |

Ollama et LM Studio sont exclus de la phase 1 (décision de l'utilisateur).

**Décision** : Validé. Implémenter la sérialisation pour les trois formats ci-dessus, avec des tests unitaires par format.

### 2. Changement de provider et clés API

**Problème** : un sous-agent qui change de provider nécessite la clé API correspondante. Si elle est absente, l'appel échoue.

**Recommandation** : retourner une erreur explicite dans le `tool_result` de la tâche concernée, sans interrompre les autres tâches.

**Décision** : Validé. Erreur dans le `tool_result` de la tâche concernée. Format du provider cible : le format configuré pour ce provider, à condition qu'il accepte les outils ; sinon défaut heuristique (`responses` pour OpenAI, `chat_completions` pour les autres). Les outils hébergés ne sont transmis qu'aux sous-agents dont le provider cible est OpenAI.

### 3. Limite de concurrence et de coût

**Problème** : un modèle peut lancer un grand nombre de sous-agents en parallèle, ce qui multiplie les appels et les coûts. `usageStore` compte déjà les tokens de tous les appels.

**Recommandation** : limiter le nombre de tâches par appel (valeur à fixer, par exemple 5) et le nombre de sous-agents simultanés. Vérifier que les tokens des sous-agents sont bien comptés dans `usageStore`.

**Décision** : Validé. Maximum 5 sous-agents par appel de `run_subagents`. Tokens des sous-agents comptés dans `usageStore`.

### 4. Gestion des erreurs et annulation

**Problème** : un sous-agent peut échouer ou être lent. En mode séquentiel, un échec doit-il arrêter la suite ?

**Recommandation** : en mode séquentiel, un échec n'arrête pas les tâches suivantes ; chaque résultat (succès ou erreur) est retourné. Prévoir un délai maximal par sous-agent.

**Décision** : Validé. En séquentiel, un échec n'arrête pas les suivants et chaque sous-agent reçoit le résultat du précédent. Délai maximal de 120 s par sous-agent. Annulation : l'arrêt de la génération interrompt tous les sous-agents en cours.

### 5. Outils partagés et récursion

**Problème** : un sous-agent qui reçoit `run_subagents` pourrait en lancer d'autres, ce qui est hors périmètre. Chaque sous-agent exécute aussi sa propre boucle d'outils, avec le même plafond de 100 itérations.

**Recommandation** : la liste d'outils d'un sous-agent est celle de l'agent principal, moins `run_subagents`. Le plafond de 100 itérations s'applique à chaque sous-agent. Les appels MCP des sous-agents sont journalisés dans `httpStore`.

**Décision** : Validé. Pas de récursion en v1 : un sous-agent ne peut pas lancer de sous-agents.

### 6. Consigne de l'agent principal

**Problème** : sans consigne, le modèle ne sait pas quand utiliser l'outil. La consigne est la description textuelle de l'outil, lue par le modèle principal à chaque requête.

**Recommandation** : la description de l'outil précise son usage (tâches indépendantes, parallélisables) et le format attendu du prompt de chaque tâche.

**Décision** : Validé.

### 7. Streaming visible des sous-agents

**Problème** : le streaming actuel de `Chat.tsx` alimente un seul message. Plusieurs sous-agents en parallèle produisent des flux simultanés qu'il faut attribuer à la bonne tâche.

**Recommandation** : chaque sous-agent reçoit son propre callback de streaming, identifié par l'index de la tâche. `ChatMessage.tsx` affiche un bloc par sous-agent, dont le texte grandit pendant l'exécution. Le switch de streaming existant (`StreamSection`) s'applique aussi aux sous-agents ; sans streaming, le bloc s'affiche une fois terminé.

**Décision** : Validé. Streaming visible pendant l'exécution, un bloc par sous-agent.

### 8. Switch d'activation

**Problème** : l'utilisateur doit pouvoir activer ou couper `run_subagents` sans modifier le code. Le switch doit aussi rester désactivé par défaut pour respecter l'objectif 7.

**Recommandation** : ajouter un champ booléen (par exemple `subAgentsEnabled`) dans `AppConfig`, valeur par défaut `false`, persisté dans `configStore`. Placer le switch dans la barre latérale gauche, à coté des outils hébergés. Quand le switch est désactivé, l'outil n'est ni déclaré dans le corps de requête ni routable dans `Chat.tsx`.

**Décision** : Validé.

### 9. Format du `tool_result`

**Problème** : le `tool_result` doit être lisible par le modèle principal et par l'interface, pour chaque tâche.

**Recommandation** : un JSON structuré, un objet par tâche, dans l'ordre d'appel : `index`, `provider`, `model`, `status` (`ok` ou `error`), et `content` ou `error`.

**Décision** : Validé.

### 10. Ollama et LM Studio actifs

**Décision** : Validé. Le switch est désactivé avec la mention « non supporté par ce provider ». L'outil n'est pas déclaré. Un sous-agent visant Ollama ou LM Studio renvoie une erreur dans son `tool_result`.

### 11. Mode séquentiel

**Décision** : Validé. Le résultat du sous-agent précédent est ajouté au prompt de la tâche suivante, sous un bloc « Résultat précédent (tâche N) ». Si le précédent a échoué, le bloc indique l'échec et son message.

### 12. Paramètres hérités

**Décision** : Validé. `temperature`, `topP` et `maxTokens` sont hérités de la configuration. `showThinking` est forcé à désactivé. La sortie structurée (JSON Schema) n'est pas héritée : les sous-agents répondent en texte libre.

### 13. Schéma de l'outil et providers cibles

**Décision** : Validé. Schéma : `mode` (`parallel` par défaut, ou `sequential`) et `tasks` (1 à 5 objets `{ prompt, provider?, model? }`). Providers cibles : `openai`, `anthropic`, `mistral`, `ovh`, `google` (format `google_interactions`).
