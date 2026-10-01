/**
 * Modulity 2.0 — File Storage Contract
 *
 * Provider-independent boundary for binary file storage.
 * Firebase Storage (or another provider) implements this contract.
 *
 * @module core/data/fileStorageContract
 */

/**
 * @typedef {Object} FileStorageAdapter
 * @property {function(string, File|Blob, Object): Promise<{storagePath: string, size: number}>} upload
 * @property {function(string): Promise<string>} getDownloadUrl
 * @property {function(string): Promise<void>} remove
 */

// Contract-only module.
export default undefined;
