# Évolution 06 : génération d'images (OpenAI, Responses API)

## Demande

Ajouter la génération d'images dans le chat, pour OpenAI uniquement, via l'outil hébergé `image_generation` de l'API Responses. Le modèle décide seul s'il génère une image ; l'utilisateur formule simplement sa demande.

## Contexte

- La recherche web hébergée (`web_search`) existe déjà pour OpenAI (format `responses`) et Anthropic (format `anthropic_messages`).
- La génération d'images reprend ce schéma : toggle dans « Outils hébergés », fonction de disponibilité dans `helpers.ts`, outil ajouté au body, extraction dans les parseurs, agrégation dans `Chat.tsx`.
- L'image revient en base64 dans un item `image_generation_call` (champ `result`) accompagné d'un champ `status`. Seuls les items `completed` sont affichés.

## Objectifs

1. Permettre au modèle de générer une image à partir d'une demande textuelle.
2. Afficher l'image générée dans le message assistant.
3. Fonctionner à l'identique en mode streaming et non streamé.
4. Limiter le périmètre à OpenAI, format `responses`.
5. Ne rien changer pour les autres fournisseurs et formats.

## Hors périmètre (phase 1)

- Aperçus partiels pendant la génération (`partial_images`).
- Modification d'une image existante au tour suivant.
- Téléchargement de l'image depuis l'interface.
- Autres fournisseurs (Anthropic, Mistral, OVH, LM Studio, Ollama).
- Persistance : les conversations ne sont pas sauvegardées aujourd'hui, donc les images non plus.

## Fichiers concernés

