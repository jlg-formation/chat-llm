# Brief détaillé — Chat Pédagogique IA

## Contexte et objectif

Application web **pédagogique** destinée à des **stagiaires en formation IA pour développeurs**. L'objectif est de permettre à des apprenants de comprendre concrètement comment fonctionne un chatbot conversationnel basé sur un LLM : flux HTTP, streaming, tool calling, structured output, etc.

L'application simule l'expérience ChatGPT tout en exposant de manière transparente les mécanismes techniques sous-jacents.

> **MVP pédagogique** — pas de backend, pas de gestion de sécurité des clés API, pas de persistance des conversations. Tout est front-end.

---

## Stack technique

- **React** (avec Vite comme bundler)
- **TailwindCSS** (thème clair obligatoire, pas de dark mode par défaut)
- **localforage** (pour le stockage IndexedDB des skills)
- **react-markdown** (rendu Markdown dans les messages du chat)
- **Déploiement** : GitHub Pages (build statique)
- **Dépôt GitHub** : https://github.com/jlg-formation/chat-llm

Un fichier **README.md** doit être présent à la racine du dépôt et expliquer :
- La finalité pédagogique du projet
- Les providers LLM supportés
- La notion de skills (spec agentskills.io)
- Comment lancer le projet en local (`npm install && npm run dev`)
- Comment déployer sur GitHub Pages

---

## Layout général

```
┌─────────────────────────────────────────────────────────┐
│                        HEADER                           │
├──────────────┬──────────────────────┬───────────────────┤
│              │                      │                   │
│   SIDEBAR    │        CHAT          │  SIDEBAR DROITE   │
│   GAUCHE     │       (body)         │  (HTTP Inspector) │
│ (config)     │                      │                   │
│              │                      │                   │
├──────────────┴──────────────────────┴───────────────────┤
│                        FOOTER                           │
└─────────────────────────────────────────────────────────┘
```

Le body (zone de chat) occupe tout l'espace vertical restant entre header et footer.

---

## Composant 1 — Header

- Titre de l'application
- Indicateur du provider LLM actif et du modèle sélectionné
- Indicateur du mode stream (activé / désactivé)
- Lien vers le code source sur GitHub : https://github.com/jlg-formation/chat-llm (icône GitHub, s'ouvre dans un nouvel onglet)

---

## Composant 2 — Sidebar gauche (Configuration)

Panneau de configuration persisté en **localStorage**. Les sections sont organisées en **accordéons repliables** (une seule section ouverte à la fois, ou plusieurs selon implémentation). Contient les sections suivantes :

### 2.1 Provider LLM

Sélection du provider parmi :
- **OpenAI** (`https://api.openai.com`)
- **OVH AI Endpoints** (URL configurable)
- **LM Studio** (URL locale configurable, ex. `http://localhost:1234`)
- **Ollama** (URL locale configurable, ex. `http://localhost:11434`)

