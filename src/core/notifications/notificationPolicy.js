/**
 * Modulity 2.0 — Notification Policy + Recipient Resolution (pure)
 *
 * Deterministic mapping: event → recipients + presentation.
 * No Firebase here; callers resolve context and pass the result.
 *
 * The policy describes WHAT the user should see (title/message/action URL),
 * the resolver describes WHO receives it. Presentation never embeds business
 * data beyond light safe metadata.
 *
 * @module core/notifications/notificationPolicy
 */

import {
  NOTIFICATION_EVENT_TYPES,
  NOTIFICATION_PRIORITIES,
} from './notificationContract.js';

/**
 * Controlled presentation registry. Adding a new event type here is the
 * explicit product decision for a new user-visible notification.
 */
export const NOTIFICATION_TEMPLATES = Object.freeze({
  [NOTIFICATION_EVENT_TYPES.RECORD_CREATED]: Object.freeze({
    title: 'Record created',
    priority: NOTIFICATION_PRIORITIES.NORMAL,
    messageFor: () => 'Your Record was created successfully.',
  }),
  [NOTIFICATION_EVENT_TYPES.RECORD_DRAFT_SAVED]: Object.freeze({
    title: 'Draft saved',
    priority: NOTIFICATION_PRIORITIES.NORMAL,
    messageFor: () => 'Your Draft was saved and can be edited later.',
  }),
  [NOTIFICATION_EVENT_TYPES.RECORD_SUBMITTED]: Object.freeze({
    title: 'Record submitted',
    priority: NOTIFICATION_PRIORITIES.NORMAL,
    messageFor: () => 'Your Record was submitted.',
  }),
  [NOTIFICATION_EVENT_TYPES.CHAT_DIRECT_MESSAGE]: Object.freeze({
    title: 'New message',
    priority: NOTIFICATION_PRIORITIES.ATTENTION,
    messageFor: () => 'A direct message is waiting in Chat.',
  }),
  [NOTIFICATION_EVENT_TYPES.CHAT_MENTIONED]: Object.freeze({
    title: 'Mentioned in Chat',
    priority: NOTIFICATION_PRIORITIES.ATTENTION,
    messageFor: () => 'Someone mentioned you in a workspace conversation.',
  }),
  [NOTIFICATION_EVENT_TYPES.CHAT_CONTEXT_MESSAGE]: Object.freeze({
    title: 'Context conversation update',
    priority: NOTIFICATION_PRIORITIES.NORMAL,
    messageFor: () => 'Activity in a business-context conversation.',
  }),
});

const DEFAULT_ACTION = '/app/notifications';

/**
 * Resolves the deterministic presentation for an intent.
 *
 * @param {Object} intent
 * @param {Object} options
 * @param {(ref: Object) => string|null} [options.actionUrlFor]
 * @returns {{ title: string, message: string, priority: string, actionUrl: string }|null}
 */
export function resolveNotificationTemplate(intent, { actionUrlFor = null } = {}) {
  const template = NOTIFICATION_TEMPLATES[intent.eventType];
  if (!template) return null;
  const actionUrl = actionUrlFor?.(intent.contextReference) || defaultActionUrl(intent.contextReference);
  return {
    title: template.title,
    message: template.messageFor(),
    priority: template.priority,
    actionUrl,
  };
}

function defaultActionUrl(ref) {
  if (!ref?.type || !ref?.id) return DEFAULT_ACTION;
  switch (ref.type) {
    case 'RECORD': return `/app/records/${ref.id}`;
    case 'MODULE': return `/app/modules/${ref.id}`;
    case 'ENTITY': return `/app/entities/${ref.id}`;
    case 'LEDGER_ENTRY': return `/app/ledger`;
    default: return DEFAULT_ACTION;
  }
}
