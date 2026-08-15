// Optional client-side encryption for backups (file, sync, endpoint).
// AES-256-GCM with a key derived from the user's passphrase via PBKDF2.
// Works in both the service worker and extension pages (globalThis.crypto).
// The passphrase never leaves the device; the server/sync only sees ciphertext.

const enc = new TextEncoder();
const dec = new TextDecoder();
// OWASP's current PBKDF2-HMAC-SHA256 minimum. Old backups carry their own lower
// `iterations` value in the envelope (see decryptJSON) so they keep decrypting.
const PBKDF2_ITERATIONS = 600000;
const LEGACY_ITERATIONS = 150000; // fallback for envelopes written before the bump

function toB64(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(str) {
  const bin = atob(str);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

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

/** Encrypt any JSON-serializable object into a self-describing envelope. */
export async function encryptJSON(obj, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
  return {
    app: 'TimeTrack',
    enc: 'aes-256-gcm',
    kdf: 'pbkdf2-sha256',
    iterations: PBKDF2_ITERATIONS,
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
  try {
    const key = await deriveKey(passphrase, fromB64(envelope.salt), envelope.iterations || LEGACY_ITERATIONS);
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64(envelope.iv) }, key, fromB64(envelope.ct));
    return JSON.parse(dec.decode(pt));
  } catch {
    throw new Error('סיסמת הפענוח שגויה או שהקובץ פגום');
  }
}
