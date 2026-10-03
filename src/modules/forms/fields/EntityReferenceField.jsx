import { useState, useEffect } from 'react';
import { FieldWrapper } from './FieldWrapper.jsx';
import { useFormFieldServices } from '../FormFieldServicesContext.jsx';

export function EntityReferenceField({ field, value, onChange, error, disabled, workspaceId }) {
  const fieldServices = useFormFieldServices();
  const fieldId = `field-${field.key}`;
  const [entities, setEntities] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!workspaceId || !field.entityTypeId) return;
    let cancelled = false;
    setLoading(true);
    const loadEntities = fieldServices?.loadEntities;
    if (typeof loadEntities === 'function') {
      loadEntities(workspaceId, { entityTypeId: field.entityTypeId })
        .then((list) => { if (!cancelled) setEntities(list || []); })
        .catch(() => { if (!cancelled) setEntities([]); })
        .finally(() => { if (!cancelled) setLoading(false); });
    } else {
      setLoading(false);
    }
    return () => { cancelled = true; };
  }, [workspaceId, field.entityTypeId, fieldServices]);

  const selectedEntityId = value?.entityId || '';

  const handleChange = (e) => {
    const entityId = e.target.value;
    if (!entityId) {
      onChange(field.key, undefined);
      return;
    }
    const entity = entities.find((en) => en.entityId === entityId);
    if (entity) {
      onChange(field.key, {
        entityId: entity.entityId,
        entityTypeId: entity.entityTypeId,
        workspaceId: entity.workspaceId,
      });
    }
  };

  return (
    <FieldWrapper field={field} error={error}>
      <select
        id={fieldId}
        value={selectedEntityId}
        onChange={handleChange}
        disabled={disabled || loading}
        required={field.required}
        aria-invalid={!!error}
        aria-describedby={error ? `${fieldId}-error` : field.helpText ? `${fieldId}-help` : undefined}
        className={`w-full px-3 py-2 border rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 ${
          error ? 'border-red-400 focus:ring-red-500' : 'border-neutral-300'
        } ${disabled ? 'bg-neutral-100 cursor-not-allowed' : 'bg-white'}`}
      >
        <option value="">{loading ? 'Loading...' : 'Select...'}</option>
        {entities.map((entity) => (
          <option key={entity.entityId} value={entity.entityId}>
            {entity.displayName}
          </option>
        ))}
      </select>
    </FieldWrapper>
  );
}
