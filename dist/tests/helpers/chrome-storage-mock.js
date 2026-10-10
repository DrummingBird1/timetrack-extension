// Minimal in-memory chrome.storage.{local,sync,session} for Node tests. Values are
// structuredClone'd on write so tests can't accidentally share references with the
// code under test.

export function makeArea() {
  const store = new Map();
  return {
    _store: store,
    async get(keys) {
      if (keys == null) { const o = {}; for (const [k, v] of store) o[k] = structuredClone(v); return o; }
      const list = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
      const o = {};
      for (const k of list) if (store.has(k)) o[k] = structuredClone(store.get(k));
      return o;
    },
    async set(obj) { for (const [k, v] of Object.entries(obj)) store.set(k, structuredClone(v)); },
    async remove(keys) { for (const k of (Array.isArray(keys) ? keys : [keys])) store.delete(k); },
    async getBytesInUse() { let n = 0; for (const [k, v] of store) n += k.length + JSON.stringify(v).length; return n; },
    async clear() { store.clear(); },
  };
}

export function installChrome() {
  globalThis.chrome = {
    storage: { local: makeArea(), sync: makeArea(), session: makeArea() },
    runtime: { getURL: (p) => `chrome-extension://test/${p}` },
  };
  return globalThis.chrome;
}
