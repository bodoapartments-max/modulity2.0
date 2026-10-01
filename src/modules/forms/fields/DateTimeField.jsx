import { FieldWrapper } from './FieldWrapper.jsx';

export function DateTimeField({ field, value, onChange, error, disabled }) {
  const fieldId = `field-${field.key}`;
  // Convert ISO datetime to datetime-local format for input
  const inputValue = value ? value.slice(0, 16) : '';
  return (
    <FieldWrapper field={field} error={error}>
      <input
        id={fieldId}
        type="datetime-local"
        value={inputValue}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(field.key, raw ? new Date(raw).toISOString() : '');
        }}
        disabled={disabled}
        required={field.required}
        aria-invalid={!!error}
        aria-describedby={error ? `${fieldId}-error` : field.helpText ? `${fieldId}-help` : undefined}
        className={`w-full px-3 py-2 border rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 ${
          error ? 'border-red-400 focus:ring-red-500' : 'border-neutral-300'
        } ${disabled ? 'bg-neutral-100 cursor-not-allowed' : 'bg-white'}`}
      />
    </FieldWrapper>
  );
}
