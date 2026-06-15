# Scénarios de tests E2E — Chat Pédagogique IA

> Tests Playwright ciblant les principaux flux utilisateur.  
> Serveur dev requis : `bun run dev` → `http://localhost:5173/chat-llm/`

## Hypothèses d'environnement

Les clés API sont disponibles en **variables d'environnement** dans le terminal qui lance Playwright. Les tests les lisent via `process.env` et les injectent dans la configuration de l'app (localStorage ou champ UI) en setup de suite — elles ne sont jamais codées en dur dans les tests.

| Variable | Provider |
|----------|----------|
| `OPENAI_API_KEY` | OpenAI |
| `OVH_API_KEY` | OVH AI Endpoints |
| `LMSTUDIO_API_KEY` | LM Studio (si authentification activée) |

Les tests qui nécessitent un vrai appel réseau (non mocké) doivent vérifier en setup que la variable correspondante est définie, et passer (`test.skip`) si elle est absente.

---

## Conventions

| Symbole | Signification |
|---------|--------------|
| `[P0]` | Critique — le flux cœur de l'app |
| `[P1]` | Important — fonctionnalité fréquemment utilisée |
| `[P2]` | Secondaire — edge case ou fonctionnalité avancée |

---

## 1. Configuration LLM

### TC-01 · Sélection du provider et du modèle `[P0]`

**Script :** [`tc01-provider-selection.spec.ts`](../tests/tc01-provider-selection.spec.ts)

**Objectif :** Vérifier que le changement de provider met à jour cohéremment l'URL de base, la liste de modèles et le format API.

**Préconditions :** App fraîchement chargée (localStorage vide).

**Étapes :**
1. Ouvrir la section « Provider LLM » dans la sidebar gauche.
2. Sélectionner le provider **OVH**.
3. Vérifier que l'URL de base passe sur l'endpoint OVH.
4. Vérifier que le sélecteur de format API propose `chat_completions` et `responses`.
5. Sélectionner le provider **Ollama**.
6. Vérifier que le champ URL est éditable et pré-rempli avec `http://localhost:11434`.
7. Sélectionner le provider **OpenAI**.
8. Vérifier que l'URL de base est verrouillée (non éditable).

**Résultat attendu :** Chaque changement de provider met à jour l'UI de façon cohérente sans rechargement de page.

---

### TC-02 · Injection et masquage de la clé API `[P0]`

**Script :** [`tc02-api-key.spec.ts`](../tests/tc02-api-key.spec.ts)

**Préconditions :** `OPENAI_API_KEY` définie dans l'environnement.

**Étapes :**
1. En setup de test, écrire la clé lue depuis `process.env.OPENAI_API_KEY` dans le localStorage (`chat_pedagogique_config` → `llm.apiKeys.openai`).
2. Recharger la page.
3. Ouvrir la section « Provider LLM ».
4. Vérifier que le champ clé API est de type `password` (caractères masqués).
5. Vérifier que la valeur affichée correspond à la clé injectée.
6. Vérifier que l'avertissement de stockage en clair est visible.

**Résultat attendu :** La clé est chargée depuis l'environnement, masquée à l'affichage, et l'avertissement est présent.

---

### TC-03 · Chargement dynamique des modèles `[P1]`

**Script :** [`tc03-model-loading.spec.ts`](../tests/tc03-model-loading.spec.ts)

**Préconditions :** Serveur Ollama ou LM Studio accessible localement, ou mocker la réponse réseau.

**Étapes :**
1. Sélectionner le provider **Ollama**.
2. Cliquer sur le bouton « Charger les modèles ».
3. Vérifier qu'un état de chargement est visible.
4. Vérifier que la liste de modèles se peuple.
5. Cliquer sur « Actualiser » pour rafraîchir.

**Résultat attendu :** La liste est mise à jour sans rechargement de page.

---

### TC-04 · Avertissement format API incompatible `[P1]`

