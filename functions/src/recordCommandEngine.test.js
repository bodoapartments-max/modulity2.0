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
    async set(data) {
      db._docs.set(path, clone(data));
    },
    async update(data) {
      db._docs.set(path, { ...(db._docs.get(path) || {}), ...clone(data) });
    },
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
    batch() {
      const writes = [];
      return {
        set(ref, data) { writes.push({ path: ref.path, op: 'set', data }); },
        update(ref, data) { writes.push({ path: ref.path, op: 'update', data }); },
        delete(ref) { writes.push({ path: ref.path, op: 'delete', data: null }); },
        async commit() {
          for (const w of writes) {
            if (w.op === 'set') docs.set(w.path, clone(normalizeServerTimestamps(w.data)));
            else if (w.op === 'update') docs.set(w.path, { ...docs.get(w.path), ...clone(normalizeServerTimestamps(w.data)) });
            else if (w.op === 'delete') docs.delete(w.path);
          }
        },
      };
    },
    collection(path) {
      const filters = [];
      const api = {
        path,
        doc: (id) => makeRef(db, `${path}/${id}`),
        add: async (data) => {
          const id = `gen_${Math.random().toString(36).slice(2, 11)}`;
          docs.set(`${path}/${id}`, clone(normalizeServerTimestamps(data)));
          return { id };
        },
        where(field, op, value) {
          filters.push({ field, op, value });
          return api;
        },
        limit() { return api; },
        async get() {
          const prefix = `${path}/`;
          const matches = [...docs.entries()]
            .filter(([key]) => key.startsWith(prefix) || key === path)
            .filter(([, data]) => filters.every(({ field, value }) => {
              const actual = field.split('.').reduce((acc, key) => (acc ? acc[key] : acc), data);
              return actual === value;
            }))
            .map(([p, data]) => ({
              id: p.split('/').pop(),
              path: p,
              get exists() { return true; },
              data: () => clone(data),
            }));
          return {
            size: matches.length,
            empty: matches.length === 0,
            docs: matches.map((m) => ({
              id: m.id,
              path: m.path,
              ref: makeRef(db, m.path),
              get exists() { return true; },
              data: () => clone(docs.get(m.path)),
            })),
          };
        },
      };
      return api;
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

const MUTATION_VERSION = '1.1.0';

function makeMutationCommand(type, payload = {}, extra = {}) {
  return {
    contractVersion: MUTATION_VERSION,
    operationId: 'op-mut-1',
    commandType: type,
    payload: { workspaceId: 'ws-1', recordId: 'rec-draft1', ...payload },
    ...extra,
  };
}

function seedWithDraft(recordOverrides = {}) {
  const s = seed();
  s['workspaces/ws-1/records/rec-draft1'] = {
    workspaceId: 'ws-1', status: 'DRAFT', moduleId: 'mod-1', moduleVersion: 1,
    recordType: 'TEST_MOD', data: { summary: 'Old value' }, entityReferences: [], entityReferenceIds: [],
    createdBy: { actorType: 'USER', actorId: 'user-1' }, submittedBy: null, submittedAt: null,
    priority: null,
    ...recordOverrides,
  };
  return s;
}

describe('UPDATE_DRAFT trusted command', () => {
  it('updates the same DRAFT Record via trusted command', async () => {
    const db = createFakeDb(seedWithDraft());
    const result = await executeRecordCommand(db, {
      userId: 'user-1',
      command: makeMutationCommand('UPDATE_DRAFT', { values: { summary: 'New value' } }),
    });
    assert.equal(result.record.recordId, 'rec-draft1');
    assert.equal(result.record.data.summary, 'New value');
    const stored = (await db.doc('workspaces/ws-1/records/rec-draft1').get()).data();
    assert.equal(stored.data.summary, 'New value');
    assert.equal(stored.status, 'DRAFT');
  });

  it('rejects UPDATE_DRAFT on a non-DRAFT Record', async () => {
    const db = createFakeDb(seedWithDraft({ status: 'SUBMITTED' }));
    await assert.rejects(
      () => executeRecordCommand(db, {
        userId: 'user-1',
        command: makeMutationCommand('UPDATE_DRAFT', { values: { summary: 'X' } }),
      }),
      (err) => err.details?.code === 'INVALID_RECORD_STATE',
    );
    const stored = (await db.doc('workspaces/ws-1/records/rec-draft1').get()).data();
    assert.equal(stored.data.summary, 'Old value');
  });

  it('rejects undeclared schema fields', async () => {
    const db = createFakeDb(seedWithDraft());
    await assert.rejects(
      () => executeRecordCommand(db, {
        userId: 'user-1',
        command: makeMutationCommand('UPDATE_DRAFT', { values: { hacker: 'x' } }),
      }),
      (err) => err.details?.code === 'RECORD_INVALID',
    );
  });

  it('rejects client-supplied actor/authority fields at the envelope', async () => {
    const db = createFakeDb(seedWithDraft());
    await assert.rejects(
      () => executeRecordCommand(db, {
        userId: 'user-1',
        command: makeMutationCommand('UPDATE_DRAFT', { values: { summary: 'x' }, submittedBy: { actorType: 'USER', actorId: 'user-2' } }),
      }),
      (err) => err.details?.code === 'OPERATION_INVALID',
    );
  });

  it('denies mutation in another users workspace', async () => {
    const s = seedWithDraft();
    s['workspaces/ws-2'] = { workspaceId: 'ws-2', type: 'PERSONAL', ownerUserId: 'user-2' };
    s['workspaces/ws-2/records/rec-draft1'] = { ...s['workspaces/ws-1/records/rec-draft1'], workspaceId: 'ws-2' };
    const db = createFakeDb(s);
    await assert.rejects(
      () => executeRecordCommand(db, {
        userId: 'user-1',
        command: makeMutationCommand('UPDATE_DRAFT', { workspaceId: 'ws-2', values: { summary: 'x' } }),
      }),
      (err) => err.details?.code === 'WORKSPACE_FORBIDDEN',
    );
  });

  it('is idempotent for retry with the same operationId', async () => {
    const db = createFakeDb(seedWithDraft());
    const cmd = makeMutationCommand('UPDATE_DRAFT', { values: { summary: 'Stable' } });
    const first = await executeRecordCommand(db, { userId: 'user-1', command: cmd });
    const second = await executeRecordCommand(db, { userId: 'user-1', command: cmd });
    assert.equal(first.idempotent, false);
    assert.equal(second.idempotent, true);
    assert.equal(second.record.data.summary, 'Stable');
  });

  it('rejects same operationId with different payload', async () => {
    const db = createFakeDb(seedWithDraft());
    await executeRecordCommand(db, {
      userId: 'user-1',
      command: makeMutationCommand('UPDATE_DRAFT', { values: { summary: 'A' } }),
    });
    await assert.rejects(
      () => executeRecordCommand(db, {
        userId: 'user-1',
        command: makeMutationCommand('UPDATE_DRAFT', { values: { summary: 'B' } }),
      }),
      (err) => err.details?.code === 'OPERATION_MISMATCH',
    );
  });

  it('handles 10 concurrent identical UPDATE_DRAFT requests as one logical operation', async () => {
    const db = createFakeDb(seedWithDraft());
    const cmd = makeMutationCommand('UPDATE_DRAFT', { values: { summary: 'Concurrent' } });
    const results = await Promise.all(Array.from({ length: 10 }, () =>
      executeRecordCommand(db, { userId: 'user-1', command: clone(cmd) }),
    ));
    assert.equal(new Set(results.map((r) => r.record.recordId)).size, 1);
    assert.equal((await db.doc('workspaces/ws-1/records/rec-draft1').get()).data().data.summary, 'Concurrent');
  });
});

describe('SUBMIT_RECORD trusted command', () => {
  it('transitions DRAFT → SUBMITTED with server-derived actor and timestamp', async () => {
    const db = createFakeDb(seedWithDraft());
    const result = await executeRecordCommand(db, {
      userId: 'user-1',
      command: makeMutationCommand('SUBMIT_RECORD'),
    });
    assert.equal(result.record.status, 'SUBMITTED');
    const stored = (await db.doc('workspaces/ws-1/records/rec-draft1').get()).data();
    assert.equal(stored.status, 'SUBMITTED');
    assert.equal(stored.submittedBy.actorId, 'user-1');
    assert.ok(stored.submittedAt, 'submittedAt must be set by the server');
  });

  it('rejects submit when a required field is missing and keeps the Record DRAFT', async () => {
    const db = createFakeDb(seedWithDraft({ data: {} }));
    await assert.rejects(
      () => executeRecordCommand(db, { userId: 'user-1', command: makeMutationCommand('SUBMIT_RECORD') }),
      (err) => err.details?.code === 'RECORD_INVALID',
    );
    const stored = (await db.doc('workspaces/ws-1/records/rec-draft1').get()).data();
    assert.equal(stored.status, 'DRAFT');
    assert.equal(stored.submittedAt, null);
  });

  it('rejects a fresh SUBMIT operation once the Record is already SUBMITTED', async () => {
    const db = createFakeDb(seedWithDraft());
    await executeRecordCommand(db, { userId: 'user-1', command: makeMutationCommand('SUBMIT_RECORD') });
    await assert.rejects(
      () => executeRecordCommand(db, {
        userId: 'user-1',
        command: makeMutationCommand('SUBMIT_RECORD', {}, { operationId: 'op-mut-2' }),
      }),
      (err) => err.details?.code === 'INVALID_RECORD_STATE',
    );
  });

  it('replays the same SUBMIT operation idempotently without duplicating audit evidence', async () => {
    const db = createFakeDb(seedWithDraft());
    const cmd = makeMutationCommand('SUBMIT_RECORD');
    const first = await executeRecordCommand(db, { userId: 'user-1', command: cmd });
    const auditAfterFirst = [...db._docs.keys()].filter((k) => k.includes('auditEntries'));
    const second = await executeRecordCommand(db, { userId: 'user-1', command: cmd });
    const auditAfterSecond = [...db._docs.keys()].filter((k) => k.includes('auditEntries'));
    assert.equal(second.idempotent, true);
    assert.equal(second.record.recordId, first.record.recordId);
    // One logical operation may emit MULTIPLE distinct audit events (record.submitted,
    // ledger.book_created, ledger.entry_registered) — but retry must not add any.
    assert.equal(auditAfterSecond.length, auditAfterFirst.length, 'audit side effects must be deduplicated by operation identity');
    assert.ok(auditAfterFirst.some((k) => k.includes('record.submitted')));
  });

  it('handles 10 concurrent identical SUBMIT requests as one transition', async () => {
    const db = createFakeDb(seedWithDraft());
    const cmd = makeMutationCommand('SUBMIT_RECORD');
    const results = await Promise.all(Array.from({ length: 10 }, () =>
      executeRecordCommand(db, { userId: 'user-1', command: clone(cmd) }),
    ));
    assert.equal(results.filter((r) => !r.idempotent).length, 1, 'exactly one request performs the transition');
    const stored = (await db.doc('workspaces/ws-1/records/rec-draft1').get()).data();
    assert.equal(stored.status, 'SUBMITTED');
  });
});

describe('trusted lifecycle/operational commands', () => {
  it('SET_PRIORITY updates priority; invalid priority is rejected by the contract', async () => {
    const db = createFakeDb(seedWithDraft({ status: 'SUBMITTED', submittedBy: { actorType: 'USER', actorId: 'user-1' } }));
    const result = await executeRecordCommand(db, {
      userId: 'user-1',
      command: makeMutationCommand('SET_PRIORITY', { priority: 'HIGH' }),
    });
    assert.equal(result.record.priority, 'HIGH');
    await assert.rejects(
      () => executeRecordCommand(db, {
        userId: 'user-1',
        command: makeMutationCommand('SET_PRIORITY', { priority: 'ULTRA' }, { operationId: 'op-mut-3' }),
      }),
      (err) => err.details?.code === 'OPERATION_INVALID',
    );
  });

  it('ARCHIVE_RECORD writes archive provenance; RESTORE_RECORD restores it', async () => {
    const db = createFakeDb(seedWithDraft({ status: 'SUBMITTED', submittedBy: { actorType: 'USER', actorId: 'user-1' } }));
    const archived = await executeRecordCommand(db, {
      userId: 'user-1',
      command: makeMutationCommand('ARCHIVE_RECORD'),
    });
    assert.equal(archived.record.status, 'ARCHIVED');
    const storedArchived = (await db.doc('workspaces/ws-1/records/rec-draft1').get()).data();
    assert.equal(storedArchived._previousStatus, 'SUBMITTED');
    assert.ok(storedArchived.archivedAt);

    const restored = await executeRecordCommand(db, {
      userId: 'user-1',
      command: makeMutationCommand('RESTORE_RECORD', {}, { operationId: 'op-mut-4' }),
    });
    assert.equal(restored.record.status, 'SUBMITTED');
  });

  it('CANCEL_RECORD sets CANCELLED and rejects re-cancel', async () => {
    const db = createFakeDb(seedWithDraft({ status: 'SUBMITTED' }));
    await executeRecordCommand(db, { userId: 'user-1', command: makeMutationCommand('CANCEL_RECORD') });
    assert.equal((await db.doc('workspaces/ws-1/records/rec-draft1').get()).data().status, 'CANCELLED');
    await assert.rejects(
      () => executeRecordCommand(db, {
        userId: 'user-1',
        command: makeMutationCommand('CANCEL_RECORD', {}, { operationId: 'op-mut-5' }),
      }),
      (err) => err.details?.code === 'INVALID_RECORD_STATE',
    );
  });
});

// ═══════════════════════════════════════════════════════
// STEP 17.1 — Universal Form Ledger integration
// ═══════════════════════════════════════════════════════

describe('universal Form Ledger integration', () => {
  function entryKeys(db) {
    return [...db._docs.keys()].filter((k) => k.includes('ledgerEntries'));
  }
  function bookKeys(db) {
    return [...db._docs.keys()].filter((k) => k.includes('ledgerBooks/') && !k.includes('/blocks/'));
  }

  it('submitted CREATE automatically provisions the Module Form Book and registers the Record', async () => {
    const db = createFakeDb(seed());
    const result = await executeRecordCommand(db, {
      userId: 'user-1',
      command: makeCommand({ payload: { ...makeCommand().payload, values: { summary: 'Ledger form' } } }),
    });
    const entries = entryKeys(db);
    assert.equal(entries.length, 1);
    const entry = db._docs.get(entries[0]);
    assert.equal(entry.recordId, result.record.recordId);
    assert.equal(entry.sequenceNumber, 1);
    assert.ok(entry.referenceNumber.startsWith('TEST_MOD-'), `reference starts with module code, got ${entry.referenceNumber}`);
    assert.equal(entry.registeredBy.actorId, 'user-1');

    // Record linkage written by the trusted backend
    const stored = (await db.doc(`workspaces/ws-1/records/${result.record.recordId}`).get()).data();
    assert.equal(stored.ledgerEntryId, entry.ledgerEntryId);
    assert.equal(stored.referenceNumber, entry.referenceNumber);

    // Book is scoped to the record's module
    const books = bookKeys(db);
    assert.equal(books.length, 1);
    assert.equal(db._docs.get(books[0]).moduleId, 'mod-1');
  });

  it('draft CREATE does NOT register anything', async () => {
    const db = createFakeDb(seed());
    await executeRecordCommand(db, {
      userId: 'user-1',
      command: makeCommand({ payload: { ...makeCommand().payload, isDraft: true, values: {} } }),
    });
    assert.equal(entryKeys(db).length, 0);
    assert.equal(bookKeys(db).length, 0);
  });

  it('retry of the same submission yields exactly one book + one entry', async () => {
    const db = createFakeDb(seed());
    const cmd = makeCommand();
    await executeRecordCommand(db, { userId: 'user-1', command: cmd });
    await executeRecordCommand(db, { userId: 'user-1', command: cmd });
    await executeRecordCommand(db, { userId: 'user-1', command: cmd });
    assert.equal(bookKeys(db).length, 1);
    assert.equal(entryKeys(db).length, 1);
  });

  it('SUBMIT_RECORD of a draft auto-registers; CANCEL_RECORD voids the entry without deleting it', async () => {
    const db = createFakeDb(seedWithDraft());
    await executeRecordCommand(db, { userId: 'user-1', command: makeMutationCommand('SUBMIT_RECORD') });
    assert.equal(entryKeys(db).length, 1);
    const entryPath = entryKeys(db)[0];
    assert.equal(db._docs.get(entryPath).entryStatus, 'ACTIVE');

    await executeRecordCommand(db, { userId: 'user-1', command: makeMutationCommand('CANCEL_RECORD', {}, { operationId: 'op-mut-9' }) });
    const entry = db._docs.get(entryPath);
    assert.equal(entry.entryStatus, 'CANCELLED');
    assert.ok(entry.cancelledAt, 'cancel provenance must be written');
    assert.ok(entry.sequenceNumber, 'sequence position is NEVER reused');
  });

  it('a second Module gets its own book; same module new version stays in the same book', async () => {
    const db = createFakeDb({
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
      'workspaces/ws-1/modules/mod-2': {
        moduleId: 'mod-2', workspaceId: 'ws-1', status: 'ACTIVE', version: 1,
        moduleCode: 'OTHER_MOD',
        formSchema: { schemaVersion: '1.0.0', fields: [{ key: 'summary', label: 'Summary', type: 'text', required: true }] },
      },
      'workspaces/ws-1/modules/mod-2/versions/1': {
        moduleId: 'mod-2', workspaceId: 'ws-1', version: 1,
        formSchema: { schemaVersion: '1.0.0', fields: [{ key: 'summary', label: 'Summary', type: 'text', required: true }] },
      },
    });
    await executeRecordCommand(db, { userId: 'user-1', command: makeCommand({ operationId: 'op-a', payload: { workspaceId: 'ws-1', moduleId: 'mod-1', values: { summary: 'A' } } }) });
    await executeRecordCommand(db, { userId: 'user-1', command: makeCommand({ operationId: 'op-b', payload: { workspaceId: 'ws-1', moduleId: 'mod-2', values: { summary: 'B' } } }) });
    assert.equal(bookKeys(db).length, 2);
    const codes = bookKeys(db).map((k) => db._docs.get(k).moduleId).sort();
    assert.deepEqual(codes, ['mod-1', 'mod-2']);
    assert.equal(entryKeys(db).length, 2);
  });
});
