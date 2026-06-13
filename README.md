# Chat Pédagogique IA

Application web pédagogique destinée aux **stagiaires en formation IA pour développeurs**. Elle simule l'expérience ChatGPT tout en exposant de manière transparente les mécanismes techniques sous-jacents : flux HTTP, streaming SSE, structured output, skills, tool calling via MCP.

## Finalité pédagogique

L'objectif est de rendre visible ce qui se passe "sous le capot" lors d'une conversation avec un LLM :
- Les requêtes et réponses HTTP entre le navigateur et le serveur LLM sont affichées dans l'**Inspecteur HTTP** (sidebar droite)
- Le mode **Stream (SSE)** permet de visualiser le flux de tokens en temps réel
- Le **Structured Output** montre comment forcer le LLM à répondre en JSON via un schema
- Les **Skills** illustrent l'injection de contexte dans le prompt système

L'application est **100 % front-end** — aucun backend. Les clés API sont stockées localement dans le navigateur (localStorage).

## Providers LLM supportés

| Provider | API | Endpoint |
|----------|-----|----------|
| **OpenAI** | API Responses (dernière version) | `POST /v1/responses` |
| **OVH AI Endpoints** | Chat Completions (compatible OpenAI) | `POST /v1/chat/completions` |
| **LM Studio** | Chat Completions (compatible OpenAI) | `POST /v1/chat/completions` |
| **Ollama** | API native Ollama | `POST /api/chat` |

## Skills (spec agentskills.io)

Les skills sont des modules de contexte injectés dans le prompt système. Ils suivent la spécification [agentskills.io](https://agentskills.io/home).

Un skill est un fichier `.zip` contenant un répertoire portant le nom du skill, avec :
- `SKILL.md` (obligatoire) : description du skill, instructions, exemples
- Fichiers additionnels optionnels (référencés dans `SKILL.md`)

Les skills sont stockés en IndexedDB via `localforage` pour supporter de grands volumes.

## Lancer le projet en local

```bash
npm install
npm run dev
```

L'application sera accessible sur `http://localhost:5173`.

## Déployer sur GitHub Pages

```bash
npm run build
```

Le contenu du dossier `dist/` est prêt à être déployé. La configuration Vite inclut `base: '/chat-llm/'` pour GitHub Pages.

Pour déployer automatiquement via GitHub Actions, ajoutez un workflow qui build et publie `dist/` sur la branche `gh-pages`.

## Stack technique

- [React](https://react.dev/) + [Vite](https://vitejs.dev/)
- [TailwindCSS](https://tailwindcss.com/) v4
- [localforage](https://github.com/localForage/localForage) (IndexedDB pour les skills)
- [react-markdown](https://github.com/remarkjs/react-markdown) (rendu Markdown)
- [JSZip](https://stuk.github.io/jszip/) (import des skills)
- [lucide-react](https://lucide.dev/) (icônes)
