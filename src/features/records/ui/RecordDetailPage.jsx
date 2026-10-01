/**
 * Record Detail — displays a Module-created Record's data.
 * Entity References are resolved to display names.
 */
import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx';
import { formatDisplayValue } from '../../../modules/forms/displayFormatter.js';
import services from '../../../infrastructure/services.js';

const STATUS_COLORS = {
  DRAFT: 'bg-neutral-100 text-neutral-700',
  SUBMITTED: 'bg-blue-100 text-blue-800',
  ACTIVE: 'bg-green-100 text-green-800',
  COMPLETED: 'bg-green-200 text-green-900',
  CANCELLED: 'bg-red-100 text-red-700',
  ARCHIVED: 'bg-neutral-200 text-neutral-500',
};

export default function RecordDetailPage() {
  const { recordId } = useParams();
  const { currentWorkspace } = useWorkspace();
  const [record, setRecord] = useState(null);
  const [mod, setMod] = useState(null);
  const [entityNames, setEntityNames] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const workspaceId = currentWorkspace?.workspaceId;

  useEffect(() => {
    if (!workspaceId || !recordId) return;
    let cancelled = false;
    setLoading(true);

    services?.record?.getRecord(workspaceId, recordId)
      .then(async (rec) => {
        if (cancelled || !rec) return;
        setRecord(rec);

        // Load module for field definitions
        if (rec.moduleId && services?.module) {
          try {
            const m = await services.module.getModule(workspaceId, rec.moduleId);
            if (!cancelled) setMod(m);
          } catch {
            // Module may not exist or be accessible
          }
        }

        // Resolve entity reference display names
        if (rec.entityReferences?.length > 0 && services?.entity) {
          const names = {};
          await Promise.all(
            rec.entityReferences.map(async (ref) => {
              try {
                const entity = await services.entity.getEntity(ref.workspaceId || workspaceId, ref.entityId);
                if (entity) names[ref.entityId] = entity.displayName;
              } catch {
                // Entity may not be accessible
              }
            }),
          );
          if (!cancelled) setEntityNames(names);
        }
      })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [workspaceId, recordId]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-neutral-200 rounded" />
          <div className="h-4 w-64 bg-neutral-100 rounded" />
        </div>
      </div>
    );
  }

  if (!record) {
    return (
      <div className="p-6">
        <p className="text-neutral-500">Record not found.</p>
      </div>
    );
  }

  const fields = mod?.formSchema?.fields || [];

  return (
    <div className="p-6 max-w-3xl">
      {mod && (
        <Link to={`/app/modules/${mod.moduleId}`} className="text-sm text-primary-600 hover:underline mb-4 inline-block">
          &larr; Back to {mod.name}
        </Link>
      )}

      {error && (
        <div className="p-3 mb-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      {/* Record Header */}
      <div className="bg-white border border-neutral-200 rounded-xl p-6 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">
              {mod?.name || record.recordType} Record
            </h1>
            <p className="text-xs text-neutral-400 font-mono mt-0.5">
              {record.recordId}
            </p>
          </div>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLORS[record.status] || ''}`}>
            {record.status}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-neutral-500">Module</span>
            <p className="font-medium text-neutral-800">{mod?.name || '—'}</p>
          </div>
          <div>
            <span className="text-neutral-500">Record Type</span>
            <p className="font-medium text-neutral-800 font-mono text-xs">{record.recordType}</p>
          </div>
          <div>
            <span className="text-neutral-500">Created</span>
            <p className="font-medium text-neutral-800">{formatTimestamp(record.createdAt)}</p>
          </div>
          {record.submittedAt && (
            <div>
              <span className="text-neutral-500">Submitted</span>
              <p className="font-medium text-neutral-800">{formatTimestamp(record.submittedAt)}</p>
            </div>
          )}
        </div>
      </div>

      {/* Record Data */}
      <div className="bg-white border border-neutral-200 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-neutral-800 mb-4">Data</h2>

        {fields.length > 0 ? (
          <div className="space-y-3">
            {fields.map((field) => {
              const value = record.data?.[field.key];
              const display = formatDisplayValue(value, field, { entityNames });
              return (
                <div key={field.key} className="flex flex-col sm:flex-row sm:items-baseline gap-1 py-2 border-b border-neutral-100 last:border-0">
                  <span className="text-sm text-neutral-500 sm:w-40 flex-shrink-0">{field.label}</span>
                  <span className="text-sm text-neutral-900 font-medium">{display}</span>
                </div>
              );
            })}
          </div>
        ) : (
          // Fallback: display raw data fields
          <div className="space-y-3">
            {Object.entries(record.data || {}).map(([key, value]) => (
              <div key={key} className="flex flex-col sm:flex-row sm:items-baseline gap-1 py-2 border-b border-neutral-100 last:border-0">
                <span className="text-sm text-neutral-500 sm:w-40 flex-shrink-0">{key}</span>
                <span className="text-sm text-neutral-900 font-medium">
                  {typeof value === 'object' ? JSON.stringify(value) : String(value ?? '—')}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Entity References */}
        {record.entityReferences?.length > 0 && (
          <div className="mt-6 pt-4 border-t border-neutral-200">
            <h3 className="text-sm font-semibold text-neutral-700 mb-2">Entity References</h3>
            <div className="space-y-1">
              {record.entityReferences.map((ref, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="text-neutral-500">{ref.entityTypeId}:</span>
                  <Link
                    to={`/app/entities/${ref.entityId}`}
                    className="text-primary-600 hover:underline font-medium"
                  >
                    {entityNames[ref.entityId] || ref.entityId}
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function formatTimestamp(ts) {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return ts;
  }
}
