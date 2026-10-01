/**
 * OrganizationSettingsPage
 *
 * Basic organization settings view/edit for the current organization workspace.
 */

import { useEffect, useState } from 'react';
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx';
import { useAuth } from '../../../app/providers/AuthProvider.jsx';
import services from '../../../infrastructure/services.js';
import { ORGANIZATION_TYPE_LABELS } from '../model.js';
import PageContainer from '../../../design-system/components/PageContainer/PageContainer.jsx';
import PageHeader from '../../../design-system/components/PageHeader/PageHeader.jsx';
import Card from '../../../design-system/components/Card/Card.jsx';
import Button from '../../../design-system/components/Button/Button.jsx';
import Input from '../../../design-system/components/Input/Input.jsx';
import Label from '../../../design-system/components/Label/Label.jsx';
import Alert from '../../../design-system/components/Alert/Alert.jsx';
import EmptyState from '../../../design-system/components/EmptyState/EmptyState.jsx';
import LoadingState from '../../../design-system/components/LoadingState/LoadingState.jsx';
import { hasCapability } from '../../../core/workspace/role.js';

function OrganizationSettingsPage() {
  const { user } = useAuth();
  const { currentWorkspace, currentMembership, isOrganizationWorkspace, refreshWorkspaces } = useWorkspace();
  const [organization, setOrganization] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [editValues, setEditValues] = useState({ name: '', description: '', country: '' });

  useEffect(() => {
    if (!isOrganizationWorkspace || !currentWorkspace?.organizationId) {
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const org = await services.organization.getOrganization(currentWorkspace.organizationId);
        setOrganization(org);
        setEditValues({ name: org.name, description: org.description, country: org.country });
      } catch (err) {
        console.error('[OrganizationSettings] Load failed:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [isOrganizationWorkspace, currentWorkspace?.organizationId]);

  if (!isOrganizationWorkspace) {
    return (
      <PageContainer>
        <EmptyState
          title="No Organization Selected"
          description="Switch to an organization workspace to view its settings."
        />
      </PageContainer>
    );
  }

  if (loading) {
    return (
      <PageContainer>
        <LoadingState message="Loading organization..." />
      </PageContainer>
    );
  }

  const canEdit = currentMembership && hasCapability(currentMembership.roles, 'organization.edit');

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const updated = await services.organization.updateOrganization(
        currentWorkspace.organizationId,
        editValues,
        user.userId,
      );
      setOrganization(updated);
      setEditing(false);
      setSaveSuccess(true);
      await refreshWorkspaces();
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSaveError(err.message || 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Organization Settings"
        description={organization?.name || 'Manage your organization.'}
      />

      {saveSuccess && (
        <Alert variant="success" className="mb-4">Changes saved successfully.</Alert>
      )}
      {saveError && (
        <Alert variant="error" className="mb-4">{saveError}</Alert>
      )}

      <Card className="max-w-lg">
        {!editing ? (
          <div className="space-y-4">
            <div>
              <span className="text-sm font-medium text-neutral-500">Name</span>
              <p className="text-sm text-neutral-900">{organization?.name}</p>
            </div>
            <div>
              <span className="text-sm font-medium text-neutral-500">Type</span>
              <p className="text-sm text-neutral-900">{ORGANIZATION_TYPE_LABELS[organization?.type] || organization?.type}</p>
            </div>
            <div>
              <span className="text-sm font-medium text-neutral-500">Country</span>
              <p className="text-sm text-neutral-900">{organization?.country}</p>
            </div>
            <div>
              <span className="text-sm font-medium text-neutral-500">Description</span>
              <p className="text-sm text-neutral-900">{organization?.description || '—'}</p>
            </div>
            {canEdit && (
              <Button onClick={() => setEditing(true)} className="mt-2">
                Edit
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label htmlFor="editName">Name</Label>
              <Input
                id="editName"
                value={editValues.name}
                onChange={(e) => setEditValues((v) => ({ ...v, name: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="editCountry">Country</Label>
              <Input
                id="editCountry"
                value={editValues.country}
                onChange={(e) => setEditValues((v) => ({ ...v, country: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="editDescription">Description</Label>
              <textarea
                id="editDescription"
                value={editValues.description}
                onChange={(e) => setEditValues((v) => ({ ...v, description: e.target.value }))}
                rows={3}
                className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSave} loading={saving}>Save</Button>
              <Button onClick={() => { setEditing(false); setSaveError(null); }} variant="ghost">
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Card>
    </PageContainer>
  );
}

export default OrganizationSettingsPage;
