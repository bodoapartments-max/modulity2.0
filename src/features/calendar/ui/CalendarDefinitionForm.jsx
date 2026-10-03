import { useMemo, useState } from 'react';
import Button from '../../../design-system/components/Button/Button.jsx';
import Label from '../../../design-system/components/Label/Label.jsx';

const FIELD_TYPE_GROUPS = {
  title: new Set(['text', 'textarea', 'select', 'email', 'phone', 'entity-reference']),
  time: new Set(['date', 'datetime', 'date-range']),
  resource: new Set(['entity-reference']),
};

function parseInitialMapping(definition) {
  return definition?.configuration?.mapping || { titleField: '', startField: '' };
}

function parseInitialModuleId(definition, modules) {
  if (!definition) return '';
  const moduleCode = definition.source?.ref?.replace('module:', '');
  return modules.find((m) => m.moduleCode === moduleCode)?.moduleId || '';
}

export default function CalendarDefinitionForm({ modules, initialDefinition, onSubmit, onCancel, saving }) {
  const isEdit = Boolean(initialDefinition);
  const [name, setName] = useState(initialDefinition?.name || '');
  const [description, setDescription] = useState(initialDefinition?.description || '');
  const [moduleId, setModuleId] = useState(() => parseInitialModuleId(initialDefinition, modules));
  const [mapping, setMapping] = useState(() => parseInitialMapping(initialDefinition));
  const [error, setError] = useState(null);

  const selectedModule = useMemo(() => modules.find((m) => m.moduleId === moduleId), [modules, moduleId]);
  const fields = selectedModule?.formSchema?.fields || [];

  const compatibleFields = (typeSet) => fields.filter((f) => typeSet.has(f.type));
  const startIsDateRange = fields.find((f) => f.key === mapping.startField)?.type === 'date-range';

  const handleFieldChange = (key, value) => {
    setMapping((m) => {
      const next = { ...m, [key]: value || undefined };
      if (key === 'startField') {
        const field = fields.find((f) => f.key === value);
        if (field?.type === 'date-range') {
          delete next.endField;
        }
      }
      return next;
    });
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setError(null);
    if (!name.trim()) return setError('Name is required');
    if (!moduleId) return setError('Source Module is required');
    if (!mapping.titleField) return setError('Title field is required');
    if (!mapping.startField) return setError('Start field is required');
    const cleanMapping = Object.fromEntries(Object.entries(mapping).filter(([, v]) => v));
    onSubmit({ definitionId: initialDefinition?.definitionId, name: name.trim(), description: description.trim(), sourceModuleId: moduleId, mapping: cleanMapping }).catch((err) => setError(err.message));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-neutral-200 bg-white p-4">
      <h3 className="text-lg font-semibold text-neutral-900">{isEdit ? 'Edit Calendar' : 'New Calendar'}</h3>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div>
        <Label htmlFor="cal-name" required>Name</Label>
        <input id="cal-name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
      </div>
      <div>
        <Label htmlFor="cal-desc">Description</Label>
        <input id="cal-desc" value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
      </div>
      <div>
        <Label htmlFor="cal-module" required>Source Module</Label>
        <select id="cal-module" value={moduleId} onChange={(e) => { setModuleId(e.target.value); setMapping({ titleField: '', startField: '' }); }} className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm">
          <option value="">Select a module…</option>
          {modules.map((m) => <option key={m.moduleId} value={m.moduleId}>{m.name}</option>)}
        </select>
      </div>
      {selectedModule && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="cal-title" required>Title field</Label>
              <select id="cal-title" value={mapping.titleField || ''} onChange={(e) => handleFieldChange('titleField', e.target.value)} className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm">
                <option value="">Select…</option>
                {compatibleFields(FIELD_TYPE_GROUPS.title).map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="cal-start" required>Start field</Label>
              <select id="cal-start" value={mapping.startField || ''} onChange={(e) => handleFieldChange('startField', e.target.value)} className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm">
                <option value="">Select…</option>
                {compatibleFields(FIELD_TYPE_GROUPS.time).map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="cal-end">End field {startIsDateRange && <span className="text-neutral-400 text-xs">(not used with date-range)</span>}</Label>
              <select id="cal-end" value={mapping.endField || ''} disabled={startIsDateRange} onChange={(e) => handleFieldChange('endField', e.target.value)} className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm disabled:bg-neutral-100 disabled:text-neutral-500">
                <option value="">None</option>
                {compatibleFields(FIELD_TYPE_GROUPS.time).map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="cal-resource">Resource field</Label>
              <select id="cal-resource" value={mapping.resourceField || ''} onChange={(e) => handleFieldChange('resourceField', e.target.value)} className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm">
                <option value="">None</option>
                {compatibleFields(FIELD_TYPE_GROUPS.resource).map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
            </div>
          </div>
        </>
      )}
      <div className="flex gap-2 pt-2">
        <Button type="submit" loading={saving} disabled={saving}>{isEdit ? 'Save Changes' : 'Create Calendar'}</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
