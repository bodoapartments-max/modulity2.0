/**
 * Modulity 2.0 — User Record State
 *
 * Per-user state for Records: starred, saved, etc.
 * This state MUST NOT pollute canonical business Record data.
 *
 * Path: workspaces/{workspaceId}/userRecordState/{compositeId}
 * where compositeId = `${userId}_${recordId}` for deterministic lookup.
 *
 * @module core/data/userRecordState
 */

/**
 * Creates a deterministic composite ID for user record state.
 *
 * @param {string} userId
 * @param {string} recordId
 * @returns {string}
 */
export function userRecordStateId(userId, recordId) {
  if (!userId || !recordId) {
    throw new Error('userId and recordId are required for userRecordStateId');
  }
  return `${userId}_${recordId}`;
}

/**
 * @typedef {Object} UserRecordState
 * @property {string} stateId — composite: userId_recordId
 * @property {string} workspaceId
 * @property {string} userId
 * @property {string} recordId
 * @property {boolean} starred
 * @property {string} updatedAt
 */

/**
 * Creates a UserRecordState value object.
 *
 * @param {Object} params
 * @returns {UserRecordState}
 */
export function createUserRecordState({
  workspaceId,
  userId,
  recordId,
  starred = false,
  updatedAt,
}) {
  if (!workspaceId) throw new Error('workspaceId is required');
  if (!userId) throw new Error('userId is required');
  if (!recordId) throw new Error('recordId is required');

  return Object.freeze({
    stateId: userRecordStateId(userId, recordId),
    workspaceId,
    userId,
    recordId,
    starred: Boolean(starred),
    updatedAt: updatedAt || new Date().toISOString(),
  });
}
