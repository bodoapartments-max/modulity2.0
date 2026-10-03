import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { executeRecordCommand } from './recordCommandEngine.js';

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
    collection(db, id) { return makeRef(db, `${path}/${id}`); },
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

function createMutex() {
  let lock = Promise.resolve();
  return async function acquire() {
    let release;
    const next = new Promise((resolve) => { release = resolve; });
    const prev = lock;
    lock = lock.then(() => next);
    await prev;
    return release;
  };
}

function createFakeDb(seed = {}) {
  const docs = new Map();
  for (const [key, value] of Object.entries(seed)) docs.set(key, clone(value));
  const listeners = [];
  const mutex = createMutex();

  function docPath(ref) {
    return ref.path || ref.segments.join('/');
  }

  function normalizeServerTimestamps(value) {
    const now = Timestamp.now();
    if (value === FieldValue.serverTimestamp()) return now;
    if (value && typeof value === 'object') {
      for (const k of Object.keys(value)) value[k] = normalizeServerTimestamps(value[k]);
    }
    return value;
  }

  const db = {
    _docs: docs,
    doc(path) { return makeRef(db, path); },
    collection(path) {
      return {
        path,
        doc: (id) => makeRef(db, `${path}/${id}`),
        add: async (data) => {
          const id = `gen_${Math.random().toString(36).slice(2, 11)}`;
          docs.set(`${path}/${id}`, clone(normalizeServerTimestamps(data)));
          return { id };
        },
      };
    },
    async runTransaction(fn) {
      const release = await mutex();
      try {
      const reads = new Map();
      const writes = [];
      const tx = {
        async get(ref) {
          const p = docPath(ref);
          if (!reads.has(p)) {
            const data = docs.has(p) ? clone(docs.get(p)) : undefined;
            reads.set(p, data);
          }
          return new FakeSnap(p.split('/').pop(), reads.get(p));
        },
        set(ref, data) { writes.push({ path: docPath(ref), op: 'set', data: clone(data) }); },
        update(ref, data) { writes.push({ path: docPath(ref), op: 'update', data: clone(data) }); },
      };
      const result = await fn(tx);
      for (const w of writes) {
        const normalized = normalizeServerTimestamps(clone(w.data));
        if (w.op === 'set') {
          docs.set(w.path, normalized);
        } else {
          const existing = docs.get(w.path) || {};
          docs.set(w.path, { ...existing, ...normalized });
        }
      }
      for (const listener of listeners) listener();
      return result;
      } finally {
        release();
      }
    },
  };
  return db;
}

function makeCommand(overrides = {}) {
  return {
    contractVersion: '1.0.0',
    operationId: 'op-test-1',
    commandType: 'CREATE_RECORD',
    payload: {
      workspaceId: 'ws-1',
      moduleId: 'mod-1',
      values: { summary: 'Test' },
      isDraft: false,
      ...overrides.payload,
    },
    ...overrides,
  };
}

function seed() {
  return {
    'workspaces/ws-1': { workspaceId: 'ws-1', type: 'PERSONAL', ownerUserId: 'user-1' },
    'workspaces/ws-1/modules/mod-1': {
      moduleId: 'mod-1', workspaceId: 'ws-1', status: 'ACTIVE', version: 1,
      moduleCode: 'TEST_MOD',
      formSchema: { schemaVersion: '1.0.0', fields: [{ key: 'summary', label: 'Summary', type: 'text', required: true }] },
    },
    'workspaces/ws-1/modules/mod-1/versions/1': {
      moduleId: 'mod-1', workspaceId: 'ws-1', version: 1,
      formSchema: { schemaVersion: '1.0.0', fields: [{ key: 'summary', label: 'Summary', type: 'text', required: true }] },
    },
  };
}

