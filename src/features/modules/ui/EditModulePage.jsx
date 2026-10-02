/**
 * Edit Module — edit a DRAFT module's metadata and form fields.
 */
import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx';
import { useAuth } from '../../../app/providers/AuthProvider.jsx';
import { FIELD_TYPES } from '../../../core/data/entityType.js';
import { userActor } from '../../../core/data/actorRef.js';
import services from '../../../infrastructure/services.js';

const FIELD_TYPE_OPTIONS = [
  { value: FIELD_TYPES.TEXT, label: 'Text' },
  { value: FIELD_TYPES.TEXTAREA, label: 'Textarea' },
  { value: FIELD_TYPES.NUMBER, label: 'Number' },
  { value: FIELD_TYPES.DATE, label: 'Date' },
  { value: FIELD_TYPES.DATETIME, label: 'Date & Time' },
  { value: FIELD_TYPES.BOOLEAN, label: 'Yes/No' },
  { value: FIELD_TYPES.SELECT, label: 'Select' },
  { value: FIELD_TYPES.EMAIL, label: 'Email' },
  { value: FIELD_TYPES.PHONE, label: 'Phone' },
  { value: FIELD_TYPES.URL, label: 'URL' },
  { value: FIELD_TYPES.ENTITY_REFERENCE, label: 'Entity Reference' },
  { value: FIELD_TYPES.FILE_REFERENCE, label: 'File Reference' },
];

export default function EditModulePage() {
  const { moduleId } = useParams();
  const navigate = useNavigate();
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();
  const [mod, setMod] = useState(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [fields, setFields] = useState([]);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const workspaceId = currentWorkspace?.workspaceId;

  useEffect(() => {
    if (!workspaceId || !moduleId) return;
    services?.module?.getModule(workspaceId, moduleId)
      .then((result) => {
        setMod(result);
        if (result) {
          setName(result.name);
          setDescription(result.description || '');
          setCategory(result.category || '');
          setFields((result.formSchema?.fields || []).map((f) => ({
            ...f,
            optionsText: Array.isArray(f.options) ? f.options.join('\n') : '',
          })));
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [workspaceId, moduleId]);

  const updateField = (index, changes) => {
    setFields((prev) => prev.map((f, i) => (i === index ? { ...f, ...changes } : f)));
  };

  const addField = () => setFields((prev) => [...prev, { key: '', label: '', type: 'text', required: false }]);
  const removeField = (index) => setFields((prev) => prev.filter((_, i) => i !== index));
  const moveField = (index, dir) => {
    setFields((prev) => {
      const next = [...prev];
      const t = index + dir;
      if (t < 0 || t >= next.length) return prev;
      [next[index], next[t]] = [next[t], next[index]];
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const validFields = fields.filter((f) => f.key && f.label && f.type);

    setSaving(true);
    try {
      await services.module.updateModule(workspaceId, moduleId, {
        name: name.trim(),
        description: description.trim(),
        category: category.trim(),
        formSchema: {
          schemaVersion: '1.0.0',
          fields: validFields.map((f) => {
            const field = { key: f.key, label: f.label, type: f.type, required: !!f.required };
            if (f.type === 'select' && f.optionsText) {
              field.options = f.optionsText.split('\n').map((o) => o.trim()).filter(Boolean);
            }
            if (f.type === 'entity-reference' && f.entityTypeId) {
              field.entityTypeId = f.entityTypeId;
            }
            if (f.placeholder) field.placeholder = f.placeholder;
            if (f.helpText) field.helpText = f.helpText;
            return field;
          }),
        },
      }, userActor(user.userId || user.uid));
      navigate(`/app/modules/${moduleId}`);
    } catch (err) {
      setError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-6"><div className="animate-pulse h-8 w-48 bg-neutral-200 rounded" /></div>;
  }

  if (!mod || mod.status !== 'DRAFT') {
    return (
      <div className="p-6">
        <p className="text-neutral-500">{!mod ? 'Module not found.' : 'Only DRAFT modules can be edited.'}</p>
        <Link to="/app/modules" className="text-primary-600 text-sm hover:underline">Back to Modules</Link>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl">
      <Link to={`/app/modules/${moduleId}`} className="text-sm text-primary-600 hover:underline mb-4 inline-block">
        &larr; Back to {mod.name}
      </Link>
      <h1 className="text-2xl font-bold text-neutral-900 mb-6">Edit Module</h1>

      {error && (
        <div className="p-3 mb-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Module Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Code (read-only)</label>
            <input type="text" value={mod.moduleCode} disabled
              className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm bg-neutral-100 font-mono" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
            className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Category</label>
          <input type="text" value={category} onChange={(e) => setCategory(e.target.value)}
            className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>

        <div>
          <h2 className="text-lg font-semibold text-neutral-800 mb-3">Form Fields</h2>
          <div className="space-y-3">
            {fields.map((field, index) => (
              <div key={index} className="p-4 bg-neutral-50 border border-neutral-200 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-neutral-500">Field {index + 1}</span>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => moveField(index, -1)} disabled={index === 0}
                      className="p-1 text-neutral-400 hover:text-neutral-600 disabled:opacity-30">&#9650;</button>
                    <button type="button" onClick={() => moveField(index, 1)} disabled={index === fields.length - 1}
                      className="p-1 text-neutral-400 hover:text-neutral-600 disabled:opacity-30">&#9660;</button>
                    <button type="button" onClick={() => removeField(index)}
                      className="p-1 text-red-400 hover:text-red-600 ml-2">&#10005;</button>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input type="text" value={field.key} onChange={(e) => updateField(index, { key: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })}
                    placeholder="fieldKey" className="px-2 py-1.5 border border-neutral-300 rounded text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary-500" />
                  <input type="text" value={field.label} onChange={(e) => updateField(index, { label: e.target.value })}
                    placeholder="Label" className="px-2 py-1.5 border border-neutral-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-primary-500" />
                  <select value={field.type} onChange={(e) => updateField(index, { type: e.target.value })}
                    className="px-2 py-1.5 border border-neutral-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-primary-500">
                    {FIELD_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <label className="flex items-center gap-1.5 text-sm mt-2">
                  <input type="checkbox" checked={!!field.required} onChange={(e) => updateField(index, { required: e.target.checked })} className="rounded" />
                  <span className="text-neutral-600">Required</span>
                </label>
                {field.type === 'select' && (
                  <textarea value={field.optionsText || ''} onChange={(e) => updateField(index, { optionsText: e.target.value })}
                    rows={3} placeholder="Options (one per line)" className="mt-2 w-full px-2 py-1.5 border border-neutral-300 rounded text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary-500" />
                )}
                {field.type === 'entity-reference' && (
                  <input type="text" value={field.entityTypeId || ''} onChange={(e) => updateField(index, { entityTypeId: e.target.value })}
                    placeholder="Entity Type ID" className="mt-2 w-full px-2 py-1.5 border border-neutral-300 rounded text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary-500" />
                )}
              </div>
            ))}
          </div>
          <button type="button" onClick={addField}
            className="mt-3 px-4 py-2 text-sm text-primary-600 border border-primary-300 rounded-lg hover:bg-primary-50">+ Add Field</button>
        </div>

        <div className="flex gap-3 pt-4 border-t border-neutral-200">
          <button type="submit" disabled={saving}
            className={`px-6 py-2 rounded-lg text-sm font-medium text-white ${saving ? 'bg-primary-400' : 'bg-primary-600 hover:bg-primary-700'}`}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <Link to={`/app/modules/${moduleId}`}
            className="px-4 py-2 text-sm text-neutral-600 border border-neutral-300 rounded-lg hover:bg-neutral-50">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
