/**
 * Modulity 2.0 — In-Memory File Storage Adapter (Step 30)
 *
 * Canonical TEST adapter implementing the File Storage Contract. Deterministic
 * and synchronous — suitable for unit tests and simulation. This is NOT
 * production persistence; it must never be presented as such.
 *
 * @module core/files/inMemoryFileStorageAdapter
 */

/**
 * @returns {import('./fileStorageContract.js').FileStorageAdapter}
 */
export function createInMemoryFileStorageAdapter() {
  const store = new Map(); // storagePath -> { bytes: Uint8Array, contentType }

  function toBytes(content) {
    if (content instanceof Uint8Array) return content;
    if (typeof Blob !== 'undefined' && content instanceof Blob) {
      throw new Error('Blob content requires an async environment — use Uint8Array in tests');
    }
    return new TextEncoder().encode(String(content ?? ''));
  }

  return Object.freeze({
    async upload(storagePath, content, { contentType = 'application/octet-stream' } = {}) {
      if (!storagePath) throw new Error('storagePath is required');
      const bytes = toBytes(content);
      store.set(storagePath, { bytes, contentType });
      return { storagePath, size: bytes.length };
    },
    async getDownloadUrl(storagePath) {
      if (!store.has(storagePath)) throw new Error(`No stored content at ${storagePath}`);
      return `memory://storage/${encodeURIComponent(storagePath)}`;
    },
    async remove(storagePath) {
      store.delete(storagePath);
    },
    async exists(storagePath) {
      return store.has(storagePath);
    },
    /** Test-only escape hatch — not part of the contract surface. */
    _dump() { return store; },
  });
}
