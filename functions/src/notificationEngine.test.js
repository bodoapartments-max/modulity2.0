import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { processNotificationIntent } from './notificationEngine.js';

function clone(v) {
  return typeof v === 'object' && v !== null ? JSON.parse(JSON.stringify(v, replacer), reviver) : v;
}
function replacer(_key, value) {
  if (value instanceof Timestamp) return { __ts: value.toMillis() };
  if (value === FieldValue.serverTimestamp()) return { __sv: true };
  return value;
}
function reviver(_key, value) {
  if (value && typeof value === 'object') {
    if (value.__ts) return Timestamp.fromMillis(value.__ts);
    if (value.__sv) return FieldValue.serverTimestamp();
  }
  return value;
}
function makeRef(db, path) {
  return {
    path,
    segments: path.split('/').filter(Boolean),
    async get() {
      const data = db._docs.has(path) ? clone(db._docs.get(path)) : undefined;
      return new FakeSnap(path.split('/').pop(), data);
    },
    async set(data) { db._docs.set(path, clone(data)); },
    collection(db2, id) { return makeRef(db2, `${path}/${id}`); },
    doc(id) { return makeRef(db, `${path}/${id}`); },
    parent: null,
  };
}
class FakeSnap {
  constructor(id, data) {
    this.id = id;
    this.exists = data !== undefined && data !== null;
    this._data = data;
  }
  data() { return clone(this._data); }
}
function createFakeDb(seed = {}) {
  const docs = new Map();
  for (const [key, value] of Object.entries(seed)) docs.set(key, clone(value));
  return {
    _docs: docs,
    doc(path) { return makeRef(this, path); },
  };
}

function seedPersonal() {
  return { 'workspaces/ws-1': { workspaceId: 'ws-1', type: 'PERSONAL', ownerUserId: 'user-1' } };
}

function intentFor(overrides = {}) {
  return {
    eventType: 'record.created',
    workspaceId: 'ws-1',
    actorUserId: 'user-1',
    operationId: 'op-notif-1',
    contextReference: { type: 'RECORD', id: 'rec-1', workspaceId: 'ws-1' },
    ...overrides,
  };
}

function notificationDocs(db) {
  return [...db._docs.entries()].filter(([key]) => key.includes('notifications'));
}

describe('processNotificationIntent', () => {
  it('creates one canonical IN_APP notification for the actor', async () => {
    const db = createFakeDb(seedPersonal());
    const results = await processNotificationIntent(db, intentFor());
    assert.equal(results.length, 1);
    const [docPath, doc] = notificationDocs(db)[0];
    assert.ok(docPath.includes('op_op-notif-1_record.created_user-1'));
    assert.equal(doc.recipientUserId, 'user-1');
    assert.equal(doc.status, 'UNREAD');
    assert.equal(doc.type, 'RECORD_CREATED');
    assert.equal(doc.title, 'Record created');
    assert.equal(doc.resourceType, 'RECORD');
    assert.equal(doc.resourceId, 'rec-1');
    assert.equal(doc.actionUrl, '/app/records/rec-1');
    assert.equal(doc.contextReference.type, 'RECORD');
    assert.equal(doc.metadata.operationId, 'op-notif-1');
  });

  it('10 retries of the same operation produce exactly one notification and never reset read state', async () => {
    const db = createFakeDb(seedPersonal());
    for (let i = 0; i < 10; i++) {
      await processNotificationIntent(db, intentFor());
    }
    assert.equal(notificationDocs(db).length, 1);
    // Simulate the user having read it: retry must not reset status
    const [path] = notificationDocs(db)[0];
    const existing = db._docs.get(path);
    existing.status = 'READ';
    db._docs.set(path, existing);
    await processNotificationIntent(db, intentFor());
    assert.equal(db._docs.get(path).status, 'READ');
  });

  it('two distinct operations produce two notifications', async () => {
    const db = createFakeDb(seedPersonal());
    await processNotificationIntent(db, intentFor());
    await processNotificationIntent(db, intentFor({ operationId: 'op-notif-2', contextReference: { type: 'RECORD', id: 'rec-2', workspaceId: 'ws-1' } }));
    assert.equal(notificationDocs(db).length, 2);
  });

  it('recipient access is verified — a forged recipient outside the workspace is skipped', async () => {
    const db = createFakeDb(seedPersonal());
    const results = await processNotificationIntent(db, {
      ...intentFor(),
      recipientStrategy: { type: 'EXPLICIT_USER', userId: 'user-2' },
    });
    assert.equal(results[0].skipped, true);
    assert.equal(notificationDocs(db).length, 0);
  });

  it('organization: only active members can receive', async () => {
    const db = createFakeDb({
      'workspaces/ws-1': { workspaceId: 'ws-1', type: 'ORGANIZATION', organizationId: 'org-1' },
      'organizations/org-1/members/user-2': { userId: 'user-2', status: 'ACTIVE' },
      'organizations/org-1/members/user-3': { userId: 'user-3', status: 'LEFT' },
    });
    const allowed = await processNotificationIntent(db, {
      ...intentFor(),
      recipientStrategy: { type: 'EXPLICIT_USER', userId: 'user-2' },
    });
    assert.equal(notificationDocs(db).length, 1);
    assert.equal(allowed[0].skipped, undefined);

    const db2 = createFakeDb({
      'workspaces/ws-1': { workspaceId: 'ws-1', type: 'ORGANIZATION', organizationId: 'org-1' },
      'organizations/org-1/members/user-3': { userId: 'user-3', status: 'LEFT' },
    });
    const rejected = await processNotificationIntent(db2, {
      ...intentFor(),
      recipientStrategy: { type: 'EXPLICIT_USER', userId: 'user-3' },
    });
    assert.equal(rejected[0].skipped, true);
    assert.equal(notificationDocs(db2).length, 0);
  });

  it('EXPLICIT_USER with excludeActorRecipient suppresses a redundant self-notification', async () => {
    const db = createFakeDb(seedPersonal());
    await processNotificationIntent(db, {
      ...intentFor(),
      recipientStrategy: { type: 'EXPLICIT_USER', userId: 'user-1' },
      excludeActorRecipient: true,
    });
    assert.equal(notificationDocs(db).length, 0);
  });

  it('rejects intents carrying forged authority fields', async () => {
    const db = createFakeDb(seedPersonal());
    await assert.rejects(
      () => processNotificationIntent(db, intentFor({ actorUserId: 'user-1', recipientUserId: 'user-2' })),
      /server-authoritative/,
    );
  });

  it('rejects intents with cross-workspace context reference', async () => {
    const db = createFakeDb(seedPersonal());
    await assert.rejects(
      () => processNotificationIntent(db, intentFor({ contextReference: { type: 'RECORD', id: 'rec-1', workspaceId: 'other-ws' } })),
      /must match/,
    );
  });

  it('events without a registered template produce no notification (deliberate silence)', async () => {
    const db = createFakeDb(seedPersonal());
    const results = await processNotificationIntent(db, intentFor({ eventType: 'record.priority_changed' }));
    void results;
    assert.equal(notificationDocs(db).length, 0);
  });
});
