/**
 * Modulity 2.0 — File Metadata Repository Contract
 *
 * @module core/data/fileRepository
 */

/**
 * @typedef {Object} FileRepository
 * @property {function(string, string): Promise<FileMeta|null>} getById — (workspaceId, fileId)
 * @property {function(string): Promise<FileMeta[]>} listByWorkspace
 * @property {function(FileMeta): Promise<FileMeta>} create
 */

export default undefined;
