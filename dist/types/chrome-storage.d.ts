// @types/chrome types every storage value as `unknown`. This extension reads and writes
// only its own keys (ttt_*), whose shapes are documented in extension/src/lib/types.js,
// so reads are typed as a bag of `any` here and narrowed with JSDoc where it matters.
declare namespace chrome.storage {
  type Bag = { [key: string]: any };
  interface LocalStorageArea { get(keys?: string | string[] | Bag | null): Promise<Bag>; }
  interface SyncStorageArea { get(keys?: string | string[] | Bag | null): Promise<Bag>; }
  interface SessionStorageArea { get(keys?: string | string[] | Bag | null): Promise<Bag>; }
}