| Fichier                                         | Rôle de la modification                                                                                                                |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `src/types.ts`                                  | `hostedTools.imageGeneration: boolean` et `hostedTools.imageModel: string` (modèle de l'outil, configurable) ; `HostedActivity.images` |
| `src/store/configStore.ts`                      | Valeur par défaut `false`, vérifier la fusion avec la configuration sauvegardée                                                        |
| `src/services/llm/helpers.ts`                   | `imageGenerationAvailable` (OpenAI + `responses` + modèle de la liste blanche)                                                         |
| `src/services/llm/bodyBuilders.ts`              | Ajout de `{ type: 'image_generation' }` dans `buildOpenAIResponsesBody`                                                                |
| `src/services/llm/parsersImages.ts`             | Nouveau module : extraction des images (streaming et non streamé)                                                                      |
| `src/services/llm/parsers.ts`                   | Appel de `parsersImages.ts` sur les deux chemins                                                                                       |
| `src/services/llm/index.ts`                     | Journal HTTP : base64 remplacé par un marqueur de taille                                                                               |
| `src/services/llm/types.ts`                     | Propagation de `hosted.images`                                                                                                         |
| `src/components/Chat.tsx`                       | Agrégation des images, enregistrement sur le message assistant                                                                         |
| `src/components/chat/ChatMessage.tsx`           | Affichage des images générées                                                                                                          |
| `src/components/sidebar/HostedToolsSection.tsx` | Second toggle « Génération d'images », sélecteur du modèle d'outil, message d'indisponibilité                                          |
| `src/data/openai-image-pricing.json`            | Nouveau : prix officiels des tokens de sortie image (ids 2.6)                                                                          |
| `src/store/usageStore.ts`                       | Compteur d'images générées                                                                                                             |
| `src/components/sidebar/UsageSection.tsx`       | Affichage du compteur et du coût estimé                                                                                                |
| `tests/unit/`                                   | Tests Vitest du parseur d'images (streaming et non streamé)                                                                            |
| `tests/e2e/tcXX-image-generation.spec.ts`       | Scénario E2E avec flux SSE simulé (`tcXX` : prochain numéro libre)                                                                     |

## Points d'attention et recommandations

Chaque point porte une décision à valider (statut « Proposé » par défaut).

### 1. Coût non suivi

**Problème** : `pricing.ts` et `usageStore` ne comptent que les tokens texte. Le coût affiché dans `UsageSection` sera sous-évalué.

**Recommandation** : compter les images générées dans `usageStore` et les afficher dans `UsageSection`. Ajouter un coût par image dans `src/data/openai-image-pricing.json`, au format des autres fichiers `*-pricing.json`, renseigné depuis la page tarifaire officielle OpenAI avec la date de vérification. Afficher ce coût comme « estimé ». Ne pas inventer de tarif.

**Décision** : Proposé.

### 2. Modèle incompatible

**Problème** : l'outil ne fonctionne qu'avec certains modèles. La liste de `models.ts` ne filtre pas cela.

**Recommandation** : établir une liste blanche de modèles compatibles avec `image_generation`, après vérification de la documentation OpenAI, et la placer dans `helpers.ts`. Si le modèle sélectionné n'y figure pas, désactiver le toggle et afficher un message dédié. Ce message est distinct de celui de « Outils hébergés », qui ne couvre que la compatibilité du fournisseur.

**Décision** : Proposé.

### 3. Vérification d'organisation

**Problème** : l'accès au modèle d'image sous-jacent peut exiger une vérification du compte OpenAI. L'erreur doit rester lisible.

**Recommandation** : ne pas contourner la vérification. Afficher l'erreur HTTP telle quelle dans le message assistant (déjà géré par `sendMessage` et le flag `isError`) et ajouter le prérequis au README.

**Décision** : Proposé.

### 4. Volume dans le journal HTTP

**Problème** : une image en base64 pèse souvent plusieurs centaines de Ko. Le panneau `RightSidebar` conserverait tout le contenu dans `httpStore`.

**Recommandation** : dans `src/services/llm/index.ts`, avant `updateExchange`, remplacer le champ `result` par un marqueur de taille, par exemple `"[image base64 : 412 Ko]"`. Le message UI garde l'image complète ; le journal n'en garde aucune trace brute.

**Décision** : Proposé.

### 5. Déclenchement non garanti

**Problème** : le modèle peut ne pas générer d'image si la demande est ambiguë. Un `tool_choice` forcé réduirait la souplesse.

**Recommandation** : laisser le choix automatique, sans `tool_choice` forcé. Ajouter une aide courte sous le toggle : une demande explicite (« génère une image de… ») déclenche l'outil plus sûrement.

**Décision** : Proposé.

### 6. Chemin non streamé

**Problème** : `parseNonStreamingResponse` doit aussi extraire les images. Sans cela, le bug n'apparaît que lorsque le streaming est désactivé.

**Recommandation** : obligatoire en phase 1. Tests Vitest du parseur pour les deux modes, et scénario E2E pour le streaming, conformément à `AGENTS.md`.

**Décision** : Proposé.

### 7. Taille de `parsers.ts`

**Problème** : le fichier dépasse déjà la limite de 300 lignes d'oxlint (avertissement), et l'ajout l'alourdira.

**Recommandation** : créer `src/services/llm/parsersImages.ts` avec une seule fonction d'extraction, appelée depuis `parsers.ts` sur les deux chemins. Même organisation que `parsersAnthropic.ts` et `parsersLmStudio.ts`.

**Décision** : Proposé.

## Modèles compatibles (liste blanche)

Deux listes distinctes, toutes deux issues de la documentation OpenAI (`developers.openai.com`, guide « Image generation tool ») :

- **Modèle principal** (`config.llm.model`, qui appelle l'outil) : `chat-latest`, `gpt-5.2`, `gpt-5.2-pro`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.4-pro`, `gpt-5.5`, `gpt-5.5-pro`, `gpt-5.6-cyber`, `gpt-5.6-luna`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-6-astra`, `gpt-6-cyber`, `gpt-6-luna`, `gpt-6-sol`, `gpt-6.1-sol`, `gpt-6.1-terra`. Constante `IMAGE_GENERATION_MODELS` dans `helpers.ts`.
- **Modèle de l'outil** (`config.hostedTools.imageModel`, champ `model` de l'outil, configurable dans la sidebar) : `gpt-image-2.6-sunburst`, `gpt-image-2.6-flare`. Constante `IMAGE_TOOL_MODELS` dans `helpers.ts`. Valeur par défaut : `gpt-image-2.6-flare`.

Points à vérifier :

- Les identifiants GPT-Image-2.6 visibles dans l'interface ChatGPT ne figurent pas dans la documentation API consultée. Ils ne sont pas ajoutés à la liste tant qu'OpenAI ne les documente pas.
- Les listes sont statiques. Une mise à jour passe par la documentation, pas par l'API.

## Tarification (estimation)

- Le coût d'une image n'est pas publié en prix unitaire sur la page tarifaire consultée (le calculateur est en JavaScript seul).
- Prix officiel (page tarifaire OpenAI, section Images, consultée le 2026-11-15) : `gpt-image-2.6-sunburst` et `gpt-image-2.6-flare` coûtent 30 $ par million de tokens de sortie image (8 $/M en entrée image, 5 $/M en entrée texte, 2 $/M en image cachée, 1,25 $/M en texte caché). Ces prix peuvent évoluer.
- Nommage : OpenAI est passé de 2.5 à 2.6, les ids 2.5 ont été retirés. Les tarifs s'appliquent aux ids 2.6 ; sans `tool_usage.image_gen.output_tokens_details.image_tokens` dans la réponse, le coût affiche « non estimé ».
- Approche : tokens de sortie image × 30 $/M. Les tokens image sont lus dans `tool_usage.image_gen.output_tokens_details.image_tokens` (constaté sur les logs d'un essai réel, `gpt-image-2.6-flare`). Les tokens d'entrée de l'outil (`tool_usage.image_gen.input_tokens`) ne sont pas facturés ici.
- Affichage : coût marqué « estimé ». Aucun prix n'est inventé.
- Les tarifs sont dans `src/data/openai-image-pricing.json`, calcul dans `src/services/imagePricing.ts`.

## Plan de mise en œuvre

**Phase 1**

1. Types, configuration et fonction de disponibilité.
2. Ajout de l'outil dans le body et toggle dans la sidebar.
3. Extraction des images (streaming et non streamé) dans `parsersImages.ts`.
4. Agrégation dans `Chat.tsx` et affichage dans `ChatMessage.tsx`.
5. Journal HTTP avec base64 tronqué.
6. Compteur d'images et coût estimé dans `UsageSection`.
7. Tests Vitest du parseur et scénario E2E.

**Phase 2**

1. Téléchargement de l'image.

## Critères d'acceptation

- Avec OpenAI, format `responses`, modèle compatible et toggle activé, une demande de création d'image affiche l'image dans le message assistant.
- Le résultat est identique en streaming et en mode non streamé.
- Pour les autres fournisseurs et formats, le toggle est désactivé avec un message explicite, et l'outil `image_generation` n'apparaît pas dans le body envoyé (vérifié par les tests).
- Le journal HTTP ne contient pas de base64 brut.
- Le compteur d'images et le coût estimé apparaissent dans `UsageSection`, avec la mention « estimé ».
- Les tests Vitest et E2E passent ; `bun run build` et `bun run lint` sont sans erreur.
