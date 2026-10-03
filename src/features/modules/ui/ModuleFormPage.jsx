/**
 * Module Form — the actual form submission page.
 * Uses the generic FormRenderer to render any Module's form.
 */
import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx';
import { useAuth } from '../../../app/providers/AuthProvider.jsx';
import { userActor } from '../../../core/data/actorRef.js';
import { FormRenderer } from '../../../modules/forms/FormRenderer.jsx';
import services from '../../../infrastructure/services.js';
import { workspaceQueryCache } from '../../../core/cache/workspaceQueryCache.js';

export default function ModuleFormPage() {
  const { moduleId } = useParams();
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();
  const [mod, setMod] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const workspaceId = currentWorkspace?.workspaceId;
  const actor = user ? userActor(user.userId || user.uid) : null;

  useEffect(() => {
    if (!workspaceId || !moduleId) return;
    let cancelled = false;
    setLoading(true);
    services?.module?.getModule(workspaceId, moduleId)
      .then((result) => { if (!cancelled) setMod(result); })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [workspaceId, moduleId]);

  const handleSubmit = useCallback(async (values) => {
    setError(null);
    setSubmitting(true);
    try {
      const record = await services.moduleSubmission.submitModuleRecord({
        workspaceId,
        moduleId,
        actor,
        values,
      });
      workspaceQueryCache.invalidate(`${workspaceId}:records:`);
      workspaceQueryCache.invalidate(`${workspaceId}:dashboardRecords:`);
      workspaceQueryCache.invalidate(`${workspaceId}:widgetResult:`);
      setSuccess(record);
    } catch (err) {
      setError(err.cause || err.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  }, [workspaceId, moduleId, actor]);

  const handleSaveDraft = useCallback(async (values) => {
    setError(null);
    setSubmitting(true);
    try {
      const record = await services.moduleSubmission.saveDraft({
        workspaceId,
        moduleId,
        actor,
        values,
      });
      workspaceQueryCache.invalidate(`${workspaceId}:records:`);
      workspaceQueryCache.invalidate(`${workspaceId}:dashboardRecords:`);
      workspaceQueryCache.invalidate(`${workspaceId}:widgetResult:`);
      setSuccess(record);
    } catch (err) {
      setError(err.cause || err.message || 'Failed to save draft');
    } finally {
      setSubmitting(false);
    }
  }, [workspaceId, moduleId, actor]);

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

  // Success state
  if (success) {
    return (
      <div className="p-6 max-w-2xl">
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
          <div className="text-4xl mb-3">&#9989;</div>
          <h2 className="text-lg font-semibold text-green-800 mb-2">
            {success.status === 'DRAFT' ? 'Draft Saved' : 'Record Created'}
          </h2>
          <p className="text-sm text-green-700 mb-4">
            Record ID: <span className="font-mono">{success.recordId?.slice(0, 8)}...</span>
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link
              to={`/app/records/${success.recordId}`}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700"
            >
              View Record
            </Link>
            <button
              onClick={() => { setSuccess(null); setError(null); }}
              className="px-4 py-2 border border-neutral-300 text-neutral-600 rounded-lg text-sm font-medium hover:bg-neutral-50"
            >
              Create Another
            </button>
            <Link
              to={`/app/modules/${moduleId}`}
              className="px-4 py-2 border border-neutral-300 text-neutral-600 rounded-lg text-sm font-medium hover:bg-neutral-50"
            >
              Back to Module
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl">
      <Link to={`/app/modules/${moduleId}`} className="text-sm text-primary-600 hover:underline mb-4 inline-block">
        &larr; Back to {mod.name}
      </Link>

      <h1 className="text-2xl font-bold text-neutral-900 mb-1">{mod.name}</h1>
      {mod.description && (
        <p className="text-sm text-neutral-500 mb-4">{mod.description}</p>
      )}
      {mod.status === 'DRAFT' && (
        <div className="p-2 mb-4 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-700">
          This module is in DRAFT mode. Records created here are for testing purposes.
        </div>
      )}

      {error && (
        <div className="p-3 mb-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {typeof error === 'object' ? (
            <ul className="list-disc pl-4">
              {Object.entries(error).map(([key, msg]) => (
                <li key={key}><strong>{key}:</strong> {msg}</li>
              ))}
            </ul>
          ) : error}
        </div>
      )}

      <div className="bg-white border border-neutral-200 rounded-xl p-6">
        <FormRenderer
          schema={mod.formSchema}
          workspaceId={workspaceId}
          onSubmit={handleSubmit}
          onSaveDraft={handleSaveDraft}
          loading={submitting}
          submitLabel="Submit"
          fieldServices={{ loadEntities: services.entity.listEntities }}
        />
      </div>
    </div>
  );
}
