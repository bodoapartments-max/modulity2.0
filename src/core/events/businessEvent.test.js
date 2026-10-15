import { describe, expect, it } from 'vitest';
import {
  createBusinessEvent,
  businessEventIdFor,
  BUSINESS_EVENT_TYPES,
  BUSINESS_EVENT_SOURCES,
  sanitizeBusinessEventInput,
} from './businessEvent.js';

describe('BusinessEvent contract (canonical)', () => {
  it('creates a canonical event with required identity', () => {
    const ev = createBusinessEvent({
      eventId: 'be_op_x.record.created',
      eventType: BUSINESS_EVENT_TYPES.RECORD_CREATED,
      workspaceId: 'ws-1',
      source: BUSINESS_EVENT_SOURCES.RECORD_COMMAND,
      actor: { actorType: 'USER', actorId: 'user-1' },
      objectReference: { type: 'RECORD', id: 'rec-1', workspaceId: 'ws-1' },
      payload: { recordId: 'rec-1' },
      idempotencyKey: 'op-x',
    });
    expect(ev.eventId).toBe('be_op_x.record.created');
    expect(ev.eventType).toBe('record.created');
    expect(ev.workspaceId).toBe('ws-1');
  });

  it('rejects unknown event types, missing idempotency, unscoped references', () => {
    const base = {
      eventId: 'be_1',
      eventType: BUSINESS_EVENT_TYPES.RECORD_CREATED,
      workspaceId: 'ws',
      source: BUSINESS_EVENT_SOURCES.RECORD_COMMAND,
      idempotencyKey: 'op',
    };
    expect(() => createBusinessEvent({ ...base, eventType: 'not.a.type' })).toThrow(/Unknown BusinessEvent type/);
    expect(() => createBusinessEvent({ ...base, idempotencyKey: '' })).toThrow(/idempotencyKey/);
    expect(() => createBusinessEvent({ ...base, objectReference: { type: 'RECORD', id: 'r', workspaceId: 'other-ws' } })).toThrow(/same Workspace/);
  });

  it('sanitizes identity out of intermediate business data before writing', () => {
    const dirty = { password: 'x', token: 'y', apiKey: 'z', payload: { note: 'ok' } };
    const clean = sanitizeBusinessEventInput(dirty);
    expect(clean.password).toBeUndefined();
    expect(clean.token).toBeUndefined();
    expect(clean.apiKey).toBeUndefined();
    expect(clean.payload).toEqual({ note: 'ok' });
    expect(clean.payload !== dirty.payload).toBe(true);
  });

  it('identity is immutable and deterministic', () => {
    const a = businessEventIdFor('op-1', BUSINESS_EVENT_TYPES.RECORD_CREATED);
    const b = businessEventIdFor('op-1', BUSINESS_EVENT_TYPES.RECORD_CREATED);
    const c = businessEventIdFor('op-2', BUSINESS_EVENT_TYPES.RECORD_CREATED);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});
