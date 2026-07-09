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

export const DEFAULT_DOMAIN_CATEGORY = {
  // Productivity / dev / tools
  'github.com': 'productivity', 'gitlab.com': 'productivity', 'bitbucket.org': 'productivity',
  'notion.so': 'productivity', 'figma.com': 'productivity', 'trello.com': 'productivity',
  'atlassian.net': 'productivity', 'jira.com': 'productivity', 'asana.com': 'productivity',
  'docs.google.com': 'productivity', 'drive.google.com': 'productivity', 'sheets.google.com': 'productivity',
  'claude.ai': 'productivity', 'chatgpt.com': 'productivity', 'chat.openai.com': 'productivity',
  'overleaf.com': 'productivity', 'codepen.io': 'productivity', 'replit.com': 'productivity',
  'vercel.com': 'productivity', 'netlify.com': 'productivity', 'localhost': 'productivity',

  // Reference / learning
  'stackoverflow.com': 'reference', 'stackexchange.com': 'reference', 'developer.mozilla.org': 'reference',
  'wikipedia.org': 'reference', 'medium.com': 'reference', 'coursera.org': 'reference',
  'udemy.com': 'reference', 'khanacademy.org': 'reference', 'w3schools.com': 'reference',
  'geeksforgeeks.org': 'reference', 'arxiv.org': 'reference', 'scholar.google.com': 'reference',

  // Communication
  'mail.google.com': 'communication', 'gmail.com': 'communication', 'outlook.com': 'communication',
  'outlook.office.com': 'communication', 'slack.com': 'communication', 'discord.com': 'communication',
  'web.whatsapp.com': 'communication', 'whatsapp.com': 'communication', 'telegram.org': 'communication',
  'web.telegram.org': 'communication', 'teams.microsoft.com': 'communication', 'zoom.us': 'communication',
  'meet.google.com': 'communication',

  // News
  'cnn.com': 'news', 'bbc.com': 'news', 'bbc.co.uk': 'news', 'nytimes.com': 'news',
  'theguardian.com': 'news', 'reuters.com': 'news', 'ynet.co.il': 'news', 'walla.co.il': 'news',
  'mako.co.il': 'news', 'haaretz.co.il': 'news', 'calcalist.co.il': 'news', 'n12.co.il': 'news',

  // Finance
  'paypal.com': 'finance', 'wise.com': 'finance', 'coinbase.com': 'finance',
  'binance.com': 'finance', 'tradingview.com': 'finance',

  // Shopping
  'amazon.com': 'shopping', 'ebay.com': 'shopping', 'aliexpress.com': 'shopping',
  'etsy.com': 'shopping', 'walmart.com': 'shopping', 'ksp.co.il': 'shopping', 'zap.co.il': 'shopping',

  // Social
  'facebook.com': 'social', 'instagram.com': 'social', 'twitter.com': 'social', 'x.com': 'social',
  'tiktok.com': 'social', 'reddit.com': 'social', 'linkedin.com': 'social', 'pinterest.com': 'social',
  'snapchat.com': 'social', 'tumblr.com': 'social', 'threads.net': 'social',

  // Entertainment
  'youtube.com': 'entertainment', 'netflix.com': 'entertainment', 'twitch.tv': 'entertainment',
  'spotify.com': 'entertainment', 'open.spotify.com': 'entertainment', 'disneyplus.com': 'entertainment',
  'hulu.com': 'entertainment', 'primevideo.com': 'entertainment', 'soundcloud.com': 'entertainment',
  'imdb.com': 'entertainment', '9gag.com': 'entertainment', 'steampowered.com': 'entertainment',
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
