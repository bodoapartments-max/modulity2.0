/**
 * Shared operation-journal plumbing for trusted command engines
 * (recordCommand, ledgerCommand, and future trusted boundaries).
 *
 * One journal collection per Workspace: workspaces/{ws}/recordOperations.
 * Fingerprint = SHA-256 of stableJson({ userId, commandType, payload }).
 *
 * Journal semantics (Steps 12.1/15/16):
 *  - same operationId + same fingerprint → idempotent replay (COMPLETED)
 *  - same operationId + different fingerprint → OPERATION_MISMATCH
 *  - PROCESSING with a live lease → caller receives OPERATION_IN_PROGRESS
 *  - PROCESSING with an expired lease → recovered/reacquired with attemptCount++
 *  - FAILED is terminal
 *  - For mutation-style commands the journal COMPLETED write and the domain
 *    mutation commit in ONE transaction (crash-safe)
 */
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { createHash } from 'node:crypto';

export const OPERATION_STATUS = Object.freeze({
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
});

export const OPERATION_LEASE_MS = 30_000;
export const MAX_RECOVERY_ATTEMPTS = 10;

export function stableJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableJson(value[k])}`).join(',')}}`;
}

export function computeOperationFingerprint(userId, command) {
  const normalized = stableJson({ userId, commandType: command.commandType, payload: command.payload });
  return createHash('sha256').update(normalized).digest('hex');
}

export function operationDoc(db, workspaceId, operationId) {
  return db.doc(`workspaces/${workspaceId}/recordOperations/${operationId}`);
}

export function buildOperationDocument({ command, userId, fingerprint, status, recordId = null, attemptCount = 1, leaseMs = OPERATION_LEASE_MS, extra = {} }) {
  const now = Timestamp.now();
  return {
    operationId: command.operationId,
    workspaceId: command.payload.workspaceId,
    commandType: command.commandType,
    status,
    fingerprint,
    userId,
    recordId,
    attemptCount,
    leaseExpiresAt: Timestamp.fromMillis(now.toMillis() + leaseMs),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    ...extra,
  };
}

/**
 * Pre-transaction journal peek for mutation-style commands: replay COMPLETED
 * operations without re-running domain authority checks against the CURRENT
 * domain state, so idempotent retries of legitimate earlier operations never
 * fail as "invalid transition".
 *
 * @returns {Promise<{replay: boolean, recordId: string|null}|null>} null when the caller must proceed
 */
export async function peekCompletedOperation(db, { workspaceId, operationId, userId, fingerprint, fail, codes }) {
  const opSnap = await operationDoc(db, workspaceId, operationId).get();
  if (!opSnap.exists) return null;
  const op = opSnap.data();
  if (op.userId !== userId || op.workspaceId !== workspaceId) {
    fail(codes.OPERATION_CONFLICT, 'Operation identity mismatch.');
  }
  if (op.fingerprint !== fingerprint) {
    fail(codes.OPERATION_MISMATCH, 'Operation command mismatch.');
  }
  if (op.status === OPERATION_STATUS.FAILED) {
    fail(codes.OPERATION_CONFLICT, 'Operation exists with terminal or failed status.');
  }
  if (op.status === OPERATION_STATUS.COMPLETED) {
    return { replay: true, recordId: op.recordId || null };
  }
  return null; // PROCESSING → the transaction handles lease/reacquire
}

