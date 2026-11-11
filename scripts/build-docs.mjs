import { mkdirSync, writeFileSync } from 'node:fs';

const REPO = 'https://github.com/Rem7474/mealmcp';
const SITE = 'https://rem7474.github.io/mealmcp';

const TOOLS = {
  stock: ['list_stock', 'add_stock', 'update_stock_item', 'open_stock_item', 'consume_stock', 'remove_stock_item', 'get_stock_alerts'],
  recipes: ['list_recipes', 'get_recipe', 'create_recipe', 'update_recipe', 'check_recipe_availability', 'suggest_recipes_to_use_up'],
  plan: ['list_meal_plan', 'plan_meal', 'cook_planned_meal', 'list_planning_slots'],
  shop: ['list_shopping_list', 'generate_shopping_list', 'add_shopping_item', 'check_shopping_item', 'complete_shopping'],
  budget: ['record_expense', 'get_spending_summary', 'get_budget_status', 'set_budget', 'estimate_recipe_cost', 'estimate_shopping_list_cost'],
  more: ['list_products', 'update_product', 'add_product_alias', 'list_equipment', 'set_household_settings', 'add_stock_bulk', 'create_recipes_bulk', 'plan_meals_bulk'],
};

const t = {
  en: {
    lang: 'en',
    path: '',
    other: '../fr/',
    otherLabel: 'Français',
    assets: '',
    title: 'MealMCP: meal planning, shopping and pantry, driven by your AI',
    desc: 'Self-hosted meal planning, shopping list, pantry stock and budget for your household, with a built-in MCP server so an AI assistant can run it for you.',
    nav: { features: 'Features', mcp: 'AI & MCP', tour: 'Tour', deploy: 'Self-host' },
    h1: 'Plan the week. <em>Let your AI</em> do the rest.',
    lead: 'MealMCP keeps your meal plan, recipes, shopping list, pantry and budget in one self-hosted app for your household, and ships an MCP server so Claude or any assistant can read and update it for you.',
    cta1: 'Self-host in 2 minutes',
    cta2: 'View on GitHub',
    badges: ['Self-hosted', 'MCP + OAuth 2.1', 'Installable (PWA)', 'EN / FR', 'MIT licence'],
    fHead: 'Everything a kitchen needs',
    fLead: 'One household, one source of truth. Every screen works by hand; every action is also a tool your AI can call.',
    features: [
      ['📅', 'Meal planning', 'Meals per day from a recipe or free text. Tell it who eats and when: empty slots are highlighted so you know what is left to plan.'],
      ['📖', 'Recipes', 'Ingredients, steps with appliance and temperature, tags, 1–5 star ratings and favorites. See at a glance what you can cook with your stock.'],
      ['🛒', 'Smart shopping', 'Generated from the plan: needs minus stock, plus products under their threshold. View it by aisle or by the meal each item is for.'],
      ['🧊', 'Real pantry', 'Fridge, freezer, pantry. Packs as “3 × 200 ml”, opened jars with a shelf life and an alert, drained vs net weight, and “plenty of it” markers.'],
      ['💶', 'Budget', 'Record purchases, set a monthly budget with a projection, see spending by category and shop, and get cost estimates from what you really paid.'],
      ['🍎', 'Nutrition, if you want it', 'An opt-in module: calories and macros per recipe, from Open Food Facts lookups (only the product name is sent) or values you type. Off by default.'],
      ['🥕', 'In season','A built-in calendar of seasonal fruit, vegetables and herbs for your country. Out-of-season items on your list come with in-season alternatives.'],
      ['🥗', 'Diet and allergies', 'Vegetarian, gluten-free, the 14 EU allergens, ingredients you dislike: recipes that do not fit are flagged and never suggested.'],
      ['♻️', 'History and waste', 'Remember what you cooked so menus do not repeat, and log what you throw away to see what it costs.'],
      ['🔧', 'Equipment', 'Tell it which appliances you own. Recipes that need an air fryer you do not have are flagged.'],
      ['⚡', 'Live updates', 'The dashboard refreshes by itself when something changes elsewhere, for example when your AI edits the stock.'],
      ['📱', 'Installable', 'Add it to your phone’s home screen for a full-screen app. Dark “Nocturne” theme, English and French.'],
    ],
    mHead: 'Built for AI assistants',
    mLead: 'The same business logic backs the web UI and an MCP endpoint. Connect Claude (or any MCP client) and just talk: it can read your stock, plan the week, build the list and log the receipt.',
    chat: [
      ['me', 'What can I cook tonight with what is about to expire?'],
      ['ai', 'You have a half jar of tomato sauce (opened 3 days ago) and potatoes expiring on the 13th. Air fryer fries + a pasta?', 'suggest_recipes_to_use_up'],
      ['me', 'Plan the pasta for Thursday and generate the shopping list.'],
      ['ai', 'Done: pasta planned for Thursday dinner. 8 items to buy, about €23 estimated.', 'plan_meal · generate_shopping_list'],
    ],
    mBullets: [
      ['OAuth 2.1 built in', ': discovery, dynamic client registration, PKCE. Paste the address, sign in, allow. Revoke any time.'],
      ['Personal tokens', ' for scripts and clients without OAuth. The same token opens the REST API.'],
      ['Over 40 tools', ': stock, recipes, plan, shopping, budget, equipment, bulk variants.'],
      ['Household-scoped', ': every request acts on the signed-in person’s household only.'],
    ],
    toolsHead: 'Some of the tools your AI gets',
    toolGroups: [['Stock', 'stock'], ['Recipes', 'recipes'], ['Meal plan', 'plan'], ['Shopping', 'shop'], ['Budget', 'budget'], ['And more', 'more']],
    zoom: 'Enlarge the screenshot',
    mobileHead: 'In your pocket',
    mobileLead: 'The same app on a phone: bottom tab bar, one-handed use, install it on your home screen.',
    mobile: [
      ['planning', 'Planning: the week as a day-by-day list.'],
      ['shopping', 'Shopping: tick items as you walk the aisles.'],
      ['stock', 'Stock: fix a quantity or open a pack in one tap.'],
      ['budget', 'Budget: where the month’s money went.'],
    ],
    tourHead: 'A quick tour',
    tourLead: 'Screens from the web app. Click one to enlarge it.',
    tour: [
      ['planning', 'Planning: only the meals you actually plan are shown, with what is missing for each.'],
      ['recipes', 'Recipes: ratings, favorites, when each was last made, and what is in season this month.'],
      ['shopping', 'Shopping: grouped by meal, aisle or a flat list, with a running cost estimate.'],
      ['stock', 'Stock: packs, opened items to finish soon, and one-click “open a pack”.'],
      ['budget', 'Budget: monthly envelope, projection and a breakdown of where the money goes.'],
    ],
    dHead: 'Self-host in two minutes',
    dLead: 'One container, one SQLite file. Multi-arch image (amd64 and arm64) published on GitHub Container Registry.',
    steps: [
      ['Get the files', 'Grab <code>docker-compose.yml</code> and <code>.env.example</code> from the repository and copy the example to <code>.env</code>. Set <code>PUBLIC_URL</code> to the real address of the app.'],
      ['Start it', null],
      ['Create the first account', 'Open the app: <strong>the first account becomes the household owner</strong>. Invite others from the Account tab with a single-use code.'],
      ['Connect your AI', 'Add <code>PUBLIC_URL/mcp</code> as an MCP server in Claude. Remote clients need HTTPS: put the app behind a reverse proxy.'],
    ],
    dNote: 'Passwords are hashed with scrypt, sessions are HttpOnly/SameSite cookies, tokens are stored hashed and logins are rate-limited. Data stays on your server.',
    aHead: 'Under the hood',
    aLead: 'Express 5, TypeScript, Drizzle with SQLite, the official MCP SDK and Zod on the server; React 19, Vite and Tailwind 4 on the web. The REST API and the MCP server are two thin adapters over the same services, so a business rule is written once.',
    foot: 'Released under the MIT licence.',
    links: { repo: 'Repository', docs: 'Full documentation', rel: 'Releases' },
  },
  fr: {
    lang: 'fr',
    path: 'fr/',
    other: '../',
    otherLabel: 'English',
    assets: '../',
    title: 'MealMCP : repas, courses et placard pilotés par votre IA',
    desc: 'Planning de repas, courses, stock du placard et budget pour votre foyer, auto-hébergé, avec un serveur MCP intégré pour qu’un assistant IA s’en occupe à votre place.',
    nav: { features: 'Fonctions', mcp: 'IA & MCP', tour: 'Aperçu', deploy: 'Installer' },
    h1: 'Planifiez la semaine. <em>Laissez votre IA</em> faire le reste.',
    lead: 'MealMCP réunit planning de repas, recettes, courses, placard et budget dans une application auto-hébergée pour votre foyer, avec un serveur MCP pour que Claude (ou tout assistant) les lise et les mette à jour à votre place.',
    cta1: 'Installer en 2 minutes',
    cta2: 'Voir sur GitHub',
    badges: ['Auto-hébergé', 'MCP + OAuth 2.1', 'Installable (PWA)', 'FR / EN', 'Licence MIT'],
    fHead: 'Tout ce qu’il faut à une cuisine',
    fLead: 'Un foyer, une seule source de vérité. Chaque écran fonctionne à la main ; chaque action est aussi un outil que votre IA peut appeler.',
    features: [
      ['📅', 'Planning de repas', 'Les repas du jour depuis une recette ou en texte libre. Dites qui mange et quand : les créneaux vides sont signalés pour voir ce qu’il reste à planifier.'],
      ['📖', 'Recettes', 'Ingrédients, étapes avec appareil et température, étiquettes, notes de 1 à 5 étoiles et favoris. Voyez d’un coup d’œil ce que le stock permet de cuisiner.'],
      ['🛒', 'Courses intelligentes', 'Générées depuis le planning : besoins moins stock, plus les produits sous leur seuil. Affichage par rayon ou par repas concerné.'],
      ['🧊', 'Un vrai placard', 'Frigo, congélateur, placard. Conditionnements « 3 × 200 ml », pots ouverts avec durée de conservation et alerte, poids net ou égoutté, et marqueurs « beaucoup ».'],
      ['💶', 'Budget', 'Enregistrez vos achats, fixez un budget mensuel avec projection, suivez les dépenses par catégorie et magasin, et estimez les coûts d’après ce que vous avez réellement payé.'],
      ['🍎', 'Nutrition, si vous voulez', 'Un module optionnel : calories et macros par recette, depuis Open Food Facts (seul le nom du produit est envoyé) ou vos propres valeurs. Désactivé par défaut.'],
      ['🥕', 'De saison','Un calendrier intégré des fruits, légumes et herbes de saison pour votre pays. Les articles hors saison de la liste viennent avec des alternatives de saison.'],
      ['🥗', 'Régimes et allergies', 'Végétarien, sans gluten, les 14 allergènes de l’UE, ce que vous n’aimez pas : les recettes qui ne conviennent pas sont signalées et jamais suggérées.'],
      ['♻️', 'Historique et gaspillage', 'Retient ce que vous avez cuisiné pour éviter les répétitions, et note ce que vous jetez pour en voir le coût.'],
      ['🔧', 'Équipement', 'Indiquez les appareils que vous possédez. Une recette qui demande un air fryer que vous n’avez pas est signalée.'],
      ['⚡', 'Mises à jour en direct', 'Le tableau de bord se rafraîchit tout seul quand quelque chose change ailleurs, par exemple quand votre IA modifie le stock.'],
      ['📱', 'Installable', 'Ajoutez-la à l’écran d’accueil de votre téléphone pour une application plein écran. Thème sombre « Nocturne », français et anglais.'],
    ],
    mHead: 'Pensé pour les assistants IA',
    mLead: 'La même logique métier alimente l’interface web et un point d’accès MCP. Connectez Claude (ou tout client MCP) et parlez-lui : il lit votre stock, planifie la semaine, construit la liste et enregistre le ticket de caisse.',
    chat: [
      ['me', 'Que cuisiner ce soir avec ce qui va bientôt expirer ?'],
      ['ai', 'Il vous reste un demi-pot de sauce tomate (ouvert depuis 3 jours) et des pommes de terre qui expirent le 13. Des frites à l’air fryer + des pâtes ?', 'suggest_recipes_to_use_up'],
      ['me', 'Planifie les pâtes jeudi et génère la liste de courses.'],
      ['ai', 'C’est fait : pâtes au dîner de jeudi. 8 articles à acheter, environ 23 € estimés.', 'plan_meal · generate_shopping_list'],
    ],
    mBullets: [
      ['OAuth 2.1 intégré', ' : découverte, enregistrement dynamique des clients, PKCE. Collez l’adresse, connectez-vous, autorisez. Révocable à tout moment.'],
      ['Jetons personnels', ' pour les scripts et clients sans OAuth. Le même jeton ouvre l’API REST.'],
      ['Plus de 40 outils', ' : stock, recettes, planning, courses, budget, équipement, variantes en lot.'],
      ['Cloisonné par foyer', ' : chaque requête n’agit que sur le foyer de la personne connectée.'],
    ],
    toolsHead: 'Quelques outils offerts à votre IA',
    toolGroups: [['Stock', 'stock'], ['Recettes', 'recipes'], ['Planning', 'plan'], ['Courses', 'shop'], ['Budget', 'budget'], ['Et plus', 'more']],
    zoom: 'Agrandir la capture',
    mobileHead: 'Dans votre poche',
    mobileLead: 'La même application sur téléphone : barre d’onglets en bas, utilisable d’une main, installable sur l’écran d’accueil.',
    mobile: [
      ['planning', 'Planning : la semaine, jour par jour.'],
      ['shopping', 'Courses : cochez au fil des rayons.'],
      ['stock', 'Stock : corrigez une quantité ou ouvrez une unité en un geste.'],
      ['budget', 'Budget : où est parti l’argent du mois.'],
    ],
    tourHead: 'Petit tour du propriétaire',
    tourLead: 'Captures de l’application web. Cliquez pour agrandir.',
    tour: [
      ['planning', 'Planning : seuls les repas que vous planifiez sont affichés, avec ce qui manque pour chacun.'],
      ['recipes', 'Recettes : notes, favorites, date de la dernière fois, et ce qui est de saison ce mois-ci.'],
      ['shopping', 'Courses : par repas, par rayon ou en liste simple, avec une estimation du coût.'],
      ['stock', 'Stock : conditionnements, produits entamés à finir vite et « ouvrir une unité » en un clic.'],
      ['budget', 'Budget : enveloppe mensuelle, projection et répartition des dépenses.'],
    ],
    dHead: 'Installez-le en deux minutes',
    dLead: 'Un conteneur, un fichier SQLite. Image multi-architecture (amd64 et arm64) publiée sur le GitHub Container Registry.',
    steps: [
      ['Récupérez les fichiers', 'Prenez <code>docker-compose.yml</code> et <code>.env.example</code> dans le dépôt et copiez l’exemple vers <code>.env</code>. Renseignez <code>PUBLIC_URL</code> avec l’adresse réelle de l’application.'],
      ['Démarrez', null],
      ['Créez le premier compte', 'Ouvrez l’application : <strong>le premier compte devient propriétaire du foyer</strong>. Invitez les autres depuis l’onglet Compte avec un code à usage unique.'],
      ['Connectez votre IA', 'Ajoutez <code>PUBLIC_URL/mcp</code> comme serveur MCP dans Claude. Les clients distants exigent HTTPS : placez l’application derrière un reverse proxy.'],
    ],
    dNote: 'Les mots de passe sont hachés avec scrypt, les sessions utilisent des cookies HttpOnly/SameSite, les jetons sont stockés hachés et les connexions sont limitées en débit. Vos données restent sur votre serveur.',
    aHead: 'Sous le capot',
    aLead: 'Express 5, TypeScript, Drizzle avec SQLite, le SDK MCP officiel et Zod côté serveur ; React 19, Vite et Tailwind 4 côté web. L’API REST et le serveur MCP sont deux fines couches au-dessus des mêmes services : une règle métier s’écrit une seule fois.',
    foot: 'Publié sous licence MIT.',
    links: { repo: 'Dépôt', docs: 'Documentation complète', rel: 'Versions' },
  },
};