describe('executeRecordCommand', () => {
  it('creates a canonical Record', async () => {
    const db = createFakeDb(seed());
    const result = await executeRecordCommand(db, { userId: 'user-1', command: makeCommand() });
    assert.equal(result.record.workspaceId, 'ws-1');
    assert.equal(result.record.moduleId, 'mod-1');
    assert.equal(result.record.status, 'SUBMITTED');
    assert.equal(result.idempotent, false);
  });

  it('returns the same Record on retry with same operationId', async () => {
    const db = createFakeDb(seed());
    const cmd = makeCommand();
    const first = await executeRecordCommand(db, { userId: 'user-1', command: cmd });
    const second = await executeRecordCommand(db, { userId: 'user-1', command: cmd });
    assert.equal(second.record.recordId, first.record.recordId);
    assert.equal(second.idempotent, true);
  });

  it('rejects same operationId with different command', async () => {
    const db = createFakeDb(seed());
    const first = makeCommand();
    await executeRecordCommand(db, { userId: 'user-1', command: first });
    const second = makeCommand({ payload: { moduleId: 'mod-1', workspaceId: 'ws-1', values: { summary: 'Changed' } } });
    await assert.rejects(
      () => executeRecordCommand(db, { userId: 'user-1', command: second }),
      (err) => err.message.includes('command mismatch') && err.details && err.details.code === 'OPERATION_MISMATCH',
    );
  });

  it('reports in-progress when a valid PROCESSING lease exists', async () => {
    const db = createFakeDb(seed());
    const cmd = makeCommand({ operationId: 'op-live' });
    await executeRecordCommand(db, { userId: 'user-1', command: cmd });
    // Manually revert op to PROCESSING with a future lease
    const op = (await db.doc('workspaces/ws-1/recordOperations/op-live').get()).data();
    op.status = 'PROCESSING';
    op.leaseExpiresAt = Timestamp.fromMillis(Date.now() + 60_000);
    db._docs.set('workspaces/ws-1/recordOperations/op-live', op);

    await assert.rejects(
      () => executeRecordCommand(db, { userId: 'user-1', command: cmd }),
      (err) => err.message.includes('already being processed') && err.details && err.details.code === 'OPERATION_IN_PROGRESS',
    );
  });

  it('recovers a stale PROCESSING operation when Record already exists', async () => {
    const db = createFakeDb(seed());
    const cmd = makeCommand({ operationId: 'op-recover-existing' });
    await executeRecordCommand(db, { userId: 'user-1', command: cmd });
    const firstRecordId = (await db.doc('workspaces/ws-1/recordOperations/op-recover-existing').get()).data().recordId;

    // Reset op to PROCESSING with expired lease, leave Record in place
    const op = (await db.doc('workspaces/ws-1/recordOperations/op-recover-existing').get()).data();
    op.status = 'PROCESSING';
    op.leaseExpiresAt = Timestamp.fromMillis(Date.now() - 1_000);
    db._docs.set('workspaces/ws-1/recordOperations/op-recover-existing', op);

    const result = await executeRecordCommand(db, { userId: 'user-1', command: cmd });
    assert.equal(result.record.recordId, firstRecordId);
    assert.equal(result.idempotent, true);
    assert.equal(db._docs.get('workspaces/ws-1/recordOperations/op-recover-existing').status, 'COMPLETED');
  });

  it('recovers a stale PROCESSING operation when Record does not exist', async () => {
    const db = createFakeDb(seed());
    const cmd = makeCommand({ operationId: 'op-recover-missing' });
    // Execute once normally to compute fingerprint and create the operation entry.
    const normal = await executeRecordCommand(db, { userId: 'user-1', command: cmd });
    const recordId = normal.record.recordId;
    // Reset: op PROCESSING + no record.
    db._docs.delete(`workspaces/ws-1/records/${recordId}`);
    const op = (await db.doc('workspaces/ws-1/recordOperations/op-recover-missing').get()).data();
    op.status = 'PROCESSING';
    op.leaseExpiresAt = Timestamp.fromMillis(Date.now() - 1_000);
    db._docs.set('workspaces/ws-1/recordOperations/op-recover-missing', op);

    const result = await executeRecordCommand(db, { userId: 'user-1', command: cmd });
    assert.equal(result.record.recordId, recordId);
  });

  it('rejects DRAFT Module submission', async () => {
    const s = seed();
    s['workspaces/ws-1/modules/mod-1'].status = 'DRAFT';
    const db = createFakeDb(s);
    await assert.rejects(
      () => executeRecordCommand(db, { userId: 'user-1', command: makeCommand() }),
      (err) => err.message.includes('DRAFT') && err.message.includes('ACTIVE'),
    );
  });

  it('produces exactly one Record for concurrent duplicate requests with the same operationId', async () => {
    const db = createFakeDb(seed());
    const cmd = makeCommand({ operationId: 'op-concurrent-1' });
    const results = await Promise.all(Array.from({ length: 10 }, () =>
      executeRecordCommand(db, { userId: 'user-1', command: clone(cmd) }),
    ));
    const recordIds = results.map((r) => r.record.recordId);
    const uniqueRecordIds = new Set(recordIds);
    assert.equal(uniqueRecordIds.size, 1, 'all concurrent callers must resolve to the same Record');
    assert.equal(results.filter((r) => r.idempotent).length, 9, 'subsequent callers should be idempotent');
  });
});
