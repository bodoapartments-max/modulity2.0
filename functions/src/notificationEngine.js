/**
 * Trusted Notification Engine (server-side).
 *
 * ONE boundary for canonical Notification creation. Trusted commands
 * (recordCommand, ledgerCommand, future engines) pass Notification intents;
 * this engine resolves recipients deterministically, verifies workspace
 * access, and writes ONE canonical Notification per (operation, event,
 * recipient) — retries can never duplicate it.
 *
 * Notifications are derived communication artifacts; they never change a
 * committed business mutation. Failures here are best-effort-only AFTER the
 * canonical transaction — the caller decides (commands treat notification
 * failure as non-blocking by design).
 */
import { FieldValue } from 'firebase-admin/firestore';
import {
  validateNotificationIntent,
  deriveNotificationId,
  createCanonicalNotification,
} from './generated/src/core/notifications/notificationContract.js';
import { resolveRecipients } from './generated/src/core/notifications/recipientResolution.js';
import { resolveNotificationTemplate } from './generated/src/core/notifications/notificationPolicy.js';
import { routeNotificationDelivery, DELIVERY_CHANNELS } from './generated/src/core/notifications/deliveryRouter.js';

function notificationDoc(db, workspaceId, notificationId) {
  return db.doc(`workspaces/${workspaceId}/notifications/${notificationId}`);
}

/**
 * Verifies the recipient can receive notifications in this workspace
 * (Personal owner OR active Organization member). Commands always run behind
 * Firebase Auth, so the caller's own authorization was already checked; this
 * protects EXPLICIT_USER cross-boundary intents for future engines.
 */
async function assertRecipientAccess(db, workspaceId, recipientUserId) {
  const wsSnap = await db.doc(`workspaces/${workspaceId}`).get();
  if (!wsSnap.exists) return false;
  const workspace = wsSnap.data();
  if (workspace.type === 'PERSONAL') {
    return workspace.ownerUserId === recipientUserId;
  }
  if (workspace.type === 'ORGANIZATION') {
    const member = await db.doc(`organizations/${workspace.organizationId}/members/${recipientUserId}`).get();
    return member.exists && member.data().status === 'ACTIVE';
  }
  return false;
}

/**
 * Processes ONE Notification intent.
 *
 * @returns {Promise<Array<{ notificationId: string, recipientUserId: string, skipped?: boolean }>>}
 */
export async function processNotificationIntent(db, intent) {
  const validation = validateNotificationIntent(intent);
  if (!validation.valid) {
    throw new Error(`Notification intent invalid: ${validation.errors.join('; ')}`);
  }

  const template = resolveNotificationTemplate(intent);
  if (!template) {
    // No user-visible template for this event — deliberate silence.
    return [];
  }

  const resolution = resolveRecipients(intent);
  if (!resolution.ok) {
    throw new Error(`Notification recipients invalid: ${resolution.errors.join('; ')}`);
  }

  const results = [];
  for (const recipientUserId of resolution.recipients) {
    const allowed = await assertRecipientAccess(db, intent.workspaceId, recipientUserId);
    if (!allowed) {
      results.push({ notificationId: null, recipientUserId, skipped: true });
      continue;
    }

    const notificationId = deriveNotificationId({
      operationId: intent.operationId,
      eventType: intent.eventType,
      recipientUserId,
    });

    const notification = createCanonicalNotification({
      notificationId,
      workspaceId: intent.workspaceId,
      recipientUserId,
      eventType: intent.eventType,
      title: template.title,
      message: template.message,
      contextReference: { ...intent.contextReference, workspaceId: intent.workspaceId },
      actionUrl: template.actionUrl,
      priority: template.priority,
      metadata: {
        ...(intent.metadata || {}),
        operationId: intent.operationId,
        actorUserId: intent.actorUserId,
      },
      createdBy: { actorType: 'USER', actorId: intent.actorUserId },
    });

    const { delivered } = await routeNotificationDelivery(notification, intent, {
      IN_APP: async (canonical) => {
        // Create-only semantics: a retry of the same logical operation finds
        // the existing document and leaves user read-state untouched.
        const ref = notificationDoc(db, intent.workspaceId, canonical.notificationId);
        const existing = await ref.get();
        if (existing.exists) return;
        await ref.set({
          ...canonical,
          _createdAt: FieldValue.serverTimestamp(),
          _readAt: null,
        });
      },
    });
    void delivered;

    results.push({ notificationId, recipientUserId });
  }
  return results;
}

export { DELIVERY_CHANNELS };
