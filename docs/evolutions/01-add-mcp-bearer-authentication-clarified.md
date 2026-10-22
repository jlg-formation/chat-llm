# Authentification Bearer par serveur MCP

## Contexte

L'application envoie aujourd'hui des requêtes JSON-RPC aux serveurs MCP sans aucune authentification. La fonction `buildHeaders` de [src/services/mcp.ts](src/services/mcp.ts#L19) ne transmet que `Content-Type`, `MCP-Protocol-Version` et `Mcp-Session-Id`. Or certains serveurs MCP exigent un en-tête `Authorization: Bearer <token>` (_source : « les serveurs MCP peuvent parfois accepter une en-tête `Authorization : Bearer machin chouette` »_).

## Objectif

Permettre à l'utilisateur de renseigner un token d'authentification (clé d'API) lors de l'ajout d'un serveur MCP, et de le transmettre dans l'en-tête `Authorization: Bearer <token>` de chaque requête adressée à ce serveur.

## Périmètre fonctionnel

- **Saisie par serveur** : chaque serveur MCP (carte de `McpSection`) possède son propre champ token. Il n'existe pas de token global partagé.
- **Saisie masquée** : le champ est de type `password`, avec un bouton œil pour afficher ou masquer la valeur.
- **Préfixe automatique** : l'application ajoute elle-même le préfixe `Bearer ` ; l'utilisateur saisit uniquement la valeur du token.
- **Stockage** : le token est persisté dans la configuration `chat_pedagogique_config` (localStorage), au même titre que les autres réglages de serveurs MCP.
- **Effacement** : un bouton permet d'effacer le token d'un serveur sans supprimer ce serveur.
- **Transmission** : l'en-tête `Authorization` est ajouté à toutes les requêtes MCP, y compris le rafraîchissement de la liste d'outils et les appels d'outils. Il est ajouté lors de l'initialisation de session comme pour les autres appels.
- **Inspecteur HTTP** : dans la sidebar droite, la valeur du token est masquée (affichage du type `Authorization: Bearer ***`).

## Hors périmètre

- **LM Studio** : le token n'est pas transmis dans le champ `integrations` de LM Studio.
- **Fetch des modèles LLM** : le token n'est pas envoyé lors de la récupération de la liste des modèles des fournisseurs LLM.
- **Autres schémas d'authentification** : pas d'OAuth, pas d'en-tête personnalisé, pas de clé passée en paramètre d'URL.
- **Tests automatisés** : aucun nouveau test Playwright n'est requis ; la validation se fait manuellement.

## Utilisateurs cibles

Un développeur ou un apprenant utilisant l'application en local, seul sur sa machine. Il n'y a pas de partage de configuration entre utilisateurs.

## Contraintes techniques

- Stack existante : React 19, TypeScript, Vite, stores à observer maison (`configStore`).
- Le token est stocké en clair dans le localStorage ; aucun chiffrement n'est requis.
- La migration de configuration (`configStore`) doit rester compatible : les serveurs existants sans token continuent de fonctionner sans en-tête `Authorization`.
- Le champ token doit respecter `verbatimModuleSyntax` et le style du reste de `McpSection`.

## Critères de succès

- Un serveur MCP peut être configuré avec un token, et la valeur est conservée après rechargement de la page.
- Chaque requête MCP adressée à ce serveur (initialisation, listing des outils, appel d'outil, rafraîchissement) contient l'en-tête `Authorization: Bearer <token>`, vérifiable dans l'inspecteur HTTP côté en-tête (valeur masquée).
- Un serveur sans token n'envoie pas d'en-tête `Authorization`.
- Le bouton d'effacement retire le token sans supprimer le serveur.
- Les serveurs MCP existants (sans token) continuent de fonctionner après mise à jour.
- Le build (`bun run build`) et le lint (`bun run lint`) passent sans erreur.
