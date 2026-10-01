/**
 * Modulity 2.0 — Secure Share Service
 *
 * Foundation for QR-code and secure-link sharing.
 *
 * CRITICAL SECURITY RULES:
 *   - QR codes NEVER contain sensitive Record business data.
 *   - Only the SHA-256 hash of the token is stored in Firestore.
 *   - The plaintext token is returned once to the creator and never stored.
 *   - Redemption uses a Firestore transaction for concurrency safety.
 *   - redeemedByUserId is derived from the authenticated caller, never client-provided.
 *   - External/public QR redemption cannot be claimed secure without a backend.
 *
 * @module core/data/secureShareService
 */

import { createShareToken, generateShareToken, hashShareToken, SHARE_TOKEN_STATUSES, SHARE_TOKEN_SCOPES } from './secureShare.js';
import { generateId } from '../utils/generateId.js';
import { eventBus, createEvent } from '../events/eventBus.js';
import { AppError } from '../errors/appError.js';

/**
 * @param {Object} deps
 * @param {Object} deps.shareTokenRepo — must implement redeemTokenAtomic(workspaceId, tokenId, userId)
 * @param {Object} deps.recordRepo
 */
export function createSecureShareService({ shareTokenRepo, recordRepo }) {
  /**
   * Creates a secure share token for a Record.
   * Returns the plaintext token ONCE — it is never stored.
   *
   * @returns {Promise<{ token: ShareToken, plaintextToken: string }>}
   */
  async function createToken({
    workspaceId,
    recordId,
    scope = SHARE_TOKEN_SCOPES.READ,
    createdBy,
    expiresAt = null,
    maxRedemptions = 1,
  }) {
    // Verify record exists
    const record = await recordRepo.getById(workspaceId, recordId);
    if (!record) {
      throw new AppError('not_found', 'Record not found');
    }

    const plaintextToken = generateShareToken();
    const tokenHash = await hashShareToken(plaintextToken);

    const shareToken = createShareToken({
      tokenId: generateId(),
      workspaceId,
      recordId,
      tokenHash,
      scope,
      createdBy,
      expiresAt,
      maxRedemptions,
    });

    const created = await shareTokenRepo.create(shareToken);

    eventBus.emit(createEvent({
      eventType: 'share.created',
      workspaceId,
      actor: { type: createdBy.actorType === 'USER' ? 'user' : 'service', id: createdBy.actorId },
      payload: { tokenId: created.tokenId, recordId, scope },
    }));

    return { token: created, plaintextToken };
  }

  /**
   * Revokes a share token.
   */
  async function revokeToken(workspaceId, tokenId, actor) {
    const existing = await shareTokenRepo.getById(workspaceId, tokenId);
    if (!existing) {
      throw new AppError('not_found', 'Share token not found');
    }
    if (existing.status !== SHARE_TOKEN_STATUSES.ACTIVE) {
      throw new AppError('forbidden', 'Token is not active');
    }
    // Only creator can revoke
    if (actor.actorId !== existing.createdBy.actorId) {
      throw new AppError('forbidden', 'Only the token creator can revoke it');
    }

    const updated = await shareTokenRepo.update(workspaceId, tokenId, {
      status: SHARE_TOKEN_STATUSES.REVOKED,
      updatedAt: new Date().toISOString(),
    });

    eventBus.emit(createEvent({
      eventType: 'share.revoked',
      workspaceId,
      actor: { type: actor.actorType === 'USER' ? 'user' : 'service', id: actor.actorId },
      payload: { tokenId, recordId: existing.recordId },
    }));

    return updated;
  }

  /**
   * Redeems a share token.
   *
   * CONCURRENCY-SAFE: Uses a Firestore transaction via shareTokenRepo.redeemTokenAtomic()
   * to atomically check limits and increment redemptionCount. Two concurrent
   * redemptions against maxRedemptions=1 will result in exactly one success.
   *
   * IDENTITY: userId is the authenticated caller (request.auth.uid).
   * The caller CANNOT provide an arbitrary userId — it must correspond
   * to their actual identity at the security boundary.
   *
   * NOTE: Full public/anonymous redemption requires a trusted backend boundary.
   * This implementation handles authenticated-user redemption only.
   */
  async function redeemToken(workspaceId, plaintextToken, userId) {
    if (!userId) {
      throw new AppError('forbidden', 'Authenticated user identity is required for redemption');
    }

    const tokenHash = await hashShareToken(plaintextToken);
    const token = await shareTokenRepo.getByHash(workspaceId, tokenHash);
    if (!token) {
      throw new AppError('not_found', 'Invalid or expired share token');
    }

    // Delegate to transactional atomic redemption
    try {
      const result = await shareTokenRepo.redeemTokenAtomic(workspaceId, token.tokenId, userId);

      eventBus.emit(createEvent({
        eventType: 'share.redeemed',
        workspaceId,
        actor: { type: 'user', id: userId },
        payload: { tokenId: token.tokenId, recordId: result.recordId, scope: result.scope },
      }));

      return result;
    } catch (err) {
      // Map transaction errors to AppError
      if (err.message.includes('expired')) {
        throw new AppError('forbidden', 'Token has expired');
      }
      if (err.message.includes('limit reached')) {
        throw new AppError('forbidden', 'Token redemption limit reached');
      }
      if (err.message.includes('no longer active')) {
        throw new AppError('forbidden', 'Token is no longer active');
      }
      throw err;
    }
  }

  /**
   * Lists all share tokens for a record.
   */
  async function listTokensForRecord(workspaceId, recordId) {
    return shareTokenRepo.listByRecord(workspaceId, recordId);
  }

  return {
    createToken,
    revokeToken,
    redeemToken,
    listTokensForRecord,
  };
}