Champs associés :
- URL de base de l'API (pré-remplie selon le provider, modifiable)
- Clé d'authentification API (champ texte, masqué type password) — **non sécurisée, assumé**
- Modèle à utiliser (champ texte libre ou liste dynamique si l'API le permet)

### 2.2 Mode Stream

Toggle on/off.
- **On** : les réponses sont reçues en Server-Sent Events (SSE), affichées progressivement dans le chat. La sidebar HTTP affiche la réponse finale consolidée.
- **Off** : appel HTTP classique, réponse complète attendue.

### 2.3 Prompt Système

Zone de texte multilignes permettant de saisir un prompt système (`system` message). Ce prompt est injecté en premier dans chaque requête envoyée au LLM.

> Note : le prompt système est **automatiquement enrichi** avec la déclaration des skills activés (voir section Skills).

### 2.4 Structured Output (JSON Schema)

Zone de texte multilignes pour saisir un **JSON Schema**. Si renseigné, la requête au LLM inclura une instruction de structured output (ex. `response_format` pour OpenAI). La réponse JSON est alors affichée dans un composant React dédié, formatée et indentée, mais sans coloration syntaxique.

### 2.5 Skills (Tool Calling via contexte)

Les skills sont des **modules de contexte injectés dans le prompt système** pour guider le LLM. Ils ne font pas d'appels réseau autonomes — c'est le LLM qui décide de les mobiliser, et leur contenu est lu depuis le prompt.

Les skills suivent la **spécification [agentskills.io](https://agentskills.io/home)**.

#### Chargement d'un skill

- Bouton « Charger un skill (.zip) »
- Le ZIP doit contenir un répertoire à la racine portant le nom du skill, avec :
  - `SKILL.md` (obligatoire) : description du skill, instructions, exemples — conforme à la spec agentskills.io
  - Fichiers additionnels optionnels (référencés dans `SKILL.md`)
- À l'import, le skill est stocké en **IndexedDB** via **localforage** (les skills peuvent être volumineux, localStorage est insuffisant)

#### Gestion des skills (CRUD)

- Liste des skills chargés avec leur nom
- Actions par skill : **activer/désactiver**, **supprimer**
- Les skills activés sont automatiquement **injectés dans le prompt système** (contenu de `SKILL.md` inclus) avant chaque envoi au LLM

### 2.6 MCP Server (optionnel)

Si l'utilisateur souhaite utiliser un serveur MCP externe :
- Champ URL du serveur MCP
- Toggle activation/désactivation globale du MCP
- Liste des outils (tools) exposés par le serveur MCP, avec activation/désactivation individuelle par outil

> **Contrainte** : seuls les serveurs MCP utilisant le **transport HTTP** (Streamable HTTP) sont supportés. Les transports stdio et SSE natifs ne sont pas gérés.

---

## Composant 3 — Zone de Chat (body)

Interface conversationnelle :

### 3.1 Layout interne

```
┌────────────────────────────────────┐
│  Message utilisateur               │  ← les messages partent du haut
│  Réponse LLM                       │
│  Message utilisateur               │
│  ...                               │
│                                    │
│                                    │  ← espace flexible
├────────────────────────────────────┤
│  [ Zone de saisie      ] [+] [↑]   │  ← fixée en bas
└────────────────────────────────────┘
```

- L'**historique de conversation** s'affiche depuis le haut et défile vers le bas
- La **zone de saisie est fixée en bas** du composant chat (sticky/fixed)
- Distinction visuelle claire entre messages utilisateur et réponses LLM

### 3.2 Zone de saisie

- Textarea multilignes (s'agrandit automatiquement selon le contenu)
- **Envoi** : bouton dédié ou `Entrée` (Shift+Entrée pour saut de ligne)
- **Bouton `+`** : ouvre un sélecteur de fichier pour insérer des images ou fichiers dans le message
- **Coller une image** (`Ctrl+V`) : si le presse-papiers contient une image (ex. screenshot), elle est automatiquement ajoutée au message en cours de saisie
- Les images insérées sont affichées en aperçu miniature dans la zone de saisie avant envoi, avec possibilité de les supprimer

### 3.3 Contenu des messages

- **Texte** : rendu Markdown via **react-markdown** (gras, italique, code inline, blocs de code, listes)
- **Images** : affichées directement dans la bulle de message
- **Mode stream** : affichage progressif des tokens au fil de leur réception
- **Structured output** : si un JSON Schema est configuré et que la réponse est du JSON valide, affichage dans un composant dédié (JSON formaté, indenté, fond légèrement distinct)
- **Pas de persistance** : la conversation est perdue au rechargement de la page

### 3.4 Formats d'images acceptés

- PNG, JPEG, GIF, WebP
- Via presse-papiers (`Ctrl+V`)
- Via le bouton `+` (file picker filtré sur les images)
- Les images sont encodées en base64 et transmises au LLM dans le format multimodal adapté au provider (voir section API LLM)
- Pas de compression ni de redimensionnement : l'image est envoyée telle quelle

---

## Composant 4 — Sidebar droite (HTTP Inspector)

Panneau pédagogique affichant les échanges HTTP entre le navigateur et les serveurs externes (LLM et MCP). Objectif : rendre visible ce qui se passe "sous le capot".

### Visibilité et redimensionnement

- La sidebar droite est **masquable** (bouton toggle) pour libérer de l'espace sur petit écran
- Largeur fixe par défaut, pas de redimensionnement drag nécessaire

### Distinction visuelle

- Requêtes/réponses vers le **LLM** : couleur A (ex. bleu)
- Requêtes/réponses vers le **serveur MCP** : couleur B (ex. vert)

### Structure d'un échange affiché

Pour chaque appel HTTP :

```
▶ REQUÊTE  [LLM | MCP]  POST https://...
─────────────────────────────
Headers pédagogiques :
  Authorization: Bearer sk-...
  Content-Type: application/json

Body :
  {
    "model": "...",
    "messages": [...],
    "stream": false
  }

◀ RÉPONSE  200 OK
─────────────────────────────
Headers pédagogiques :
  Content-Type: application/json

Body :
  {
    "choices": [...]
  }
```

### Headers pédagogiques retenus

Côté **requête** : `Authorization`, `Content-Type`, `Accept`
Côté **réponse** : `Content-Type`, `x-request-id` (si présent), `x-ratelimit-*` (si présents)

> Pas de coloration syntaxique, mais le JSON est formaté/indenté pour lisibilité.

### Mode Stream

En mode stream (SSE), la sidebar affiche la **réponse consolidée finale** uniquement (pas les chunks intermédiaires).

### Comportement

- Les échanges s'accumulent dans la sidebar au fil de la session
- Bouton « Vider » pour remettre à zéro
- Scrollable verticalement

---

## Persistance

### localStorage

Données légères de configuration persistées entre les sessions :

| Clé              | Contenu                                           |
|------------------|---------------------------------------------------|
| `llm_provider`   | Provider sélectionné + URL + modèle               |
| `llm_api_key`    | Clé API (non chiffrée)                            |
| `stream_enabled` | Booléen                                           |
| `system_prompt`  | Texte du prompt système saisi par l'utilisateur   |
| `json_schema`    | Texte du JSON Schema                              |
| `mcp_url`        | URL du serveur MCP                                |
| `mcp_enabled`    | Booléen                                           |
| `mcp_tools`      | Liste des tools avec état activé/désactivé        |

### IndexedDB (via localforage)

Données volumineuses :

| Store         | Contenu                                                      |
|---------------|--------------------------------------------------------------|
| `skills`      | Liste des skills : nom, état (activé/désactivé), contenu des fichiers décompressés du ZIP |

**Non persisté** : historique des conversations, logs HTTP de la sidebar.

---

## API LLM utilisée par provider

Chaque provider expose sa propre API la plus récente. Le client HTTP s'adapte selon le provider sélectionné.

| Provider | API utilisée | Endpoint |
|----------|-------------|----------|
| **OpenAI** | API Responses (la plus récente) | `POST /v1/responses` |
| **OVH AI Endpoints** | API Chat Completions OpenAI-compatible | `POST /v1/chat/completions` |
| **LM Studio** | API Chat Completions OpenAI-compatible | `POST /v1/chat/completions` |
| **Ollama** | API native Ollama (`/api/chat`) ou OpenAI-compatible selon configuration | `POST /api/chat` |

### Spécificités API Responses OpenAI
- Le champ `input` remplace `messages`
- Le streaming passe par les événements SSE de type `response.output_text.delta`
- Le structured output utilise le champ `text.format` avec `type: "json_schema"`
- Les images sont transmises dans `input` comme blocs de type `input_image` (base64)

### Spécificités API Chat Completions (OVH, LM Studio, Ollama)
- Champ `messages` standard avec rôles `system`, `user`, `assistant`
- Streaming via SSE avec `data: {"choices":[{"delta":{"content":"..."}}]}`
- Structured output via `response_format: { type: "json_schema", json_schema: {...} }` si supporté
- Images via le format multimodal : `content: [{ type: "image_url", image_url: { url: "data:image/...;base64,..." } }]`

---

## Contraintes & règles de développement

- Thème clair (light) obligatoire
- Application 100 % front-end, aucun backend
- Clés API stockées en clair dans localStorage — acceptable dans ce contexte pédagogique
- Build statique compatible GitHub Pages (`base` Vite à configurer)
- Pas de coloration syntaxique (pas de dépendance type highlight.js ou Prism)
- Pas de persistance des conversations
- Une seule conversation active à la fois, pas d'historique multi-chat
- MCP : transport HTTP uniquement (Streamable HTTP)
- Skills : conformes à la spécification agentskills.io, stockés en IndexedDB via localforage
