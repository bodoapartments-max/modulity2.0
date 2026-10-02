/**
 * Create Module — manual Module Builder.
 * Users can define Module name, code, category, and form fields.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx';
import { useAuth } from '../../../app/providers/AuthProvider.jsx';
import { FIELD_TYPES } from '../../../core/data/entityType.js';
import { userActor } from '../../../core/data/actorRef.js';
import services from '../../../infrastructure/services.js';
import { workspaceQueryCache } from '../../../core/cache/workspaceQueryCache.js';

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

const EMPTY_FIELD = { key: '', label: '', type: 'text', required: false };

export default function CreateModulePage() {
  const navigate = useNavigate();
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [moduleCode, setModuleCode] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [fields, setFields] = useState([{ ...EMPTY_FIELD }]);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const updateField = (index, changes) => {
    setFields((prev) => prev.map((f, i) => (i === index ? { ...f, ...changes } : f)));
  };

  const addField = () => setFields((prev) => [...prev, { ...EMPTY_FIELD }]);

  const removeField = (index) => {
    setFields((prev) => prev.filter((_, i) => i !== index));
  };

  const moveField = (index, direction) => {
    setFields((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) { setError('Module name is required'); return; }
    if (!moduleCode.trim()) { setError('Module code is required'); return; }

    // Filter out empty fields
    const validFields = fields.filter((f) => f.key && f.label && f.type);
    if (validFields.length === 0) { setError('At least one field is required'); return; }

    setSaving(true);
    try {
      const created = await services.module.createModule({
        workspaceId: currentWorkspace.workspaceId,
        moduleCode: moduleCode.toUpperCase().replace(/\s+/g, '_'),
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
        createdBy: userActor(user.userId || user.uid),
      });
      workspaceQueryCache.invalidate(`${currentWorkspace.workspaceId}:modules:`);
      navigate(`/app/modules/${created.moduleId}`);
    } catch (err) {
      setError(err.message || 'Failed to create module');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-bold text-neutral-900 mb-1">Create Module</h1>
      <p className="text-sm text-neutral-500 mb-6">
        Define a new module with its form fields. The module starts in DRAFT status.
      </p>

      {error && (
        <div className="p-3 mb-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Module Identity */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-neutral-700 mb-1">
              Module Name <span className="text-red-500">*</span>
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Room Inspection"
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label htmlFor="code" className="block text-sm font-medium text-neutral-700 mb-1">
              Module Code <span className="text-red-500">*</span>
            </label>
            <input
              id="code"
              type="text"
              value={moduleCode}
              onChange={(e) => setModuleCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
              placeholder="ROOM_INSPECTION"
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <p className="text-xs text-neutral-400 mt-1">Uppercase letters, digits, underscores</p>
          </div>
        </div>

        <div>
          <label htmlFor="desc" className="block text-sm font-medium text-neutral-700 mb-1">Description</label>
          <textarea
            id="desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        <div>
          <label htmlFor="cat" className="block text-sm font-medium text-neutral-700 mb-1">Category</label>
          <input
            id="cat"
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Operations, HR, Finance..."
            className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        {/* Form Fields */}
        <div>
          <h2 className="text-lg font-semibold text-neutral-800 mb-3">Form Fields</h2>
          <div className="space-y-3">
            {fields.map((field, index) => (
              <FieldEditor
                key={index}
                field={field}
                index={index}
                total={fields.length}
                onChange={(changes) => updateField(index, changes)}
                onRemove={() => removeField(index)}
                onMove={(dir) => moveField(index, dir)}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={addField}
            className="mt-3 px-4 py-2 text-sm text-primary-600 border border-primary-300 rounded-lg hover:bg-primary-50 transition-colors"
          >
            + Add Field
          </button>
        </div>

        <div className="flex gap-3 pt-4 border-t border-neutral-200">
          <button
            type="submit"
            disabled={saving}
            className={`px-6 py-2 rounded-lg text-sm font-medium text-white transition-colors ${
              saving ? 'bg-primary-400 cursor-not-allowed' : 'bg-primary-600 hover:bg-primary-700'
            }`}
          >
            {saving ? 'Creating...' : 'Create Module'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/app/modules')}
            className="px-4 py-2 text-sm text-neutral-600 border border-neutral-300 rounded-lg hover:bg-neutral-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function FieldEditor({ field, index, total, onChange, onRemove, onMove }) {
  return (
    <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-lg">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-neutral-500">Field {index + 1}</span>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => onMove(-1)} disabled={index === 0}
            className="p-1 text-neutral-400 hover:text-neutral-600 disabled:opacity-30" title="Move up">&#9650;</button>
          <button type="button" onClick={() => onMove(1)} disabled={index === total - 1}
            className="p-1 text-neutral-400 hover:text-neutral-600 disabled:opacity-30" title="Move down">&#9660;</button>
          <button type="button" onClick={onRemove}
            className="p-1 text-red-400 hover:text-red-600 ml-2" title="Remove field">&#10005;</button>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-neutral-600 mb-1">Field Key</label>
          <input
            type="text"
            value={field.key}
            onChange={(e) => onChange({ key: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })}
            placeholder="fieldKey"
            className="w-full px-2 py-1.5 border border-neutral-300 rounded text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>
        <div>
          <label className="block text-xs text-neutral-600 mb-1">Label</label>
          <input
            type="text"
            value={field.label}
            onChange={(e) => onChange({ label: e.target.value })}
            placeholder="Field Label"
            className="w-full px-2 py-1.5 border border-neutral-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>
        <div>
          <label className="block text-xs text-neutral-600 mb-1">Type</label>
          <select
            value={field.type}
            onChange={(e) => onChange({ type: e.target.value })}
            className="w-full px-2 py-1.5 border border-neutral-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
          >
            {FIELD_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-4 mt-3">
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={!!field.required}
            onChange={(e) => onChange({ required: e.target.checked })}
            className="rounded border-neutral-300"
          />
          <span className="text-neutral-600">Required</span>
        </label>
      </div>

      {/* Type-specific settings */}
      {field.type === 'select' && (
        <div className="mt-3">
          <label className="block text-xs text-neutral-600 mb-1">Options (one per line)</label>
          <textarea
            value={field.optionsText || ''}
            onChange={(e) => onChange({ optionsText: e.target.value })}
            rows={3}
            placeholder="GOOD&#10;NEEDS_ATTENTION&#10;OUT_OF_SERVICE"
            className="w-full px-2 py-1.5 border border-neutral-300 rounded text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>
      )}

      {field.type === 'entity-reference' && (
        <div className="mt-3">
          <label className="block text-xs text-neutral-600 mb-1">Entity Type ID</label>
          <input
            type="text"
            value={field.entityTypeId || ''}
            onChange={(e) => onChange({ entityTypeId: e.target.value })}
            placeholder="ROOM, VEHICLE..."
            className="w-full px-2 py-1.5 border border-neutral-300 rounded text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
          <p className="text-xs text-neutral-400 mt-0.5">The Entity Type code to filter available entities</p>
        </div>
      )}
    </div>
  );
}
