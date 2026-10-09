// gzip + base64 helpers. The cloud backup compresses the snapshot BEFORE encrypting it (ciphertext
// is incompressible, so the order matters) — chrome.storage.sync only has ~100 KB, and repetitive
// JSON compresses roughly 5-10x, which is the difference between a few months and years of history.
// Uses the platform's CompressionStream / DecompressionStream: no dependencies, available in the
// service worker, extension pages and Node.

const utf8 = new TextEncoder();
const utf8d = new TextDecoder();

// A backup read back from sync is untrusted input (another device wrote it): never inflate unbounded.
const MAX_INFLATED_BYTES = 256 * 1024 * 1024;

export function toB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromB64(str) {
  const bin = atob(str);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

/** @param {Uint8Array<ArrayBuffer>} bytes @returns {Promise<Uint8Array<ArrayBuffer>>} */
export async function gzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * @param {Uint8Array<ArrayBuffer>} bytes
 * @param {number} [maxBytes]
 * @returns {Promise<Uint8Array<ArrayBuffer>>}
 */
export async function gunzip(bytes, maxBytes = MAX_INFLATED_BYTES) {
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  const parts = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) { await reader.cancel(); throw new Error('decompressed data is too large'); }
    parts.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

/**
 * A plaintext compressed payload: JSON → gzip → base64 inside a small self-describing wrapper.
 * (The encrypted form is an envelope with `zip: 'gzip'`, see crypto.js — no double base64.)
 */
export async function packJSON(obj) {
  return { app: 'TimeTrack', zip: 'gzip', data: toB64(await gzip(utf8.encode(JSON.stringify(obj)))) };
}

export function isPacked(obj) {
  return !!(obj && typeof obj === 'object' && obj.zip === 'gzip' && typeof obj.data === 'string' && !('ct' in obj));
}

export async function unpackJSON(packed) {
  return JSON.parse(utf8d.decode(await gunzip(fromB64(packed.data))));
}
