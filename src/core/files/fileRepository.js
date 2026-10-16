/**
 * Modulity 2.0 — File Metadata Repository Contracts (Step 30)
 *
 * Read-side repository contracts for canonical Files, Versions and
 * Attachments. Writes belong exclusively to the trusted fileCommand boundary
 * — client repositories expose no write methods.
 *
 * @module core/files/fileRepository
 */

/**
 * @typedef {Object} FileRepository
 * @property {function(string, string): Promise<File|null>} getById — (workspaceId, fileId)
 * @property {function(string): Promise<File[]>} listByWorkspace — bounded, ACTIVE-or-ARCHIVED by contract
 */

/**
 * @typedef {Object} FileVersionRepository
 * @property {function(string, string, number|string): Promise<FileVersion|null>} getVersion — (workspaceId, fileId, version)
 * @property {function(string, string): Promise<FileVersion[]>} listVersions — (workspaceId, fileId)
 */

/**
 * @typedef {Object} FileAttachmentRepository
 * @property {function(string, string): Promise<FileAttachment|null>} getById — (workspaceId, attachmentId)
 * @property {function(string, string, string): Promise<FileAttachment[]>} listActiveByTarget — (workspaceId, targetType, targetId)
 * @property {function(string, string): Promise<FileAttachment[]>} listByFile — (workspaceId, fileId)
 */

export default undefined;
