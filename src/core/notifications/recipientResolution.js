/**
 * Modulity 2.0 — Recipient Resolution (pure)
 *
 * Deterministic recipient computation for Notification intents.
 * Receiving a Notification never grants access; target authorization uses
 * the normal Workspace/Domain rules when the user opens the context object.
 *
 * @module core/notifications/recipientResolution
 */

import { RECIPIENT_STRATEGIES, NOTIFICATION_ERROR_CODES } from './notificationContract.js';

/**
 * Computes recipient user ids for an intent.
 *
 * @param {Object} intent
 * @param {Object} options
 * @param {boolean} [options.excludeActorWhenSelfRedundant=true] — skip when the
 *   recipient strategy only informs the actor of their own action AND the
 *   template does not want self-notification (left to policy per event)
 * @returns {{ ok: boolean, recipients: string[], errors: string[], code?: string }}
 */
export function resolveRecipients(intent) {
  const strategy = intent?.recipientStrategy?.type || RECIPIENT_STRATEGIES.SELF_FROM_ACTOR;

  if (strategy === RECIPIENT_STRATEGIES.SELF_FROM_ACTOR) {
    if (!intent.actorUserId) {
      return { ok: false, recipients: [], errors: ['SELF_FROM_ACTOR requires intent.actorUserId'], code: NOTIFICATION_ERROR_CODES.RECIPIENT_INVALID };
    }
    return { ok: true, recipients: [intent.actorUserId], errors: [] };
  }

  if (strategy === RECIPIENT_STRATEGIES.EXPLICIT_USER) {
    const userId = intent.recipientStrategy?.userId;
    if (!userId) {
      return { ok: false, recipients: [], errors: ['EXPLICIT_USER requires recipientStrategy.userId'], code: NOTIFICATION_ERROR_CODES.RECIPIENT_INVALID };
    }
    // Actor exclusion when appropriate: if producing yourself an inbox item
    // about your own action adds no signal, the intent can opt out.
    if (intent.excludeActorRecipient && userId === intent.actorUserId) {
      return { ok: true, recipients: [], errors: [] };
    }
    return { ok: true, recipients: [userId], errors: [] };
  }

  return { ok: false, recipients: [], errors: [`Unknown recipient strategy: ${strategy}`], code: NOTIFICATION_ERROR_CODES.RECIPIENT_INVALID };
}
