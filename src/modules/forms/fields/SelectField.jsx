import { FieldWrapper } from './FieldWrapper.jsx';

export function SelectField({ field, value, onChange, error, disabled }) {
  const fieldId = `field-${field.key}`;
  const options = (field.options || []).map((o) =>
    typeof o === 'object' && o !== null ? o : { value: o, label: o },
  );

  return (
    <FieldWrapper field={field} error={error}>
      <select
        id={fieldId}
        value={value || ''}
        onChange={(e) => onChange(field.key, e.target.value || undefined)}
        disabled={disabled}
        required={field.required}
        aria-invalid={!!error}
        aria-describedby={error ? `${fieldId}-error` : field.helpText ? `${fieldId}-help` : undefined}
        className={`w-full px-3 py-2 border rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 ${
          error ? 'border-red-400 focus:ring-red-500' : 'border-neutral-300'
        } ${disabled ? 'bg-neutral-100 cursor-not-allowed' : 'bg-white'}`}
      >
        <option value="">Select...</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </FieldWrapper>
  );
}
