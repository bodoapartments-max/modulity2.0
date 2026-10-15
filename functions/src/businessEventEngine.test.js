import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { planBusinessEventEmission, eventDocWrite } from './businessEventEngine.js';
import { createFakeDb } from './fakeDbHarness.js';

describe('businessEventEngine trusted emission', () => {
  it('emits deterministic events inside an existing transaction', async () => {
    const db = createFakeDb({
      'workspaces/ws-1': { workspaceId: 'ws-1', type: 'PERSONAL', ownerUserId: 'u1' },
      'workspaces/ws-1/businessEvents/be_op-1.record.created': {
        workspaceId: 'ws-1',
        eventType: 'record.created',
        source: 'recordCommand',
        actor: { actorType: 'USER', actorId: 'u1' },
      },
    });

    // Same idempotency key re-emitted through plan+write = the event stays unique.
    const planA = planBusinessEventEmission(db, {
      eventType: 'record.created',
      workspaceId: 'ws-1',
      source: 'recordCommand',
      actor: { actorType: 'USER', actorId: 'u1' },
      objectReference: { type: 'RECORD', id: 'rec-1', workspaceId: 'ws-1' },
      payload: { recordId: 'rec-1' },
      idempotencyKey: 'op-1',
    });
    await db.runTransaction(async (tx) => {
      eventDocWrite(tx, db, {
        eventType: 'record.created',
        workspaceId: 'ws-1',
        source: 'recordCommand',
        actor: { actorType: 'USER', actorId: 'u1' },
        objectReference: { type: 'RECORD', id: 'rec-1', workspaceId: 'ws-1' },
        payload: { recordId: 'rec-1' },
        idempotencyKey: 'op-1',
      });
      // retry — same op id, same outcome: event stays single-authored.
      const planB = planBusinessEventEmission(db, {
        eventType: 'record.created',
        workspaceId: 'ws-1',
        source: 'recordCommand',
        actor: { actorType: 'USER', actorId: 'u1' },
        objectReference: { type: 'RECORD', id: 'rec-1', workspaceId: 'ws-1' },
        payload: { recordId: 'rec-1' },
        idempotencyKey: 'op-1',
      });
      assert.equal(planB.eventId, planA.eventId);
      assert.equal(planB.eventRef.path, planA.eventRef.path);
    });
  });

  it('rejects untrusted source kinds', () => {
    const db = createFakeDb();
    assert.throws(() => planBusinessEventEmission(db, {
      eventType: 'record.created', workspaceId: 'ws', source: 'USER_RAW', idempotencyKey: 'op',
    }), (err) => String(err.message || '').toLowerCase().includes('untrusted'));
  });
});
