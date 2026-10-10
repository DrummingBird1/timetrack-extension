import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gzip, gunzip, toB64, fromB64, packJSON, unpackJSON, isPacked } from '../../extension/src/lib/compress.js';
import { encryptJSON, decryptJSON, isEncrypted } from '../../extension/src/lib/crypto.js';

const utf8 = new TextEncoder();

test('base64 round-trips every byte value, including buffers larger than one fromCharCode batch', () => {
  const bytes = new Uint8Array(100_000);
  for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
  assert.deepEqual(fromB64(toB64(bytes)), bytes);
});

test('gzip → gunzip is lossless and actually shrinks repetitive data', async () => {
  const input = utf8.encode(JSON.stringify({ days: Array.from({ length: 500 }, (_, i) => ({ domain: 'example.com', t: i })) }));
  const packed = await gzip(input);
  assert.ok(packed.length < input.length / 3, `${packed.length} vs ${input.length}`);
  assert.deepEqual(await gunzip(packed), input);
});

test('packJSON / unpackJSON round-trip non-ASCII text and recognise their own wrapper', async () => {
  const obj = { sites: ['אתר-בדיקה.co.il', 'пример.рф', '例え.jp', 'emoji-😀.example'], n: [1, 2, 3] };
  const packed = await packJSON(obj);
  assert.equal(isPacked(packed), true);
  assert.deepEqual(await unpackJSON(packed), obj);
});

test('isPacked only accepts the compressed wrapper — not snapshots, encrypted envelopes or junk', async () => {
  assert.equal(isPacked({ app: 'TimeTrack', version: 2, days: {} }), false);
  assert.equal(isPacked(await encryptJSON({ a: 1 }, 'pass', { gzip: true })), false);
  assert.equal(isPacked(null), false);
  assert.equal(isPacked('zip'), false);
  assert.equal(isPacked({ zip: 'gzip' }), false);
});

test('gunzip refuses to inflate past its limit (a hostile backup cannot exhaust memory)', async () => {
  const bomb = await gzip(new Uint8Array(5_000_000));     // 5 MB of zeros → a few KB compressed
  assert.ok(bomb.length < 50_000);
  await assert.rejects(() => gunzip(bomb, 1_000_000), /too large/);
  assert.equal((await gunzip(bomb, 10_000_000)).length, 5_000_000);
});

test('garbage is rejected, not silently decoded', async () => {
  await assert.rejects(() => gunzip(utf8.encode('definitely not gzip')));
  await assert.rejects(() => unpackJSON({ zip: 'gzip', data: toB64(utf8.encode('nope')) }));
});

test('an encrypted envelope can carry compressed data, and says so', async () => {
  const obj = { rows: Array.from({ length: 400 }, (_, i) => ({ site: 'example.com', i })) };
  const plain = await encryptJSON(obj, 'p@ss');
  const zipped = await encryptJSON(obj, 'p@ss', { gzip: true });
  assert.equal(plain.zip, undefined, 'the default stays uncompressed, so existing callers and files are unchanged');
  assert.equal(zipped.zip, 'gzip');
  assert.equal(isEncrypted(zipped), true);
  assert.ok(zipped.ct.length < plain.ct.length / 2, 'compressing before encrypting is what makes the ciphertext small');
  assert.deepEqual(await decryptJSON(zipped, 'p@ss'), obj);
  assert.deepEqual(await decryptJSON(plain, 'p@ss'), obj);
  await assert.rejects(() => decryptJSON(zipped, 'wrong'), /סיסמת הפענוח/);
});
