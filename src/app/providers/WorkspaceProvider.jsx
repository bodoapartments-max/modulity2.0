/**
 * WorkspaceProvider
 *
 * Centralized workspace context for the application.
 * Exposes: currentWorkspace, availableWorkspaces, switchWorkspace, loading, error.
 *
 * On mount (when user is authenticated):
 *   1. Ensures personal workspace + profile exist (idempotent)
 *   2. Loads all accessible workspaces
 *   3. Restores last selected workspace (if still accessible)
 *   4. Falls back to personal workspace if restored workspace is invalid
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthProvider.jsx';
import services from '../../infrastructure/services.js';
import { repositories } from '../../infrastructure/repositories.js';
import { WORKSPACE_TYPES } from '../../core/workspace/workspace.js';
import { eventBus, createEvent } from '../../core/events/eventBus.js';
import { workspaceQueryCache, workspaceQueryKey } from '../../core/cache/workspaceQueryCache.js';

export const WorkspaceContext = createContext(null);

const STORAGE_KEY = 'modulity_lastWorkspaceId';

const STARTUP_DIAGNOSTIC_TIMEOUT_MS = 10000;

async function traceWorkspaceOperation(label, operation) {
  const startedAt = performance.now();
  let timeoutId;
  try {
    const result = await Promise.race([
      operation(),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`${label} did not settle within ${STARTUP_DIAGNOSTIC_TIMEOUT_MS}ms`)), STARTUP_DIAGNOSTIC_TIMEOUT_MS);
      }),
    ]);
    return result;
  } catch (error) {
    if (import.meta.env.DEV) console.error(`[WorkspaceProvider] ${label} ERROR (${Math.round(performance.now() - startedAt)}ms)`, error);
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function resolveWorkspaceTarget(workspaceId, availableWorkspaces, targetOverride = null) {
  return targetOverride?.workspaceId === workspaceId
    ? targetOverride
    : availableWorkspaces.find((workspace) => workspace.workspaceId === workspaceId) || null;
}

function safeGetStoredWorkspaceId() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function safeSetStoredWorkspaceId(workspaceId) {
  try {
    localStorage.setItem(STORAGE_KEY, workspaceId);
  } catch {
    /* localStorage unavailable */
  }
}

function safeRemoveStoredWorkspaceId() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* localStorage unavailable */
  }
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
}

