/**
 * Entity Types Management Page
 *
 * View Core and Domain Entity Types.
 * Create Domain Entity Types with field definitions.
 */

import { useCallback, useEffect, useState } from 'react';
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx';
import { useAuth } from '../../../app/providers/AuthProvider.jsx';
import services from '../../../infrastructure/services.js';
import PageContainer from '../../../design-system/components/PageContainer/PageContainer.jsx';
import PageHeader from '../../../design-system/components/PageHeader/PageHeader.jsx';
import Button from '../../../design-system/components/Button/Button.jsx';
import Card from '../../../design-system/components/Card/Card.jsx';
import Badge from '../../../design-system/components/Badge/Badge.jsx';
import Input from '../../../design-system/components/Input/Input.jsx';
import Label from '../../../design-system/components/Label/Label.jsx';
import Spinner from '../../../design-system/components/Spinner/Spinner.jsx';
import { FIELD_TYPES } from '../../../core/data/entityType.js';

function EntityTypesPage() {
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ code: '', name: '', description: '', fields: [] });
  const [error, setError] = useState(null);

  const workspaceId = currentWorkspace?.workspaceId;

  const loadTypes = useCallback(async () => {
    if (!workspaceId) return;
    try {
      setLoading(true);
      await services.entityType.seedCoreTypes(workspaceId);
      const list = await services.entityType.listEntityTypes(workspaceId);
      setTypes(list);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { loadTypes(); }, [loadTypes]);

  const handleAddField = () => {
    setFormData((prev) => ({
      ...prev,
      fields: [...prev.fields, { key: '', label: '', type: 'text', required: false }],
    }));
  };

  const handleFieldChange = (index, key, value) => {
    setFormData((prev) => {
      const fields = [...prev.fields];
      fields[index] = { ...fields[index], [key]: value };
      return { ...prev, fields };
    });
  };

  const handleRemoveField = (index) => {
    setFormData((prev) => ({
      ...prev,
      fields: prev.fields.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await services.entityType.createDomainEntityType({
        workspaceId,
        code: formData.code.toUpperCase().replace(/\s+/g, '_'),
        name: formData.name,
        description: formData.description,
        fields: formData.fields.filter((f) => f.key && f.label),
        actor: { actorType: 'USER', actorId: user.userId },
      });
      setShowForm(false);
      setFormData({ code: '', name: '', description: '', fields: [] });
      await loadTypes();
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <PageContainer>
        <div className="flex justify-center py-12"><Spinner /></div>
      </PageContainer>
    );
  }

  const coreTypes = types.filter((t) => t.category === 'CORE');
  const domainTypes = types.filter((t) => t.category === 'DOMAIN');

  return (
    <PageContainer>
      <PageHeader
        title="Entity Types"
        description="Core and Domain Entity Type registry"
        action={
          !showForm && (
            <Button onClick={() => setShowForm(true)}>
              Create Domain Type
            </Button>
          )
        }
      />

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {showForm && (
        <Card className="mb-6">
          <form onSubmit={handleSubmit} className="space-y-4 p-4">
            <h3 className="text-lg font-medium text-neutral-900">New Domain Entity Type</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="type-code">Code</Label>
                <Input id="type-code" value={formData.code} onChange={(e) => setFormData((p) => ({ ...p, code: e.target.value }))} placeholder="e.g. ROOM" required />
              </div>
              <div>
                <Label htmlFor="type-name">Name</Label>
                <Input id="type-name" value={formData.name} onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Room" required />
              </div>
            </div>
            <div>
              <Label htmlFor="type-desc">Description</Label>
              <Input id="type-desc" value={formData.description} onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))} placeholder="Optional description" />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <Label>Field Definitions</Label>
                <Button type="button" variant="ghost" size="sm" onClick={handleAddField}>+ Add Field</Button>
              </div>
              {formData.fields.map((field, i) => (
                <div key={i} className="mb-2 flex items-center gap-2">
                  <Input className="flex-1" placeholder="Key" value={field.key} onChange={(e) => handleFieldChange(i, 'key', e.target.value)} />
                  <Input className="flex-1" placeholder="Label" value={field.label} onChange={(e) => handleFieldChange(i, 'label', e.target.value)} />
                  <select className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm" value={field.type} onChange={(e) => handleFieldChange(i, 'type', e.target.value)}>
                    {Object.values(FIELD_TYPES).map((ft) => (
                      <option key={ft} value={ft}>{ft}</option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1 text-sm">
                    <input type="checkbox" checked={field.required} onChange={(e) => handleFieldChange(i, 'required', e.target.checked)} />
                    Req
                  </label>
                  <Button type="button" variant="ghost" size="sm" onClick={() => handleRemoveField(i)}>x</Button>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Button type="submit">Create</Button>
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      {coreTypes.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-lg font-medium text-neutral-900">Core Entity Types</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {coreTypes.map((t) => (
              <Card key={t.typeId} className="p-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-neutral-900">{t.name}</span>
                  <Badge variant="neutral">{t.code}</Badge>
                </div>
                <p className="mt-1 text-sm text-neutral-600">{t.description}</p>
                <p className="mt-2 text-xs text-neutral-500">{t.fields?.length || 0} fields</p>
              </Card>
            ))}
          </div>
        </div>
      )}

      {domainTypes.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-medium text-neutral-900">Domain Entity Types</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {domainTypes.map((t) => (
              <Card key={t.typeId} className="p-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-neutral-900">{t.name}</span>
                  <Badge variant="warning">{t.code}</Badge>
                </div>
                <p className="mt-1 text-sm text-neutral-600">{t.description}</p>
                <p className="mt-2 text-xs text-neutral-500">{t.fields?.length || 0} fields</p>
              </Card>
            ))}
          </div>
        </div>
      )}

      {types.length === 0 && !loading && (
        <p className="text-sm text-neutral-500">No entity types found. They will be seeded on first load.</p>
      )}
    </PageContainer>
  );
}

export default EntityTypesPage;
