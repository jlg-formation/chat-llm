# ADR 006 — Tarifs : grille officielle par provider, LiteLLM en complément

- **Statut** : accepté
- **Date** : 2026-11-15
- **Décideur** : Jean-Louis GUENEGO

## Contexte

Les APIs `/models` ne renvoient pas les tarifs (OpenAI, Anthropic, Mistral) ou seulement partiellement (OVH). `bun run pricing` ne couvrait qu'OpenAI, via la base communautaire LiteLLM ; Anthropic et Mistral étaient saisis à la main (évolutions 04 et 05), OVH n'avait aucun prix. LiteLLM n'est pas une source officielle : sur `mistral-large-latest` elle donnait 0,5 / 1,5 $/Mtok au lieu des 0,7 / 2,1 $/Mtok publiés par Mistral.

## Décision

`bun run pricing` régénère `src/data/{openai,anthropic,mistral,ovh}-pricing.json`. Pour chaque provider, le prix officiel est prioritaire :

- **Anthropic** : tableau « Model pricing » de `platform.claude.com/docs/en/about-claude/pricing.md`. L'id se déduit du nom (`Claude Opus 5.5` → `claude-opus-5-5`), les modèles retirés sont ignorés, les deux lignes de Haiku 5.5 (« jusqu'à / au-delà de 100 000 tokens ») donnent le prix de base et `longContext`. Le contexte vient de LiteLLM.
- **Mistral** : `docs.mistral.ai/inference/pricing.md` (sections Generalist et Code), puis la fiche `.md` de chaque modèle pour les alias d'API (`mistral-large-latest`), le contexte et les modalités. Seuls les modèles texte → texte sont gardés.
- **OVH** : catalogue AI Endpoints (JSON embarqué dans la page), catégorie « Text Generation » et sortie texte uniquement ; l'id du catalogue et ses alias (sans préfixe d'organisation) sont tous enregistrés. Pas de secours LiteLLM : un modèle absent du catalogue n'a pas de prix.
- **OpenAI** : LiteLLM seul (la page officielle mélange plusieurs tables par palier de contexte). Seuls les `gpt-*` sont gardés : ni série o, ni fine-tunes, ni modèles dont `deprecation_date` est déjà passée.

Un provider dont la source échoue ou ne renvoie rien laisse son fichier inchangé et fait échouer le script.

`getStaticPricing(modelId, provider)` lit une table par provider, car un même id peut avoir des prix différents selon le provider (`gpt-oss-20b` chez OpenAI et chez OVH) ; les providers locaux n'ont aucun prix.

Les listes de modèles ne gardent que les modèles texte → texte (images en entrée tolérées) : `isMistralChatModel()` (`models.ts`), `isOpenAiChatModel()` et `isOvhChatModel()` (`modelHelpers.ts`).

## Raisons

- Le coût affiché doit refléter la grille publiée par le provider, pas une copie communautaire parfois en retard.
- Les pages officielles sont exposées en Markdown (Anthropic, Mistral, OpenAI) ou en JSON embarqué (OVH) : on peut les lire sans clé d'API et sans navigateur.

## Conséquences

- Le script dépend du format de ces pages : un changement de mise en page se traduit par un échec explicite (« aucun modèle trouvé ») plutôt que par des prix faux.
- OVH : le catalogue est un JSON embarqué dans une page Next.js, plus fragile que du Markdown ; les ids d'API OVH n'ont pas été vérifiés avec une vraie clé, d'où l'enregistrement des alias.
- Un modèle absent des tables (variante datée sans préfixe connu, modèle récent) s'affiche sans coût estimé.
- Les filtres de modèles sont heuristiques (capacités renvoyées par l'API quand elles existent, sinon motifs d'id) : un nouveau modèle non texte peut passer tant que son id ne correspond à aucun motif.
