/**
 * Entity Detail Page
 *
 * Shows: display name, type, status, data, relationships, related records.
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx';
import services from '../../../infrastructure/services.js';
import PageContainer from '../../../design-system/components/PageContainer/PageContainer.jsx';
import PageHeader from '../../../design-system/components/PageHeader/PageHeader.jsx';
import Card from '../../../design-system/components/Card/Card.jsx';
import Badge from '../../../design-system/components/Badge/Badge.jsx';
import Button from '../../../design-system/components/Button/Button.jsx';
import Spinner from '../../../design-system/components/Spinner/Spinner.jsx';
import { RELATIONSHIP_OBJECT_TYPES } from '../../../core/data/relationship.js';

function EntityDetailPage() {
  const { entityId } = useParams();
  const { currentWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const [entity, setEntity] = useState(null);
  const [entityType, setEntityType] = useState(null);
  const [relationships, setRelationships] = useState([]);
  const [relatedRecordCount, setRelatedRecordCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const workspaceId = currentWorkspace?.workspaceId;

  const loadDetail = useCallback(async () => {
    if (!workspaceId || !entityId) return;
    try {
      setLoading(true);
      const ent = await services.entity.getEntity(workspaceId, entityId);
      if (!ent) {
        setError('Entity not found');
        setLoading(false);
        return;
      }
      setEntity(ent);

      const [type, rels, records] = await Promise.all([
        services.entityType.getEntityType(workspaceId, ent.entityTypeId),
        services.relationship.listRelationshipsForObject(
          workspaceId,
          RELATIONSHIP_OBJECT_TYPES.ENTITY,
          entityId,
        ),
        services.record.listRecordsByEntity(workspaceId, entityId),
      ]);
      setEntityType(type);
      setRelationships(rels);
      setRelatedRecordCount(records.length);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, entityId]);

  useEffect(() => { loadDetail(); }, [loadDetail]);

  if (loading) {
    return (
      <PageContainer>
        <div className="flex justify-center py-12"><Spinner /></div>
      </PageContainer>
    );
  }

  if (error || !entity) {
    return (
      <PageContainer>
        <div className="py-12 text-center">
          <p className="text-neutral-600">{error || 'Entity not found'}</p>
          <Button variant="ghost" className="mt-4" onClick={() => navigate('/app/entities')}>Back to Entities</Button>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={entity.displayName}
        description={entityType ? `${entityType.name} (${entityType.code})` : entity.entityTypeId}
        action={
          <Button variant="ghost" onClick={() => navigate('/app/entities')}>Back</Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-medium text-neutral-600">Details</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-neutral-500">Status</dt>
              <dd><Badge variant={entity.status === 'ACTIVE' ? 'success' : 'neutral'}>{entity.status}</Badge></dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-neutral-500">Entity Type</dt>
              <dd>{entityType?.name || entity.entityTypeId}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-neutral-500">Schema Version</dt>
              <dd>{entity.schemaVersion}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-neutral-500">Created</dt>
              <dd>{entity.createdAt ? new Date(entity.createdAt).toLocaleString() : '—'}</dd>
            </div>
          </dl>
        </Card>

        <Card className="p-4">
          <h3 className="mb-3 text-sm font-medium text-neutral-600">Data</h3>
          {entity.data && Object.keys(entity.data).length > 0 ? (
            <dl className="space-y-2 text-sm">
              {Object.entries(entity.data).map(([key, value]) => {
                const fieldDef = entityType?.fields?.find((f) => f.key === key);
                return (
                  <div key={key} className="flex justify-between">
                    <dt className="text-neutral-500">{fieldDef?.label || key}</dt>
                    <dd className="text-neutral-900">{String(value)}</dd>
                  </div>
                );
              })}
            </dl>
          ) : (
            <p className="text-sm text-neutral-500">No data fields.</p>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="mb-3 text-sm font-medium text-neutral-600">
            Relationships ({relationships.length})
          </h3>
          {relationships.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {relationships.map((rel) => {
                const isSource = rel.source.objectId === entityId;
                const other = isSource ? rel.target : rel.source;
                return (
                  <li key={rel.relationshipId} className="flex items-center gap-2">
                    <Badge variant="neutral">{rel.relationshipType}</Badge>
                    <span className="text-neutral-600">
                      {isSource ? '' : '(incoming) '}
                      {other.objectType}: {other.objectId}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-neutral-500">No relationships.</p>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="mb-3 text-sm font-medium text-neutral-600">
            Related Records ({relatedRecordCount})
          </h3>
          <p className="text-sm text-neutral-500">
            {relatedRecordCount > 0
              ? `${relatedRecordCount} record(s) reference this entity.`
              : 'No records reference this entity.'}
          </p>
        </Card>
      </div>
    </PageContainer>
  );
}

export default EntityDetailPage;
