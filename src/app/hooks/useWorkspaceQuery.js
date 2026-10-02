import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { workspaceQueryCache, workspaceQueryKey } from '../../core/cache/workspaceQueryCache.js';

export function useWorkspaceQuery({
  workspaceId, resource, params = {}, loader, enabled = true, ttlMs = 30000,
}) {
  const serializedParams = JSON.stringify(params);
  const key = useMemo(
    () => workspaceId && resource ? workspaceQueryKey(workspaceId, resource, JSON.parse(serializedParams)) : null,
    [workspaceId, resource, serializedParams],
  );
  const subscribe = useCallback((listener) => workspaceQueryCache.subscribe(listener), []);
  const getSnapshot = useCallback(() => key ? workspaceQueryCache.get(key) : workspaceQueryCache.get(''), [key]);
  const entry = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    if (!enabled || !key) return;
    const hasData = entry.data !== undefined;
    const stale = !hasData || Date.now() - entry.updatedAt >= ttlMs;
    if (stale && entry.status !== 'INITIAL_LOADING' && entry.status !== 'REFRESHING' && entry.status !== 'ERROR') {
      workspaceQueryCache.fetch(key, loader, { ttlMs }).catch(() => {});
    }
  }, [enabled, key, loader, ttlMs, entry.data, entry.status, entry.updatedAt]);

  const refresh = useCallback(() => {
    if (!key) return Promise.resolve(undefined);
    return workspaceQueryCache.fetch(key, loader, { force: true, ttlMs });
  }, [key, loader, ttlMs]);

  return {
    data: entry.data,
    error: entry.error,
    initialLoading: entry.data === undefined && (entry.status === 'IDLE' || entry.status === 'INITIAL_LOADING'),
    refreshing: entry.data !== undefined && entry.status === 'REFRESHING',
    refresh,
    key,
  };
}
