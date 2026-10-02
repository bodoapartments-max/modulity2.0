const EMPTY_ENTRY = Object.freeze({ data: undefined, error: null, status: 'IDLE', updatedAt: 0 });

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

export function workspaceQueryKey(workspaceId, resource, params = {}) {
  if (!workspaceId || !resource) throw new Error('workspaceId and resource are required for cache keys');
  return `${workspaceId}:${resource}:${JSON.stringify(stableValue(params))}`;
}

export function createWorkspaceQueryCache() {
  const entries = new Map();
  const listeners = new Set();
  const notify = () => listeners.forEach((listener) => listener());

  function get(key) {
    return entries.get(key) || EMPTY_ENTRY;
  }

  async function fetch(key, loader, { force = false, ttlMs = 30000 } = {}) {
    const existing = entries.get(key);
    const fresh = existing?.data !== undefined && Date.now() - existing.updatedAt < ttlMs;
    if (!force && fresh) return existing.data;
    if (existing?.promise) return existing.promise;

    const promise = Promise.resolve().then(loader);
    entries.set(key, { ...get(key), status: existing?.data === undefined ? 'INITIAL_LOADING' : 'REFRESHING', error: null, promise });
    notify();
    try {
      const data = await promise;
      entries.set(key, { data, error: null, status: 'READY', updatedAt: Date.now() });
      notify();
      return data;
    } catch (error) {
      entries.set(key, { data: existing?.data, error, status: 'ERROR', updatedAt: existing?.updatedAt || 0 });
      notify();
      throw error;
    }
  }

  function set(key, data) {
    entries.set(key, { data, error: null, status: 'READY', updatedAt: Date.now() });
    notify();
  }

  function invalidate(prefix) {
    for (const [key, entry] of entries) {
      if (key.startsWith(prefix)) entries.set(key, { ...entry, updatedAt: 0 });
    }
    notify();
  }

  return {
    get,
    fetch,
    set,
    invalidate,
    clear: () => { entries.clear(); notify(); },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}

export const workspaceQueryCache = createWorkspaceQueryCache();
