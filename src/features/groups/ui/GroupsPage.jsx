/**
 * GroupsPage
 *
 * Organization-level groups management. Supports create, rename, delete.
 */

import { useCallback, useEffect, useState } from 'react';
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx';
import services from '../../../infrastructure/services.js';
import { hasCapability } from '../../../core/workspace/role.js';
import PageContainer from '../../../design-system/components/PageContainer/PageContainer.jsx';
import PageHeader from '../../../design-system/components/PageHeader/PageHeader.jsx';
import Card from '../../../design-system/components/Card/Card.jsx';
import Button from '../../../design-system/components/Button/Button.jsx';
import Input from '../../../design-system/components/Input/Input.jsx';
import Alert from '../../../design-system/components/Alert/Alert.jsx';
import EmptyState from '../../../design-system/components/EmptyState/EmptyState.jsx';
import LoadingState from '../../../design-system/components/LoadingState/LoadingState.jsx';
import ErrorState from '../../../design-system/components/ErrorState/ErrorState.jsx';
import { useAuth } from '../../../app/providers/AuthProvider.jsx';

function GroupsPage() {
  const { user } = useAuth();
  const { currentWorkspace, currentMembership, isOrganizationWorkspace } = useWorkspace();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  const roles = currentMembership?.roles || [];
  const canCreate = hasCapability(roles, 'groups.create');
  const canDelete = hasCapability(roles, 'groups.delete');

  const loadGroups = useCallback(async () => {
    if (!isOrganizationWorkspace || !currentWorkspace?.organizationId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const result = await services.group.getOrganizationGroups(
        currentWorkspace.organizationId,
      );
      setGroups(result);
    } catch (err) {
      console.error('[GroupsPage] Load failed:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [isOrganizationWorkspace, currentWorkspace?.organizationId]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;

    setCreating(true);
    setCreateError(null);
    try {
      await services.group.createNewGroup({
        organizationId: currentWorkspace.organizationId,
        name: newGroupName.trim(),
        userId: user.userId,
        roles,
      });
      setNewGroupName('');
      await loadGroups();
    } catch (err) {
      setCreateError(err.message || 'Failed to create group.');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (groupId) => {
    try {
      await services.group.deleteGroup(groupId, user.userId, roles);
      await loadGroups();
    } catch (err) {
      setCreateError(err.message || 'Failed to delete group.');
    }
  };

  if (!isOrganizationWorkspace) {
    return (
      <PageContainer>
        <EmptyState
          title="No Organization Selected"
          description="Switch to an organization workspace to manage groups."
        />
      </PageContainer>
    );
  }

  if (loading) {
    return (
      <PageContainer>
        <LoadingState message="Loading groups..." />
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer>
        <ErrorState
          title="Failed to Load Groups"
          message="Could not load groups. Please try again."
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Groups"
        description={`${groups.length} group${groups.length !== 1 ? 's' : ''} in this organization.`}
      />

      {createError && (
        <Alert variant="error" className="mb-4">{createError}</Alert>
      )}

      {canCreate && (
        <Card className="mb-6 max-w-lg">
          <form onSubmit={handleCreate} className="flex gap-2">
            <Input
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="New group name..."
              className="flex-1"
            />
            <Button type="submit" loading={creating} disabled={!newGroupName.trim()}>
              Create
            </Button>
          </form>
        </Card>
      )}

      {groups.length === 0 ? (
        <EmptyState
          title="No Groups"
          description="Create groups to organize your team members."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => (
            <Card key={group.groupId}>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium text-neutral-900">{group.name}</h3>
                  {group.description && (
                    <p className="mt-1 text-sm text-neutral-500">{group.description}</p>
                  )}
                </div>
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => handleDelete(group.groupId)}
                    className="text-sm text-neutral-400 hover:text-danger"
                    aria-label={`Delete group ${group.name}`}
                  >
                    Delete
                  </button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </PageContainer>
  );
}

export default GroupsPage;
