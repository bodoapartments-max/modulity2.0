import { useState } from 'react';
import PageContainer from '../../../design-system/components/PageContainer/PageContainer.jsx';
import PageHeader from '../../../design-system/components/PageHeader/PageHeader.jsx';
import Alert from '../../../design-system/components/Alert/Alert.jsx';
import Button from '../../../design-system/components/Button/Button.jsx';
import LoadingState from '../../../design-system/components/LoadingState/LoadingState.jsx';
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx';
import { useAuth } from '../../../app/providers/AuthProvider.jsx';
import { useCalendarDefinitions } from '../hooks/useCalendarDefinitions.js';
import CalendarDefinitionForm from './CalendarDefinitionForm.jsx';

export default function ManageCalendarsPage() {
  const { currentWorkspace, currentMembership } = useWorkspace();
  const { user } = useAuth();
  const { definitions, modules, loading, saving, error, canManage, create, setStatus } = useCalendarDefinitions({
    workspace: currentWorkspace,
    membership: currentMembership,
    user,
  });
  const [showForm, setShowForm] = useState(false);

  if (loading) return <PageContainer><LoadingState message="Loading calendars…" /></PageContainer>;

  return (
    <PageContainer>
      <PageHeader title="Manage Calendars" description="Configure CalendarDefinitions for this Workspace." />
      {!canManage && <Alert variant="warning" className="mb-4">Only Workspace owners or Organization OWNER/ADMIN can manage calendars.</Alert>}
      {error && <Alert variant="error" className="mb-4">{error}</Alert>}
      {canManage && (
        <div className="mb-6">
          {!showForm ? (
            <Button onClick={() => setShowForm(true)}>Create Calendar</Button>
          ) : (
            <CalendarDefinitionForm
              modules={modules}
              saving={saving}
              onCancel={() => setShowForm(false)}
              onSubmit={async (data) => {
                await create(data);
                setShowForm(false);
              }}
            />
          )}
        </div>
      )}
      <div className="space-y-3">
        {definitions.length === 0 && <p className="text-sm text-neutral-500">No CalendarDefinitions configured.</p>}
        {definitions.map((def) => (
          <div key={def.definitionId} className="flex flex-wrap items-center justify-between rounded-xl border border-neutral-200 bg-white p-4">
            <div>
              <h3 className="font-semibold text-neutral-900">{def.name}</h3>
              <p className="text-xs text-neutral-500">{def.source.ref} · {def.status}</p>
              <p className="text-xs text-neutral-500 font-mono">{def.definitionId}</p>
            </div>
            {canManage && (
              <div className="flex items-center gap-2">
                {def.status === 'ACTIVE' ? (
                  <Button size="sm" variant="secondary" loading={saving} onClick={() => setStatus(def.definitionId, 'INACTIVE')}>Deactivate</Button>
                ) : (
                  <Button size="sm" variant="secondary" loading={saving} onClick={() => setStatus(def.definitionId, 'ACTIVE')}>Activate</Button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </PageContainer>
  );
}
