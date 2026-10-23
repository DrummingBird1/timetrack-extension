// The built-in domain → category table (extension/src/lib/categories.js) and categorize().
// The table is data, so these tests guard its shape: valid categories, no silent duplicate
// keys, and no keys the tracker can never produce.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CATEGORY_DEFS, DEFAULT_DOMAIN_CATEGORY, categorize } from '../../extension/src/lib/categories.js';
import { registrableDomain } from '../../extension/src/lib/utils.js';

const source = fs.readFileSync(fileURLToPath(new URL('../../extension/src/lib/categories.js', import.meta.url)), 'utf8');

// What the tracker stores for a hostname when "group subdomains" is on (the default).
const grouped = (host) => categorize(registrableDomain(host));

// Keys that predate the registrable-domain rule. They still work with grouping off, but with
// it on the tracker only ever stores the registrable domain, so they can never match. Do not
// add to this list: add the registrable form (`openai.com`) instead.
const LEGACY_SUBDOMAIN_KEYS = [
  'chat.openai.com', 'developer.mozilla.org', 'docs.google.com', 'drive.google.com',
  'mail.google.com', 'meet.google.com', 'open.spotify.com', 'outlook.office.com',
  'scholar.google.com', 'sheets.google.com', 'teams.microsoft.com', 'web.telegram.org',
  'web.whatsapp.com',
];

test('every default maps to a defined, non-"other" category', () => {
  for (const [domain, category] of Object.entries(DEFAULT_DOMAIN_CATEGORY)) {
    assert.ok(CATEGORY_DEFS[category], `${domain}: unknown category "${category}"`);
    assert.notEqual(category, 'other', `${domain}: "other" is the fallback, don't list it`);
  }
});

test('default keys are bare lowercase hostnames', () => {
  for (const domain of Object.keys(DEFAULT_DOMAIN_CATEGORY)) {
    assert.match(domain, /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/, `${domain}: not a bare lowercase hostname`);
    assert.ok(!domain.startsWith('www.'), `${domain}: drop the www.`);
  }
});

test('no domain is listed twice (a later duplicate would silently win)', () => {
  const start = source.indexOf('DEFAULT_DOMAIN_CATEGORY = {');
  const body = source.slice(start, source.indexOf('\n};', start));
  const keys = [...body.matchAll(/'([^']+)':\s*'/g)].map((m) => m[1]);
  assert.ok(keys.length > 300, 'the parse should see the whole table');
  const seen = new Set();
  const dupes = keys.filter((k) => seen.size === seen.add(k).size);
  assert.deepEqual(dupes, []);
  assert.equal(keys.length, Object.keys(DEFAULT_DOMAIN_CATEGORY).length);
});

test('only the pinned legacy keys are subdomains the tracker cannot produce', () => {
  const dead = Object.keys(DEFAULT_DOMAIN_CATEGORY).filter((k) => registrableDomain(k) !== k).sort();
  assert.deepEqual(dead, LEGACY_SUBDOMAIN_KEYS);
});

test('sites from all six UI languages\' markets resolve once subdomains are grouped', () => {
  const cases = [
    // global
    ['mail.proton.me', 'communication'], ['www.nature.com', 'reference'], ['www.bloomberg.com', 'news'],
    ['store.steampowered.com', 'entertainment'], ['www.temu.com', 'shopping'],
    // previously dead subdomain defaults, now reachable through the registrable domain
    ['chat.openai.com', 'productivity'], ['developer.mozilla.org', 'reference'],
    // he
    ['www.timesofisrael.com', 'news'], ['www.yad2.co.il', 'shopping'], ['www.leumi.co.il', 'finance'],
    // es
    ['www.elpais.com', 'news'], ['listado.mercadolibre.com.ar', 'shopping'], ['www.bbva.es', 'finance'],
    // fr
    ['www.lemonde.fr', 'news'], ['www.leboncoin.fr', 'shopping'], ['www.boursorama.com', 'finance'],
    // ru
    ['m.vk.com', 'social'], ['www.ozon.ru', 'shopping'], ['www.kinopoisk.ru', 'entertainment'],
    ['habr.com', 'reference'], ['www.sberbank.ru', 'finance'],
    // ar
    ['www.aljazeera.net', 'news'], ['shahid.mbc.net', 'entertainment'], ['www.noon.com', 'shopping'],
    ['www.amazon.sa', 'shopping'], ['www.alrajhibank.com.sa', 'finance'],
  ];
  for (const [host, expected] of cases) assert.equal(grouped(host), expected, host);
});

test('ambiguous multi-product hosts stay uncategorized instead of guessing', () => {
  for (const host of ['mail.google.com', 'docs.google.com', 'teams.microsoft.com', 'outlook.office.com']) {
    assert.equal(grouped(host), 'other', host);
  }
});

test('categorize: user override beats the default, unknown domains fall back to "other"', () => {
  assert.equal(categorize('lemonde.fr'), 'news');
  assert.equal(categorize('lemonde.fr', { 'lemonde.fr': 'productivity' }), 'productivity');
  assert.equal(categorize('shop.lemonde.fr'), 'news');
  assert.equal(categorize('no-such-site.example'), 'other');
  assert.equal(categorize(''), 'other');
});
