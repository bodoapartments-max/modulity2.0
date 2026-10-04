/* global process */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { executeAdminCommand } from './adminCommandEngine.js';

function clone(v) { return v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v; }

function createFakeDb(seed = {}) {
  const docs = new Map(Object.entries(clone(seed)));
  let lock = Promise.resolve();

  const docRef = (path) => ({
    path,
    async get() {
      return { id: path.split('/').pop(), exists: docs.has(path), data: () => clone(docs.get(path)) };
    },
    async set(data) { docs.set(path, clone(data)); },
    async delete() { docs.delete(path); },
  });

  function runQuery(path, filters = [], orderField = null, lim = Infinity, startAfter = null) {
    let rows = [...docs.entries()]
      .filter(([key]) => key.startsWith(`${path}/`) && key.slice(path.length + 1).split('/').length === 1)
      .filter(([, data]) => filters.every(({ field, op, value }) => {
        const actual = field.split('.').reduce((acc, key) => (acc ? acc[key] : acc), data);
        if (op === '==') return actual === value;
        if (op === 'array-contains') return Array.isArray(actual) && actual.includes(value);
        return false;
      }));
    if (orderField) rows = [...rows].sort((a, b) => (a[1][orderField] > b[1][orderField] ? 1 : -1));
    if (startAfter) {
      const idx = rows.findIndex(([key]) => key === startAfter.ref?.path);
      if (idx >= 0) rows = rows.slice(idx + 1);
    }
    return {
      empty: rows.length === 0,
      size: Math.min(lim, rows.length),
      docs: rows.slice(0, lim).map(([p, d]) => ({
        id: p.split('/').pop(),
        path: p,
        ref: docRef(p),
        get exists() { return true; },
        data: () => clone(d),
      })),
    };
  }

  return {
    _docs: docs,
    doc: (path) => docRef(path),
    collection: (path) => {
      const state = { filters: [], orderField: null, limit: Infinity, startAfter: null };
      const api = {
        doc: (id) => docRef(`${path}/${id}`),
        where: (field, op, value) => { state.filters.push({ field, op, value }); return api; },
        orderBy: (field) => { state.orderField = field; return api; },
        limit: (n) => { state.limit = n; return api; },
        startAfter: (cursor) => { state.startAfter = cursor; return api; },
        get: () => Promise.resolve(runQuery(path, state.filters, state.orderField, state.limit, state.startAfter)),
      };
      return api;
    },
    async runTransaction(fn) {
      // Fake single-mutex execution: deterministic but NOT concurrent-safe.
      // Journal preconditions (peekCompletedOperation) handle the idempotency
      // surface at this harness level; real concurrency tests live in the
      // emulator-backed rules suites.
      const release = await (() => {
        const prev = lock; let r; lock = new Promise((res) => { r = res; });
        return prev.then(() => r);
      })();
      try {
        const reads = new Map();
        const writes = [];
        const tx = {
        get: (ref) => {
          if (!reads.has(ref.path)) reads.set(ref.path, docs.has(ref.path) ? clone(docs.get(ref.path)) : undefined);
          const val = reads.get(ref.path);
          return Promise.resolve({ id: ref.path.split('/').pop(), exists: val !== undefined, data: () => val });
        },
        set: (ref, data) => writes.push([ref.path, 'set', clone(data)]),
        update: (ref, data) => writes.push([ref.path, 'update', clone(data)]),
        delete: (ref) => writes.push([ref.path, 'delete', null]),
        create: (ref, data) => writes.push([ref.path, 'create', clone(data)]),
      };
      const result = await fn(tx);
      for (const [path, op, data] of writes) {
        if (op === 'set' || op === 'create') docs.set(path, data);
        else if (op === 'update') docs.set(path, { ...docs.get(path), ...data });
        else if (op === 'delete') docs.delete(path);
      }
      return result;
      } finally {
        release();
      }
    },
  };
}

function cmd(commandType, payload, operationId = 'op-1') {
  return { contractVersion: '1.0.0', operationId, commandType, payload: { workspaceId: 'ws-1', ...payload } };
}

function seedWs(members = null) {
  const base = { 'workspaces/ws-1': { workspaceId: 'ws-1', ownerUserId: 'user-1', type: 'PERSONAL' } };
  if (members) {
    base['workspaces/ws-org'] = { workspaceId: 'ws-org', organizationId: 'org-a', type: 'ORGANIZATION' };
    for (const [uid, roles] of Object.entries(members)) {
      base[`organizations/${'org-a'}/members/${uid}`] = { status: 'ACTIVE', roles };
    }
  }
  return base;
}