**Script :** [`tc04-api-format-compat.spec.ts`](../tests/tc04-api-format-compat.spec.ts)

**Étapes :**
1. Sélectionner provider **OVH**, modèle `gpt-oss-20b`.
2. Vérifier que le format `chat_completions` est désactivé ou qu'un avertissement d'incompatibilité est affiché.

**Résultat attendu :** L'UI indique clairement l'incompatibilité et empêche une mauvaise configuration.

---

### TC-05 · Paramètres de sampling `[P1]`

**Script :** [`tc05-sampling.spec.ts`](../tests/tc05-sampling.spec.ts)

**Étapes :**
1. Ouvrir la section « Sampling ».
2. Activer le toggle **Temperature** et régler le curseur à `0.5`.
3. Activer le toggle **Top-P** et le régler à `0.8`.
4. Renseigner **Max tokens** à `512`.
5. Recharger la page.
6. Vérifier que les valeurs sont restaurées.

**Résultat attendu :** Les valeurs persistent en localStorage et sont correctement restaurées.

---

### TC-06 · Reset complet de la configuration `[P1]`

**Script :** [`tc06-reset-config.spec.ts`](../tests/tc06-reset-config.spec.ts)

**Étapes :**
1. Configurer un provider, une clé API, un prompt système et activer le streaming.
2. Cliquer sur le bouton « Réinitialiser la configuration ».
3. Confirmer la première invite.
4. Confirmer la seconde invite (double confirmation).
5. Vérifier que toute la configuration revient aux valeurs par défaut.

**Résultat attendu :** LocalStorage et IndexedDB sont vidés ; les champs affichent les valeurs par défaut.

---

## 2. Envoi de messages et conversation

### TC-10 · Envoi d'un message simple `[P0]`

**Script :** [`tc10-send-message.spec.ts`](../tests/tc10-send-message.spec.ts)

**Préconditions :** `OPENAI_API_KEY` définie dans l'environnement. Setup injecte la clé et configure le provider OpenAI en localStorage avant chargement de la page.

**Étapes :**
1. Taper un message dans la zone de saisie.
2. Appuyer sur **Entrée**.
3. Vérifier que le message utilisateur apparaît dans le fil de conversation.
4. Vérifier qu'une réponse assistant apparaît.
5. Vérifier que l'input est vidé après l'envoi.

**Résultat attendu :** Échange complet affiché, input réinitialisé, focus rétabli.

---

### TC-11 · Saut de ligne dans l'input `[P1]`

**Script :** [`tc11-13-input.spec.ts`](../tests/tc11-13-input.spec.ts)

**Étapes :**
1. Placer le curseur dans l'input.
2. Appuyer sur **Maj+Entrée**.
3. Vérifier qu'une nouvelle ligne est insérée sans envoi du message.

**Résultat attendu :** Saut de ligne inséré, message non envoyé.

---

### TC-12 · Auto-expansion du textarea `[P1]`

**Script :** [`tc11-13-input.spec.ts`](../tests/tc11-13-input.spec.ts) · [`tc12-textarea-max.spec.ts`](../tests/tc12-textarea-max.spec.ts)

**Étapes :**
1. Coller un texte long (> 5 lignes) dans l'input.
2. Vérifier que la hauteur du textarea grandit jusqu'à 200 px maximum.
3. Dépasser le maximum et vérifier l'apparition d'une scrollbar.

**Résultat attendu :** Expansion automatique avec plafond respecté.

---

### TC-13 · Bouton Envoyer désactivé si vide `[P1]`

**Script :** [`tc11-13-input.spec.ts`](../tests/tc11-13-input.spec.ts)

**Étapes :**
1. Vider l'input (aucun texte, aucune image).
2. Vérifier que le bouton d'envoi est désactivé (`disabled`).

**Résultat attendu :** Bouton non cliquable si aucun contenu.

---

