/**
 * Modulity 2.0 — Invitation Domain Model
 *
 * An Invitation allows a user to join an Organization.
 * Security-sensitive operations (accepting, role granting) must be
 * handled by trusted server-side logic.
 *
 * This defines the domain contract. Full server-side implementation
 * is documented but deferred if disproportionate for Step 2.
 */

export const INVITATION_STATUSES = Object.freeze({
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  EXPIRED: 'EXPIRED',
  REVOKED: 'REVOKED',
});

/**
 * @typedef {Object} Invitation
 * @property {string} invitationId
 * @property {string} organizationId
 * @property {string} email            — invited email address
 * @property {string} role             — intended role upon acceptance
 * @property {string} invitedByUserId
 * @property {string} status           — one of INVITATION_STATUSES
 * @property {string} createdAt        — ISO 8601
 * @property {string} expiresAt        — ISO 8601
 * @property {string|null} acceptedAt  — ISO 8601 or null
 */

/**
 * Default invitation expiry: 7 days from creation.
 */
export const DEFAULT_INVITATION_EXPIRY_DAYS = 7;

/**
 * Creates an Invitation value object.
 *
 * @param {Object} params
 * @returns {Invitation}
 */
export function createInvitation({
  invitationId,
  organizationId,
  email,
  role,
  invitedByUserId,
  status = INVITATION_STATUSES.PENDING,
  createdAt,
  expiresAt,
  acceptedAt = null,
}) {
  if (!invitationId) throw new Error('invitationId is required');
  if (!organizationId) throw new Error('organizationId is required');
  if (!email || email.trim() === '') throw new Error('Email is required');
  if (!role) throw new Error('Role is required');
  if (!invitedByUserId) throw new Error('invitedByUserId is required');
  if (!INVITATION_STATUSES[status]) throw new Error(`Invalid invitation status: ${status}`);

  const now = new Date();
  const created = createdAt || now.toISOString();
  const expires = expiresAt || new Date(now.getTime() + DEFAULT_INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();

  return Object.freeze({
    invitationId,
    organizationId,
    email: email.trim().toLowerCase(),
    role,
    invitedByUserId,
    status,
    createdAt: created,
    expiresAt: expires,
    acceptedAt,
  });
}

/**
 * Checks whether an invitation has expired.
 *
 * @param {Invitation} invitation
 * @returns {boolean}
 */
export function isExpired(invitation) {
  return new Date(invitation.expiresAt) < new Date();
}
