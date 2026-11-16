# MealMCP

**Français** · [English](README.md) · [Site web](https://rem7474.github.io/mealmcp/fr/)

[![CI](https://github.com/Rem7474/mealmcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Rem7474/mealmcp/actions/workflows/ci.yml)

Décidez quoi manger, n'achetez que le nécessaire, utilisez ce qu'il y a déjà dans le frigo et gardez le budget courses sous contrôle. Une application que vous hébergez, et que Claude ou tout assistant IA peut piloter pour vous grâce à son serveur MCP intégré.

- **La semaine planifiée en quelques minutes** : posez une recette ou une simple note sur chaque jour. Dites qui mange et quand : les créneaux vides ressortent. « Planifier ma semaine » propose un menu selon le stock, ce qui périme et vos goûts ; vous gardez, changez ou choisissez chaque repas avant l’ajout. Avec un serveur d’IA connecté, « Planifier avec l’IA » fait de même avec des recettes inédites écrites pour vous (et vos envies) ; elles ne sont enregistrées que lorsque vous les ajoutez.
- **Des courses qui se préparent seules** : les repas de la semaine deviennent une liste (ce qu'il faut, moins ce qu'il y a à la maison, plus ce qui commence à manquer). Affichage par rayon ou par repas, et rangement des achats en un geste. De retour des courses, saisissez ou collez ce que vous avez acheté (« J’ai fait les courses ») : vous vérifiez les lignes, puis stock, liste et dépense sont mis à jour d’un coup.
- **Savoir ce qu'il y a dans le frigo** : frigo, congélateur et placard avec dates de péremption, alertes sur les pots ouverts, DLC et DDM, congélation et décongélation, même d'une partie d'un paquet (l’horloge change avec), une note et une marque par ligne, des codes-barres (plusieurs par produit, un par format ; scannez-en un avec la caméra du téléphone ou saisissez-le et le formulaire se remplit, ou un assistant peut en chercher un dans Open Food Facts et le mettre en stock en un appel, seul le code ou le nom cherché est envoyé), conditionnements « 3 × 200 ml », poids égouttés pour les haricots et le thon, conversions par produit (1 patate douce = 300 g). Des recettes sont suggérées pour finir ce qui expire en premier.
- **Des recettes adaptées à votre cuisine** : ingrédients (les produits de base et les ingrédients « à votre goût » ne sont jamais achetés), étapes avec appareil et température, étiquettes, notes de 1 à 5 étoiles et favoris. Voyez ce que vous pouvez cuisiner tout de suite, et ce qui demande un appareil que vous n'avez pas.
- **Un budget courses maîtrisé** : enregistrez vos achats (à la main, depuis un ticket via une IA, ou en terminant les courses), fixez un budget mensuel avec projection, suivez les dépenses par catégorie, magasin et mois, et estimez le coût des recettes, de la semaine et de la liste d'après ce que vous avez réellement payé. Chaque ticket alimente un historique des prix par produit (au kilo, au litre ou à la pièce, tendance, magasin le moins cher), les lignes de courses sont signalées quand un prix dépasse nettement l'habituel, et chaque ligne de stock retient ce que vous avez payé. Dans la devise de votre choix.
- **Calories et macros, seulement si vous voulez** (désactivé par défaut) : activez-le dans les réglages du foyer pour voir calories, protéines, glucides et lipides de chaque recette. Les valeurs viennent d'[Open Food Facts](https://fr.openfoodfacts.org) quand vous cherchez un produit (seul le nom ou le code-barres est envoyé ; données sous licence ODbL) ou de vos propres chiffres, et les totaux indiquent quels ingrédients n'en avaient pas.
- **Manger de saison** : un calendrier hors ligne des fruits, légumes et herbes selon votre pays (FR, BE, CH, GB, CA, US, hémisphère sud pris en charge). Les articles hors saison de la liste viennent avec des alternatives de saison.
- **Régimes et allergies pris en compte** : végétarien, sans gluten, les 14 allergènes de l'UE, ce que quelqu'un n'aime pas. Les recettes qui ne conviennent pas sont signalées et jamais suggérées (détection par nom d'ingrédient : un garde-fou, vérifiez les étiquettes).
- **Moins de gaspillage, moins de répétitions** : voyez quand chaque recette a été faite pour varier les menus, et notez ce que vous jetez pour en mesurer le coût, chiffré au prix que vous avez payé.
- **Pensé pour la planification par IA** : `get_meal_context` donne à un assistant tout ce qu'il faut pour proposer un menu en un appel (contraintes, stock qui expire, saison, repas récents, créneaux libres, budget).
- **Un foyer, tout le monde synchronisé** : invitez la famille, et chaque écran se met à jour tout seul quand quelque chose change ailleurs, y compris quand votre IA modifie le stock.
- **Dans votre poche** : installez-la depuis le navigateur et utilisez-la d'une main en magasin ; les formulaires s'ouvrent en feuilles qu'on ferme en les glissant vers le bas (nécessite HTTPS, voir plus bas).
- **Bilingue** : français et anglais (sélecteur de langue en haut à droite, langue du navigateur par défaut). Les descriptions des outils MCP sont en anglais.

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
| `npm test` | tests serveur (services, auth, OAuth, sécurité, config) et web (composants, i18n, service worker) |
| `npm run test:coverage` | idem, et échoue si la couverture passe sous les seuils |
| `npm run lint` | Biome : lint et formatage (`npm run format` corrige ce qui peut l'être) |
| `npm run typecheck` | TypeScript sur le serveur (tests inclus) et le web |
| `npm run release -- patch` | incrémente la version partout, commit et tag (pousser avec `git push --follow-tags`) |
| `npm run build` | build web + serveur |
| `npm start` | sert l'app construite sur le port 3000 |
| `npm run db:generate` | génère une migration après modification de `server/src/db/schema.ts` |

## CI/CD

- `_checks.yml` (réutilisable, partagé par la CI et les releases) : lint/format Biome, typage, build, tests avec seuils de couverture, et `npm audit` sur les dépendances de production.
- `ci.yml` : ces contrôles à chaque push et pull request, puis construction de l'image Docker, test de fumée du conteneur (health check, accès refusé sans compte, découverte OAuth, `no-store` sur l'API, logs JSON sans secrets, arrêt propre sur SIGTERM) et analyse Trivy.
- `codeql.yml` : analyse statique CodeQL sur les push, pull requests et chaque semaine.
- `release.yml` : après les mêmes contrôles, publie l'image multi-arch sur GitHub Container Registry avec SBOM, attestation de provenance et signature cosign. Pour un tag `vX.Y.Z`, vérifie d'abord que le tag correspond à la version des `package.json`, puis crée la Release GitHub. Pour publier : `npm run release -- minor && git push --follow-tags`.
- Dependabot met à jour les dépendances npm, les actions GitHub et l'image de base. Les actions et l'image de base sont épinglées par empreinte.

Vérifier une image publiée :

```bash
cosign verify ghcr.io/rem7474/mealmcp:0.4.5 \
  --certificate-identity-regexp '^https://github.com/Rem7474/mealmcp/' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

## Déploiement Docker

Copiez `.env.example` en `.env` et renseignez au moins `PUBLIC_URL` (l'adresse réelle de l'app, en HTTPS si des clients MCP distants doivent s'y connecter), puis :

```bash
docker compose up -d
```

Cela télécharge l'image publiée (`ghcr.io/rem7474/mealmcp:latest`). Pour figer une version, ajoutez `MEALMCP_VERSION=0.1.0` dans `.env` ; pour construire depuis les sources, utilisez `docker compose up -d --build`.

Ouvrez ensuite l'adresse de l'app : **le premier compte créé devient propriétaire du foyer**.

L'image (amd64 et arm64) est publiée à chaque push sur `main` (tag `main`) et à chaque tag `vX.Y.Z` (tags `X.Y.Z`, `X.Y` et `latest`).

La base SQLite est dans le volume `mealmcp-data`. Si l'app est exposée hors du réseau local, placez-la derrière un reverse proxy HTTPS et réglez `PUBLIC_URL` et `TRUST_PROXY` (voir `.env.example`).

La configuration est vérifiée au démarrage : une valeur erronée (`PORT=abc`, `PUBLIC_URL` sans `https://`...) arrête l'app en listant tous les problèmes. Les logs vont sur la sortie standard, un objet JSON par ligne en production (`LOG_FORMAT=json`), avec un identifiant de requête (`X-Request-Id`) et les secrets masqués ; `LOG_LEVEL` vaut `debug`, `info`, `warn`, `error` ou `silent`. Le conteneur a un health check sur `/health` et s'arrête proprement sur `SIGTERM`.

**Sauvegarde** : copiez la base à chaud avec `docker compose exec mealmcp node -e "require('better-sqlite3')('/data/mealmcp.db').backup('/data/backup.db').then(()=>console.log('ok'))"` puis récupérez `/data/backup.db` dans le volume.

## IA locale facultative

MealMCP fonctionne entièrement sans IA. Si vous faites tourner un serveur de modèles chez vous (Ollama, LM Studio, llama.cpp : tout ce qui parle l'API OpenAI), renseignez `LLM_BASE_URL` (par exemple `http://localhost:11434/v1`) et l'app pourra s'en servir pour des parcours guidés. Le modèle ne fait que **proposer** : une personne relit et valide avant toute écriture, et il n'appelle aucun outil et ne récupère rien. Tout reste entre cette app et votre serveur de modèles.

- `LLM_BASE_URL` vide signifie que les fonctions IA sont désactivées. Elle est fixée par la personne qui déploie le serveur et ne se change pas depuis l'app. Dans Docker, `localhost` est le conteneur : utilisez `http://host.docker.internal:11434/v1` pour un serveur sur la machine hôte.
- `LLM_API_KEY` (facultative) est envoyée en jeton Bearer et n'atteint jamais le navigateur ni les logs. `LLM_MODEL` et `LLM_VISION_MODEL` sont des valeurs par défaut ; le propriétaire du foyer choisit les modèles dans **Compte > Assistant IA**, parmi la liste que le serveur annonce.
- `LLM_VISION` vaut `auto` (on se fie à ce que le serveur annonce pour un modèle : Ollama, LM Studio et llama.cpp sont reconnus, le reste est `unknown`), `true` ou `false`. `LLM_TIMEOUT_MS` et `LLM_MAX_CONCURRENT` bornent la charge : une requête à la fois par foyer, `LLM_MAX_CONCURRENT` en tout.
- Un bouton **Tester** du même écran vérifie que le serveur répond, que le modèle existe, qu'il renvoie du JSON valide et, s'il lit les images, qu'il en accepte une.

## Comptes et foyers

- Un **foyer** regroupe recettes, planning, courses et stock ; chaque donnée appartient à un foyer et les services filtrent systématiquement dessus (deux foyers ne voient jamais les données l'un de l'autre).
- Le premier compte crée un foyer et en est propriétaire. Il invite ensuite d'autres personnes (onglet **Compte**) avec un code à usage unique valable 7 jours. `ALLOW_REGISTRATION=true` ouvre aussi la création de nouveaux foyers.
- Mots de passe hachés avec scrypt, sessions par cookie `HttpOnly`/`SameSite=Lax`, jetons et codes stockés hachés, limitation des tentatives de connexion par IP et par email. L'inscription ne révèle jamais si un email est déjà utilisé.
- Dans l'onglet **Compte** : changer de mot de passe (les autres appareils sont déconnectés), voir les appareils connectés et en déconnecter, retirer un membre du foyer (propriétaire), supprimer son compte (et le foyer si l'on y est seul), créer des jetons personnels avec une date d'expiration facultative.
- **Pas de réinitialisation de mot de passe par email** : l'app n'envoie pas de mail. En cas d'oubli, supprimez la ligne de l'utilisateur dans la base ou recréez le compte.

## Connexion d'une IA (MCP)

Point d'accès : `POST /mcp` (transport Streamable HTTP, sans session), qui agit toujours sur le foyer de la personne connectée.

**OAuth 2.1 (recommandé)** : le serveur est son propre serveur d'autorisation (métadonnées de découverte, enregistrement dynamique de clients, PKCE S256, jetons d'accès d'une heure et jetons de rafraîchissement renouvelés à chaque usage). Un client compatible, comme Claude, n'a besoin que de l'adresse `PUBLIC_URL/mcp` : il ouvre la page de connexion, vous autorisez l'accès, c'est tout. Les accès accordés se retirent depuis l'onglet **Compte**. Remarque : la découverte OAuth exige que `PUBLIC_URL` soit en HTTPS (ou `localhost`).

**Jeton personnel** : pour les scripts ou les clients sans OAuth, créez un jeton dans l'onglet **Compte**, puis par exemple avec Claude Code :

```bash
claude mcp add --transport http mealmcp http://localhost:3000/mcp --header "Authorization: Bearer mmcp_VOTRE_JETON"
```

Le même jeton (ou un jeton d'accès OAuth) fonctionne sur l'API REST (`/api`) pour tout ce qui touche à la cuisine, mais ne peut pas gérer le compte (mot de passe, appareils, jetons, invitations, membres) : cela exige la session du navigateur. Pour tester le flux OAuth en local, utilisez l'app construite (`npm run build && npm start`) plutôt que `npm run dev`.

Argent : les montants que vous envoyez sont des décimaux dans la devise du foyer (`2.49`), ceux que vous recevez sont des entiers en centimes (`249`). Les écritures faites via MCP (ou l'API) sont poussées aux tableaux de bord ouverts par Server-Sent Events (`GET /api/events`) : rien à rafraîchir.

Outils exposés : stock (`list_stock`, `add_stock`, `add_stock_bulk`, `update_stock_item`, `update_stock_bulk`, `open_stock_item`, `unopen_stock_item`, `freeze_stock_item`, `thaw_stock_item`, `consume_stock`, `discard_stock`, `remove_stock_item`, `get_stock_alerts`, `get_waste_summary`), recettes (`list_recipes`, `get_recipe`, `create_recipe`, `create_recipes_bulk`, `update_recipe`, `delete_recipe`, `check_recipe_availability`, `suggest_recipes_to_use_up`), planning (`list_meal_plan`, `plan_meal`, `plan_meals_bulk`, `remove_planned_meal`, `cook_planned_meal`, `list_planning_slots`, `get_meal_history`, `get_meal_context`, `get_next_actions`), courses (`list_shopping_list`, `generate_shopping_list`, `add_shopping_item`, `add_shopping_items_bulk`, `check_shopping_item`, `remove_shopping_item`, `complete_shopping`), budget et prix (`record_expense`, `list_expenses`, `get_expense`, `delete_expense`, `get_spending_summary`, `get_budget_status`, `set_budget`, `set_product_price`, `get_price_history`, `estimate_recipe_cost`, `estimate_meal_plan_cost`, `estimate_shopping_list_cost`), nutrition (optionnelle) (`search_nutrition`, `set_product_nutrition`, `get_recipe_nutrition`, `get_meal_plan_nutrition`), produits, équipements, foyer et saison (`list_products`, `search_catalog`, `update_product`, `update_products_bulk`, `add_product_alias`, `remove_product_alias`, `list_equipment`, `add_equipment`, `update_equipment`, `remove_equipment`, `get_household_settings`, `set_household_settings`, `get_seasonal_produce`).

## Licence

[MIT](LICENSE)