describe('adminCommand — workspace + contract boundary', () => {
  it('rejects non-member org administration', async () => {
    const db = createFakeDb(seedWs({ 'user-2': ['MEMBER'] }));
    await assert.rejects(
      () => executeAdminCommand(db, { userId: 'user-2', command: cmd('ARCHIVE_MODULE', { workspaceId: 'ws-org', resourceId: 'm-1' }) }),
      (err) => err.details?.code === 'ADMIN_FORBIDDEN',
    );
  });

  it('denies unauthenticated writes', async () => {
    const db = createFakeDb(seedWs());
    await assert.rejects(
      () => executeAdminCommand(db, { userId: null, command: cmd('CREATE_MODULE_CATEGORY', { displayName: 'X' }) }),
      (err) => err.details?.code === 'UNAUTHENTICATED',
    );
  });

  it('rejects forged authority keys at the envelope', async () => {
    const db = createFakeDb(seedWs());
    await assert.rejects(
      () => executeAdminCommand(db, { userId: 'user-1', command: cmd('CREATE_MODULE_CATEGORY', { displayName: 'X', createdBy: { actorType: 'INTERNAL_AGENT', actorId: 'hax' } }) }),
      (err) => err.details?.code === 'COMMAND_INVALID',
    );
  });
});

describe('adminCommand — Module Category lifecycle + backfill-safe semantics', () => {
  it('creates a category with server-generated stable code', async () => {
    const db = createFakeDb(seedWs());
    const result = await executeAdminCommand(db, { userId: 'user-1', command: cmd('CREATE_MODULE_CATEGORY', { displayName: 'Front Office' }) });
    assert.equal(result.result.categoryCode, 'FRONT_OFFICE');
    assert.equal(result.idempotent, false);
    const saved = db._docs.get(`workspaces/ws-1/moduleCategories/${result.result.categoryId}`);
    assert.equal(saved.displayName, 'Front Office');
    assert.equal(saved.categoryCode, 'FRONT_OFFICE');
    assert.ok(saved.createdBy.actorId === 'user-1');
  });

  it('rename keeps categoryCode and categoryId immutable', async () => {
    const db = createFakeDb(seedWs());
    const created = await executeAdminCommand(db, { userId: 'user-1', command: cmd('CREATE_MODULE_CATEGORY', { displayName: 'Front Office' }) });
    await executeAdminCommand(db, { userId: 'user-1', command: cmd('UPDATE_MODULE_CATEGORY', { resourceId: created.result.categoryId, displayName: 'Reception' }, 'op-2') });
    const saved = db._docs.get(`workspaces/ws-1/moduleCategories/${created.result.categoryId}`);
    assert.equal(saved.displayName, 'Reception');
    assert.equal(saved.categoryCode, 'FRONT_OFFICE');
    assert.equal(saved.categoryId, created.result.categoryId);
  });

  it('10 retries with same operationId create one category', async () => {
    const db = createFakeDb(seedWs());
    const results = await Promise.all(Array.from({ length: 10 }, () => executeAdminCommand(db, { userId: 'user-1', command: cmd('CREATE_MODULE_CATEGORY', { displayName: 'X' }) })));
    assert.equal(new Set(results.map((r) => r.result.categoryId)).size, 1);
    assert.equal([...db._docs.keys()].filter((k) => k.includes('moduleCategories/')).length, 1);
  });

  it('delete blocked when the category still has Modules', async () => {
    const db = createFakeDb({
      ...seedWs(),
      'workspaces/ws-1/moduleCategories/cat-1': { categoryId: 'cat-1', workspaceId: 'ws-1', displayName: 'HR', createdBy: { actorType: 'USER', actorId: 'user-1' }, status: 'ACTIVE' },
      'workspaces/ws-1/modules/mod-1': { moduleId: 'mod-1', workspaceId: 'ws-1', moduleCode: 'X', name: 'm', status: 'ACTIVE', categoryId: 'cat-1', createdBy: { actorType: 'USER', actorId: 'user-1' } },
    });
    await assert.rejects(
      () => executeAdminCommand(db, { userId: 'user-1', command: cmd('DELETE_MODULE_CATEGORY', { resourceId: 'cat-1' }) }),
      (err) => err.details?.code === 'DEPENDENCY_BLOCKED',
    );
    // Audit still records the failed delete attempt? No — failed commands don't mutate; audit is only written in commit path.
    assert.equal(db._docs.has('workspaces/ws-1/moduleCategories/cat-1'), true);
  });

  it('archive/restore lifecycle keeps history and stays idempotent', async () => {
    const db = createFakeDb({
      ...seedWs(),
      'workspaces/ws-1/moduleCategories/cat-1': { categoryId: 'cat-1', workspaceId: 'ws-1', displayName: 'HR', createdBy: { actorType: 'USER', actorId: 'user-1' }, status: 'ACTIVE' },
    });
    await executeAdminCommand(db, { userId: 'user-1', command: cmd('ARCHIVE_MODULE_CATEGORY', { resourceId: 'cat-1' }) });
    assert.equal(db._docs.get('workspaces/ws-1/moduleCategories/cat-1').status, 'ARCHIVED');
    const retry = await executeAdminCommand(db, { userId: 'user-1', command: cmd('ARCHIVE_MODULE_CATEGORY', { resourceId: 'cat-1' }) });
    assert.equal(retry.idempotent, true, 'same op id replays');
    await executeAdminCommand(db, { userId: 'user-1', command: cmd('RESTORE_MODULE_CATEGORY', { resourceId: 'cat-1' }, 'op-restore') });
    assert.equal(db._docs.get('workspaces/ws-1/moduleCategories/cat-1').status, 'ACTIVE');
  });

  it('hard delete of a dependency-free category works and writes delete audit', async () => {
    const db = createFakeDb({
      ...seedWs(),
      'workspaces/ws-1/moduleCategories/cat-1': { categoryId: 'cat-1', workspaceId: 'ws-1', displayName: 'HR', createdBy: { actorType: 'USER', actorId: 'user-1' }, status: 'ACTIVE' },
    });
    const res = await executeAdminCommand(db, { userId: 'user-1', command: cmd('DELETE_MODULE_CATEGORY', { resourceId: 'cat-1' }) });
    assert.equal(res.result.deleted, true);
    assert.equal(db._docs.has('workspaces/ws-1/moduleCategories/cat-1'), false);
    const auditKeys = [...db._docs.keys()].filter((k) => k.includes('auditEntries'));
    assert.ok(auditKeys.some((k) => k.includes('module_category.deleted')));
  });
});

