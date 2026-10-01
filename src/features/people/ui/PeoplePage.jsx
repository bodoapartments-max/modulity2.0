/**
 * PeoplePage
 *
 * Shows members of the current organization workspace.
 * Displays: Name, Email, Role, Status.
 */

import { useCallback, useEffect, useState } from 'react';
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx';
import services from '../../../infrastructure/services.js';
import PageContainer from '../../../design-system/components/PageContainer/PageContainer.jsx';
import PageHeader from '../../../design-system/components/PageHeader/PageHeader.jsx';
import Card from '../../../design-system/components/Card/Card.jsx';
import Badge from '../../../design-system/components/Badge/Badge.jsx';
import EmptyState from '../../../design-system/components/EmptyState/EmptyState.jsx';
import LoadingState from '../../../design-system/components/LoadingState/LoadingState.jsx';
import ErrorState from '../../../design-system/components/ErrorState/ErrorState.jsx';

const STATUS_VARIANTS = {
  ACTIVE: 'success',
  INVITED: 'info',
  SUSPENDED: 'warning',
  LEFT: 'default',
};

function PeoplePage() {
  const { currentWorkspace, isOrganizationWorkspace } = useWorkspace();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadMembers = useCallback(async () => {
    if (!isOrganizationWorkspace || !currentWorkspace?.organizationId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const result = await services.membership.getOrganizationMembers(
        currentWorkspace.organizationId,
      );
      setMembers(result);
    } catch (err) {
      console.error('[PeoplePage] Load failed:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [isOrganizationWorkspace, currentWorkspace?.organizationId]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  if (!isOrganizationWorkspace) {
    return (
      <PageContainer>
        <EmptyState
          title="No Organization Selected"
          description="Switch to an organization workspace to view members."
        />
      </PageContainer>
    );
  }

  if (loading) {
    return (
      <PageContainer>
        <LoadingState message="Loading members..." />
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer>
        <ErrorState
          title="Failed to Load Members"
          message="Could not load organization members. Please try again."
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="People"
        description={`${members.length} member${members.length !== 1 ? 's' : ''} in this organization.`}
      />

      {members.length === 0 ? (
        <EmptyState
          title="No Members"
          description="This organization has no members yet."
        />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-200">
                <th className="pb-3 pr-4 font-medium text-neutral-500">Name</th>
                <th className="pb-3 pr-4 font-medium text-neutral-500">Email</th>
                <th className="pb-3 pr-4 font-medium text-neutral-500">Role</th>
                <th className="pb-3 font-medium text-neutral-500">Status</th>
              </tr>
            </thead>
            <tbody>
              {members.map(({ membership, person }) => (
                <tr key={membership.membershipId} className="border-b border-neutral-100 last:border-b-0">
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-700">
                        {(person?.displayName || '?').charAt(0).toUpperCase()}
                      </span>
                      <span className="font-medium text-neutral-900">
                        {person?.displayName || 'Unknown'}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-neutral-600">
                    {person?.email || '—'}
                  </td>
                  <td className="py-3 pr-4">
                    {membership.roles.map((role) => (
                      <Badge key={role} variant={role === 'OWNER' ? 'primary' : 'default'} className="mr-1">
                        {role}
                      </Badge>
                    ))}
                  </td>
                  <td className="py-3">
                    <Badge variant={STATUS_VARIANTS[membership.status] || 'default'}>
                      {membership.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </PageContainer>
  );
}

export default PeoplePage;