### TC-14 · Nouvelle discussion `[P0]`

**Script :** [`tc14-new-chat.spec.ts`](../tests/tc14-new-chat.spec.ts)

**Étapes :**
1. Envoyer au moins un message et obtenir une réponse.
2. Cliquer sur le bouton « Nouvelle discussion ».
3. Vérifier que le fil de conversation est vidé.
4. Vérifier que les compteurs de tokens/coûts sont remis à zéro.

**Résultat attendu :** Conversation réinitialisée, historique effacé.

---

### TC-15 · Arrêt de la génération `[P0]`

**Script :** [`tc15-stop-generation.spec.ts`](../tests/tc15-stop-generation.spec.ts)

**Préconditions :** Streaming activé, réponse longue en cours.

**Étapes :**
1. Envoyer un message qui génère une réponse longue.
2. Pendant le streaming, cliquer sur le bouton **Stop** (rouge).
3. Vérifier que la génération s'arrête et que le contenu partiel est conservé.
4. Vérifier que le bouton redevient « Envoyer ».

**Résultat attendu :** Génération interrompue, texte partiel affiché, UI restaurée.

---

### TC-16 · Streaming vs mode complet `[P1]`

**Script :** [`tc16-streaming.spec.ts`](../tests/tc16-streaming.spec.ts) · [`tc16b-streaming-chat-completions.spec.ts`](../tests/tc16b-streaming-chat-completions.spec.ts)

**Étapes :**
1. Activer le streaming → envoyer un message → vérifier l'affichage progressif (curseur clignotant).
2. Désactiver le streaming → envoyer un message → vérifier l'affichage en bloc à réception.

**Résultat attendu :** Comportement visuellement distinct selon le mode.

---

## 3. Images dans les messages

### TC-20 · Ajout d'image via le bouton « + » `[P1]`

**Script :** [`tc20-22-images.spec.ts`](../tests/tc20-22-images.spec.ts)

**Étapes :**
1. Cliquer sur le bouton « + » dans l'input.
2. Sélectionner un fichier PNG valide.
3. Vérifier qu'un aperçu miniature apparaît dans l'input.
4. Envoyer le message.
5. Vérifier que l'image est affichée dans le message utilisateur.

**Résultat attendu :** Image attachée, transmise et affichée correctement.

---

### TC-21 · Ajout d'image par copier-coller `[P1]`

**Script :** [`tc21-image-paste.spec.ts`](../tests/tc21-image-paste.spec.ts)

**Étapes :**
1. Copier une image dans le presse-papier.
2. Coller (`Ctrl+V`) dans la zone de saisie.
3. Vérifier l'apparition de l'aperçu miniature.
4. Supprimer l'image via le bouton « x ».
5. Vérifier que l'aperçu disparaît.

**Résultat attendu :** Collage fonctionnel, suppression individuelle opérationnelle.

---

### TC-22 · Rejet des formats non supportés `[P2]`

**Script :** [`tc20-22-images.spec.ts`](../tests/tc20-22-images.spec.ts)

**Étapes :**
1. Tenter d'ajouter un fichier PDF ou SVG.
2. Vérifier qu'il n'est pas accepté ou qu'un message d'erreur s'affiche.

**Résultat attendu :** Seuls PNG, JPEG, GIF et WebP sont acceptés.

---

## 4. Prompt système et Structured Output

### TC-30 · Injection du prompt système `[P0]`

**Script :** [`tc30-system-prompt.spec.ts`](../tests/tc30-system-prompt.spec.ts) · [`tc30b-chat-completions.spec.ts`](../tests/tc30b-chat-completions.spec.ts)

**Préconditions :** `OPENAI_API_KEY` injectée en localStorage par le setup. Réseau mocké (Playwright `page.route`) pour intercepter la requête sortante sans consommer de quota.

