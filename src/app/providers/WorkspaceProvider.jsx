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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadWorkspaces = useCallback(async () => {
    if (!user || !services) return;

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
      console.error('[WorkspaceProvider] Failed to load workspaces:', err);
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

  const switchWorkspace = useCallback(async (workspaceId) => {
    const target = availableWorkspaces.find((w) => w.workspaceId === workspaceId);
    if (!target) {
      console.error('[WorkspaceProvider] Workspace not accessible:', workspaceId);
      return;
    }

    setCurrentWorkspace(target);
    safeSetStoredWorkspaceId(workspaceId);

    if (target.type === WORKSPACE_TYPES.ORGANIZATION && target.organizationId && user) {
      const membership = await repositories.memberships.getByOrgAndUser(
        target.organizationId,
        user.userId,
      );
      setCurrentMembership(membership);
    } else {
      setCurrentMembership(null);
    }

    if (user) {
      eventBus.emit(createEvent({
        eventType: 'workspace.switched',
        workspaceId,
        actor: { type: 'user', id: user.userId },
        payload: { workspaceId, type: target.type },
      }));
    }
  }, [availableWorkspaces, user]);

  const value = useMemo(() => ({
    currentWorkspace,
    availableWorkspaces,
    currentMembership,
    switchWorkspace,
    refreshWorkspaces: loadWorkspaces,
    loading,
    error,
    isPersonalWorkspace: currentWorkspace?.type === WORKSPACE_TYPES.PERSONAL,
    isOrganizationWorkspace: currentWorkspace?.type === WORKSPACE_TYPES.ORGANIZATION,
  }), [currentWorkspace, availableWorkspaces, currentMembership, switchWorkspace, loadWorkspaces, loading, error]);

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export default WorkspaceProvider;
