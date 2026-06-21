# Architecture Decision Records

Ce dossier contient les ADR (_Architecture Decision Records_) du projet **Chat Pédagogique IA**.

Un ADR documente une décision technique significative : son contexte, la décision retenue et ses conséquences. Il ne remplace pas les commentaires de code ni le CLAUDE.md — il capture le *pourquoi* d'un choix qui ne se lit pas dans le code.

## Format

```
docs/adr/
  NNN-titre-kebab-case.md
```

Chaque fichier suit cette structure :

```markdown
# ADR NNN — Titre court

- **Statut** : proposé | accepté | déprécié | remplacé par [ADR NNN](NNN-...)
- **Date** : YYYY-MM-DD
- **Décideur** : Nom

## Contexte
Situation qui a amené la question.

## Décision
Ce qui a été décidé.

## Raisons
Pourquoi ce choix plutôt qu'un autre.

## Conséquences
Ce que ça implique à court et long terme.
```

## Index

| # | Titre | Statut | Date |
|---|-------|--------|------|
| [001](001-mcp-client-pas-de-sdk-officiel.md) | Client MCP : ne pas utiliser le SDK TypeScript officiel | accepté | 2026-06-21 |
