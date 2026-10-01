import { FieldWrapper } from './FieldWrapper.jsx';

export function FileReferenceField({ field, value, onChange, error, disabled }) {
  const fieldId = `field-${field.key}`;
  return (
    <FieldWrapper field={field} error={error}>
      <div className="flex items-center gap-2">
        <input
          id={fieldId}
          type="text"
          value={value || ''}
          onChange={(e) => onChange(field.key, e.target.value || undefined)}
          disabled={disabled}
          placeholder="File reference (upload coming soon)"
          required={field.required}
          aria-invalid={!!error}
          aria-describedby={error ? `${fieldId}-error` : field.helpText ? `${fieldId}-help` : undefined}
          className={`w-full px-3 py-2 border rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 ${
            error ? 'border-red-400 focus:ring-red-500' : 'border-neutral-300'
          } ${disabled ? 'bg-neutral-100 cursor-not-allowed' : 'bg-white'}`}
        />
      </div>
      <p className="mt-1 text-xs text-neutral-400">File upload not yet available. Enter a file reference ID.</p>
    </FieldWrapper>
  );
}
