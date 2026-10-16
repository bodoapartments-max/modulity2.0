/**
 * Modulity 2.0 — File Storage Contract (Step 30)
 *
 * Provider-independent boundary for binary file content. The canonical file
 * domain never depends on a specific blob store — adapters may be Firebase
 * Storage, GCS, S3-compatible, or an in-memory test store.
 *
 *   File Service / Trusted File Command
 *           |
 *     Storage Adapter (this contract)
 *           |
 *     actual blob/object storage
 *
 * PRODUCTION READINESS NOTE: the Firebase Storage adapter is implemented
 * against the canonical path scheme, but production bucket provisioning,
 * malware scanning, and bounded/expiring download authorization are
 * documented deferred concerns (docs/UNIVERSAL_FILES.md).
 *
 * @module core/files/fileStorageContract
 */

/**
 * @typedef {Object} FileStorageAdapter
 * @property {function(string, File|Blob|Uint8Array, Object=): Promise<{storagePath: string, size: number}>} upload
 *   — writes binary content at a canonical storagePath. Never decides the path.
 * @property {function(string): Promise<string>} getDownloadUrl
 *   — resolves a download URL for an authorized caller. With Firebase Storage
 *   this yields a token URL (bearer link) — see UNIVERSAL_FILES.md limitations.
 * @property {function(string): Promise<void>} remove
 *   — deletes content. Only invoked by trusted purge flows.
 * @property {function(string): Promise<boolean>} exists — existence check.
 */

// Contract-only module — adapters implement the typedef above.
export {};