**Étapes :**
1. Renseigner un prompt système dans la section dédiée.
2. Envoyer un message.
3. Vérifier dans l'inspecteur HTTP que le prompt système est présent en première position dans `messages` (ou `instructions` selon le format API).

**Résultat attendu :** Prompt système correctement injecté dans la requête.

---

### TC-31 · Structured Output — validation du schéma JSON `[P1]`

**Script :** [`tc31-32-json-schema.spec.ts`](../tests/tc31-32-json-schema.spec.ts)

**Étapes :**
1. Ouvrir la section « Structured Output ».
2. Saisir un JSON invalide (ex: `{ "type": "object" `).
3. Vérifier qu'un message d'erreur de validation apparaît en temps réel.
4. Corriger le JSON.
5. Vérifier que l'erreur disparaît.

**Résultat attendu :** Validation temps réel, blocage si JSON invalide.

---

### TC-32 · Structured Output — transmission dans la requête `[P1]`

**Script :** [`tc31-32-json-schema.spec.ts`](../tests/tc31-32-json-schema.spec.ts)

**Préconditions :** Schéma JSON valide saisi, réseau mocké.

**Étapes :**
1. Configurer un schéma JSON valide.
2. Envoyer un message.
3. Vérifier dans l'inspecteur HTTP que `response_format` (Chat Completions) ou `text.format` (Responses API) est présent dans le body.

**Résultat attendu :** Schéma transmis dans la requête selon le format API actif.

---

## 5. Skills

### TC-40 · Import d'un skill ZIP `[P1]`

**Script :** [`tc40-43-skills.spec.ts`](../tests/tc40-43-skills.spec.ts)

**Préconditions :** Fichier `.zip` contenant un `SKILL.md` avec frontmatter valide disponible.

**Étapes :**
1. Ouvrir la section « Skills ».
2. Cliquer sur « Importer un skill ».
3. Sélectionner le fichier ZIP.
4. Vérifier que le skill apparaît dans la liste avec son nom et sa description.
5. Recharger la page.
6. Vérifier que le skill est toujours présent (persisté en IndexedDB).

**Résultat attendu :** Skill importé, extrait et persisté correctement.

---

### TC-41 · Activation/désactivation d'un skill `[P1]`

**Script :** [`tc40-43-skills.spec.ts`](../tests/tc40-43-skills.spec.ts)

**Étapes :**
1. Avoir un skill importé.
2. Activer le skill via son toggle.
3. Vérifier dans l'inspecteur HTTP (prochain message envoyé) que le prompt système contient le frontmatter du skill.
4. Désactiver le skill.
5. Vérifier que le frontmatter n'est plus injecté.

**Résultat attendu :** L'injection dans le prompt système est conditionnée à l'état du toggle.

---

### TC-42 · Appel de l'outil `get_skill_details` `[P1]`

**Script :** [`tc40-43-skills.spec.ts`](../tests/tc40-43-skills.spec.ts)

**Préconditions :** Skill activé, réseau mocké pour simuler la réponse tool_call du LLM.

**Étapes :**
1. Simuler une réponse LLM contenant un `tool_call` vers `get_skill_details` avec le nom du skill.
2. Vérifier que l'application résout l'appel et ajoute un message `tool_result` avec le contenu du skill.
3. Vérifier que la boucle agentique renvoie une requête au LLM avec le résultat.

**Résultat attendu :** Boucle tool calling complète, contenu du skill transmis au LLM.

---

### TC-43 · Suppression d'un skill `[P2]`

**Script :** [`tc40-43-skills.spec.ts`](../tests/tc40-43-skills.spec.ts)

**Étapes :**
1. Avoir au moins un skill importé.
2. Cliquer sur le bouton « Supprimer » du skill.
3. Vérifier que le skill disparaît de la liste.
4. Recharger la page et confirmer qu'il n'est plus présent.

**Résultat attendu :** Suppression permanente de l'IndexedDB.

---

## 6. Serveur MCP

