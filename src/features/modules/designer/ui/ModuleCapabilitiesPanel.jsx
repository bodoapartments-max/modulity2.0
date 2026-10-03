import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../../../../design-system/components/Button/Button.jsx';
import { useWorkspace } from '../../../../app/providers/WorkspaceProvider.jsx';
import { useAuth } from '../../../../app/providers/AuthProvider.jsx';
import services from '../../../../infrastructure/services.js';
import { createCalendarDefinitionV1 } from '../../../../engines/calendar/index.js';
import { userActor } from '../../../../core/data/actorRef.js';

const FIELD_TYPE_GROUPS = {
  title: new Set(['text', 'textarea', 'select', 'email', 'phone', 'entity-reference']),
  time: new Set(['date', 'datetime']),
  resource: new Set(['entity-reference']),
};

export default function ModuleCapabilitiesPanel({ moduleDefinition }) {
  const { currentWorkspace, currentMembership } = useWorkspace();
  const { user } = useAuth();
  const [definitions, setDefinitions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mapping, setMapping] = useState({ titleField: '', startField: '' });

  const canManage = services?.capabilityDefinition?.canManage(currentWorkspace, currentMembership) ?? false;
  const fields = moduleDefinition?.formSchema?.fields || [];
  const engineAvailable = useMemo(() => services?.capabilityRuntime?.isOperational({ engineId: 'calendar', contractVersion: '1.0.0' }) ?? false, []);

  useEffect(() => {
    if (!currentWorkspace?.workspaceId || !moduleDefinition?.moduleCode || !services?.capabilityDefinition?.listDefinitionsByEngine) return;
    let cancelled = false;
    setLoading(true);
    services.capabilityDefinition.listDefinitionsByEngine(currentWorkspace, 'calendar')
      .then((list) => { if (!cancelled) setDefinitions(list.filter((d) => d.source.ref === `module:${moduleDefinition.moduleCode}`)); })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [currentWorkspace, moduleDefinition]);

  const compatibleFields = (typeSet) => fields.filter((f) => typeSet.has(f.type));

  const handleCreate = async (event) => {
    event.preventDefault();
    if (!mapping.titleField || !mapping.startField) return;
    setSaving(true);
    setError(null);
    try {
      const actor = userActor(user.userId || user.uid);
      const cleanMapping = Object.fromEntries(Object.entries(mapping).filter(([, v]) => v));
      const def = createCalendarDefinitionV1({
        definitionId: `calendar:${moduleDefinition.moduleCode.toLowerCase()}:${Date.now()}`,
        workspaceId: currentWorkspace.workspaceId,
        sourceRef: `module:${moduleDefinition.moduleCode}`,
        mapping: cleanMapping,
        status: 'ACTIVE',
      });
      await services.capabilityDefinition.createDefinition({
        workspace: currentWorkspace,
        membership: currentMembership,
        engineId: 'calendar',
        name: `${moduleDefinition.name} Calendar`,
        description: '',
        source: def.source,
        configuration: def.configuration,
        status: 'ACTIVE',
        createdBy: actor,
      });
      const list = await services.capabilityDefinition.listDefinitionsByEngine(currentWorkspace, 'calendar');
      setDefinitions(list.filter((d) => d.source.ref === `module:${moduleDefinition.moduleCode}`));
      setShowForm(false);
      setMapping({ titleField: '', startField: '' });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!engineAvailable) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-neutral-900">Capabilities</h2>
        <p className="mt-1 text-sm text-neutral-500">Calendar capability is not currently available.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">Capabilities</h2>
          <p className="text-sm text-neutral-600">Calendar is operational for this Module.</p>
        </div>
        {canManage && (
          <Button size="sm" variant="secondary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? 'Cancel' : 'Add Calendar'}
          </Button>
        )}
      </div>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      {loading && <p className="text-sm text-neutral-500">Loading…</p>}

      {showForm && (
        <form onSubmit={handleCreate} className="mb-4 grid gap-3 rounded-lg bg-neutral-50 p-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-neutral-700">Title field</label>
            <select value={mapping.titleField} onChange={(e) => setMapping((m) => ({ ...m, titleField: e.target.value }))} className="mt-1 block w-full rounded-md border border-neutral-300 px-2 py-1 text-sm">
              <option value="">Select…</option>
              {compatibleFields(FIELD_TYPE_GROUPS.title).map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-700">Start field</label>
            <select value={mapping.startField} onChange={(e) => setMapping((m) => ({ ...m, startField: e.target.value }))} className="mt-1 block w-full rounded-md border border-neutral-300 px-2 py-1 text-sm">
              <option value="">Select…</option>
              {compatibleFields(FIELD_TYPE_GROUPS.time).map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-700">End field</label>
            <select value={mapping.endField || ''} onChange={(e) => setMapping((m) => ({ ...m, endField: e.target.value || undefined }))} className="mt-1 block w-full rounded-md border border-neutral-300 px-2 py-1 text-sm">
              <option value="">None</option>
              {compatibleFields(FIELD_TYPE_GROUPS.time).map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-700">Resource field</label>
            <select value={mapping.resourceField || ''} onChange={(e) => setMapping((m) => ({ ...m, resourceField: e.target.value || undefined }))} className="mt-1 block w-full rounded-md border border-neutral-300 px-2 py-1 text-sm">
              <option value="">None</option>
              {compatibleFields(FIELD_TYPE_GROUPS.resource).map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" size="sm" loading={saving} disabled={saving}>Create CalendarDefinition</Button>
          </div>
        </form>
      )}

      {definitions.length === 0 && !loading && <p className="text-sm text-neutral-500">No CalendarDefinitions linked to this Module.</p>}
      {definitions.map((def) => (
        <div key={def.definitionId} className="mb-2 flex items-center justify-between rounded-md border border-neutral-200 p-2 text-sm">
          <span className="font-medium text-neutral-800">{def.name}</span>
          <span className="text-xs text-neutral-500">{def.status}</span>
        </div>
      ))}
      {definitions.length > 0 && (
        <Link to="/app/calendars/manage" className="text-sm text-primary-600 hover:underline">Manage Calendars</Link>
      )}
    </div>
  );
}
