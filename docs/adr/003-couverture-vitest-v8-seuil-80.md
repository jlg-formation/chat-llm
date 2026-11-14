# ADR 003 — Couverture de tests : Vitest + V8 avec seuil à 80 %

- **Statut** : accepté
- **Date** : 2026-06-22
- **Décideur** : Jean-Louis GUENEGO

## Contexte

Le projet ne disposait que de tests E2E Playwright. L'évolution 03 exige un test de couverture d'au moins 80 % de tout le code, en plus de ces E2E.

## Décision

- Tests unitaires et de composants avec **Vitest** (`bun run test:unit`), environnement **jsdom**, **Testing Library** pour les composants.
- Couverture avec **@vitest/coverage-v8** (`bun run test:coverage`), seuils à 80 % sur lignes, branches, fonctions et instructions (`vitest.config.ts`).
- Périmètre de tests restreint à `tests/unit/**/*.test.{ts,tsx}` pour exclure les specs Playwright (`tests/e2e/`).
- Les tests Playwright (`bun run test`) restent inchangés.
- Le job `test` de `.github/workflows/deploy.yml` exécute `bun run test:coverage` ; le job `build` dépend de `test`.

## Raisons

- Vitest partage la configuration Vite et ne demande pas de second bundler.
- Le provider V8 évite l'instrumentation Istanbul et reste rapide.
- Un seuil bloquant en CI empêche la régression silencieuse de la couverture.

## Conséquences

- Le déploiement GitHub Pages est bloqué si la couverture passe sous 80 %.
- Les tests de composants utilisent jsdom : certaines APIs navigateur (scrollIntoView, clipboard, object URLs) sont stubées dans les tests.
- `tsconfig.app.json` exclut les fichiers de test du type-check de l'application ; ils restent couverts par oxlint.
- Le seuil doit être relevé et non abaissé si la couverture progresse.