describe('adminCommand — cross-resource dependency web', () => {
  it('delete Module is blocked by Records and Ledger book', async () => {
    const db = createFakeDb({
      ...seedWs(),
      'workspaces/ws-1/modules/mod-1': { moduleId: 'mod-1', workspaceId: 'ws-1', moduleCode: 'ROOM_INS', name: 'm', status: 'ACTIVE', createdBy: { actorType: 'USER', actorId: 'user-1' } },
      'workspaces/ws-1/records/rec-1': { moduleId: 'mod-1', workspaceId: 'ws-1', status: 'SUBMITTED', createdBy: { actorType: 'USER', actorId: 'user-1' } },
      'workspaces/ws-1/ledgerBooks/lb_1': { ledgerBookId: 'lb_1', workspaceId: 'ws-1', moduleId: 'mod-1', status: 'ACTIVE' },
    });
    await assert.rejects(
      () => executeAdminCommand(db, { userId: 'user-1', command: cmd('DELETE_MODULE', { resourceId: 'mod-1' }) }),
      (err) => err.details?.code === 'DEPENDENCY_BLOCKED',
    );
  });

  it('delete Entity Type is blocked by entities', async () => {
    const db = createFakeDb({
      ...seedWs(),
      'workspaces/ws-1/entityTypes/et-1': { typeId: 'et-1', workspaceId: 'ws-1', category: 'DOMAIN', code: 'VEHICLE', name: 'V', status: 'ACTIVE' },
      'workspaces/ws-1/entities/ent-1': { entityId: 'ent-1', entityTypeId: 'et-1', workspaceId: 'ws-1', displayName: 'BMW', status: 'ACTIVE' },
    });
    await assert.rejects(
      () => executeAdminCommand(db, { userId: 'user-1', command: cmd('DELETE_ENTITY_TYPE', { resourceId: 'et-1' }) }),
      (err) => err.details?.code === 'DEPENDENCY_BLOCKED',
    );
  });

  it('delete Entity is blocked by Record references', async () => {
    const db = createFakeDb({
      ...seedWs(),
      'workspaces/ws-1/entityTypes/et-1': { typeId: 'et-1', workspaceId: 'ws-1', category: 'DOMAIN', code: 'VEHICLE', name: 'V', status: 'ACTIVE' },
      'workspaces/ws-1/entities/ent-1': { entityId: 'ent-1', entityTypeId: 'et-1', workspaceId: 'ws-1', displayName: 'BMW', status: 'ACTIVE' },
      'workspaces/ws-1/records/rec-1': { moduleId: 'mod-1', workspaceId: 'ws-1', status: 'SUBMITTED', entityReferenceIds: ['ent-1'], createdBy: { actorType: 'USER', actorId: 'user-1' } },
    });
    await assert.rejects(
      () => executeAdminCommand(db, { userId: 'user-1', command: cmd('DELETE_ENTITY', { resourceId: 'ent-1' }) }),
      (err) => err.details?.code === 'DEPENDENCY_BLOCKED',
    );
  });

  it('CONTACT creation is a normal canonical Entity path with no User account', async () => {
    const db = createFakeDb({
      ...seedWs(),
      'workspaces/ws-1/entityTypes/core:contact': { typeId: 'core:contact', workspaceId: 'ws-1', category: 'CORE', code: 'CONTACT', name: 'Contact', status: 'ACTIVE', fields: [] },
    });
    const res = await executeAdminCommand(db, { userId: 'user-1', command: cmd('CREATE_ENTITY', { entityTypeId: 'core:contact', name: 'Anna Müller', data: { email: 'anna@supplier.example' } }) });
    assert.ok(res.result.entityId);
    const saved = db._docs.get(`workspaces/ws-1/entities/${res.result.entityId}`);
    assert.equal(saved.entityTypeId, 'core:contact');
    assert.equal(typeof saved.createdBy.actorId, 'string'); // USER — never an auth principal
    assert.equal(saved.status, 'ACTIVE');
    const userKeys = [...db._docs.keys()].filter((k) => k.startsWith('users/') || k.includes('/members'));
    assert.equal(userKeys.length, 0, 'no User/Login side effect');
  });
});

void process;
