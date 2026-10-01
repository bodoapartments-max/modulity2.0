/**
 * Entities Browser Page
 *
 * View, create, and archive Entities.
 * Minimal development UI for validation.
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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

function EntitiesPage() {
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [entities, setEntities] = useState([]);
  const [entityTypes, setEntityTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedTypeId, setSelectedTypeId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [fieldValues, setFieldValues] = useState({});
  const [error, setError] = useState(null);

  const workspaceId = currentWorkspace?.workspaceId;

  const loadData = useCallback(async () => {
    if (!workspaceId) return;
    try {
      setLoading(true);
      const [ents, types] = await Promise.all([
        services.entity.listEntities(workspaceId),
        services.entityType.listEntityTypes(workspaceId),
      ]);
      setEntities(ents);
      setEntityTypes(types);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { loadData(); }, [loadData]);

  const selectedType = entityTypes.find((t) => t.typeId === selectedTypeId);

  useEffect(() => {
    setFieldValues({});
  }, [selectedTypeId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await services.entity.createEntity({
        workspaceId,
        entityTypeId: selectedTypeId,
        displayName,
        data: fieldValues,
        createdBy: { actorType: 'USER', actorId: user.userId },
      });
      setShowForm(false);
      setDisplayName('');
      setSelectedTypeId('');
      setFieldValues({});
      await loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleArchive = async (entityId) => {
    try {
      await services.entity.archiveEntity(
        workspaceId,
        entityId,
        { actorType: 'USER', actorId: user.userId },
      );
      await loadData();
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

  const typeMap = Object.fromEntries(entityTypes.map((t) => [t.typeId, t]));

  return (
    <PageContainer>
      <PageHeader
        title="Entities"
        description="Business entities in this workspace"
        action={
          !showForm && (
            <Button onClick={() => setShowForm(true)}>
              Create Entity
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
            <h3 className="text-lg font-medium text-neutral-900">New Entity</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="entity-type">Entity Type</Label>
                <select
                  id="entity-type"
                  className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                  value={selectedTypeId}
                  onChange={(e) => setSelectedTypeId(e.target.value)}
                  required
                >
                  <option value="">Select type...</option>
                  {entityTypes.map((t) => (
                    <option key={t.typeId} value={t.typeId}>{t.name} ({t.code})</option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="entity-name">Display Name</Label>
                <Input id="entity-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Room 214" required />
              </div>
            </div>

            {selectedType?.fields?.length > 0 && (
              <div className="space-y-3">
                <Label>Type-specific Fields</Label>
                {selectedType.fields.map((field) => (
                  <div key={field.key}>
                    <Label htmlFor={`field-${field.key}`}>
                      {field.label}
                      {field.required && <span className="ml-1 text-red-500">*</span>}
                    </Label>
                    <Input
                      id={`field-${field.key}`}
                      type={field.type === 'number' ? 'number' : 'text'}
                      value={fieldValues[field.key] || ''}
                      onChange={(e) => setFieldValues((prev) => ({
                        ...prev,
                        [field.key]: field.type === 'number' ? Number(e.target.value) : e.target.value,
                      }))}
                      required={field.required}
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <Button type="submit">Create</Button>
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      {entities.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-200 text-neutral-600">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {entities.map((ent) => (
                <tr key={ent.entityId} className="border-b border-neutral-100 hover:bg-neutral-50">
                  <td className="px-3 py-2">
                    <button
                      className="font-medium text-primary-600 hover:underline"
                      onClick={() => navigate(`/app/entities/${ent.entityId}`)}
                    >
                      {ent.displayName}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="neutral">{typeMap[ent.entityTypeId]?.code || ent.entityTypeId}</Badge>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={ent.status === 'ACTIVE' ? 'success' : 'neutral'}>{ent.status}</Badge>
                  </td>
                  <td className="px-3 py-2 text-neutral-500">
                    {ent.createdAt ? new Date(ent.createdAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-3 py-2">
                    {ent.status === 'ACTIVE' && (
                      <Button variant="ghost" size="sm" onClick={() => handleArchive(ent.entityId)}>Archive</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-neutral-500">No entities yet. Create one to get started.</p>
      )}
    </PageContainer>
  );
}

export default EntitiesPage;
