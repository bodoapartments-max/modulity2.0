/* global process */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { executeChatCommand } from './chatCommandEngine.js';

function clone(v) { return v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v; }

function createFakeDb(seed = {}) {
  const docs = new Map(Object.entries(clone(seed)));
  let lock = Promise.resolve();
  const docRef = (path) => ({
    path,
    async get() { return { id: path.split('/').pop(), exists: docs.has(path), data: () => clone(docs.get(path)) }; },
    async set(data) { docs.set(path, clone(data)); },
    async delete() { docs.delete(path); },
  });
  function runQuery(path, filters = [], lim = Infinity) {
    const rows = [...docs.entries()].filter(([key]) => key.startsWith(`${path}/`) && key.slice(path.length + 1).split('/').length === 1)
      .filter(([, data]) => filters.every(({ field, op, value }) => {
        const actual = field.split('.').reduce((acc, key) => (acc ? acc[key] : acc), data);
        if (op === '==') return actual === value;
        if (op === 'array-contains') return Array.isArray(actual) && actual.includes(value);
        return false;
      }));
    return { empty: rows.length === 0, size: Math.min(lim, rows.length), docs: rows.slice(0, lim).map(([p, d]) => ({ id: p.split('/').pop(), path: p, ref: docRef(p), data: () => clone(d) })) };
  }
  return {
    _docs: docs,
    doc: (path) => docRef(path),
    collection: (path) => {
      const state = { filters: [], limit: Infinity };
      const api = {
        doc: (id) => docRef(`${path}/${id}`),
        where: (field, op, value) => { state.filters.push({ field, op, value }); return api; },
        limit: (n) => { state.limit = n; return api; },
        orderBy: () => api,
        startAfter: () => api,
        get: () => Promise.resolve(runQuery(path, state.filters, state.limit)),
      };
      return api;
    },
    async runTransaction(fn) {
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
            const v = reads.get(ref.path);
            return Promise.resolve({ id: ref.path.split('/').pop(), exists: v !== undefined, data: () => v });
          },
          set: (ref, data) => writes.push([ref.path, 'set', clone(data)]),
          update: (ref, data) => writes.push([ref.path, 'update', clone(data)]),
          delete: (ref) => writes.push([ref.path, 'delete', null]),
        };
        const result = await fn(tx);
        for (const [path, op, data] of writes) {
          if (op === 'set') docs.set(path, data);
          else if (op === 'update') docs.set(path, { ...docs.get(path), ...data });
          else docs.delete(path);
        }
        return result;
      } finally { release(); }
    },
  };
}

function cmd(commandType, payload, operationId = 'op-1') {
  return { contractVersion: '1.0.0', operationId, commandType, payload: { workspaceId: 'ws-1', ...payload } };
}

function seedWsOrg() {
  return {
    'workspaces/ws-1': { workspaceId: 'ws-1', type: 'ORGANIZATION', organizationId: 'org-1' },
    'organizations/org-1/members/u-anna': { status: 'ACTIVE', roles: ['OWNER'] },
    'organizations/org-1/members/u-ben': { status: 'ACTIVE', roles: ['MEMBER'] },
  };
}

describe('chatCommand — DIRECT', () => {
  it('creates a deterministic DM and replays it idempotently', async () => {
    const db = createFakeDb(seedWsOrg());
    const first = await executeChatCommand(db, { userId: 'u-anna', command: cmd('CREATE_DIRECT_CONVERSATION', { targetUserId: 'u-ben' }) });
    assert.equal(first.result.conversationId, 'dm_u-anna_u-ben');
    // Ben repeats the same command (SAME operation id) — must replay, not create.
    const second = await executeChatCommand(db, { userId: 'u-anna', command: cmd('CREATE_DIRECT_CONVERSATION', { targetUserId: 'u-ben' }) });
    assert.equal(second.result.conversationId, 'dm_u-anna_u-ben');
    assert.equal(second.idempotent, true);
    // root conversation doc (members subdocs are created too — not counted)
    assert.equal([...db._docs.keys()].filter((k) => /conversations\/[^/]+$/.test(k) && !k.includes('/messages/') && !k.includes('/readStates/') && !k.includes('/members/')).length, 1);
  });

  it('denies DM with a non-member target', async () => {
    const db = createFakeDb(seedWsOrg());
    await assert.rejects(
      () => executeChatCommand(db, { userId: 'u-anna', command: cmd('CREATE_DIRECT_CONVERSATION', { targetUserId: 'u-ghost' }) }),
      (err) => err.details?.code === 'CONTEXT_FORBIDDEN',
    );
  });
});

describe('chatCommand — POST_MESSAGE', () => {
  it('posts a message, resists replay duplicates, notifies the other direct member', async () => {
    const db = createFakeDb(seedWsOrg());
    await executeChatCommand(db, { userId: 'u-anna', command: cmd('CREATE_DIRECT_CONVERSATION', { targetUserId: 'u-ben' }) });
    const post1 = await executeChatCommand(db, { userId: 'u-anna', command: cmd('POST_MESSAGE', { conversationId: 'dm_u-anna_u-ben', content: 'hi' }, 'op-post') });
    assert.ok(post1.result.messageId);
    const post2 = await executeChatCommand(db, { userId: 'u-anna', command: cmd('POST_MESSAGE', { conversationId: 'dm_u-anna_u-ben', content: 'hi' }, 'op-post') });
    assert.equal(post2.idempotent, true);
    assert.equal([...db._docs.keys()].filter((k) => k.includes('/messages/')).length, 1);
    // Notifications: one for the other member
    const notificationKeys = [...db._docs.keys()].filter((k) => k.includes('notifications/'));
    assert.equal(notificationKeys.length, 1);
  });

  it('denies posting to a foreign conversation', async () => {
    const db = createFakeDb(seedWsOrg());
    await executeChatCommand(db, { userId: 'u-anna', command: cmd('CREATE_DIRECT_CONVERSATION', { targetUserId: 'u-ben' }) });
    await assert.rejects(
      () => executeChatCommand(db, { userId: 'u-outsider', command: cmd('POST_MESSAGE', { conversationId: 'dm_u-anna_u-ben', content: 'hi' }, 'op-post') }),
      (err) => ['WORKSPACE_FORBIDDEN', 'NOT_MEMBER'].includes(err.details?.code),
    );
  });
});

describe('chatCommand — CONTEXT', () => {
  it('creates a context conversation only if the referenced object exists', async () => {
    const db = createFakeDb({
      ...seedWsOrg(),
      'workspaces/ws-1/records/rec-1': { recordId: 'rec-1', workspaceId: 'ws-1', status: 'SUBMITTED', createdBy: { actorType: 'USER', actorId: 'u-anna' } },
    });
    const res = await executeChatCommand(db, { userId: 'u-anna', command: cmd('CREATE_CONTEXT_CONVERSATION', { contextReference: { type: 'RECORD', id: 'rec-1', workspaceId: 'ws-1' } }) });
    assert.equal(res.result.conversationId, 'ctx_record_rec-1');
    await assert.rejects(
      () => executeChatCommand(db, { userId: 'u-anna', command: cmd('CREATE_CONTEXT_CONVERSATION', { contextReference: { type: 'RECORD', id: 'rec-ghost', workspaceId: 'ws-1' } }, 'op-2') }),
      (err) => err.details?.code === 'CONTEXT_NOT_FOUND',
    );
  });
});

void process;