### TC-50 · Connexion à un serveur MCP `[P1]`

**Script :** [`tc50-53-mcp.spec.ts`](../tests/tc50-53-mcp.spec.ts)

**Préconditions :** Serveur MCP local disponible (ou mocker les requêtes JSON-RPC).

**Étapes :**
1. Ouvrir la section « Serveur MCP ».
2. Activer le toggle MCP.
3. Saisir l'alias et l'URL du serveur.
4. Cliquer sur « Charger les outils ».
5. Vérifier que la liste des outils disponibles s'affiche.
6. Vérifier dans l'inspecteur HTTP les échanges `initialize` et `tools/list`.

**Résultat attendu :** Connexion réussie, outils listés, échanges MCP visibles dans l'inspecteur.

---

### TC-51 · Activation sélective des outils MCP `[P1]`

**Script :** [`tc50-53-mcp.spec.ts`](../tests/tc50-53-mcp.spec.ts)

**Étapes :**
1. Charger au moins deux outils MCP.
2. Désactiver l'un des outils via son toggle.
3. Envoyer un message.
4. Vérifier dans l'inspecteur HTTP que seul l'outil activé est présent dans `tools` de la requête LLM.

**Résultat attendu :** Seuls les outils actifs sont transmis au LLM.

---

### TC-52 · Boucle tool calling MCP `[P1]`

**Script :** [`tc50-53-mcp.spec.ts`](../tests/tc50-53-mcp.spec.ts)

**Préconditions :** Réseau mocké pour simuler tool_call → tool_result.

**Étapes :**
1. Simuler une réponse LLM contenant un `tool_call` vers un outil MCP.
2. Vérifier que l'application appelle le serveur MCP via `tools/call`.
3. Vérifier que le résultat est ajouté en tant que message `tool_result`.
4. Vérifier que la boucle renvoie une nouvelle requête au LLM.
5. Vérifier que les messages `tool_call` et `tool_result` sont affichés dans le fil (pliables).

**Résultat attendu :** Boucle agentique complète avec affichage des échanges d'outils.

---

### TC-53 · Déconnexion MCP `[P2]`

**Script :** [`tc50-53-mcp.spec.ts`](../tests/tc50-53-mcp.spec.ts)

**Étapes :**
1. Connecter un serveur MCP.
2. Désactiver le toggle MCP.
3. Vérifier dans l'inspecteur HTTP les requêtes `shutdown` et `exit`.
4. Vérifier que les outils MCP ne sont plus injectés dans les requêtes LLM suivantes.

**Résultat attendu :** Déconnexion propre, outils retirés des requêtes.

---

## 7. Inspecteur HTTP (sidebar droite)

### TC-60 · Affichage d'un échange LLM `[P0]`

**Script :** [`tc60-http-inspector.spec.ts`](../tests/tc60-http-inspector.spec.ts)

**Étapes :**
1. Envoyer un message.
2. Vérifier qu'une carte d'échange apparaît dans la sidebar droite avec le badge « LLM ».
3. Cliquer sur la carte pour l'expandre.
4. Vérifier la présence des headers de requête (avec clé API masquée).
5. Vérifier la présence du body de requête (JSON interactif).
6. Vérifier la présence du status de réponse et du body.

**Résultat attendu :** Échange complet visible, clé API obfusquée.

---

### TC-61 · Redimensionnement de la sidebar droite `[P2]`

**Script :** [`tc61-62-sidebar.spec.ts`](../tests/tc61-62-sidebar.spec.ts)

