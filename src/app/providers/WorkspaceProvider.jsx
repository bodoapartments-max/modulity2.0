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

export const WorkspaceContext = createContext(null);

const STORAGE_KEY = 'modulity_lastWorkspaceId';

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

  const loadWorkspaces = useCallback(async () => {
    if (!user || !services) {
      setCurrentWorkspace(null);
      setAvailableWorkspaces([]);
      setCurrentMembership(null);
      setError(!services ? new Error('Workspace services are unavailable.') : null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      await services.workspace.initializeUserWorkspace(user);

      const workspaces = await services.workspace.getAccessibleWorkspaces(
        user.userId,
        repositories.memberships,
      );

      setAvailableWorkspaces(workspaces);

      const storedId = safeGetStoredWorkspaceId();
      const restoredWorkspace = storedId
        ? workspaces.find((w) => w.workspaceId === storedId)
        : null;

      const personalWorkspace = workspaces.find(
        (w) => w.type === WORKSPACE_TYPES.PERSONAL,
      );

      const targetWorkspace = restoredWorkspace || personalWorkspace || workspaces[0] || null;

      setCurrentWorkspace(targetWorkspace);
      if (targetWorkspace) {
        safeSetStoredWorkspaceId(targetWorkspace.workspaceId);

        if (targetWorkspace.type === WORKSPACE_TYPES.ORGANIZATION && targetWorkspace.organizationId) {
          const membership = await repositories.memberships.getByOrgAndUser(
            targetWorkspace.organizationId,
            user.userId,
          );
          setCurrentMembership(membership);
        } else {
          setCurrentMembership(null);
        }
      }
    } catch (err) {
      setCurrentWorkspace(null);
      setAvailableWorkspaces([]);
      setCurrentMembership(null);
      setError(err);
    } finally {
      setLoading(false);
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
        const [nextWorksets, preference] = await Promise.all([
          services.workset.list(currentWorkspace.workspaceId),
          services.workspacePreference.get(currentWorkspace.workspaceId, user.userId),
        ]);
        if (cancelled) return;
        setWorksets(nextWorksets);
        setActiveWorkset(nextWorksets.find((item) => item.worksetId === preference?.activeWorksetId) || null);
      } catch (err) {
        if (!cancelled) setError(err);
      }
    };
    loadWorkspaceExperience();
    return () => { cancelled = true; };
  }, [currentWorkspace?.workspaceId, user]);

  const activateWorkset = useCallback(async (worksetId) => {
    if (!currentWorkspace || !user) return false;
    try {
      setError(null);
      await services.workspacePreference.setActiveWorkset(currentWorkspace.workspaceId, user.userId, worksetId);
      setActiveWorkset(worksets.find((item) => item.worksetId === worksetId) || null);
      return true;
    } catch (err) {
      setError(err);
      return false;
    }
  }, [currentWorkspace, user, worksets]);

  const switchWorkspace = useCallback(async (workspaceId) => {
    const target = availableWorkspaces.find((w) => w.workspaceId === workspaceId);
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
    switchWorkspace,
    refreshWorkspaces: loadWorkspaces,
    loading,
    switching,
    error,
    isPersonalWorkspace: currentWorkspace?.type === WORKSPACE_TYPES.PERSONAL,
    isOrganizationWorkspace: currentWorkspace?.type === WORKSPACE_TYPES.ORGANIZATION,
  }), [currentWorkspace, availableWorkspaces, currentMembership, worksets, activeWorkset, activateWorkset, switchWorkspace, loadWorkspaces, loading, switching, error]);

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export default WorkspaceProvider;
