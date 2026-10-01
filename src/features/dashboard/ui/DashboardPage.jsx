/**
 * DashboardPage
 *
 * Shows current workspace info. Reads from WorkspaceContext.
 * Does NOT implement widgets yet.
 */

import { useAuth } from '../../../app/providers/AuthProvider.jsx';
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx';
import PageContainer from '../../../design-system/components/PageContainer/PageContainer.jsx';
import PageHeader from '../../../design-system/components/PageHeader/PageHeader.jsx';
import Card from '../../../design-system/components/Card/Card.jsx';
import LoadingState from '../../../design-system/components/LoadingState/LoadingState.jsx';
import ErrorState from '../../../design-system/components/ErrorState/ErrorState.jsx';

function InfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between border-b border-neutral-100 py-3 last:border-b-0">
      <span className="text-sm font-medium text-neutral-500">{label}</span>
      <span className="text-sm text-neutral-900">{value || '—'}</span>
    </div>
  );
}

function DashboardPage() {
  const { user } = useAuth();
  const {
    currentWorkspace,
    loading,
    error,
    isPersonalWorkspace,
    isOrganizationWorkspace,
  } = useWorkspace();

  if (loading) {
    return (
      <PageContainer>
        <LoadingState message="Loading workspace..." />
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer>
        <ErrorState
          title="Workspace Error"
          message="Failed to load workspace data. Please try refreshing."
        />
      </PageContainer>
    );
  }

  const workspaceLabel = isPersonalWorkspace ? 'Personal Workspace' : currentWorkspace?.name;
  const workspaceType = isPersonalWorkspace ? 'Personal' : 'Organization';

  return (
    <PageContainer>
      <PageHeader
        title="Dashboard"
        description={`Welcome to ${workspaceLabel}.`}
      />

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-400">
            Current Workspace
          </h3>
          <InfoRow label="Name" value={workspaceLabel} />
          <InfoRow label="Type" value={workspaceType} />
          <InfoRow label="Workspace ID" value={currentWorkspace?.workspaceId?.slice(0, 8) + '...'} />
        </Card>

        <Card>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-400">
            Your Account
          </h3>
          <InfoRow label="Display Name" value={user?.displayName} />
          <InfoRow label="Email" value={user?.email} />
          <InfoRow label="Email Verified" value={user?.emailVerified ? 'Yes' : 'No'} />
        </Card>

        {isOrganizationWorkspace && (
          <Card>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-400">
              Organization
            </h3>
            <InfoRow label="Organization" value={currentWorkspace?.name} />
            <InfoRow label="Organization ID" value={currentWorkspace?.organizationId?.slice(0, 8) + '...'} />
          </Card>
        )}
      </div>
    </PageContainer>
  );
}

export default DashboardPage;