**Étapes :**
1. Localiser la poignée de drag sur le bord gauche de la sidebar droite.
2. Faire glisser la poignée vers la gauche pour élargir (jusqu'à 800 px).
3. Faire glisser vers la droite pour rétrécir (jusqu'à 200 px).
4. Vérifier le respect des limites min/max.

**Résultat attendu :** Redimensionnement fluide avec contraintes respectées.

---

### TC-62 · Réduction et expansion de la sidebar droite `[P2]`

**Script :** [`tc61-62-sidebar.spec.ts`](../tests/tc61-62-sidebar.spec.ts)

**Étapes :**
1. Cliquer sur le chevron de la sidebar droite pour la replier.
2. Vérifier que la sidebar se masque.
3. Cliquer à nouveau pour la déplier.

**Résultat attendu :** Toggle collapse/expand fonctionnel.

---

### TC-63 · Vider l'historique HTTP `[P1]`

**Script :** [`tc60-http-inspector.spec.ts`](../tests/tc60-http-inspector.spec.ts)

**Étapes :**
1. Envoyer plusieurs messages pour générer des échanges.
2. Cliquer sur « Vider » dans l'inspecteur HTTP.
3. Vérifier que toutes les cartes disparaissent.

**Résultat attendu :** Historique effacé immédiatement.

---

### TC-64 · Auto-scroll vers le dernier échange `[P2]`

**Script :** [`tc64-autoscroll.spec.ts`](../tests/tc64-autoscroll.spec.ts)

**Étapes :**
1. Générer au moins 5 échanges HTTP.
2. Faire défiler manuellement vers le haut de l'inspecteur.
3. Envoyer un nouveau message.
4. Vérifier que la vue défile automatiquement vers la nouvelle carte.

**Résultat attendu :** Auto-scroll déclenché à chaque nouvel échange.

---

## 8. Compteurs d'usage

### TC-70 · Affichage des tokens et du coût `[P1]`

**Script :** [`tc70-71-usage.spec.ts`](../tests/tc70-71-usage.spec.ts)

**Préconditions :** `OPENAI_API_KEY` injectée en localStorage. Provider OpenAI avec modèle ayant un pricing défini (famille GPT-5.x).

**Étapes :**
1. Envoyer un message et obtenir une réponse.
2. Ouvrir la section « Usage ».
3. Vérifier que le nombre de tokens input et output est affiché.
4. Vérifier que le coût estimé est calculé et affiché.
5. Vérifier que le graphique donut reflète la répartition.

**Résultat attendu :** Métriques correctes affichées après chaque échange.

---

### TC-71 · Réinitialisation des compteurs `[P1]`

**Script :** [`tc70-71-usage.spec.ts`](../tests/tc70-71-usage.spec.ts)

**Étapes :**
1. Accumuler des tokens via plusieurs messages.
2. Cliquer sur le bouton de reset dans la section Usage.
3. Vérifier que tous les compteurs reviennent à zéro.

**Résultat attendu :** Compteurs remis à zéro sans réinitialiser la conversation.

---

## 9. Affichage des messages

### TC-80 · Rendu Markdown `[P1]`

**Script :** [`tc80-82-display.spec.ts`](../tests/tc80-82-display.spec.ts)

**Préconditions :** Réseau mocké pour retourner une réponse Markdown.

**Étapes :**
1. Simuler une réponse assistant contenant : titre `##`, liste à puces, code inline et bloc de code.
2. Vérifier le rendu HTML correct de chaque élément Markdown.

**Résultat attendu :** Markdown rendu visuellement, pas affiché en texte brut.

---

### TC-81 · Blocs XML pliables `[P2]`

**Script :** [`tc81-xml-blocks.spec.ts`](../tests/tc81-xml-blocks.spec.ts)

**Préconditions :** Réseau mocké pour retourner une réponse avec balises `<think>` et `<answer>`.

**Étapes :**
1. Simuler une réponse contenant `<think>raisonnement…</think><answer>réponse</answer>`.
2. Vérifier que chaque bloc est rendu comme une section pliable.
3. Cliquer pour déplier/replier chaque bloc.

**Résultat attendu :** Blocs XML affichés comme accordéons interactifs.

---

### TC-82 · Affichage JSON structuré `[P1]`

**Script :** [`tc80-82-display.spec.ts`](../tests/tc80-82-display.spec.ts)

**Préconditions :** JSON Schema configuré, réseau mocké pour retourner du JSON.

**Étapes :**
1. Activer un schéma JSON et envoyer un message.
2. Simuler une réponse JSON valide.
3. Vérifier que la réponse est affichée formatée avec indentation (2 espaces).

**Résultat attendu :** JSON indenté automatiquement quand le schéma est actif.

---

### TC-83 · Messages tool_call et tool_result pliables `[P2]`

**Script :** [`tc83-tool-messages.spec.ts`](../tests/tc83-tool-messages.spec.ts)

**Préconditions :** Réseau mocké pour déclencher un tool calling.

**Étapes :**
1. Simuler un cycle complet tool_call → tool_result.
2. Vérifier que les deux messages apparaissent dans le fil avec leur icône respective.
3. Cliquer sur un message pour déplier les arguments / le résultat.

**Résultat attendu :** Messages d'outils affichés et interactifs.

---

## 10. Comportements transversaux

### TC-90 · Persistance de la configuration entre rechargements `[P0]`

**Script :** [`tc90-config-persistence.spec.ts`](../tests/tc90-config-persistence.spec.ts)

**Étapes :**
1. Configurer un provider, une clé API, un prompt système, activer le streaming et le JSON Schema.
2. Recharger la page (`F5`).
3. Vérifier que toutes les valeurs sont restaurées.

**Résultat attendu :** Configuration complète restaurée depuis localStorage.

---

### TC-91 · Boucle agentique — limite de 5 itérations `[P2]`

**Script :** [`tc91-agentic-loop.spec.ts`](../tests/tc91-agentic-loop.spec.ts)

**Préconditions :** Réseau mocké pour retourner indéfiniment des `tool_calls`.

**Étapes :**
1. Configurer un mock qui répond toujours avec un `tool_call`.
2. Envoyer un message.
3. Vérifier que la boucle s'arrête après 5 itérations.
4. Vérifier qu'un message d'erreur ou un état terminal est affiché.

**Résultat attendu :** Protection contre les boucles infinies active.

---

### TC-92 · Gestion d'erreur réseau `[P1]`

**Script :** [`tc92-network-error.spec.ts`](../tests/tc92-network-error.spec.ts)

**Étapes :**
1. Couper la connexion réseau ou configurer un mock retournant `500`.
2. Envoyer un message.
3. Vérifier qu'un message d'erreur explicite apparaît dans la conversation.
4. Vérifier que le statut d'erreur est visible dans l'inspecteur HTTP.

**Résultat attendu :** Erreur affichée proprement, pas de crash silencieux.

---

### TC-93 · En-tête reflète la configuration active `[P0]`

**Script :** [`tc93-header.spec.ts`](../tests/tc93-header.spec.ts)

**Étapes :**
1. Changer de provider et de modèle.
2. Vérifier que le badge dans le Header reflète immédiatement le nouveau provider et le nouveau modèle.
3. Activer/désactiver le streaming.
4. Vérifier que l'indicateur de streaming (icône Wifi) change d'état.

**Résultat attendu :** Header toujours synchronisé avec la configuration.

---

## Matrice de priorité

| ID | Scénario | Priorité | Effort estimé | Script |
|----|----------|----------|---------------|--------|
| TC-01 | Sélection provider/modèle | P0 | Moyen | ✅ `tc01-provider-selection.spec.ts` |
| TC-02 | Clé API — saisie et persistance | P0 | Faible | ✅ `tc02-api-key.spec.ts` |
| TC-10 | Envoi message simple | P0 | Faible | ✅ `tc10-send-message.spec.ts` |
| TC-14 | Nouvelle discussion | P0 | Faible | ✅ `tc14-new-chat.spec.ts` |
| TC-15 | Arrêt génération | P0 | Moyen | ✅ `tc15-stop-generation.spec.ts` |
| TC-30 | Injection prompt système | P0 | Moyen | ✅ `tc30-system-prompt.spec.ts` |
| TC-60 | Affichage échange LLM | P0 | Faible | ✅ `tc60-http-inspector.spec.ts` |
| TC-90 | Persistance config | P0 | Faible | ✅ `tc90-config-persistence.spec.ts` |
| TC-93 | Header synchronisé | P0 | Faible | ✅ `tc93-header.spec.ts` |
| TC-04 | Format API incompatible | P1 | Faible | ✅ `tc04-api-format-compat.spec.ts` |
| TC-05 | Paramètres sampling | P1 | Faible | ✅ `tc05-sampling.spec.ts` |
| TC-06 | Reset configuration | P1 | Faible | ✅ `tc06-reset-config.spec.ts` |
| TC-11 | Saut de ligne input | P1 | Faible | ✅ `tc11-13-input.spec.ts` |
| TC-16 | Streaming vs complet | P1 | Moyen | ✅ `tc16-streaming.spec.ts` |
| TC-31 | JSON Schema — validation | P1 | Faible | ✅ `tc31-32-json-schema.spec.ts` |
| TC-32 | JSON Schema — transmission | P1 | Moyen | ✅ `tc31-32-json-schema.spec.ts` |
| TC-80 | Rendu Markdown | P1 | Faible | ✅ `tc80-82-display.spec.ts` |
| TC-82 | JSON structuré | P1 | Moyen | ✅ `tc80-82-display.spec.ts` |
| TC-92 | Erreur réseau | P1 | Moyen | ✅ `tc92-network-error.spec.ts` |
| TC-03 | Chargement modèles | P1 | Moyen | — |
| TC-20 | Image via bouton | P1 | Moyen | ✅ `tc20-22-images.spec.ts` |
| TC-21 | Image copier-coller | P1 | Moyen | — |
| TC-40 | Import skill ZIP | P1 | Moyen | — |
| TC-41 | Toggle skill | P1 | Moyen | — |
| TC-42 | Tool calling get_skill_details | P1 | Élevé | — |
| TC-50 | Connexion MCP | P1 | Élevé | — |
| TC-51 | Sélection outils MCP | P1 | Moyen | — |
| TC-52 | Boucle tool calling MCP | P1 | Élevé | — |
| TC-63 | Vider historique HTTP | P1 | Faible | — |
| TC-70 | Tokens et coûts | P1 | Moyen | ✅ `tc70-71-usage.spec.ts` |
| TC-71 | Reset compteurs | P1 | Faible | ✅ `tc70-71-usage.spec.ts` |
| TC-12 | Auto-expansion textarea | P2 | Faible | ✅ `tc11-13-input.spec.ts` |
| TC-13 | Bouton Envoyer désactivé | P2 | Faible | ✅ `tc11-13-input.spec.ts` |
| TC-81 | Blocs XML pliables | P2 | Moyen | ✅ `tc80-82-display.spec.ts` |
| TC-22 | Format image invalide | P2 | Faible | ✅ `tc20-22-images.spec.ts` |
| TC-43 | Suppression skill | P2 | Faible | — |
| TC-53 | Déconnexion MCP | P2 | Moyen | — |
| TC-61 | Redimensionnement sidebar | P2 | Faible | ✅ `tc61-62-sidebar.spec.ts` |
| TC-62 | Collapse sidebar | P2 | Faible | ✅ `tc61-62-sidebar.spec.ts` |
| TC-64 | Auto-scroll inspecteur | P2 | Faible | ✅ `tc64-autoscroll.spec.ts` |
| TC-83 | Messages tool pliables | P2 | Moyen | ✅ `tc83-tool-messages.spec.ts` |
| TC-91 | Limite 5 itérations | P2 | Élevé | ✅ `tc91-agentic-loop.spec.ts` |
