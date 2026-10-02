import { describe, expect, it, vi } from 'vitest';
import { createWorkspaceQueryCache, workspaceQueryKey } from './workspaceQueryCache.js';

describe('workspaceQueryCache', () => {
  it('creates deterministic workspace-scoped query keys', () => {
    expect(workspaceQueryKey('ws-a', 'records', { status: 'ACTIVE', page: 1 }))
      .toBe('ws-a:records:{"page":1,"status":"ACTIVE"}');
    expect(workspaceQueryKey('ws-b', 'records', { page: 1, status: 'ACTIVE' }))
      .not.toBe(workspaceQueryKey('ws-a', 'records', { status: 'ACTIVE', page: 1 }));
  });

  it('returns fresh cached data without another fetch', async () => {
    const cache = createWorkspaceQueryCache();
    const loader = vi.fn().mockResolvedValue([]);
    const key = workspaceQueryKey('ws-a', 'modules');
    await cache.fetch(key, loader);
    await cache.fetch(key, loader);
    expect(loader).toHaveBeenCalledOnce();
    expect(cache.get(key).status).toBe('READY');
  });

  it('deduplicates concurrent requests', async () => {
    const cache = createWorkspaceQueryCache();
    const loader = vi.fn().mockResolvedValue(['module-1']);
    const key = workspaceQueryKey('ws-a', 'modules');
    const [first, second] = await Promise.all([cache.fetch(key, loader), cache.fetch(key, loader)]);
    expect(first).toEqual(second);
    expect(loader).toHaveBeenCalledOnce();
  });

  it('keeps cached data visible while refreshing', async () => {
    const cache = createWorkspaceQueryCache();
    const key = workspaceQueryKey('ws-a', 'ledgerBooks');
    cache.set(key, []);
    let resolve;
    const pending = new Promise((done) => { resolve = done; });
    const refresh = cache.fetch(key, () => pending, { force: true });
    expect(cache.get(key).data).toEqual([]);
    expect(cache.get(key).status).toBe('REFRESHING');
    resolve(['book-1']);
    await refresh;
    expect(cache.get(key).data).toEqual(['book-1']);
  });

  it('invalidates only matching workspace/resource entries', async () => {
    const cache = createWorkspaceQueryCache();
    const a = workspaceQueryKey('ws-a', 'modules');
    const b = workspaceQueryKey('ws-b', 'modules');
    cache.set(a, ['a']);
    cache.set(b, ['b']);
    cache.invalidate('ws-a:modules:');
    expect(cache.get(a).updatedAt).toBe(0);
    expect(cache.get(b).updatedAt).toBeGreaterThan(0);
  });
});
