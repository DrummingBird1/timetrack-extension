// Pre-submission checks for the shippable extension/ folder. These encode what a store
// reviewer (or an unhappy user) would object to, so a regression fails CI instead of
// a review: surprise permissions, remote or eval'd code, inline scripts that the MV3 CSP
// forbids, broken imports, missing icons.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../extension');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}
const files = walk(ROOT);
const rel = (f) => path.relative(ROOT, f).replace(/\\/g, '/');
const ofType = (ext) => files.filter((f) => f.endsWith(ext));

test('manifest basics: MV3, valid version, store-length name and description', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.ok(manifest.name.length <= 75, `name is ${manifest.name.length} chars (store limit 75)`);
  assert.ok(manifest.description.length <= 132, `description is ${manifest.description.length} chars (store limit 132)`);
  assert.equal(manifest.background.service_worker, 'background.js');
  assert.equal(manifest.background.type, 'module');
  assert.ok(manifest.minimum_chrome_version);
});

test('permissions are exactly the documented set — adding one must be a deliberate, reviewed change', () => {
  assert.deepEqual([...manifest.permissions].sort(), ['alarms', 'idle', 'notifications', 'storage', 'tabs', 'unlimitedStorage']);
  assert.deepEqual(manifest.optional_permissions, ['favicon']);
  assert.equal(manifest.host_permissions, undefined, 'no host permissions: the extension never reads page content');
  assert.equal(manifest.optional_host_permissions, undefined);
  assert.equal(manifest.content_scripts, undefined, 'no content scripts');
  assert.equal(manifest.externally_connectable, undefined, 'no external messaging surface');
  assert.equal(manifest.content_security_policy, undefined, 'the default MV3 CSP is kept (no unsafe-eval / remote script)');
});

test('commands all have a description and a default key', () => {
  for (const [name, cmd] of Object.entries(manifest.commands || {})) {
    assert.ok(cmd.description, `${name} has no description`);
    assert.ok(cmd.suggested_key?.default, `${name} has no default shortcut`);
  }
});

test('the only web-accessible resource is the focus block page', () => {
  assert.deepEqual(manifest.web_accessible_resources.map((r) => r.resources).flat(), ['src/blocked/blocked.html']);
});

test('every icon exists and has the declared dimensions', () => {
  const declared = { ...manifest.icons, ...manifest.action.default_icon };
  assert.deepEqual(Object.keys(declared).sort(), ['128', '16', '32', '48']);
  for (const [size, file] of Object.entries(declared)) {
    const buf = fs.readFileSync(path.join(ROOT, file));
    assert.equal(buf.subarray(1, 4).toString(), 'PNG', `${file} is not a PNG`);
    assert.equal(buf.readUInt32BE(16), Number(size), `${file} width`);
    assert.equal(buf.readUInt32BE(20), Number(size), `${file} height`);
  }
});

test('every entry point named in the manifest exists', () => {
  for (const file of [manifest.background.service_worker, manifest.action.default_popup, manifest.options_ui.page]) {
    assert.ok(fs.existsSync(path.join(ROOT, file)), `${file} is missing`);
  }
});

test('HTML pages: no inline scripts or inline event handlers (forbidden by the MV3 CSP), every local asset exists', () => {
  for (const file of ofType('.html')) {
    const html = fs.readFileSync(file, 'utf8');
    const inline = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>/gi)];
    assert.deepEqual(inline.map((m) => m[0]), [], `${rel(file)} has an inline <script>`);
    assert.doesNotMatch(html, /\son[a-z]+\s*=\s*["']/i, `${rel(file)} has an inline event handler`);
    for (const m of html.matchAll(/(?:src|href)="([^"#?]+)"/g)) {
      if (/^(https?:|data:|chrome-extension:|mailto:)/.test(m[1])) {
        assert.doesNotMatch(m[1], /^https?:/, `${rel(file)} loads a remote resource: ${m[1]}`);
        continue;
      }
      assert.ok(fs.existsSync(path.resolve(path.dirname(file), m[1])), `${rel(file)} references missing ${m[1]}`);
    }
  }
});

test('no eval / Function constructor / remote code anywhere in the extension', () => {
  for (const file of ofType('.js')) {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /\beval\s*\(/, `${rel(file)} uses eval`);
    assert.doesNotMatch(source, /\bnew\s+Function\s*\(/, `${rel(file)} uses the Function constructor`);
    assert.doesNotMatch(source, /import\s*\(\s*['"`]https?:/, `${rel(file)} imports remote code`);
    assert.doesNotMatch(source, /importScripts\s*\(/, `${rel(file)} uses importScripts`);
  }
});

test('every relative import resolves to a file (and no import goes outside extension/)', () => {
  for (const file of ofType('.js')) {
    const source = fs.readFileSync(file, 'utf8');
    for (const m of source.matchAll(/(?:^|\n)\s*(?:import|export)\s[^'"\n]*?from\s+['"](\.[^'"]+)['"]/g)) {
      const target = path.resolve(path.dirname(file), m[1]);
      assert.ok(fs.existsSync(target), `${rel(file)} imports missing ${m[1]}`);
      assert.ok(target.startsWith(ROOT), `${rel(file)} imports outside the extension: ${m[1]}`);
    }
  }
});

test('the package carries only runtime files and stays small', () => {
  const banned = files.filter((f) => /\.(test|spec)\.|node_modules|\.map$|\.ts$|\.md$|\.zip$|\.env/.test(rel(f)));
  assert.deepEqual(banned.map(rel), [], 'dev-only files must not ship');
  const bytes = files.reduce((n, f) => n + fs.statSync(f).size, 0);
  assert.ok(bytes < 1.5 * 1024 * 1024, `extension/ is ${(bytes / 1024).toFixed(0)} KB — unexpectedly large`);
});

test('the service worker does not touch the DOM (it has none)', () => {
  const source = fs.readFileSync(path.join(ROOT, 'background.js'), 'utf8');
  assert.doesNotMatch(source, /\b(document|window)\./, 'background.js references document/window');
});
