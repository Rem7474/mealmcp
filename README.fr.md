# MealMCP

**Français** · [English](README.md)

[![CI](https://github.com/Rem7474/mealmcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Rem7474/mealmcp/actions/workflows/ci.yml)

Gestion des repas, des courses et du stock d'un foyer, avec un serveur MCP intégré pour le piloter depuis une IA.

- **Planning** : repas par jour, à partir d'une recette ou en texte libre.
- **Recettes** : ingrédients, portions, préparation, disponibilité par rapport au stock.
- **Courses** : liste générée depuis le planning (besoins − stock + produits sous leur seuil), ajouts manuels, rangement des achats dans le stock.
- **Stock** : par emplacement (frigo, congélateur, placard), dates de péremption, seuils d'alerte.
- **Budget** : enregistrement des achats (à la main, depuis un ticket via une IA, ou en terminant les courses), budget mensuel avec projection, dépenses par catégorie / magasin / mois, et estimation du coût des recettes, des repas de la semaine et de la liste de courses à partir des prix de ce que vous avez acheté.
- **Tableau de bord en direct** : l'interface web se met à jour toute seule quand quelque chose change ailleurs, par exemple quand une IA modifie votre stock via MCP.
- **Bilingue** : interface en anglais et en français (sélecteur de langue en haut à droite, langue du navigateur par défaut). Les descriptions des outils MCP sont en anglais.

## Architecture

```
server/src
  db/         schéma Drizzle + SQLite, migrations appliquées au démarrage
  domain/     schémas Zod (entrées), unités, dates, erreurs
  auth/       comptes, sessions, foyers, serveur OAuth pour le MCP
  services/   toute la logique métier (liée à un foyer)
  api/        adaptateur REST (utilisé par l'interface web)
  mcp/        adaptateur MCP (utilisé par les IA)
web/src       interface React + Vite + Tailwind
```

L'API REST et le serveur MCP sont deux adaptateurs fins au-dessus des mêmes services : une règle métier s'écrit une fois, dans `services/`.

Les quantités sont stockées en unité de base (g, ml, « piece ») ; kg, l, cl sont convertis à l'entrée.

## Développement

```bash
npm install
npm run dev
```

Interface sur http://localhost:5173, backend sur http://localhost:3000.

| Commande | Effet |
| --- | --- |
| `npm test` | tests des services |
| `npm run build` | build web + serveur |
| `npm start` | sert l'app construite sur le port 3000 |
| `npm run db:generate` | génère une migration après modification de `server/src/db/schema.ts` |

## CI/CD

- `ci.yml` : à chaque push et pull request, build (typage web + serveur), tests, puis construction de l'image Docker et test de fumée du conteneur (accès refusé sans compte, découverte OAuth, création de compte).
- `release.yml` : après les tests, publie l'image sur GitHub Container Registry. Pour une version : `git tag v0.1.0 && git push --tags`.
- Dependabot met à jour les dépendances npm, les actions GitHub et l'image de base.

## Déploiement Docker

Copiez `.env.example` en `.env` et renseignez au moins `PUBLIC_URL` (l'adresse réelle de l'app, en HTTPS si des clients MCP distants doivent s'y connecter), puis :

```bash
docker compose up -d
```

Cela télécharge l'image publiée (`ghcr.io/rem7474/mealmcp:latest`). Pour figer une version, ajoutez `MEALMCP_VERSION=0.1.0` dans `.env` ; pour construire depuis les sources, utilisez `docker compose up -d --build`.

Ouvrez ensuite l'adresse de l'app : **le premier compte créé devient propriétaire du foyer**.

L'image (amd64 et arm64) est publiée à chaque push sur `main` (tag `main`) et à chaque tag `vX.Y.Z` (tags `X.Y.Z`, `X.Y` et `latest`).

La base SQLite est dans le volume `mealmcp-data`. Si l'app est exposée hors du réseau local, placez-la derrière un reverse proxy HTTPS et réglez `PUBLIC_URL` et `TRUST_PROXY` (voir `.env.example`).

## Comptes et foyers

- Un **foyer** regroupe recettes, planning, courses et stock ; chaque donnée appartient à un foyer et les services filtrent systématiquement dessus (deux foyers ne voient jamais les données l'un de l'autre).
- Le premier compte crée un foyer et en est propriétaire. Il invite ensuite d'autres personnes (onglet **Compte**) avec un code à usage unique valable 7 jours. `ALLOW_REGISTRATION=true` ouvre aussi la création de nouveaux foyers.
- Mots de passe hachés avec scrypt, sessions par cookie `HttpOnly`/`SameSite=Lax`, jetons et codes stockés hachés, limitation des tentatives de connexion.
- **Pas de réinitialisation de mot de passe par email** : l'app n'envoie pas de mail. En cas d'oubli, supprimez la ligne de l'utilisateur dans la base ou recréez le compte.

## Connexion d'une IA (MCP)

Point d'accès : `POST /mcp` (transport Streamable HTTP, sans session), qui agit toujours sur le foyer de la personne connectée.

**OAuth 2.1 (recommandé)** : le serveur est son propre serveur d'autorisation (métadonnées de découverte, enregistrement dynamique de clients, PKCE S256, jetons d'accès d'une heure et jetons de rafraîchissement renouvelés à chaque usage). Un client compatible, comme Claude, n'a besoin que de l'adresse `PUBLIC_URL/mcp` : il ouvre la page de connexion, vous autorisez l'accès, c'est tout. Les accès accordés se retirent depuis l'onglet **Compte**. Remarque : la découverte OAuth exige que `PUBLIC_URL` soit en HTTPS (ou `localhost`).

**Jeton personnel** : pour les scripts ou les clients sans OAuth, créez un jeton dans l'onglet **Compte**, puis par exemple avec Claude Code :

```bash
claude mcp add --transport http mealmcp http://localhost:3000/mcp --header "Authorization: Bearer mmcp_VOTRE_JETON"
```

Le même jeton fonctionne sur l'API REST (`/api`). Pour tester le flux OAuth en local, utilisez l'app construite (`npm run build && npm start`) plutôt que `npm run dev`.

Argent : les montants que vous envoyez sont des décimaux dans la devise du foyer (`2.49`), ceux que vous recevez sont des entiers en centimes (`249`). Les écritures faites via MCP (ou l'API) sont poussées aux tableaux de bord ouverts par Server-Sent Events (`GET /api/events`) : rien à rafraîchir.

Outils exposés (35) : stock (`list_stock`, `add_stock`, `update_stock_item`, `consume_stock`, `remove_stock_item`, `get_stock_alerts`), produits (`list_products`, `update_product`), recettes (`list_recipes`, `get_recipe`, `create_recipe`, `update_recipe`, `delete_recipe`, `check_recipe_availability`), planning (`list_meal_plan`, `plan_meal`, `remove_planned_meal`, `cook_planned_meal`), courses (`list_shopping_list`, `add_shopping_item`, `check_shopping_item`, `remove_shopping_item`, `generate_shopping_list`, `complete_shopping`), budget (`record_expense`, `list_expenses`, `get_expense`, `delete_expense`, `get_spending_summary`, `get_budget_status`, `set_budget`, `set_product_price`, `estimate_recipe_cost`, `estimate_meal_plan_cost`, `estimate_shopping_list_cost`).

## Licence

[MIT](LICENSE)
