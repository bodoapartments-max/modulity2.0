/**
 * CreateOrganizationPage
 *
 * Form for creating a new Organization. On success, creates the org,
 * workspace, and owner membership, then switches to the new workspace.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../app/providers/AuthProvider.jsx';
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx';
import {
  validateCreateOrganization,
  createOrgFormState,
  updateOrgField,
  ORGANIZATION_TYPE_LABELS,
} from '../model.js';
import services from '../../../infrastructure/services.js';
import PageContainer from '../../../design-system/components/PageContainer/PageContainer.jsx';
import PageHeader from '../../../design-system/components/PageHeader/PageHeader.jsx';
import Card from '../../../design-system/components/Card/Card.jsx';
import Button from '../../../design-system/components/Button/Button.jsx';
import Input from '../../../design-system/components/Input/Input.jsx';
import Label from '../../../design-system/components/Label/Label.jsx';
import Alert from '../../../design-system/components/Alert/Alert.jsx';

function CreateOrganizationPage() {
  const { user } = useAuth();
  const { refreshWorkspaces, switchWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const [form, setForm] = useState(createOrgFormState());
  const [submitError, setSubmitError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (field) => (event) => {
    setForm((prev) => updateOrgField(prev, field, event.target.value));
    setSubmitError(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError(null);

    try {
      validateCreateOrganization(form.values);
    } catch (error) {
      setForm((prev) => ({
        ...prev,
        errors: error.errors,
        touched: { name: true, type: true, country: true, description: true },
      }));
      return;
    }

    setSubmitting(true);
    try {
      const result = await services.organization.createOrganizationWithWorkspace({
        name: form.values.name,
        type: form.values.type,
        country: form.values.country,
        description: form.values.description,
        userId: user.userId,
      });

      await refreshWorkspaces();
      await switchWorkspace(result.workspace.workspaceId, result.workspace);
      navigate('/app');
    } catch (error) {
      setSubmitError(error.message || 'Failed to create organization. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Create Organization"
        description="Set up a new organization to manage your team."
      />

      <Card className="mx-auto max-w-lg">
        {submitError && (
          <Alert variant="error" className="mb-6">
            {submitError}
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <div>
            <Label htmlFor="orgName" required>Organization Name</Label>
            <Input
              id="orgName"
              name="name"
              type="text"
              placeholder="Example Hotel"
              value={form.values.name}
              onChange={handleChange('name')}
              error={form.errors.name}
              className="mt-1"
            />
            {form.errors.name && (
              <p className="mt-1 text-sm text-danger" role="alert">{form.errors.name}</p>
            )}
          </div>

          <div>
            <Label htmlFor="orgType" required>Organization Type</Label>
            <select
              id="orgType"
              name="type"
              value={form.values.type}
              onChange={handleChange('type')}
              className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Select a type...</option>
              {Object.entries(ORGANIZATION_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            {form.errors.type && (
              <p className="mt-1 text-sm text-danger" role="alert">{form.errors.type}</p>
            )}
          </div>

          <div>
            <Label htmlFor="orgCountry" required>Country</Label>
            <Input
              id="orgCountry"
              name="country"
              type="text"
              placeholder="Hungary"
              value={form.values.country}
              onChange={handleChange('country')}
              error={form.errors.country}
              className="mt-1"
            />
            {form.errors.country && (
              <p className="mt-1 text-sm text-danger" role="alert">{form.errors.country}</p>
            )}
          </div>

          <div>
            <Label htmlFor="orgDescription">Description (optional)</Label>
            <textarea
              id="orgDescription"
              name="description"
              placeholder="Brief description of your organization..."
              value={form.values.description}
              onChange={handleChange('description')}
              rows={3}
              className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <Button type="submit" loading={submitting} className="w-full">
            Create Organization
          </Button>
        </form>
      </Card>
    </PageContainer>
  );
}

export default CreateOrganizationPage;
