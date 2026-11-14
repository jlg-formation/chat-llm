# Mise en place d'une couverture de tests permanente (seuil 80 %)

## Contexte

Pour pouvoir corriger le code et faire des évolutions ultérieures en sécurité, le projet doit toujours disposer d'une mesure de couverture de tests. L'objectif est un filet de sécurité contre les régressions.

Le projet est une application React 19 + TypeScript + Vite. Les tests existants sont des tests E2E Playwright (dossier `tests/`). Il n'existe aucun test unitaire.

## Objectif

Atteindre et maintenir au minimum **80 %** de couverture sur l'ensemble du code source, pour les indicateurs suivants : **lignes, branches et fonctions**.

Le seuil est **global** (pas par fichier) et **bloquant** : le build ou la CI échoue si le seuil n'est pas atteint.

## Périmètre fonctionnel

- Mesure de couverture sur tout le code de `src/` (composants, services, stores, types d'UI).
- Ajout de tests unitaires **Vitest** (avec `@vitest/coverage`) sur la logique pure (services, stores, helpers), pour atteindre le seuil. Les tests E2E Playwright existants restent en place.
- Exécution de la couverture dans la **CI GitHub Actions** existante (workflow de déploiement / build), en plus d'une commande locale.
- Rapport de couverture : sortie texte dans le terminal et rapport HTML généré localement.

## Hors périmètre

- Badge de couverture dans le README.
- Artefact de rapport téléchargeable dans GitHub Actions.
- Couverture par fichier (seul le seuil global compte).
- Exclusions du calcul : `tests/`, fichiers de configuration, `src/main.tsx`, `src/types.ts`.

## Utilisateurs cibles

- Le développeur du projet, qui doit pouvoir vérifier localement et en CI que ses modifications ne dégradent pas la couverture.

## Contraintes techniques

- Gestionnaire de paquets : **bun** (`bun.lock`).
- Outil de couverture : **Vitest + @vitest/coverage** (provider V8 ou Istanbul, à retenir lors de l'implémentation).
- Les imports de types doivent respecter `verbatimModuleSyntax` (`import type`).
- Pas de SDK ni de dépendance supplémentaire non justifiée ; toute décision technique importante doit être tracée dans `docs/adr/`.

## Critères de succès

- Une commande locale (par exemple `bun run test:coverage`) produit un rapport texte et un rapport HTML.
- La couverture globale des lignes, branches et fonctions de `src/` est **≥ 80 %**, hors exclusions listées.
- La CI GitHub Actions échoue si la couverture passe sous 80 %.
- Les tests E2E Playwright existants continuent de passer.

## Points en suspens

- Choix final du provider de couverture (V8 ou Istanbul) et de la configuration Vitest (environnement jsdom ou autre) — à trancher lors de l'implémentation.
- Choix du workflow CI précis dans lequel ajouter l'étape de couverture — à confirmer en lisant `.github/workflows/`.
