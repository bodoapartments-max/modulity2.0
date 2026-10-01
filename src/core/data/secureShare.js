/**
 * Modulity 2.0 — Secure Share Token
 *
 * Foundation for QR-code and secure-link sharing.
 *
 * CRITICAL: QR codes must NEVER contain sensitive Record business data.
 * They encode an opaque capability token reference, not Record contents.
 *
 * Path: workspaces/{workspaceId}/shareTokens/{tokenId}
 *
 * @module core/data/secureShare
 */

export const SHARE_TOKEN_STATUSES = Object.freeze({
  ACTIVE: 'ACTIVE',
  REDEEMED: 'REDEEMED',
  EXPIRED: 'EXPIRED',
  REVOKED: 'REVOKED',
});

export const SHARE_TOKEN_SCOPES = Object.freeze({
  READ: 'READ',
  RESPOND: 'RESPOND',
});

/**
 * @typedef {Object} ShareToken
 * @property {string} tokenId — internal document ID
 * @property {string} workspaceId
 * @property {string} recordId — the Record this token grants access to
 * @property {string} tokenHash — SHA-256 hash of the actual token (never store plaintext)
 * @property {string} scope — READ or RESPOND
 * @property {string} status — one of SHARE_TOKEN_STATUSES
 * @property {Object} createdBy — ActorRef
 * @property {string|null} redeemedByUserId — who redeemed (null until redeemed)
 * @property {string|null} expiresAt — optional expiration
 * @property {number} maxRedemptions — how many times token can be used (0 = unlimited)
 * @property {number} redemptionCount — current redemption count
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * Creates a ShareToken value object.
 *
 * @param {Object} params
 * @returns {ShareToken}
 */
export function createShareToken({
  tokenId,
  workspaceId,
  recordId,
  tokenHash,
  scope = SHARE_TOKEN_SCOPES.READ,
  status = SHARE_TOKEN_STATUSES.ACTIVE,
  createdBy,
  redeemedByUserId = null,
  expiresAt = null,
  maxRedemptions = 1,
  redemptionCount = 0,
  createdAt,
  updatedAt,
}) {
  if (!tokenId) throw new Error('tokenId is required');
  if (!workspaceId) throw new Error('workspaceId is required');
  if (!recordId) throw new Error('recordId is required');
  if (!tokenHash) throw new Error('tokenHash is required');
  if (!SHARE_TOKEN_SCOPES[scope]) {
    throw new Error(`Invalid share token scope: ${scope}`);
  }
  if (!SHARE_TOKEN_STATUSES[status]) {
    throw new Error(`Invalid share token status: ${status}`);
  }
  if (!createdBy) throw new Error('createdBy is required');

  return Object.freeze({
    tokenId,
    workspaceId,
    recordId,
    tokenHash,
    scope,
    status,
    createdBy: Object.freeze({ ...createdBy }),
    redeemedByUserId,
    expiresAt,
    maxRedemptions,
    redemptionCount,
    createdAt: createdAt || new Date().toISOString(),
    updatedAt: updatedAt || new Date().toISOString(),
  });
}

/**
 * Generates a cryptographically random token string.
 * The actual token is shown to the user / encoded in QR.
 * Only the HASH is stored in Firestore.
 *
 * @returns {string} — the plaintext token (show to user, never store)
 */
export function generateShareToken() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Hashes a plaintext token for storage.
 * Uses SHA-256 via Web Crypto API.
 *
 * @param {string} token — the plaintext token
 * @returns {Promise<string>} — hex-encoded SHA-256 hash
 */
export async function hashShareToken(token) {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
