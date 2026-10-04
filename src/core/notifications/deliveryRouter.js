/**
 * Modulity 2.0 — Delivery Adapter seam (interface only)
 *
 * IN_APP is the only implemented channel in Step 17: the canonical
 * Notification document IS the in-app inbox store, so writing the
 * Notification to Firestore completes delivery.
 *
 * EMAIL / PUSH / WEBHOOK are places for future adapters — they receive the
 * same canonical Notification + intent and must never create a second copy
 * of the Notification. A failed future-channel delivery does not duplicate
 * or invalidate the canonical artifact.
 *
 * @module core/notifications/deliveryRouter
 */

export const DELIVERY_CHANNELS = Object.freeze({
  IN_APP: 'IN_APP',
  EMAIL: 'EMAIL',   // future seam — not implemented
  PUSH: 'PUSH',     // future seam — not implemented
  WEBHOOK: 'WEBHOOK', // future seam — not implemented
});

/**
 * Routes a canonical Notification to its delivery adapters.
 * Step 17 supports IN_APP only; unknown channels are skipped loudly
 * (returned, not thrown — delivery of later channels must not fail the
 * canonical artifact).
 *
 * @param {Object} notification
 * @param {Object} intent
 * @param {Object} adapters — { IN_APP: (notification, intent) => Promise<void> }
 * @returns {Promise<{ delivered: string[], skipped: string[] }>}
 */
export async function routeNotificationDelivery(notification, intent, adapters) {
  const delivered = [];
  const skipped = [];
  if (adapters?.IN_APP) {
    await adapters.IN_APP(notification, intent);
    delivered.push(DELIVERY_CHANNELS.IN_APP);
  }
  for (const channel of Object.values(DELIVERY_CHANNELS)) {
    if (channel === DELIVERY_CHANNELS.IN_APP) continue;
    if (adapters?.[channel]) {
      await adapters[channel](notification, intent);
      delivered.push(channel);
    } else {
      skipped.push(channel);
    }
  }
  return { delivered, skipped };
}
