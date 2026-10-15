/**
 * GroupsPage
 *
 * Organization-level groups management. Supports create, rename, delete.
 */

import { useCallback, useState } from 'react';
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx';
import { useWorkspaceQuery } from '../../../app/hooks/useWorkspaceQuery.js';
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
  const [newGroupName, setNewGroupName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [expandedGroup, setExpandedGroup] = useState(null);

  const roles = currentMembership?.roles || [];
  const canCreate = hasCapability(roles, 'groups.create');
  const canDelete = hasCapability(roles, 'groups.delete');
  const canEdit = hasCapability(roles, 'groups.edit');
  const orgId = isOrganizationWorkspace ? currentWorkspace?.organizationId : null;

  const loader = useCallback(async () => {
    if (!orgId) return [];
    return services.group.getOrganizationGroups(orgId);
  }, [orgId]);
  const { data: groups = [], error, initialLoading: loading, refresh } = useWorkspaceQuery({
    workspaceId: orgId, resource: 'organizationGroups', loader, enabled: Boolean(orgId),
  });

  const loadGroups = refresh;

  const memberLoader = useCallback(async () => {
    if (!orgId) return [];
    const rows = await services.membership.getOrganizationMembers(orgId);
    return rows.map((row) => ({
      userId: row.membership?.userId,
      displayName: row.person?.displayName || row.person?.firstName || row.membership?.userId,
      status: row.membership?.status,
    })).filter((m) => m.userId && (m.status === 'ACTIVE' || !m.status));
  }, [orgId]);
  const { data: memberRows = [] } = useWorkspaceQuery({
    workspaceId: orgId, resource: 'organizationMembers', loader: memberLoader, enabled: Boolean(orgId),
  });

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
      await services.group.deleteGroup(groupId, user.userId, roles, currentWorkspace.organizationId);
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
                <div className="flex gap-2">
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setExpandedGroup(expandedGroup === group.groupId ? null : group.groupId)}
                      className="text-sm text-neutral-400 hover:text-primary-600"
                    >
                      {expandedGroup === group.groupId ? 'Close' : 'Members'}
                    </button>
                  )}
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
              </div>
              {(group.memberIds || []).length > 0 && (
                <p className="mt-2 text-xs text-neutral-500">{group.memberIds.length} member{(group.memberIds.length || 0) !== 1 ? 's' : ''}</p>
              )}
              {expandedGroup === group.groupId && (
                <div className="mt-3 border-t border-neutral-100 pt-3 space-y-2">
                  {memberRows.map((m) => {
                    const inGroup = (group.memberIds || []).includes(m.userId);
                    return (
                      <label key={m.userId} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={inGroup}
                          onChange={async (event) => {
                            try {
                              if (event.target.checked) {
                                await services.group.addGroupMember(group.groupId, m.userId, user.userId, roles, orgId);
                              } else {
                                await services.group.removeGroupMember(group.groupId, m.userId, user.userId, roles, orgId);
                              }
                              await loadGroups();
                            } catch (err) { setCreateError(err.message); }
                          }}
                        />
                        <span>{m.displayName}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </PageContainer>
  );
}

export default GroupsPage;