export function WorkspaceProvider({ children }) {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [currentWorkspace, setCurrentWorkspace] = useState(null);
  const [availableWorkspaces, setAvailableWorkspaces] = useState([]);
  const [currentMembership, setCurrentMembership] = useState(null);
  const [worksets, setWorksets] = useState([]);
  const [activeWorkset, setActiveWorkset] = useState(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState(null);
  const [experienceError, setExperienceError] = useState(null);

  const loadWorkspaces = useCallback(async () => {
    if (!user || !services) {
      setCurrentWorkspace(null);
      setAvailableWorkspaces([]);
      setCurrentMembership(null);
      setError(!services ? new Error('Workspace services are unavailable.') : null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setExperienceError(null);
    const storedId = safeGetStoredWorkspaceId();

    let personalWorkspace;
    try {
      if (storedId) {
        try {
          const storedWorkspace = await traceWorkspaceOperation(
            'restored workspace validation',
            () => repositories.workspaces.getById(storedId),
          );
          if (storedWorkspace?.type === WORKSPACE_TYPES.PERSONAL && storedWorkspace.ownerUserId === user.userId) {
            personalWorkspace = storedWorkspace;
          } else if (!storedWorkspace) {
            safeRemoveStoredWorkspaceId();
          }
        } catch {
          safeRemoveStoredWorkspaceId();
        }
      }
      if (!personalWorkspace) {
        personalWorkspace = await traceWorkspaceOperation(
          'ensurePersonalWorkspace',
          () => services.workspace.ensurePersonalWorkspace(user),
        );
      }
      setAvailableWorkspaces([personalWorkspace]);
      setCurrentWorkspace(personalWorkspace);
      setCurrentMembership(null);
      safeSetStoredWorkspaceId(personalWorkspace.workspaceId);
      setLoading(false);
    } catch (err) {
      setCurrentWorkspace(null);
      setAvailableWorkspaces([]);
      setCurrentMembership(null);
      setError(err);
      setLoading(false);
      return;
    }

    try {
      const [, workspaces] = await Promise.all([
        traceWorkspaceOperation('ensurePersonProfile', () => services.workspace.ensurePersonProfile(user)),
        traceWorkspaceOperation(
          'getAccessibleWorkspaces',
          () => services.workspace.getAccessibleWorkspaces(user.userId, repositories.memberships),
        ),
      ]);
      const allWorkspaces = workspaces.some((item) => item.workspaceId === personalWorkspace.workspaceId)
        ? workspaces
        : [personalWorkspace, ...workspaces];
      setAvailableWorkspaces(allWorkspaces);

      const restoredWorkspace = storedId && storedId !== personalWorkspace.workspaceId
        ? allWorkspaces.find((item) => item.workspaceId === storedId)
        : null;
      if (!restoredWorkspace && storedId && storedId !== personalWorkspace.workspaceId) {
        safeRemoveStoredWorkspaceId();
        safeSetStoredWorkspaceId(personalWorkspace.workspaceId);
      }
      if (restoredWorkspace?.type === WORKSPACE_TYPES.ORGANIZATION && restoredWorkspace.organizationId) {
        const membership = await traceWorkspaceOperation(
          'restored workspace membership lookup',
          () => repositories.memberships.getByOrgAndUser(restoredWorkspace.organizationId, user.userId),
        );
        if (membership) {
          setCurrentWorkspace(restoredWorkspace);
          setCurrentMembership(membership);
          safeSetStoredWorkspaceId(restoredWorkspace.workspaceId);
        }
      }
    } catch (err) {
      setExperienceError(err);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      setCurrentWorkspace(null);
      setAvailableWorkspaces([]);
      setCurrentMembership(null);
      setLoading(false);
      return;
    }

    loadWorkspaces();
  }, [isAuthenticated, authLoading, loadWorkspaces]);

  useEffect(() => {
    let cancelled = false;
    const loadWorkspaceExperience = async () => {
      if (!currentWorkspace?.workspaceId || !user) {
        setWorksets([]);
        setActiveWorkset(null);
        return;
      }
      try {
        setExperienceError(null);
        const worksetKey = workspaceQueryKey(currentWorkspace.workspaceId, 'worksets');
        const [nextWorksets, preference] = await Promise.all([
          workspaceQueryCache.fetch(worksetKey, () => services.workset.list(currentWorkspace.workspaceId)),
          services.workspacePreference.get(currentWorkspace.workspaceId, user.userId),
        ]);
        if (cancelled) return;
        setWorksets(nextWorksets);
        setActiveWorkset(nextWorksets.find((item) => item.worksetId === preference?.activeWorksetId) || null);
      } catch (err) {
        if (!cancelled) {
          setWorksets([]);
          setActiveWorkset(null);
          setExperienceError(err);
        }
      }
    };
    loadWorkspaceExperience();
    return () => { cancelled = true; };
  }, [currentWorkspace?.workspaceId, user]);

  const refreshWorksets = useCallback(async () => {
    if (!currentWorkspace?.workspaceId) return [];
    const key = workspaceQueryKey(currentWorkspace.workspaceId, 'worksets');
    const next = await workspaceQueryCache.fetch(
      key,
      () => services.workset.list(currentWorkspace.workspaceId),
      { force: true },
    );
    setWorksets(next);
    setActiveWorkset((current) => current
      ? next.find((item) => item.worksetId === current.worksetId) || null
      : null);
    return next;
  }, [currentWorkspace?.workspaceId]);

  useEffect(() => {
    if (!currentWorkspace?.workspaceId || !user) return undefined;
    const workspaceId = currentWorkspace.workspaceId;
    const prefetch = () => {
      workspaceQueryCache.fetch(
        workspaceQueryKey(workspaceId, 'modules'),
        () => services.module.listModules(workspaceId),
      ).catch(() => {});
      workspaceQueryCache.fetch(
        workspaceQueryKey(workspaceId, 'widgets', { userId: user.userId }),
        () => services.widget.listForUser(workspaceId, user.userId),
      ).catch(() => {});
    };
    const idleId = window.requestIdleCallback
      ? window.requestIdleCallback(prefetch, { timeout: 1500 })
      : window.setTimeout(prefetch, 0);
    return () => {
      if (window.cancelIdleCallback) window.cancelIdleCallback(idleId);
      else window.clearTimeout(idleId);
    };
  }, [currentWorkspace?.workspaceId, user]);

  const activateWorkset = useCallback(async (worksetId) => {
    if (!currentWorkspace || !user) return false;
    try {
      setExperienceError(null);
      await services.workspacePreference.setActiveWorkset(currentWorkspace.workspaceId, user.userId, worksetId);
      setActiveWorkset(worksets.find((item) => item.worksetId === worksetId) || null);
      return true;
    } catch (err) {
      setExperienceError(err);
      return false;
    }
  }, [currentWorkspace, user, worksets]);

  const switchWorkspace = useCallback(async (workspaceId, targetOverride = null) => {
    const target = resolveWorkspaceTarget(workspaceId, availableWorkspaces, targetOverride);
    if (!target) {
      setError(new Error('This workspace is no longer available.'));
      return false;
    }

    try {
      setSwitching(true);
      setError(null);
      let membership = null;
      if (target.type === WORKSPACE_TYPES.ORGANIZATION && target.organizationId && user) {
        membership = await repositories.memberships.getByOrgAndUser(
          target.organizationId,
          user.userId,
        );
        if (!membership || membership.status !== 'ACTIVE') {
          setError(new Error('This organization membership is not active.'));
          return false;
        }
      }

      setCurrentWorkspace(target);
      setCurrentMembership(membership);
      safeSetStoredWorkspaceId(workspaceId);

      if (user) {
        eventBus.emit(createEvent({
          eventType: 'workspace.switched',
          workspaceId,
          actor: { type: 'user', id: user.userId },
          payload: { workspaceId, type: target.type },
        }));
      }
      return true;
    } catch (err) {
      setError(err);
      return false;
    } finally {
      setSwitching(false);
    }
  }, [availableWorkspaces, user]);

  const value = useMemo(() => ({
    currentWorkspace,
    availableWorkspaces,
    currentMembership,
    worksets,
    activeWorkset,
    activateWorkset,
    refreshWorksets,
    switchWorkspace,
    refreshWorkspaces: loadWorkspaces,
    loading,
    switching,
    error,
    experienceError,
    isPersonalWorkspace: currentWorkspace?.type === WORKSPACE_TYPES.PERSONAL,
    isOrganizationWorkspace: currentWorkspace?.type === WORKSPACE_TYPES.ORGANIZATION,
  }), [currentWorkspace, availableWorkspaces, currentMembership, worksets, activeWorkset, activateWorkset, refreshWorksets, switchWorkspace, loadWorkspaces, loading, switching, error, experienceError]);

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export default WorkspaceProvider;
