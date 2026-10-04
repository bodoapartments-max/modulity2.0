import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { executeLedgerCommand } from './ledgerCommandEngine.js';

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
  const mutex = createMutex();
  function docPath(ref) { return ref.path || ref.segments.join('/'); }
  function normalize(value) {
    const now = Timestamp.now();
    if (value === FieldValue.serverTimestamp()) return now;
    if (value && typeof value === 'object') { for (const k of Object.keys(value)) value[k] = normalize(value[k]); }
    return value;
  }
  return {
    _docs: docs,
    doc(path) { return makeRef(this, path); },
    collection(path) {
      const filters = [];
      let orderField = null;
      let orderDir = 'asc';
      let limitCount = Infinity;
      let afterDoc = null;
      const db = this;
      const matches = () => {
        const prefix = `${path}/`;
        let rows = [...docs.entries()]
          .filter(([key]) => key.startsWith(prefix) && key.slice(prefix.length).split('/').length === 1)
          .filter(([, data]) => filters.every(({ field, value }) => {
            const actual = field.split('.').reduce((acc, key) => (acc ? acc[key] : acc), data);
            return actual === value;
          }));
        if (orderField) {
          const val = (data) => {
            const v = data[orderField];
            if (v && typeof v.toMillis === 'function') return v.toMillis();
            if (v && typeof v === 'object' && typeof v._seconds === 'number') return v._seconds * 1000;
            return typeof v === 'number' ? v : Date.parse(v) || 0;
          };
          rows.sort((a, b) => { const d = val(a[1]) - val(b[1]); return orderDir === 'desc' ? -d : d; });
        }
        if (afterDoc) {
          const idx = rows.findIndex(([key]) => key === afterDoc.path || key.endsWith(`/${afterDoc.id}`));
          if (idx >= 0) rows = rows.slice(idx + 1);
        }
        return rows.slice(0, limitCount);
      };
      const api = {
        path,
        doc: (id) => makeRef(db, `${path}/${id}`),
        add: async (data) => {
          const id = `gen_${Math.random().toString(36).slice(2, 11)}`;
          docs.set(`${path}/${id}`, clone(normalize(data)));
          return { id };
        },
        where: (field, op, value) => { filters.push({ field, op, value }); return api; },
        orderBy: (field, dir = 'asc') => { orderField = field; orderDir = dir; return api; },
        limit: (n) => { limitCount = n; return api; },
        startAfter: (snap) => { afterDoc = snap; return api; },
        async get() {
          const rows = matches();
          return {
            size: rows.length,
            empty: rows.length === 0,
            docs: rows.map(([p, data]) => ({
              id: p.split('/').pop(),
              path: p,
              ref: makeRef(db, p),
              get exists() { return true; },
              data: () => clone(data),
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
          const normalized = normalize(clone(w.data));
          if (w.op === 'set') docs.set(w.path, normalized);
          else docs.set(w.path, { ...docs.get(w.path), ...normalized });
        }
        return result;
      } finally {
        release();
      }
    },
  };
}

function bookCommand(overrides = {}) {
  const cmd = {
    contractVersion: '1.0.0',
    operationId: 'op-book-1',
    commandType: 'CREATE_LEDGER_BOOK',
    payload: {
      workspaceId: 'ws-1',
      ledgerCode: 'RESV',
      name: 'Reservation Register',
      description: '',
      blockSize: 3,
      ...overrides.payload,
    },
    ...overrides,
  };
  cmd.payload = { workspaceId: 'ws-1', ledgerCode: 'RESV', name: 'Reservation Register', description: '', blockSize: 3, ...(overrides.payload || {}) };
  return cmd;
}

function registerCommand(recordId, overrides = {}) {
  return {
    contractVersion: '1.0.0',
    operationId: 'op-reg-1',
    commandType: 'REGISTER_LEDGER_ENTRY',
    payload: { workspaceId: 'ws-1', ledgerBookId: 'book-1', recordId, ...overrides.payload },
    ...overrides,
  };
}

function seedModule(id = 'mod-1', extra = {}) {
  return {
    [`workspaces/ws-1/modules/${id}`]: {
      moduleId: id, workspaceId: 'ws-1', name: 'Vehicle Inspection', moduleCode: 'VEHINS',
      status: 'ACTIVE', recordConfig: { recordType: 'TEST' },
      ...extra,
    },
  };
}

function seedWorkspace() {
  return {
    'workspaces/ws-1': { workspaceId: 'ws-1', type: 'PERSONAL', ownerUserId: 'user-1' },
  };
}

function seedSubmittedRecord(id = 'rec-1', extra = {}) {
  return {
    [`workspaces/ws-1/records/${id}`]: {
      workspaceId: 'ws-1', status: 'SUBMITTED', moduleId: 'mod-1', moduleVersion: 1,
      recordType: 'TEST', data: {}, createdBy: { actorType: 'USER', actorId: 'user-1' },
      submittedBy: { actorType: 'USER', actorId: 'user-1' },
      ...extra,
    },
  };
}

function seedBook({ blockSize = 3, currentBlock = { nextSequence: 1, startSequence: 1, endSequence: 3 } } = {}) {
  return {
    'workspaces/ws-1/ledgerBooks/book-1': {
      ledgerBookId: 'book-1', workspaceId: 'ws-1', ledgerCode: 'RESV', name: 'Reservation Register',
      status: 'ACTIVE', numberingStrategy: 'SEQUENTIAL', blockSize, currentBlockId: 'block_1',
      referencePrefix: 'RESV', referenceFormatVersion: 1,
      createdBy: { actorType: 'USER', actorId: 'user-1' },
    },
    'workspaces/ws-1/ledgerBooks/book-1/blocks/block_1': {
      ledgerBlockId: 'block_1', ledgerBookId: 'book-1', workspaceId: 'ws-1',
      blockNumber: 1, status: 'OPEN', capacity: blockSize,
      ...currentBlock,
    },
  };
}

describe('ledgerCommand — CREATE_LEDGER_BOOK', () => {
  it('creates code reservation + book + initial block atomically', async () => {
    const db = createFakeDb(seedWorkspace());
    const result = await executeLedgerCommand(db, { userId: 'user-1', command: bookCommand() });
    assert.equal(result.book.ledgerCode, 'RESV');
    const book = (await db.doc(`workspaces/ws-1/ledgerBooks/${result.book.ledgerBookId}`).get()).data();
    assert.equal(book.currentBlockId, 'block_1');
    assert.ok((await db.doc('workspaces/ws-1/ledgerCodes/RESV').get()).exists);
    const block = (await db.doc(`workspaces/ws-1/ledgerBooks/${result.book.ledgerBookId}/blocks/block_1`).get()).data();
    assert.equal(block.nextSequence, 1);
    assert.equal(block.endSequence, 3);
    const auditKeys = [...db._docs.keys()].filter((k) => k.includes('auditEntries'));
    assert.equal(auditKeys.length, 1);
  });

  it('replay with the same operationId returns the same book (no duplicate)', async () => {
    const db = createFakeDb(seedWorkspace());
    const first = await executeLedgerCommand(db, { userId: 'user-1', command: bookCommand() });
    const second = await executeLedgerCommand(db, { userId: 'user-1', command: bookCommand() });
    assert.equal(second.idempotent, true);
    assert.equal(second.book.ledgerBookId, first.book.ledgerBookId);
    const bookCount = [...db._docs.keys()].filter((k) => k.includes('ledgerBooks/') && !k.includes('/blocks/')).length;
    assert.equal(bookCount, 1);
  });

  it('rejects a reused ledger code under a different operationId', async () => {
    const db = createFakeDb(seedWorkspace());
    await executeLedgerCommand(db, { userId: 'user-1', command: bookCommand() });
    await assert.rejects(
      () => executeLedgerCommand(db, { userId: 'user-1', command: bookCommand({ operationId: 'op-book-2' }) }),
      (err) => err.details?.code === 'CODE_CONFLICT',
    );
  });

  it('rejects invalid ledger code', async () => {
    const db = createFakeDb(seedWorkspace());
    await assert.rejects(
      () => executeLedgerCommand(db, { userId: 'user-1', command: bookCommand({ payload: { ledgerCode: 'not valid!' } }) }),
      (err) => err.details?.code === 'COMMAND_INVALID',
    );
  });

  it('denies non-owner Personal workspace', async () => {
    const db = createFakeDb(seedWorkspace());
    await assert.rejects(
      () => executeLedgerCommand(db, { userId: 'user-2', command: bookCommand() }),
      (err) => err.details?.code === 'WORKSPACE_FORBIDDEN',
    );
  });
});

describe('ledgerCommand — Step 17.1.1 configurable sources + backfill', () => {
  it('creates a USER-provisioned book with a MODULE sourceDefinition', async () => {
    const db = createFakeDb({ ...seedWorkspace(), ...seedModule() });
    const result = await executeLedgerCommand(db, {
      userId: 'user-1',
      command: bookCommand({ payload: { sourceDefinition: { type: 'MODULE', moduleId: 'mod-1' } } }),
    });
    assert.equal(result.book.provisionedBy, 'USER');
    assert.equal(result.book.sourceDefinition.type, 'MODULE');
    assert.equal(result.book.sourceDefinition.moduleId, 'mod-1');
    assert.equal(result.book.moduleId, 'mod-1');
  });

  it('interprets a legacy bare moduleId as a MODULE source', async () => {
    const db = createFakeDb({ ...seedWorkspace(), ...seedModule() });
    const result = await executeLedgerCommand(db, {
      userId: 'user-1',
      command: bookCommand({ payload: { moduleId: 'mod-1' } }),
    });
    assert.equal(result.book.sourceDefinition.type, 'MODULE');
    assert.equal(result.book.moduleId, 'mod-1');
  });

  it('rejects a sourceDefinition referencing a non-existent Module', async () => {
    const db = createFakeDb(seedWorkspace());
    await assert.rejects(
      () => executeLedgerCommand(db, {
        userId: 'user-1',
        command: bookCommand({ payload: { sourceDefinition: { type: 'MODULE', moduleId: 'ghost-mod' } } }),
      }),
      (err) => err.details?.code === 'COMMAND_INVALID',
    );
  });

  it('rejects an unsupported sourceDefinition type at the envelope', async () => {
    const db = createFakeDb(seedWorkspace());
    await assert.rejects(
      () => executeLedgerCommand(db, {
        userId: 'user-1',
        command: bookCommand({ payload: { sourceDefinition: { type: 'ARBITRARY_QUERY', collection: 'records' } } }),
      }),
      (err) => err.details?.code === 'COMMAND_INVALID',
    );
  });

  it('backfills eligible historical evidence in _createdAt order with fresh sequences', async () => {
    const db = createFakeDb({
      ...seedWorkspace(),
      ...seedModule(),
      ...seedSubmittedRecord('rec-old', { _createdAt: '2026-01-01T10:00:00.000Z' }),
      ...seedSubmittedRecord('rec-mid', { _createdAt: '2026-02-01T10:00:00.000Z' }),
      ...seedSubmittedRecord('rec-new', { _createdAt: '2026-03-01T10:00:00.000Z' }),
      ...seedSubmittedRecord('rec-draft', { status: 'DRAFT', submittedBy: null, _createdAt: '2026-04-01T10:00:00.000Z' }),
    });
    const result = await executeLedgerCommand(db, {
      userId: 'user-1',
      command: bookCommand({ payload: { sourceDefinition: { type: 'MODULE', moduleId: 'mod-1' } } }),
    });
    assert.deepEqual(result.backfill, { registered: 3, scanned: 4 });
    const ledgerBookId = result.book.ledgerBookId;
    const entries = await db.collection(`workspaces/ws-1/ledgerEntries`).
      where('ledgerBookId', '==', ledgerBookId).orderBy('sequenceNumber', 'asc').get();
    assert.equal(entries.size, 3);
    assert.deepEqual(entries.docs.map((d) => d.data().recordId), ['rec-old', 'rec-mid', 'rec-new']);
    assert.deepEqual(entries.docs.map((d) => d.data().sequenceNumber), [1, 2, 3]);
    // drafts never become permanent evidence
    assert.equal(entries.docs.every((d) => d.data().recordId !== 'rec-draft'), true);
    // every registration carries authoritative audit rows
    const auditKeys = [...db._docs.keys()].filter((k) => k.includes('auditEntries'));
    assert.equal(auditKeys.length, 4); // 1 book + 3 entries
  });

  it('retried book creation converges backfill without double-consuming sequences', async () => {
    const db = createFakeDb({
      ...seedWorkspace(),
      ...seedModule(),
      ...seedSubmittedRecord('rec-1', { _createdAt: '2026-01-01T10:00:00.000Z' }),
      ...seedSubmittedRecord('rec-2', { _createdAt: '2026-02-01T10:00:00.000Z' }),
    });
    const first = await executeLedgerCommand(db, {
      userId: 'user-1',
      command: bookCommand({ payload: { sourceDefinition: { type: 'MODULE', moduleId: 'mod-1' } } }),
    });
    const second = await executeLedgerCommand(db, {
      userId: 'user-1',
      command: bookCommand({ payload: { sourceDefinition: { type: 'MODULE', moduleId: 'mod-1' } } }),
    });
    assert.equal(second.idempotent, true);
    assert.equal(second.backfill.registered, 2, 'backfill re-runs but converges');
    const block = (await db.doc(`workspaces/ws-1/ledgerBooks/${first.book.ledgerBookId}/blocks/block_1`).get()).data();
    assert.equal(block.nextSequence, 3, 'no second sequence consumption');
    const entries = [...db._docs.keys()].filter((k) => k.includes('ledgerEntries'));
    assert.equal(entries.length, 2);
  });

  it('ensureModuleLedgerBook prefers a USER-provisioned book over the AUTO fallback', async () => {
    const db = createFakeDb({ ...seedWorkspace(), ...seedModule() });
    const created = await executeLedgerCommand(db, {
      userId: 'user-1',
      command: bookCommand({ payload: { sourceDefinition: { type: 'MODULE', moduleId: 'mod-1' }, ledgerCode: 'VEHINS' } }),
    });
    const { ensureModuleLedgerBook } = await import('./ledgerCommandEngine.js');
    const resolved = await ensureModuleLedgerBook(db, {
      workspaceId: 'ws-1',
      module: { moduleId: 'mod-1', name: 'Vehicle Inspection', moduleCode: 'VEHINS' },
      userId: 'user-1',
    });
    assert.equal(resolved.ledgerBookId, created.book.ledgerBookId, 'trusted registration must route into the configured book');
    assert.equal(resolved.provisionedBy, 'USER');
    // no AUTO fallback book was created as a side effect
    const autoKeys = [...db._docs.keys()].filter((k) => k.includes('lb_auto_'));
    assert.equal(autoKeys.length, 0);
  });
});

describe('ledgerCommand — REGISTER_LEDGER_ENTRY', () => {
  it('registers with server-derived sequence, reference, actor and record linkage', async () => {
    const db = createFakeDb({ ...seedWorkspace(), ...seedSubmittedRecord(), ...seedBook() });
    const result = await executeLedgerCommand(db, { userId: 'user-1', command: registerCommand('rec-1') });
    assert.equal(result.entry.sequenceNumber, 1);
    assert.equal(result.entry.referenceNumber, 'RESV-2026-000001');
    assert.equal(result.entry.registeredBy.actorId, 'user-1');
    const rec = (await db.doc('workspaces/ws-1/records/rec-1').get()).data();
    assert.equal(rec.ledgerEntryId, result.entry.ledgerEntryId);
    assert.equal(rec.referenceNumber, 'RESV-2026-000001');
    const block = (await db.doc('workspaces/ws-1/ledgerBooks/book-1/blocks/block_1').get()).data();
    assert.equal(block.nextSequence, 2);
    const auditKeys = [...db._docs.keys()].filter((k) => k.includes('auditEntries'));
    assert.equal(auditKeys.length, 1);
  });

  it('rejects client-supplied sequence/reference fields at the envelope', async () => {
    const db = createFakeDb({ ...seedWorkspace(), ...seedSubmittedRecord(), ...seedBook() });
    await assert.rejects(
      () => executeLedgerCommand(db, {
        userId: 'user-1',
        command: registerCommand('rec-1', { payload: { recordId: 'rec-1', ledgerBookId: 'book-1', sequenceNumber: 99 } }),
      }),
      (err) => err.details?.code === 'COMMAND_INVALID',
    );
  });

  it('rejects DRAFT records as ineligible', async () => {
    const db = createFakeDb({ ...seedWorkspace(), ...seedSubmittedRecord('rec-1', { status: 'DRAFT', submittedBy: null }), ...seedBook() });
    await assert.rejects(
      () => executeLedgerCommand(db, { userId: 'user-1', command: registerCommand('rec-1') }),
      (err) => err.details?.code === 'RECORD_NOT_ELIGIBLE',
    );
  });

  it('same operationId retry returns the same entry/reference (no second number)', async () => {
    const db = createFakeDb({ ...seedWorkspace(), ...seedSubmittedRecord(), ...seedBook() });
    const first = await executeLedgerCommand(db, { userId: 'user-1', command: registerCommand('rec-1') });
    const second = await executeLedgerCommand(db, { userId: 'user-1', command: registerCommand('rec-1') });
    assert.equal(second.idempotent, true);
    assert.equal(second.entry.referenceNumber, first.entry.referenceNumber);
    const block = (await db.doc('workspaces/ws-1/ledgerBooks/book-1/blocks/block_1').get()).data();
    assert.equal(block.nextSequence, 2, 'a replay must not consume a second sequence');
  });

  it('fresh operationId for an already-registered Record returns the existing entry without consuming a sequence', async () => {
    const db = createFakeDb({ ...seedWorkspace(), ...seedSubmittedRecord(), ...seedBook() });
    await executeLedgerCommand(db, { userId: 'user-1', command: registerCommand('rec-1') });
    const second = await executeLedgerCommand(db, { userId: 'user-1', command: registerCommand('rec-1', { operationId: 'op-reg-2' }) });
    assert.equal(second.entry.sequenceNumber, 1);
    const block = (await db.doc('workspaces/ws-1/ledgerBooks/book-1/blocks/block_1').get()).data();
    assert.equal(block.nextSequence, 2);
    const entries = [...db._docs.keys()].filter((k) => k.includes('ledgerEntries'));
    assert.equal(entries.length, 1);
  });

  it('20 concurrent same-record registrations → exactly one entry + one sequence', async () => {
    const db = createFakeDb({ ...seedWorkspace(), ...seedSubmittedRecord(), ...seedBook() });
    const cmd = registerCommand('rec-1');
    const results = await Promise.all(Array.from({ length: 20 }, () =>
      executeLedgerCommand(db, { userId: 'user-1', command: clone(cmd) }),
    ));
    const sequences = new Set(results.map((r) => r.entry.sequenceNumber));
    assert.equal(sequences.size, 1);
    assert.equal([...sequences][0], 1);
    const entries = [...db._docs.keys()].filter((k) => k.includes('ledgerEntries'));
    assert.equal(entries.length, 1);
  });

  it('50 distinct records → 50 unique contiguous sequences with rollover', async () => {
    const db = createFakeDb({
      ...seedWorkspace(),
      ...seedBook({ blockSize: 30 }),
      ...Object.fromEntries(Array.from({ length: 50 }, (_, i) => Object.entries(seedSubmittedRecord(`rec-${i}`))[0])),
    });
    const results = await Promise.all(Array.from({ length: 50 }, (_, i) =>
      executeLedgerCommand(db, { userId: 'user-1', command: registerCommand(`rec-${i}`, { operationId: `op-r${i}` }) }),
    ));
    const sequences = results.map((r) => r.entry.sequenceNumber).sort((a, b) => a - b);
    assert.deepEqual(sequences, Array.from({ length: 50 }, (_, i) => i + 1));
  });

  it('denies registration for a Record in another workspace', async () => {
    const db = createFakeDb({
      ...seedWorkspace(),
      ...seedSubmittedRecord(),
      ...seedBook(),
      'workspaces/ws-2': { workspaceId: 'ws-2', type: 'PERSONAL', ownerUserId: 'user-2' },
    });
    await assert.rejects(
      () => executeLedgerCommand(db, { userId: 'user-1', command: registerCommand('rec-1', { payload: { workspaceId: 'ws-2', recordId: 'rec-1', ledgerBookId: 'book-1' } }) }),
      (err) => ['BOOK_NOT_FOUND', 'WORKSPACE_FORBIDDEN'].includes(err.details?.code),
    );
  });
});
