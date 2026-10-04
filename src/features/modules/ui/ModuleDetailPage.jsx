/**
 * Module Detail — shows module info, actions, and preview.
 */
import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx';
import { useAuth } from '../../../app/providers/AuthProvider.jsx';
import { userActor } from '../../../core/data/actorRef.js';
import { FormRenderer } from '../../../modules/forms/FormRenderer.jsx';
import services from '../../../infrastructure/services.js';
import AdminActions from '../../admin/ui/AdminActions.jsx';

const STATUS_COLORS = {
  DRAFT: 'bg-neutral-100 text-neutral-700',
  ACTIVE: 'bg-green-100 text-green-800',
  INACTIVE: 'bg-yellow-100 text-yellow-800',
  ARCHIVED: 'bg-neutral-200 text-neutral-500',
};

export default function ModuleDetailPage() {
  const { moduleId } = useParams();
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [mod, setMod] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const workspaceId = currentWorkspace?.workspaceId;
  const actor = user ? userActor(user.userId || user.uid) : null;

  const loadModule = useCallback(async () => {
    if (!workspaceId || !moduleId) return;
    setLoading(true);
    try {
      const result = await services?.module?.getModule(workspaceId, moduleId);
      setMod(result);
      setCategories(await services?.moduleCategory?.listCategories(workspaceId) ?? []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, moduleId]);

  useEffect(() => { loadModule(); }, [loadModule]);

  const canonicalCategory = categories.find((c) => c.categoryId === mod?.categoryId) || null;

  const handleActivate = async () => {
    setActionLoading(true);
    setError(null);
    try {
      await services.module.activateModule(workspaceId, moduleId, actor);
      await loadModule();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeactivate = async () => {
    setActionLoading(true);
    setError(null);
    try {
      await services.module.deactivateModule(workspaceId, moduleId, actor);
      await loadModule();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleArchive = async () => {
    setActionLoading(true);
    setError(null);
    try {
      await services.module.archiveModule(workspaceId, moduleId, actor);
      await loadModule();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

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

  if (!mod) {
    return (
      <div className="p-6">
        <p className="text-neutral-500">Module not found.</p>
        <Link to="/app/modules" className="text-primary-600 text-sm hover:underline">Back to Modules</Link>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl">
      <Link to="/app/modules" className="text-sm text-primary-600 hover:underline mb-4 inline-block">
        &larr; Back to Modules
      </Link>

      {error && (
        <div className="p-3 mb-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="bg-white border border-neutral-200 rounded-xl p-6 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">{mod.name}</h1>
            <p className="text-sm text-neutral-400 font-mono mt-0.5">{mod.moduleCode}</p>
            {mod.description && (
              <p className="text-neutral-600 mt-2">{mod.description}</p>
            )}
          </div>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLORS[mod.status] || ''}`}>
            {mod.status}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 text-sm">
          <div>
            <span className="text-neutral-500">Category</span>
            {mod.status !== 'ARCHIVED' ? (
              <select
                aria-label="Module Category"
                value={mod.categoryId || ''}
                onChange={async (event) => {
                  try {
                    setActionLoading(true);
                    await services.module.updateModule(workspaceId, moduleId, { categoryId: event.target.value || null }, actor);
                    await loadModule();
                  } catch (err) { setError(err.message); } finally { setActionLoading(false); }
                }}
                className="mt-1 block w-full rounded-md border border-neutral-300 px-2 py-1 text-sm"
                disabled={actionLoading}
              >
                <option value="">Uncategorized</option>
                {categories.filter((c) => c.status === 'ACTIVE').map((cat) => (
                  <option key={cat.categoryId} value={cat.categoryId}>{cat.displayName}</option>
                ))}
              </select>
            ) : (
              <p className="font-medium text-neutral-800">{canonicalCategory?.displayName || mod.category || '—'}</p>
            )}
          </div>
          <div>
            <span className="text-neutral-500">Version</span>
            <p className="font-medium text-neutral-800">v{mod.version}</p>
          </div>
          <div>
            <span className="text-neutral-500">Fields</span>
            <p className="font-medium text-neutral-800">{mod.formSchema?.fields?.length || 0}</p>
          </div>
          <div>
            <span className="text-neutral-500">Record Type</span>
            <p className="font-medium text-neutral-800 font-mono text-xs">{mod.recordConfig?.recordType || mod.moduleCode}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 mt-6 pt-4 border-t border-neutral-100">
          <Link
            to={`/app/modules/${moduleId}/records`}
            className="px-4 py-2 border border-primary-300 text-primary-700 rounded-lg text-sm font-medium hover:bg-primary-50 transition-colors"
          >
            View Records
          </Link>

          {(mod.status === 'ACTIVE' || mod.status === 'DRAFT') && (
            <Link
              to={`/app/modules/${moduleId}/form`}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
            >
              {mod.status === 'ACTIVE' ? 'Open Form' : 'Test Form'}
            </Link>
          )}

          {(mod.status === 'DRAFT' || mod.status === 'INACTIVE') && (
            <button
              onClick={handleActivate}
              disabled={actionLoading}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              Activate
            </button>
          )}

          {mod.status === 'ACTIVE' && (
            <button
              onClick={handleDeactivate}
              disabled={actionLoading}
              className="px-4 py-2 border border-yellow-500 text-yellow-700 rounded-lg text-sm font-medium hover:bg-yellow-50 transition-colors disabled:opacity-50"
            >
              Deactivate
            </button>
          )}

          {mod.status !== 'ARCHIVED' && (
            <button
              onClick={handleArchive}
              disabled={actionLoading}
              className="px-4 py-2 border border-neutral-300 text-neutral-600 rounded-lg text-sm font-medium hover:bg-neutral-50 transition-colors disabled:opacity-50"
            >
              Archive
            </button>
          )}

          {mod.status !== 'ARCHIVED' && (
            <Link
              to={`/app/modules/${moduleId}/edit`}
              className="px-4 py-2 border border-neutral-300 text-neutral-600 rounded-lg text-sm font-medium hover:bg-neutral-50 transition-colors"
            >
              Open Designer
            </Link>
          )}

          {mod.status === 'ARCHIVED' && (
            <button
              onClick={async () => {
                setActionLoading(true);
                try {
                  await services.module.restoreModule(workspaceId, moduleId);
                  await loadModule();
                } catch (err) { setError(err.message); } finally { setActionLoading(false); }
              }}
              disabled={actionLoading}
              className="px-4 py-2 border border-green-500 text-green-700 rounded-lg text-sm font-medium hover:bg-green-50 transition-colors disabled:opacity-50"
            >
              Restore
            </button>
          )}

          <button
            onClick={() => setShowPreview(!showPreview)}
            className="px-4 py-2 border border-neutral-300 text-neutral-600 rounded-lg text-sm font-medium hover:bg-neutral-50 transition-colors"
          >
            {showPreview ? 'Hide Preview' : 'Preview Form'}
          </button>
        </div>

        {/* Step 17.3 — trusted administration actions (rename / delete via dependency check) */}
        <AdminActions
          resourceLabel={`Module "${mod.name}"`}
          status={mod.status}
          busy={actionLoading}
          onRename={async (newName) => {
            setActionLoading(true);
            try {
              await services.module.updateModule(workspaceId, moduleId, { name: newName }, actor);
              await loadModule();
            } catch (err) { setError(err.message); } finally { setActionLoading(false); }
          }}
          onArchive={handleArchive}
          onRestore={async () => {
            setActionLoading(true);
            try {
              await services.module.restoreModule(workspaceId, moduleId);
              await loadModule();
            } catch (err) { setError(err.message); } finally { setActionLoading(false); }
          }}
          onDelete={async () => {
            setActionLoading(true);
            try {
              await services.module.deleteModule(workspaceId, moduleId);
              navigate('/app/modules');
            } catch (err) { setError(err.message); setActionLoading(false); }
          }}
        />
      </div>

      {/* Form Schema Summary */}
      <div className="bg-white border border-neutral-200 rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold text-neutral-800 mb-3">Form Fields</h2>
        {mod.formSchema?.fields?.length > 0 ? (
          <div className="space-y-2">
            {mod.formSchema.fields.map((field, i) => (
              <div key={field.key || i} className="flex items-center gap-3 py-2 px-3 bg-neutral-50 rounded-lg text-sm">
                <span className="font-mono text-xs text-neutral-500 w-24 flex-shrink-0">{field.key}</span>
                <span className="font-medium text-neutral-800 flex-1">{field.label}</span>
                <span className="text-xs text-neutral-500 bg-neutral-200 px-2 py-0.5 rounded">{field.type}</span>
                {field.required && <span className="text-xs text-red-500">required</span>}
                {field.entityTypeId && <span className="text-xs text-primary-600">{field.entityTypeId}</span>}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-neutral-500">No fields defined.</p>
        )}
      </div>

      {/* Form Preview */}
      {showPreview && mod.formSchema?.fields?.length > 0 && (
        <div className="bg-white border border-neutral-200 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-neutral-800 mb-4">Form Preview</h2>
          <p className="text-xs text-neutral-400 mb-4">Preview only — submissions will not create records.</p>
          <FormRenderer
            schema={mod.formSchema}
            workspaceId={workspaceId}
            onSubmit={() => {}}
            disabled
            submitLabel="Submit (Preview)"
            fieldServices={{ loadEntities: services.entity.listEntities }}
          />
        </div>
      )}
    </div>
  );
}