const logo = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M7 15h18v3a7 7 0 0 1-7 7h-4a7 7 0 0 1-7-7z" fill="none" stroke="#9184d9" stroke-width="2" stroke-linejoin="round"/><path d="M5 15h22M12 11c0-2 2-2 2-4M18 11c0-2 2-2 2-4" fill="none" stroke="#d2cefd" stroke-width="2" stroke-linecap="round"/></svg>';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function page(c) {
  const a = c.assets;
  const readme = c.lang === 'fr' ? `${REPO}/blob/main/README.fr.md` : `${REPO}/blob/main/README.md`;
  const tools = c.toolGroups
    .map(([label, key]) => `<div><h3>${label}</h3>${TOOLS[key].map((n) => `<code>${n}</code>`).join(' ')}</div>`)
    .join('\n      ');
  const chat = c.chat
    .map(([who, text, tool]) => `<div class="msg ${who}">${esc(text)}${tool ? `<small>${tool}</small>` : ''}</div>`)
    .join('\n        ');
  const feats = c.features.map(([i, h, p]) => `<div class="card"><div class="ico" aria-hidden="true">${i}</div><h3>${h}</h3><p>${p}</p></div>`).join('\n      ');
  const tour = c.tour
    .map(([k, cap]) => `<figure><div class="shot"><a class="zoom" href="${a}screens/${k}-${c.lang}.jpg" aria-label="${esc(c.zoom)}"><img src="${a}screens/${k}-${c.lang}.jpg" alt="${esc(cap)}" loading="lazy" width="1280" height="800"></a></div><figcaption>${cap}</figcaption></figure>`)
    .join('\n      ');
  const phones = c.mobile
    .map(([k, cap]) => `<figure><a class="zoom phone" href="${a}screens/m-${k}-${c.lang}.jpg" aria-label="${esc(c.zoom)}"><img src="${a}screens/m-${k}-${c.lang}.jpg" alt="${esc(cap)}" loading="lazy" width="780" height="1688"></a><figcaption>${cap}</figcaption></figure>`)
    .join('\n      ');
  const run = `cp .env.example .env   # ${c.lang === 'fr' ? 'puis éditez PUBLIC_URL' : 'then edit PUBLIC_URL'}\ndocker compose up -d`;
  const steps = c.steps
    .map(([h, p]) => `<div class="step"><div><p><strong>${h}</strong></p>${p ? `<p>${p}</p>` : `<pre><code>${run}</code></pre>`}</div></div>`)
    .join('\n      ');
  const bullets = c.mBullets.map(([b, r]) => `<li><strong>${b}</strong>${r}</li>`).join('');
  const url = `${SITE}/${c.path}`;

  return `<!doctype html>
<html lang="${c.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${c.title}</title>
<meta name="description" content="${c.desc}">
<meta name="theme-color" content="#161826">
<link rel="canonical" href="${url}">
<link rel="alternate" hreflang="en" href="${SITE}/">
<link rel="alternate" hreflang="fr" href="${SITE}/fr/">
<link rel="alternate" hreflang="x-default" href="${SITE}/">
<meta property="og:type" content="website">
<meta property="og:title" content="${c.title}">
<meta property="og:description" content="${c.desc}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/screens/planning-${c.lang}.jpg">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${a}assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${a}assets/style.css">
</head>
<body>
<header class="top">
  <div class="wrap">
    <a class="brand" href="#top">${logo}MealMCP</a>
    <nav aria-label="Main">
      <a class="hide-sm" href="#features">${c.nav.features}</a>
      <a class="hide-sm" href="#mcp">${c.nav.mcp}</a>
      <a class="hide-sm" href="#tour">${c.nav.tour}</a>
      <a class="hide-sm" href="#deploy">${c.nav.deploy}</a>
      <a href="${REPO}">GitHub</a>
      <span class="lang" role="group" aria-label="Language"><a href="${c.lang === 'en' ? '#' : c.other}" hreflang="en" lang="en"${c.lang === 'en' ? ' aria-current="true"' : ''}>EN</a><a href="${c.lang === 'fr' ? '#' : 'fr/'}" hreflang="fr" lang="fr"${c.lang === 'fr' ? ' aria-current="true"' : ''}>FR</a></span>
    </nav>
  </div>
</header>

<main id="top">
<div class="wrap hero">
  <h1>${c.h1}</h1>
  <p class="lead">${c.lead}</p>
  <div class="cta">
    <a class="btn primary" href="#deploy">${c.cta1}</a>
    <a class="btn" href="${REPO}">${c.cta2}</a>
  </div>
  <div class="badges">${c.badges.map((b) => `<span class="badge">${b}</span>`).join('')}</div>
  <div class="shot"><a class="zoom" href="${a}screens/planning-${c.lang}.jpg" aria-label="${esc(c.zoom)}"><img src="${a}screens/planning-${c.lang}.jpg" alt="${esc(c.tour[0][1])}" width="1280" height="800"></a></div>
</div>

<section id="features"><div class="wrap">
  <h2>${c.fHead}</h2>
  <p class="lead">${c.fLead}</p>
  <div class="grid">
      ${feats}
  </div>
</div></section>

<section id="mcp"><div class="wrap">
  <div class="split">
    <div>
      <div class="eyebrow">MCP</div>
      <h2>${c.mHead}</h2>
      <p class="lead">${c.mLead}</p>
      <ul>${bullets}</ul>
    </div>
    <div class="chat" aria-label="Example conversation">
        ${chat}
    </div>
  </div>
  <h2 style="margin-top:56px;font-size:1.3rem">${c.toolsHead}</h2>
  <div class="tools">
      ${tools}
  </div>
</div></section>

<section id="tour"><div class="wrap">
  <h2>${c.tourHead}</h2>
  <p class="lead">${c.tourLead}</p>
  <div class="gallery">
      ${tour}
  </div>
</div></section>

<section id="mobile"><div class="wrap">
  <h2>${c.mobileHead}</h2>
  <p class="lead">${c.mobileLead}</p>
  <div class="phones">
      ${phones}
  </div>
</div></section>

<section id="deploy"><div class="wrap">
  <h2>${c.dHead}</h2>
  <p class="lead">${c.dLead}</p>
  <div class="steps">
      ${steps}
  </div>
  <p class="lead" style="margin-top:24px">${c.dNote}</p>
</div></section>

<section id="arch"><div class="wrap">
  <h2>${c.aHead}</h2>
  <p class="lead">${c.aLead}</p>
<pre style="margin-top:20px"><code>server/src
  db/        Drizzle schema + SQLite, migrations at startup
  domain/    Zod schemas, units, dates, errors
  auth/      accounts, sessions, households, OAuth server
  services/  all the business logic (per household)
  api/       REST adapter (web UI)
  mcp/       MCP adapter (AI clients)
web/src      React + Vite + Tailwind UI (EN / FR)</code></pre>
</div></section>
</main>

<footer><div class="wrap">
  <span>MealMCP · ${c.foot}</span>
  <span><a href="${REPO}">${c.links.repo}</a> · <a href="${readme}">${c.links.docs}</a> · <a href="${REPO}/releases">${c.links.rel}</a></span>
</div></footer>
<dialog id="lightbox" aria-label="${c.zoom}"><img alt=""></dialog>
<script>
(function () {
  var box = document.getElementById('lightbox');
  if (!box || !box.showModal) return;
  var img = box.querySelector('img');
  document.querySelectorAll('a.zoom').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      img.src = a.href;
      img.alt = a.querySelector('img').alt;
      box.showModal();
    });
  });
  box.addEventListener('click', function () { box.close(); });
})();
</script>
</body>
</html>
`;
}

mkdirSync('docs/fr', { recursive: true });
writeFileSync('docs/index.html', page(t.en));
writeFileSync('docs/fr/index.html', page(t.fr));
console.log('ok');
