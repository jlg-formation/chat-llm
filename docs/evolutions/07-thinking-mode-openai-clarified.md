# Rendre visible et réglable l'effort de réflexion (thinking) OpenAI

## Contexte

Certains modèles OpenAI permettent de régler l'effort de réflexion avant de répondre. Aujourd'hui, ce réglage n'est pas accessible dans le chat pédagogique, et le raisonnement du modèle n'est pas visible. Le chat étant un outil de formation, l'utilisateur doit pouvoir voir ces mécanismes en action : régler l'effort et suivre, si l'API le permet, ce que le modèle explore pendant qu'il réfléchit.

## Objectif

Permettre à l'utilisateur :

1. de régler l'effort de réflexion des modèles OpenAI qui le supportent ;
2. de voir le raisonnement du modèle pendant la génération, dans la conversation.

## Périmètre fonctionnel

### Réglage de l'effort de réflexion

- Le réglage se trouve dans une **nouvelle section « Thinking »** de la sidebar gauche, placée **juste sous « Provider »**. Tout ce qui concerne le raisonnement (réglage et affichage) est regroupé dans cette section.
- La section **s'adapte au modèle sélectionné** : elle ne propose que les niveaux d'effort supportés par ce modèle, plus l'option « Défaut API ». Si le modèle ne supporte aucun réglage d'effort, le contrôle n'est pas proposé.
- Les niveaux supportés proviennent d'une **table de capacités codée en dur**, par modèle. `/v1/models` ne renvoie pas les niveaux d'effort. Les valeurs possibles sont `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`, avec des exceptions par modèle (ex. GPT-6 Astra et GPT-6.2 Astra/Sol rejettent `none` ; GPT-6.1 Sol rejette `none` et `minimal`). Un modèle absent de la table désactive la section avec un message explicite.
- Valeur par défaut : **`medium`**, si le modèle le supporte. Sinon, la valeur par défaut de l'API est utilisée, c'est-à-dire que le champ `reasoning.effort` n'est pas envoyé. La valeur n'est **persistée** (localStorage, configStore) que si l'utilisateur la modifie.
- Le réglage ne s'applique qu'au format `responses`. En `chat_completions`, la section est **désactivée** avec un message explicite.

### Affichage du raisonnement

- Le contenu affiché est le **résumé du raisonnement** fourni par l'API (paramètre `reasoning.summary`). L'API OpenAI n'expose pas le raisonnement brut : les tokens de raisonnement ne sont pas visibles, seul le résumé l'est. Le raisonnement brut n'est donc **pas** une exigence de cette évolution.
- Affichage **en direct** pendant le streaming lorsque le streaming est activé. Sans streaming, le raisonnement s'affiche **à la fin** de la réponse.
- Présentation : **bloc dépliable au-dessus de la réponse, fermé par défaut**.
- Un **interrupteur** (toggle) dans la section Thinking permet d'afficher ou masquer le raisonnement.
- Le raisonnement est **affiché mais non renvoyé** au modèle dans les tours suivants de l'historique.

## Hors périmètre

- Les providers autres qu'OpenAI : **aucune implémentation** pour l'instant. Le `showThinking` d'Anthropic reste en place et n'est pas modifié. La section Thinking doit néanmoins être conçue de façon générique, pour pouvoir accueillir Anthropic plus tard sans refonte.
- Le renvoi du raisonnement dans l'historique des tours suivants.
- Le réglage dans le Header ou dans la section Sampling.

## Utilisateurs cibles

Développeurs et apprenants utilisant le chat pédagogique pour comprendre le fonctionnement des modèles de raisonnement d'OpenAI.

## Contraintes techniques

- Application 100 % frontend (React 19, TypeScript, Vite) ; aucun backend ajouté.
- Le format de requête et de parsing diffère selon l'`apiFormat` (`responses` pour OpenAI) : le réglage et l'extraction du raisonnement doivent respecter ces spécificités, en mode streaming **et** non-streaming.
- Paramètre de réglage : `reasoning.effort` (Responses API). Paramètre de résumé : `reasoning.summary` ; le nom exact est à valider par un appel réel avant implémentation.
- Événements de streaming du résumé : `response.reasoning_summary_text.delta` (et `.done`), distincts de `response.output_text.delta`.
- En non-streaming, le résumé est lu dans les items `type: 'reasoning'` de `output`, champ `summary[].text`.
- Les modèles de raisonnement refusent `temperature` / `top_p` dès qu'un effort différent de `none` est envoyé : ces champs ne doivent pas être envoyés dans ce cas.
- Les tokens de raisonnement sont facturés comme tokens de sortie ; ils sont déjà comptés dans l'usage existant.
- Dans la boucle d'outils, la nécessité de renvoyer les items de raisonnement (`encrypted_content`) doit être vérifiée par un test réel.
- `verbatimModuleSyntax: true` : imports de types via `import type`.
- Les nouveaux champs de configuration passent par `AppConfig` / `DEFAULT_CONFIG` et la migration de `configStore`.
- Les échanges HTTP restent visibles dans `httpStore`.

## Critères de succès

- La section Thinking apparaît juste sous Provider et ne propose que les niveaux supportés par le modèle sélectionné, selon la table de capacités. Si le modèle ne supporte pas de réglage, le contrôle n'est pas proposé.
- La valeur choisie est bien envoyée à l'API ; sans modification, la valeur `medium` est utilisée (si supportée, sinon le champ n'est pas envoyé et la valeur par défaut de l'API s'applique) et rien n'est persisté.
- En `chat_completions`, la section est désactivée avec un message explicite.
- Avec streaming activé, le résumé du raisonnement apparaît progressivement dans le bloc dépliable pendant la réflexion.
- Sans streaming, le raisonnement apparaît une fois la réponse reçue.
- L'interrupteur masque et affiche le bloc de raisonnement.
- Le raisonnement n'est pas inclus dans les messages renvoyés lors des tours suivants.
- Tests E2E (mock SSE OpenAI, dans le style de `tests/e2e/`) et tests unitaires (body builders, parsers) passent.
