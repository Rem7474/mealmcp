import { mkdirSync, writeFileSync } from 'node:fs';

const REPO = 'https://github.com/Rem7474/mealmcp';
const SITE = 'https://rem7474.github.io/mealmcp';

const TOOLS = {
  stock: ['list_stock', 'add_stock', 'update_stock_item', 'open_stock_item', 'consume_stock', 'remove_stock_item', 'get_stock_alerts'],
  recipes: ['list_recipes', 'get_recipe', 'create_recipe', 'update_recipe', 'check_recipe_availability', 'suggest_recipes_to_use_up'],
  plan: ['list_meal_plan', 'plan_meal', 'cook_planned_meal', 'list_planning_slots'],
  shop: ['list_shopping_list', 'generate_shopping_list', 'add_shopping_item', 'check_shopping_item', 'complete_shopping'],
  budget: ['record_expense', 'get_spending_summary', 'get_budget_status', 'set_budget', 'estimate_recipe_cost', 'estimate_shopping_list_cost'],
  nutrition: ['search_nutrition', 'set_product_nutrition', 'get_recipe_nutrition', 'get_meal_plan_nutrition'],
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
    lead: 'Decide what to eat, buy only what you need, use what is already in the fridge and keep the grocery budget in check. One app you host yourself, that Claude or any AI assistant can run for you.',
    cta1: 'Self-host in 2 minutes',
    cta2: 'View on GitHub',
    badges: ['Self-hosted', 'MCP + OAuth 2.1', 'Installable (PWA)', 'EN / FR', 'MIT licence'],
    fHead: 'Everything a kitchen needs',
    fLead: 'Use it by hand, or let your AI do it: every action in the app is also a tool it can call.',
    features: [
      ['📅', 'Plan the week in minutes', 'Drop a recipe or a quick note on each day. Empty slots stand out, so nothing is left to “we will see”.'],
      ['🛒', 'Shopping lists that write themselves', 'One tap turns the week’s meals into a list: what you need, minus what is already at home. Sort it by aisle and tick as you walk the shop.'],
      ['🧊', 'Know what is in the fridge', 'See what expires first, get an alert on opened jars, and cook what you already own before buying more.'],
      ['📖', 'Recipes that fit your kitchen', 'Rate and favorite recipes, see which ones you can make tonight, and get a warning when one needs an appliance you do not have.'],
      ['💶', 'Grocery budget under control', 'Log receipts, set a monthly budget and see where you will land before the month ends. In any currency.'],
      ['🍎', 'Calories and macros, only if you want them', 'Turn on nutrition to see calories, protein, carbs and fat for every recipe. Values come from Open Food Facts or your own numbers, and the app tells you when an ingredient is missing. Off by default.'],
      ['🥕', 'Eat in season', 'A fruit and vegetable calendar for your country. Out-of-season items on your list come with in-season alternatives.'],
      ['🥗', 'Diets and allergies, handled', 'Vegetarian, gluten-free, the 14 EU allergens, foods someone dislikes: unsuitable recipes are flagged and never suggested.'],
      ['♻️', 'Less waste, less repetition', 'Remember what you cooked so menus stay fresh, and see what throwing food away really costs you.'],
      ['👨‍👩‍👧', 'One household, everyone in sync', 'Invite the family. Changes show up on every device instantly, including the ones your AI makes.'],
      ['📱', 'On your phone', 'Install it like an app and use it one-handed in the shop. Dark theme, English and French.'],
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
    toolGroups: [['Stock', 'stock'], ['Recipes', 'recipes'], ['Meal plan', 'plan'], ['Shopping', 'shop'], ['Budget', 'budget'], ['Nutrition (optional)', 'nutrition'], ['And more', 'more']],
    zoom: 'Enlarge the screenshot',
    mobileHead: 'In your pocket',
    mobileLead: 'The same app on a phone: bottom tab bar, one-handed use, install it on your home screen.',
    mobile: [
      ['planning', 'Planning: see the week at a glance.'],
      ['shopping', 'Shopping: tick items off as you walk the aisles.'],
      ['stock', 'Stock: fix a quantity or open a pack in one tap.'],
      ['budget', 'Budget: see where the month’s money went.'],
    ],
    tourHead: 'A quick tour',
    tourLead: 'Screens from the web app. Click one to enlarge it.',
    tour: [
      ['planning', 'Planning: see the week’s meals and what is still missing for each.'],
      ['recipes', 'Recipes: find what to cook, what you made lately and what is in season.'],
      ['nutrition', 'Nutrition (optional): know the calories and macros of every recipe.'],
      ['shopping', 'Shopping: get a ready list, grouped by aisle, with what it will cost.'],
      ['stock', 'Stock: spot what to finish first and open a pack in one click.'],
      ['budget', 'Budget: keep the month on track and see where the money goes.'],
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
    lead: 'Décidez quoi manger, n’achetez que le nécessaire, utilisez ce qu’il y a déjà dans le frigo et gardez le budget courses sous contrôle. Une application que vous hébergez, et que Claude ou tout assistant IA peut piloter pour vous.',
    cta1: 'Installer en 2 minutes',
    cta2: 'Voir sur GitHub',
    badges: ['Auto-hébergé', 'MCP + OAuth 2.1', 'Installable (PWA)', 'FR / EN', 'Licence MIT'],
    fHead: 'Tout ce qu’il faut à une cuisine',
    fLead: 'Utilisez-la à la main, ou laissez votre IA le faire : chaque action de l’application est aussi un outil qu’elle peut appeler.',
    features: [
      ['📅', 'La semaine planifiée en quelques minutes', 'Posez une recette ou une simple note sur chaque jour. Les créneaux vides ressortent : plus de « on verra ».'],
      ['🛒', 'Des courses qui se préparent seules', 'Un clic transforme les repas de la semaine en liste : ce qu’il faut, moins ce qu’il y a déjà. Triez par rayon et cochez en faisant les courses.'],
      ['🧊', 'Savoir ce qu’il y a dans le frigo', 'Voyez ce qui expire en premier, soyez alerté pour les pots ouverts et cuisinez ce que vous avez avant d’en racheter.'],
      ['📖', 'Des recettes adaptées à votre cuisine', 'Notez et mettez en favori, voyez ce que vous pouvez cuisiner ce soir, et soyez prévenu si une recette demande un appareil que vous n’avez pas.'],
      ['💶', 'Un budget courses maîtrisé', 'Enregistrez vos tickets, fixez un budget mensuel et voyez où vous allez finir avant la fin du mois. Dans la devise de votre choix.'],
      ['🍎', 'Calories et macros, seulement si vous voulez', 'Activez la nutrition pour voir calories, protéines, glucides et lipides de chaque recette. Les valeurs viennent d’Open Food Facts ou de vos chiffres, et l’appli signale l’ingrédient manquant. Désactivé par défaut.'],
      ['🥕', 'Manger de saison', 'Un calendrier des fruits et légumes de votre pays. Les articles hors saison de la liste viennent avec des alternatives de saison.'],
      ['🥗', 'Régimes et allergies pris en compte', 'Végétarien, sans gluten, les 14 allergènes de l’UE, ce que quelqu’un n’aime pas : les recettes qui ne conviennent pas sont signalées et jamais suggérées.'],
      ['♻️', 'Moins de gaspillage, moins de répétitions', 'Retient ce que vous avez cuisiné pour varier les menus, et chiffre ce que coûte vraiment la nourriture jetée.'],
      ['👨‍👩‍👧', 'Un foyer, tout le monde synchronisé', 'Invitez la famille. Les changements apparaissent aussitôt sur chaque appareil, y compris ceux de votre IA.'],
      ['📱', 'Dans votre poche', 'Installez-la comme une application et utilisez-la d’une main en magasin. Thème sombre, français et anglais.'],
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
    toolGroups: [['Stock', 'stock'], ['Recettes', 'recipes'], ['Planning', 'plan'], ['Courses', 'shop'], ['Budget', 'budget'], ['Nutrition (optionnel)', 'nutrition'], ['Et plus', 'more']],
    zoom: 'Agrandir la capture',
    mobileHead: 'Dans votre poche',
    mobileLead: 'La même application sur téléphone : barre d’onglets en bas, utilisable d’une main, installable sur l’écran d’accueil.',
    mobile: [
      ['planning', 'Planning : la semaine d’un coup d’œil.'],
      ['shopping', 'Courses : cochez au fil des rayons.'],
      ['stock', 'Stock : corrigez une quantité ou ouvrez une unité en un geste.'],
      ['budget', 'Budget : voyez où est parti l’argent du mois.'],
    ],
    tourHead: 'Petit tour du propriétaire',
    tourLead: 'Captures de l’application web. Cliquez pour agrandir.',
    tour: [
      ['planning', 'Planning : les repas de la semaine et ce qui manque pour chacun.'],
      ['recipes', 'Recettes : trouvez quoi cuisiner, ce que vous avez fait récemment et ce qui est de saison.'],
      ['nutrition', 'Nutrition (optionnelle) : connaissez les calories et macros de chaque recette.'],
      ['shopping', 'Courses : une liste prête, classée par rayon, avec son coût.'],
      ['stock', 'Stock : repérez ce qu’il faut finir en premier et ouvrez une unité en un clic.'],
      ['budget', 'Budget : gardez le mois sous contrôle et voyez où va l’argent.'],
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
