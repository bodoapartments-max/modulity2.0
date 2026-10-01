/**
 * Modulity 2.0 — Record Repository Contract
 *
 * @module core/data/recordRepository
 */

/**
 * @typedef {Object} RecordRepository
 * @property {function(string, string): Promise<Record|null>} getById — (workspaceId, recordId)
 * @property {function(string): Promise<Record[]>} listByWorkspace
 * @property {function(string, string): Promise<Record[]>} listByStatus — (workspaceId, status)
 * @property {function(string, string): Promise<Record[]>} listByEntityRef — (workspaceId, entityId)
 * @property {function(string, Object): Promise<Record[]>} query — (workspaceId, filters)
 * @property {function(Record): Promise<Record>} create
 * @property {function(string, string, Object): Promise<Record>} update — (workspaceId, recordId, changes)
 */

export default undefined;
