// registrableDomain() follows the Public Suffix List algorithm (extension/src/lib/psl.js
// is generated from the official list). Cases below are the standard PSL behaviours
// plus the ones that matter for this extension's data.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registrableDomain, hostnameFromUrl, domainFromUrl } from '../../extension/src/lib/utils.js';
import { PSL_RULES, PSL_VERSION } from '../../extension/src/lib/psl.js';

const cases = [
  // ordinary
  ['example.com', 'example.com'],
  ['www.example.com', 'example.com'],
  ['a.b.c.example.com', 'example.com'],
  ['mail.google.com', 'google.com'],
  // multi-label ICANN suffixes
  ['bbc.co.uk', 'bbc.co.uk'],
  ['news.bbc.co.uk', 'bbc.co.uk'],
  ['mail.ynet.co.il', 'ynet.co.il'],
  ['www.gov.il', 'www.gov.il'],            // gov.il is itself a suffix
  ['foo.example.com.au', 'example.com.au'],
  ['x.example.co.jp', 'example.co.jp'],
  // a host that IS a public suffix has no registrable domain: keep it whole
  ['co.uk', 'co.uk'],
  ['com', 'com'],
  ['localhost', 'localhost'],
  // wildcard rule (*.ck) and its exception (!www.ck)
  ['foo.ck', 'foo.ck'],
  ['bar.foo.ck', 'bar.foo.ck'],
  ['www.ck', 'www.ck'],
  ['a.www.ck', 'www.ck'],
  // private-section suffixes: each tenant is its own site
  ['alice.github.io', 'alice.github.io'],
  ['docs.alice.github.io', 'alice.github.io'],
  ['github.io', 'github.io'],
  ['my-app.vercel.app', 'my-app.vercel.app'],
  ['shop.myshopify.com', 'shop.myshopify.com'],
  // IP addresses and dev hosts are never "grouped"
  ['192.168.1.5', '192.168.1.5'],
  ['127.0.0.1', '127.0.0.1'],
  ['10.0.0.1', '10.0.0.1'],
  ['[::1]', '[::1]'],
  ['[2001:db8::1]', '[2001:db8::1]'],
  ['app.localhost', 'app.localhost'],
  // IDN in punycode form (what URL.hostname yields)
  ['www.xn--e1afmkfd.xn--p1ai', 'xn--e1afmkfd.xn--p1ai'],
];

for (const [host, expected] of cases) {
  test(`registrableDomain(${host}) → ${expected}`, () => {
    assert.equal(registrableDomain(host), expected);
  });
}

test('falsy input is returned unchanged', () => {
  assert.equal(registrableDomain(''), '');
  assert.equal(registrableDomain(null), null);
});

test('every suffix the old hand-written MULTI_TLDS list knew is still treated as a public suffix', () => {
  const old = ['co.uk', 'org.uk', 'gov.uk', 'ac.uk', 'me.uk', 'net.uk', 'co.il', 'org.il', 'ac.il', 'gov.il', 'net.il', 'muni.il',
    'co.jp', 'or.jp', 'ne.jp', 'go.jp', 'com.au', 'net.au', 'org.au', 'gov.au', 'edu.au', 'co.nz', 'org.nz', 'govt.nz',
    'com.br', 'com.cn', 'com.mx', 'com.tr', 'com.sg', 'com.hk', 'com.tw', 'co.in', 'co.za', 'co.kr', 'co.id', 'co.th',
    'com.ar', 'com.co', 'com.pe', 'com.ve', 'com.uy', 'com.ec', 'com.py', 'com.bo', 'com.ua', 'com.pl', 'com.ph', 'com.my',
    'com.pk', 'com.bd', 'com.np', 'com.lk', 'com.eg', 'com.sa', 'com.ng', 'com.gh', 'com.kw', 'com.qa', 'com.bh', 'com.lb',
    'co.ke', 'co.tz', 'co.ug', 'co.ma', 'co.zw', 'co.ao', 'or.id', 'web.id', 'sch.id', 'ac.id', 'go.id', 'gob.mx', 'edu.mx',
    'org.mx', 'net.mx', 'org.br', 'net.br', 'gov.br', 'edu.br', 'ac.jp', 'asn.au', 'id.au'];
  const lost = old.filter((s) => registrableDomain(`site.${s}`) !== `site.${s}`);
  assert.deepEqual(lost, [], 'these suffixes would now be grouped one level too high');
});

test('the generated rules look sane', () => {
  assert.match(PSL_VERSION, /^\d{4}-\d{2}-\d{2}/);
  const rules = PSL_RULES.split('\n').filter(Boolean);
  assert.ok(rules.length > 5000, `only ${rules.length} rules`);
  assert.ok(rules.every((r) => /^[!*]?[a-z0-9.-]+$/.test(r)), 'rules are ASCII / punycode only');
  assert.ok(rules.includes('co.uk') && rules.includes('*.ck') && rules.includes('!www.ck'));
});

test('hostnameFromUrl / domainFromUrl integrate the PSL and IP handling', () => {
  assert.equal(hostnameFromUrl('https://www.example.com/x?y=1'), 'example.com');
  assert.equal(domainFromUrl('https://docs.alice.github.io/page'), 'alice.github.io');
  assert.equal(domainFromUrl('https://docs.alice.github.io/page', false), 'docs.alice.github.io');
  assert.equal(domainFromUrl('http://192.168.1.5:8080/admin'), '192.168.1.5');
  assert.equal(domainFromUrl('http://[::1]:3000/'), '[::1]');
  assert.equal(domainFromUrl('chrome://settings'), null);
  assert.equal(domainFromUrl('about:blank'), null);
});
