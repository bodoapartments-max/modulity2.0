import { describe, it, expect } from 'vitest';
import {
  validateNotificationIntent,
  deriveNotificationId,
  createCanonicalNotification,
  NOTIFICATION_STATUSES,
  RECIPIENT_STRATEGIES,
} from './notificationContract.js';
import { resolveNotificationTemplate, NOTIFICATION_TEMPLATES } from './notificationPolicy.js';
import { resolveRecipients } from './recipientResolution.js';
import { routeNotificationDelivery } from './deliveryRouter.js';

const baseIntent = {
  eventType: 'record.created',
  workspaceId: 'ws-1',
  actorUserId: 'user-1',
  operationId: 'op-1',
  contextReference: { type: 'RECORD', id: 'rec-1', workspaceId: 'ws-1' },
};

describe('notificationContract', () => {
  it('accepts a well-formed intent', () => {
    expect(validateNotificationIntent(baseIntent).valid).toBe(true);
  });

  it('requires context references and rejects cross-workspace context', () => {
    expect(validateNotificationIntent({ ...baseIntent, contextReference: { type: 'RECORD', id: 'rec-1', workspaceId: 'ws-2' } }).valid).toBe(false);
    expect(validateNotificationIntent({ ...baseIntent, contextReference: null }).valid).toBe(false);
  });

  it('rejects forged authority fields in the intent payload', () => {
    for (const key of ['notificationId', 'status', 'readAt', 'createdAt', 'recipientUserId']) {
      const result = validateNotificationIntent({ ...baseIntent, [key]: 'forged' });
      expect(result.valid).toBe(false);
    }
  });

  it('derives deterministic notification identity per operation/event/recipient', () => {
    const a = deriveNotificationId({ operationId: 'op-1', eventType: 'record.created', recipientUserId: 'user-1' });
    const b = deriveNotificationId({ operationId: 'op-1', eventType: 'record.created', recipientUserId: 'user-1' });
    const c = deriveNotificationId({ operationId: 'op-2', eventType: 'record.created', recipientUserId: 'user-1' });
    const d = deriveNotificationId({ operationId: 'op-1', eventType: 'record.created', recipientUserId: 'user-2' });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toBe(d);
  });

  it('canonical notification carries contextReference + legacy mirrors, never payload copies', () => {
    const n = createCanonicalNotification({
      notificationId: 'n-1',
      workspaceId: 'ws-1',
      recipientUserId: 'user-1',
      eventType: 'record.created',
      title: 'Record created',
      contextReference: { type: 'RECORD', id: 'rec-9', workspaceId: 'ws-1' },
      actionUrl: '/app/records/rec-9',
      createdBy: { actorType: 'USER', actorId: 'user-1' },
    });
    expect(n.status).toBe(NOTIFICATION_STATUSES.UNREAD);
    expect(n.type).toBe('RECORD_CREATED');
    expect(n.resourceType).toBe('RECORD');
    expect(n.resourceId).toBe('rec-9');
    expect(n.contextReference).toEqual({ type: 'RECORD', id: 'rec-9', workspaceId: 'ws-1' });
  });
});

describe('notificationPolicy templates', () => {
  it('resolves presentation for known record events', () => {
    expect(NOTIFICATION_TEMPLATES['record.created']).toBeDefined();
    const presentation = resolveNotificationTemplate(baseIntent);
    expect(presentation.title).toBe('Record created');
    expect(presentation.actionUrl).toBe('/app/records/rec-1');
  });

  it('returns null for events without a registered template', () => {
    expect(resolveNotificationTemplate({ ...baseIntent, eventType: 'ledger.entry_registered' })).toBeNull();
  });
});

describe('recipientResolution', () => {
  it('SELF_FROM_ACTOR notifies the actor', () => {
    expect(resolveRecipients(baseIntent).recipients).toEqual(['user-1']);
  });

  it('EXPLICIT_USER notifies the explicit user (server-verified later)', () => {
    const result = resolveRecipients({ ...baseIntent, recipientStrategy: { type: RECIPIENT_STRATEGIES.EXPLICIT_USER, userId: 'user-2' } });
    expect(result.recipients).toEqual(['user-2']);
  });

  it('excludeActorRecipient suppresses redundant self-notification', () => {
    const result = resolveRecipients({
      ...baseIntent,
      recipientStrategy: { type: RECIPIENT_STRATEGIES.EXPLICIT_USER, userId: 'user-1' },
      excludeActorRecipient: true,
    });
    expect(result.ok).toBe(true);
    expect(result.recipients).toEqual([]);
  });

  it('unknown strategy is rejected deterministically, never silently', () => {
    const result = resolveRecipients({ ...baseIntent, recipientStrategy: { type: 'EVERYONE' } });
    expect(result.ok).toBe(false);
  });
});

describe('deliveryRouter', () => {
  it('delivers via IN_APP and marks future channels as skipped', async () => {
    const calls = [];
    const result = await routeNotificationDelivery({ notificationId: 'n-1' }, baseIntent, {
      IN_APP: async () => calls.push('in-app'),
    });
    expect(calls).toEqual(['in-app']);
    expect(result.delivered).toEqual(['IN_APP']);
    expect(result.skipped.length).toBeGreaterThan(0);
  });
});
