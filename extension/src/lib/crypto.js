// Optional client-side encryption for backups (file, sync, endpoint).
// AES-256-GCM with a key derived from the user's passphrase via PBKDF2.
// Works in both the service worker and extension pages (globalThis.crypto).
// The passphrase never leaves the device; the server/sync only sees ciphertext.

import { toB64, fromB64, gzip, gunzip } from './compress.js';

const enc = new TextEncoder();
const dec = new TextDecoder();
// OWASP's current PBKDF2-HMAC-SHA256 minimum. Old backups carry their own lower
// `iterations` value in the envelope (see decryptJSON) so they keep decrypting.
const PBKDF2_ITERATIONS = 600000;
const LEGACY_ITERATIONS = 150000; // fallback for envelopes written before the bump
const MAX_ITERATIONS = 2000000;   // the most an envelope may ask for when decrypting

async function deriveKey(passphrase, salt, iterations = PBKDF2_ITERATIONS) {
  const base = await crypto.subtle.importKey(
    'raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']);
}

/**
 * Encrypt any JSON-serializable object into a self-describing envelope. With `gzip`, the JSON is
 * compressed first (the envelope records it as `zip: 'gzip'`; decryptJSON undoes it) — compression
 * after encryption would be useless.
 * @param {unknown} obj
 * @param {string} passphrase
 * @param {{ gzip?: boolean }} [opts]
 */
export async function encryptJSON(obj, passphrase, { gzip: compress = false } = {}) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const plain = enc.encode(JSON.stringify(obj));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, compress ? await gzip(plain) : plain);
  return {
    app: 'TimeTrack',
    enc: 'aes-256-gcm',
    kdf: 'pbkdf2-sha256',
    iterations: PBKDF2_ITERATIONS,
    ...(compress ? { zip: 'gzip' } : {}),
    salt: toB64(salt),
    iv: toB64(iv),
    ct: toB64(new Uint8Array(ct)),
  };
}

export function isEncrypted(obj) {
  return !!(obj && typeof obj === 'object' && obj.enc === 'aes-256-gcm'
    && typeof obj.ct === 'string' && obj.ct
    && typeof obj.salt === 'string' && obj.salt
    && typeof obj.iv === 'string' && obj.iv);
}

/**
 * Decrypt an envelope back into the original object. Throws a single friendly
 * error on wrong passphrase OR a malformed/corrupted envelope (missing/bad
 * salt/iv/ct all land here too, since fromB64/deriveKey are inside the try).
 */
export async function decryptJSON(envelope, passphrase) {
  if (!isEncrypted(envelope)) throw new Error('הקובץ אינו מוצפן');
  // The envelope names its own iteration count (older backups used fewer). Clamp it: a hostile file
  // could otherwise ask for billions of rounds and hang the page.
  const iterations = Math.min(Math.max(Number(envelope.iterations) || LEGACY_ITERATIONS, 1000), MAX_ITERATIONS);
  try {
    const key = await deriveKey(passphrase, fromB64(envelope.salt), iterations);
    const pt = new Uint8Array(await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64(envelope.iv) }, key, fromB64(envelope.ct)));
    return JSON.parse(dec.decode(envelope.zip === 'gzip' ? await gunzip(pt) : pt));
  } catch {
    throw Object.assign(new Error('סיסמת הפענוח שגויה או שהקובץ פגום'), { code: 'BAD_PASSPHRASE' });
  }
}
