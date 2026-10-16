import { Timestamp } from 'firebase-admin/firestore';

/**
 * Shared deterministic in-memory Firestore test harness for trusted-engine
 * node:test suites. Replace JSON-cloned docs with identity-preserving shape:
 * FieldValue/Timestamp instances must stay intact, because the trusted
 * engines compare via `.toMillis()`.
 *
 * Never use this for permission/business-logic shadow tests — it has no
 * security rules.
 */

export function clone(v) {
  if (v === null || typeof v !== 'object') return v;
  if (v instanceof Date) return new Date(v);
  if (v && typeof v === 'object' && '_methodName' in v) return v;             // FieldValue transforms
  if (v && typeof v.toMillis === 'function') return v;                        // Timestamp / Duration-like
  if (Array.isArray(v)) return v.map(clone);
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)]));
}

function isServerTimestampSentinel(v) {
  return v && typeof v === 'object' && '_methodName' in v && v._methodName === 'serverTimestamp';
}

function normalizeServerTimestamps(value, now = Timestamp.now()) {
  if (isServerTimestampSentinel(value)) return now;
  if (Array.isArray(value)) return value.map((v) => normalizeServerTimestamps(v, now));
  if (value && typeof value === 'object') {
    // Non-mutating rebuild — canonical models are Object.freeze'd.
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalizeServerTimestamps(v, now)]));
  }
  return value;
}

export function createFakeDb(seed = {}) {
  const docs = new Map(Object.entries(clone(seed)));
  let lock = Promise.resolve();

  class FakeSnap {
    constructor(id, exists, data) { this.id = id; this._exists = exists; this._data = data; }
    get exists() { return this._exists; }
    data() { return this._data; }
  }

  class FakeRef {
    constructor(path) { this.path = path; }
    get() {
      const exists = docs.has(this.path);
      const data = exists ? docs.get(this.path) : undefined;
      return Promise.resolve(new FakeSnap(this.path.split('/').pop(), exists, data));
    }
    set(data) { docs.set(this.path, clone(normalizeServerTimestamps(data))); return Promise.resolve(); }
    update(data) { docs.set(this.path, { ...docs.get(this.path), ...clone(normalizeServerTimestamps(data)) }); return Promise.resolve(); }
    delete() { docs.delete(this.path); return Promise.resolve(); }
  }

  function docPath(ref) {
    return ref.path || (ref.segments ? ref.segments.join('/') : String(ref));
  }

  return {
    _docs: docs,
    doc: (path) => new FakeRef(path),
    collection: (path) => {
      const state = { filters: [], orderField: null, limit: Infinity, startAfter: null };
      let innerPath = path;
      const api = {
        doc: (id) => new FakeRef(`${innerPath}/${id}`),
        where: (field, op, value) => { state.filters.push({ field, op, value }); return api; },
        orderBy: (field) => { state.orderField = field; return api; },
        limit: (n) => { state.limit = n; return api; },
        startAfter: (cursor) => { state.startAfter = cursor; return api; },
        count: async () => ({ data: () => ({ count: [...docs.keys()].filter((k) => k.startsWith(`${innerPath}/`) && k.slice(innerPath.length + 1).split('/').length === 1).length }) }),
        async get() {
          let rows = [...docs.entries()]
            .filter(([key]) => key.startsWith(`${innerPath}/`) && key.slice(innerPath.length + 1).split('/').length === 1);
          const { filters, orderField, limit: lim, startAfter: after } = state;
          rows = rows.filter(([, data]) => filters.every(({ field, op, value }) => (op === '==' ? data[field] === value : true)));
          if (orderField) rows = [...rows].sort((a, b) => (a[1][orderField] > b[1][orderField] ? 1 : -1));
          if (after) {
            const idx = rows.findIndex(([key]) => key === after.ref?.path || after.ref?.id === key);
            if (idx >= 0) rows = rows.slice(idx + 1);
          }
          return {
            size: Math.min(lim, rows.length),
            docs: rows.slice(0, lim).map(([p, d]) => ({
              id: p.split('/').pop(),
              ref: new FakeRef(p),
              data: () => clone(d),
            })),
            empty: rows.length === 0,
          };
        },
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
          async get(ref) {
            const docRef = ref instanceof FakeRef ? ref : new FakeRef(docPath(ref));
            if (!reads.has(docRef.path)) {
              const snap = await docRef.get();
              reads.set(docRef.path, snap.exists ? clone(snap.data()) : undefined);
            }
            const current = reads.get(docRef.path);
            return new FakeSnap(docRef.path.split('/').pop(), current !== undefined, current);
          },
          set(ref, data) { writes.push({ path: docPath(ref), op: 'set', data }); },
          update(ref, data) { writes.push({ path: docPath(ref), op: 'update', data }); },
          delete(ref) { writes.push({ path: docPath(ref), op: 'delete', data: null }); },
        };
        const result = await fn(tx);
        for (const w of writes) {
          const normalized = normalizeServerTimestamps(clone(w.data));
          const path = w.path;
          if (w.op === 'set' || w.op === 'create') docs.set(path, normalized);
          else if (w.op === 'update') docs.set(path, { ...docs.get(path), ...normalized });
          else if (w.op === 'delete') docs.delete(path);
        }
        return Promise.resolve(result);
      } finally {
        release();
      }
    },
  };
}
