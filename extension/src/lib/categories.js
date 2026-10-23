// Category definitions + default domain classification used by the analytics
// engine. Users can override any mapping from the dashboard settings.

import { registrableDomain } from './utils.js';

// `score`: +1 productive, 0 neutral, -1 distracting — feeds the focus score.
export const CATEGORY_DEFS = {
  productivity:  { label: 'פרודוקטיביות',   color: '#34d399', score: 1 },
  reference:     { label: 'מידע ולמידה',     color: '#22d3ee', score: 1 },
  communication: { label: 'תקשורת',          color: '#2dd4bf', score: 0 },
  news:          { label: 'חדשות',           color: '#60a5fa', score: 0 },
  finance:       { label: 'פיננסים',         color: '#818cf8', score: 0 },
  shopping:      { label: 'קניות',           color: '#a78bfa', score: -1 },
  social:        { label: 'רשתות חברתיות',   color: '#f472b6', score: -1 },
  entertainment: { label: 'בידור',           color: '#fbbf24', score: -1 },
  other:         { label: 'אחר',             color: '#94a3b8', score: 0 },
};

export const CATEGORY_ORDER = [
  'productivity', 'reference', 'communication', 'news',
  'finance', 'shopping', 'social', 'entertainment', 'other',
];

// Keys should be registrable domains (`openai.com`, not `chat.openai.com`): with the default
// "group subdomains" setting the tracker only ever stores the registrable domain, so a
// subdomain key can never match. The subdomain keys below predate that rule; they still work
// for users who turn grouping off, and `categories.test.js` pins the list so no new ones
// slip in. Google/Microsoft hosts are deliberately absent from the registrable forms:
// google.com is Gmail, Docs and Search at once, so there is no single honest category.
export const DEFAULT_DOMAIN_CATEGORY = {
  // Productivity / dev / tools
  'github.com': 'productivity', 'gitlab.com': 'productivity', 'bitbucket.org': 'productivity',
  'notion.so': 'productivity', 'figma.com': 'productivity', 'trello.com': 'productivity',
  'atlassian.net': 'productivity', 'jira.com': 'productivity', 'asana.com': 'productivity',
  'docs.google.com': 'productivity', 'drive.google.com': 'productivity', 'sheets.google.com': 'productivity',
  'claude.ai': 'productivity', 'chatgpt.com': 'productivity', 'chat.openai.com': 'productivity',
  'overleaf.com': 'productivity', 'codepen.io': 'productivity', 'replit.com': 'productivity',
  'vercel.com': 'productivity', 'netlify.com': 'productivity', 'localhost': 'productivity',
  'openai.com': 'productivity', 'anthropic.com': 'productivity', 'claude.com': 'productivity',
  'perplexity.ai': 'productivity', 'deepseek.com': 'productivity', 'mistral.ai': 'productivity',
  'huggingface.co': 'productivity', 'cursor.com': 'productivity',
  'linear.app': 'productivity', 'airtable.com': 'productivity', 'miro.com': 'productivity',
  'canva.com': 'productivity', 'dropbox.com': 'productivity', 'box.com': 'productivity',
  'evernote.com': 'productivity', 'todoist.com': 'productivity', 'clickup.com': 'productivity',
  'monday.com': 'productivity', 'sharepoint.com': 'productivity', 'zoho.com': 'productivity',
  'bitrix24.ru': 'productivity', 'bitrix24.com': 'productivity',
  'npmjs.com': 'productivity', 'pypi.org': 'productivity', 'docker.com': 'productivity',
  'cloudflare.com': 'productivity', 'digitalocean.com': 'productivity', 'heroku.com': 'productivity',
  'supabase.com': 'productivity', 'jetbrains.com': 'productivity', 'stackblitz.com': 'productivity',
  'codesandbox.io': 'productivity',

  // Reference / learning
  'stackoverflow.com': 'reference', 'stackexchange.com': 'reference', 'developer.mozilla.org': 'reference',
  'wikipedia.org': 'reference', 'medium.com': 'reference', 'coursera.org': 'reference',
  'udemy.com': 'reference', 'khanacademy.org': 'reference', 'w3schools.com': 'reference',
  'geeksforgeeks.org': 'reference', 'arxiv.org': 'reference', 'scholar.google.com': 'reference',
  'mozilla.org': 'reference', 'britannica.com': 'reference', 'wiktionary.org': 'reference',
  'wikimedia.org': 'reference', 'wikihow.com': 'reference', 'wikiwand.com': 'reference',
  'duolingo.com': 'reference', 'edx.org': 'reference', 'brilliant.org': 'reference',
  'codecademy.com': 'reference', 'freecodecamp.org': 'reference', 'leetcode.com': 'reference',
  'hackerrank.com': 'reference', 'kaggle.com': 'reference', 'readthedocs.io': 'reference',
  'dev.to': 'reference', 'css-tricks.com': 'reference', 'smashingmagazine.com': 'reference',
  'baeldung.com': 'reference', 'realpython.com': 'reference', 'tutorialspoint.com': 'reference',
  'deepl.com': 'reference', 'linguee.com': 'reference', 'reverso.net': 'reference',
  'merriam-webster.com': 'reference', 'dictionary.com': 'reference', 'etymonline.com': 'reference',
  'wolframalpha.com': 'reference', 'quizlet.com': 'reference', 'chegg.com': 'reference',
  'nih.gov': 'reference', 'nature.com': 'reference', 'sciencedirect.com': 'reference',
  'jstor.org': 'reference', 'researchgate.net': 'reference', 'academia.edu': 'reference',
  'archive.org': 'reference', 'ted.com': 'reference',
  // es / fr / ru / ar
  'rae.es': 'reference', 'wordreference.com': 'reference', 'larousse.fr': 'reference',
  'cnrtl.fr': 'reference', 'fun-mooc.fr': 'reference', 'habr.com': 'reference',
  'stepik.org': 'reference', 'openedu.ru': 'reference', 'almaany.com': 'reference',
  'edraak.org': 'reference', 'rwaq.org': 'reference',

  // Communication
  'mail.google.com': 'communication', 'gmail.com': 'communication', 'outlook.com': 'communication',
  'outlook.office.com': 'communication', 'slack.com': 'communication', 'discord.com': 'communication',
  'web.whatsapp.com': 'communication', 'whatsapp.com': 'communication', 'telegram.org': 'communication',
  'web.telegram.org': 'communication', 'teams.microsoft.com': 'communication', 'zoom.us': 'communication',
  'meet.google.com': 'communication',
  'proton.me': 'communication', 'protonmail.com': 'communication', 'fastmail.com': 'communication',
  'hey.com': 'communication', 'tuta.com': 'communication', 'tutanota.com': 'communication',
  'mail.com': 'communication', 'gmx.net': 'communication', 'web.de': 'communication',
  'laposte.net': 'communication', 'mail.ru': 'communication',
  'signal.org': 'communication', 'viber.com': 'communication', 'line.me': 'communication',
  'skype.com': 'communication', 'messenger.com': 'communication', 't.me': 'communication',
  'telegram.me': 'communication', 'webex.com': 'communication', 'whereby.com': 'communication',
  'jit.si': 'communication', 'gotomeeting.com': 'communication', 'ringcentral.com': 'communication',

  // News
  'cnn.com': 'news', 'bbc.com': 'news', 'bbc.co.uk': 'news', 'nytimes.com': 'news',
  'theguardian.com': 'news', 'reuters.com': 'news', 'ynet.co.il': 'news', 'walla.co.il': 'news',
  'mako.co.il': 'news', 'haaretz.co.il': 'news', 'calcalist.co.il': 'news', 'n12.co.il': 'news',
  'cnbc.com': 'news', 'bloomberg.com': 'news', 'foxnews.com': 'news', 'nbcnews.com': 'news',
  'apnews.com': 'news', 'washingtonpost.com': 'news', 'wsj.com': 'news', 'ft.com': 'news',
  'economist.com': 'news', 'theatlantic.com': 'news', 'newyorker.com': 'news', 'politico.com': 'news',
  'npr.org': 'news', 'usatoday.com': 'news', 'independent.co.uk': 'news', 'telegraph.co.uk': 'news',
  'dailymail.co.uk': 'news', 'dw.com': 'news', 'france24.com': 'news', 'euronews.com': 'news',
  'axios.com': 'news', 'theverge.com': 'news', 'techcrunch.com': 'news', 'arstechnica.com': 'news',
  'wired.com': 'news', 'ycombinator.com': 'news',
  // he
  'ynetnews.com': 'news', 'timesofisrael.com': 'news', 'jpost.com': 'news', 'ice.co.il': 'news',
  'maariv.co.il': 'news', 'israelhayom.co.il': 'news', 'kan.org.il': 'news', 'sport5.co.il': 'news',
  'one.co.il': 'news', 'themarker.com': 'news', 'globes.co.il': 'news', 'bizportal.co.il': 'news',
  'inn.co.il': 'news', '13tv.co.il': 'news', 'now14.co.il': 'news',
  // es
  'elpais.com': 'news', 'elmundo.es': 'news', 'abc.es': 'news', 'lavanguardia.com': 'news',
  'elconfidencial.com': 'news', '20minutos.es': 'news', 'eldiario.es': 'news', 'marca.com': 'news',
  'as.com': 'news', 'mundodeportivo.com': 'news', 'rtve.es': 'news', 'clarin.com': 'news',
  'lanacion.com.ar': 'news', 'infobae.com': 'news', 'eluniversal.com.mx': 'news', 'milenio.com': 'news',
  'elmostrador.cl': 'news', 'eltiempo.com': 'news', 'semana.com': 'news',
  // fr
  'lemonde.fr': 'news', 'lefigaro.fr': 'news', 'liberation.fr': 'news', 'leparisien.fr': 'news',
  'francetvinfo.fr': 'news', 'franceinfo.fr': 'news', '20minutes.fr': 'news', 'lequipe.fr': 'news',
  'ouest-france.fr': 'news', 'lexpress.fr': 'news', 'lepoint.fr': 'news', 'nouvelobs.com': 'news',
  'mediapart.fr': 'news', 'bfmtv.com': 'news', 'rfi.fr': 'news', 'tf1info.fr': 'news',
  'lesechos.fr': 'news', 'rtbf.be': 'news', 'lesoir.be': 'news', 'lalibre.be': 'news',
  'letemps.ch': 'news', '24heures.ch': 'news', 'lapresse.ca': 'news', 'ledevoir.com': 'news',
  'radio-canada.ca': 'news',
  // ru
  'lenta.ru': 'news', 'rbc.ru': 'news', 'kommersant.ru': 'news', 'ria.ru': 'news',
  'tass.ru': 'news', 'interfax.ru': 'news', 'gazeta.ru': 'news', 'meduza.io': 'news',
  'vedomosti.ru': 'news', 'fontanka.ru': 'news', 'sports.ru': 'news', 'championat.com': 'news',
  // ar
  'aljazeera.com': 'news', 'aljazeera.net': 'news', 'alarabiya.net': 'news', 'skynewsarabia.com': 'news',
  'youm7.com': 'news', 'almasryalyoum.com': 'news', 'elwatannews.com': 'news', 'shorouknews.com': 'news',
  'masrawy.com': 'news', 'akhbarelyom.com': 'news', 'alkhaleej.ae': 'news', 'gulfnews.com': 'news',
  'khaleejtimes.com': 'news', 'thenationalnews.com': 'news', 'arabnews.com': 'news', 'aawsat.com': 'news',
  'hespress.com': 'news', 'independentarabia.com': 'news', 'enabbaladi.net': 'news', 'alhurra.com': 'news',
  'kooora.com': 'news', 'filgoal.com': 'news', 'yallakora.com': 'news',

  // Finance
  'paypal.com': 'finance', 'wise.com': 'finance', 'coinbase.com': 'finance',
  'binance.com': 'finance', 'tradingview.com': 'finance',
  'stripe.com': 'finance', 'revolut.com': 'finance', 'robinhood.com': 'finance', 'etoro.com': 'finance',
  'schwab.com': 'finance', 'fidelity.com': 'finance', 'vanguard.com': 'finance', 'investing.com': 'finance',
  'morningstar.com': 'finance', 'marketwatch.com': 'finance', 'seekingalpha.com': 'finance',
  'kraken.com': 'finance', 'bybit.com': 'finance', 'okx.com': 'finance', 'kucoin.com': 'finance',
  'metamask.io': 'finance', 'coinmarketcap.com': 'finance', 'coingecko.com': 'finance', 'xe.com': 'finance',
  'payoneer.com': 'finance', 'venmo.com': 'finance', 'cash.app': 'finance', 'mercadopago.com': 'finance',
  'chase.com': 'finance', 'bankofamerica.com': 'finance', 'wellsfargo.com': 'finance',
  'americanexpress.com': 'finance', 'capitalone.com': 'finance', 'hsbc.com': 'finance',
  'barclays.co.uk': 'finance', 'lloydsbank.com': 'finance', 'natwest.com': 'finance',
  // he
  'bankhapoalim.co.il': 'finance', 'leumi.co.il': 'finance', 'discountbank.co.il': 'finance',
  'mizrahi-tefahot.co.il': 'finance', 'isracard.co.il': 'finance', 'cal-online.co.il': 'finance',
  'max.co.il': 'finance',
  // es
  'bbva.es': 'finance', 'bbva.mx': 'finance', 'santander.com': 'finance', 'bancosantander.es': 'finance',
  'caixabank.es': 'finance', 'bancsabadell.com': 'finance', 'bancolombia.com': 'finance',
  'banorte.com': 'finance', 'banamex.com': 'finance', 'bancodechile.cl': 'finance',
  'itau.com.br': 'finance', 'bradesco.com.br': 'finance', 'nubank.com.br': 'finance',
  // fr
  'boursorama.com': 'finance', 'creditagricole.fr': 'finance', 'societegenerale.fr': 'finance',
  'labanquepostale.fr': 'finance', 'lcl.fr': 'finance', 'caisse-epargne.fr': 'finance',
  'credit-mutuel.fr': 'finance', 'banquepopulaire.fr': 'finance',
  // ru
  'sberbank.ru': 'finance', 'sber.ru': 'finance', 'tinkoff.ru': 'finance', 'tbank.ru': 'finance',
  'vtb.ru': 'finance', 'alfabank.ru': 'finance',
  // ar
  'alrajhibank.com.sa': 'finance', 'alahli.com': 'finance', 'qnb.com': 'finance', 'nbe.com.eg': 'finance',
  'cibeg.com': 'finance', 'emiratesnbd.com': 'finance', 'mashreqbank.com': 'finance', 'adcb.com': 'finance',

  // Shopping
  'amazon.com': 'shopping', 'ebay.com': 'shopping', 'aliexpress.com': 'shopping',
  'etsy.com': 'shopping', 'walmart.com': 'shopping', 'ksp.co.il': 'shopping', 'zap.co.il': 'shopping',
  'temu.com': 'shopping', 'shein.com': 'shopping', 'ikea.com': 'shopping', 'target.com': 'shopping',
  'bestbuy.com': 'shopping', 'homedepot.com': 'shopping', 'costco.com': 'shopping',
  'shopify.com': 'shopping', 'rakuten.com': 'shopping', 'vinted.com': 'shopping',
  'decathlon.com': 'shopping',
  'amazon.co.uk': 'shopping', 'amazon.de': 'shopping', 'amazon.fr': 'shopping', 'amazon.es': 'shopping',
  'amazon.it': 'shopping', 'amazon.ca': 'shopping', 'amazon.in': 'shopping', 'amazon.co.jp': 'shopping',
  'amazon.com.au': 'shopping', 'amazon.com.mx': 'shopping', 'amazon.com.br': 'shopping',
  'amazon.sa': 'shopping', 'amazon.ae': 'shopping', 'amazon.eg': 'shopping',
  'ebay.co.uk': 'shopping', 'ebay.de': 'shopping', 'ebay.fr': 'shopping', 'ebay.es': 'shopping',
  'ebay.it': 'shopping', 'ebay.com.au': 'shopping', 'aliexpress.ru': 'shopping',
  'zalando.co.uk': 'shopping', 'zalando.de': 'shopping', 'zalando.fr': 'shopping',
  'zalando.es': 'shopping', 'zalando.it': 'shopping',
  // he
  'ivory.co.il': 'shopping', 'bug.co.il': 'shopping', 'shufersal.co.il': 'shopping',
  'rami-levy.co.il': 'shopping', 'super-pharm.co.il': 'shopping', 'castro.com': 'shopping',
  'fox.co.il': 'shopping', 'yad2.co.il': 'shopping', 'wolt.com': 'shopping', '10bis.co.il': 'shopping',
  // es
  'mercadolibre.com': 'shopping', 'mercadolibre.com.ar': 'shopping', 'mercadolibre.com.mx': 'shopping',
  'mercadolibre.cl': 'shopping', 'mercadolibre.com.co': 'shopping', 'mercadolivre.com.br': 'shopping',
  'elcorteingles.es': 'shopping', 'pccomponentes.com': 'shopping', 'wallapop.com': 'shopping',
  'milanuncios.com': 'shopping', 'mediamarkt.es': 'shopping', 'carrefour.es': 'shopping',
  'mercadona.es': 'shopping', 'miravia.es': 'shopping', 'vinted.es': 'shopping',
  'decathlon.es': 'shopping', 'falabella.com': 'shopping', 'liverpool.com.mx': 'shopping',
  'coppel.com': 'shopping', 'walmart.com.mx': 'shopping',
  // fr
  'leboncoin.fr': 'shopping', 'cdiscount.com': 'shopping', 'fnac.com': 'shopping',
  'darty.com': 'shopping', 'boulanger.com': 'shopping', 'carrefour.fr': 'shopping',
  'auchan.fr': 'shopping', 'vinted.fr': 'shopping', 'decathlon.fr': 'shopping',
  'manomano.fr': 'shopping', 'mediamarkt.de': 'shopping',
  // ru
  'avito.ru': 'shopping', 'ozon.ru': 'shopping', 'wildberries.ru': 'shopping', 'dns-shop.ru': 'shopping',
  'citilink.ru': 'shopping', 'mvideo.ru': 'shopping', 'lamoda.ru': 'shopping',
  // ar
  'noon.com': 'shopping', 'jarir.com': 'shopping', 'extra.com': 'shopping', 'namshi.com': 'shopping',
  'ounass.ae': 'shopping', 'btech.com': 'shopping', 'jumia.com.eg': 'shopping', 'dubizzle.com': 'shopping',
  'haraj.com.sa': 'shopping', 'opensooq.com': 'shopping',

  // Social
  'facebook.com': 'social', 'instagram.com': 'social', 'twitter.com': 'social', 'x.com': 'social',
  'tiktok.com': 'social', 'reddit.com': 'social', 'linkedin.com': 'social', 'pinterest.com': 'social',
  'snapchat.com': 'social', 'tumblr.com': 'social', 'threads.net': 'social',
  'threads.com': 'social', 'bsky.app': 'social', 'mastodon.social': 'social', 'flickr.com': 'social',
  'vsco.co': 'social', 'meetup.com': 'social', 'nextdoor.com': 'social', 'tinder.com': 'social',
  'bumble.com': 'social', 'badoo.com': 'social',
  'vk.com': 'social', 'ok.ru': 'social', 'pikabu.ru': 'social', 'livejournal.com': 'social',

  // Entertainment
  'youtube.com': 'entertainment', 'netflix.com': 'entertainment', 'twitch.tv': 'entertainment',
  'spotify.com': 'entertainment', 'open.spotify.com': 'entertainment', 'disneyplus.com': 'entertainment',
  'hulu.com': 'entertainment', 'primevideo.com': 'entertainment', 'soundcloud.com': 'entertainment',
  'imdb.com': 'entertainment', '9gag.com': 'entertainment', 'steampowered.com': 'entertainment',
  'dailymotion.com': 'entertainment', 'vimeo.com': 'entertainment', 'kick.com': 'entertainment',
  'max.com': 'entertainment', 'hbomax.com': 'entertainment', 'crunchyroll.com': 'entertainment',
  'paramountplus.com': 'entertainment', 'peacocktv.com': 'entertainment', 'deezer.com': 'entertainment',
  'tidal.com': 'entertainment', 'bandcamp.com': 'entertainment', 'last.fm': 'entertainment',
  'pandora.com': 'entertainment', 'steamcommunity.com': 'entertainment', 'epicgames.com': 'entertainment',
  'roblox.com': 'entertainment', 'minecraft.net': 'entertainment', 'gog.com': 'entertainment',
  'ea.com': 'entertainment', 'ubisoft.com': 'entertainment', 'battle.net': 'entertainment',
  'blizzard.com': 'entertainment', 'riotgames.com': 'entertainment', 'leagueoflegends.com': 'entertainment',
  'chess.com': 'entertainment', 'lichess.org': 'entertainment', 'itch.io': 'entertainment',
  'imgur.com': 'entertainment', 'giphy.com': 'entertainment', 'knowyourmeme.com': 'entertainment',
  'rottentomatoes.com': 'entertainment', 'letterboxd.com': 'entertainment', 'myanimelist.net': 'entertainment',
  'anilist.co': 'entertainment', 'webtoons.com': 'entertainment', 'wattpad.com': 'entertainment',
  'goodreads.com': 'entertainment', 'ign.com': 'entertainment', 'gamespot.com': 'entertainment',
  'kotaku.com': 'entertainment', 'polygon.com': 'entertainment', 'pcgamer.com': 'entertainment',
  // es / fr
  'atresplayer.com': 'entertainment', 'mitele.es': 'entertainment', 'vix.com': 'entertainment',
  'canalplus.com': 'entertainment', 'mycanal.fr': 'entertainment', 'france.tv': 'entertainment',
  'tf1.fr': 'entertainment', 'tf1plus.fr': 'entertainment', 'arte.tv': 'entertainment',
  'allocine.fr': 'entertainment',
  // ru
  'kinopoisk.ru': 'entertainment', 'ivi.ru': 'entertainment', 'okko.tv': 'entertainment',
  'rutube.ru': 'entertainment', 'premier.one': 'entertainment', 'wink.ru': 'entertainment',
  'more.tv': 'entertainment', 'vkvideo.ru': 'entertainment', 'zvuk.com': 'entertainment',
  // ar
  'mbc.net': 'entertainment', 'anghami.com': 'entertainment', 'rotana.net': 'entertainment',
  'watch.it': 'entertainment',
};

/**
 * Resolve a domain to a category. Order: user override → exact default →
 * registrable-domain default → "other".
 */
export function categorize(domain, userMap = {}) {
  if (!domain) return 'other';
  if (userMap[domain]) return userMap[domain];
  if (DEFAULT_DOMAIN_CATEGORY[domain]) return DEFAULT_DOMAIN_CATEGORY[domain];
  const reg = registrableDomain(domain);
  if (userMap[reg]) return userMap[reg];
  if (DEFAULT_DOMAIN_CATEGORY[reg]) return DEFAULT_DOMAIN_CATEGORY[reg];
  return 'other';
}

export function categoryDef(key) {
  return CATEGORY_DEFS[key] || CATEGORY_DEFS.other;
}
