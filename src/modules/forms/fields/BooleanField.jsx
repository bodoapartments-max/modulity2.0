import { FieldWrapper } from './FieldWrapper.jsx';

export function BooleanField({ field, value, onChange, error, disabled }) {
  const fieldId = `field-${field.key}`;
  return (
    <FieldWrapper field={field} error={error}>
      <div className="flex items-center gap-2 py-1">
        <button
          id={fieldId}
          type="button"
          role="switch"
          aria-checked={!!value}
          aria-invalid={!!error}
          aria-describedby={error ? `${fieldId}-error` : field.helpText ? `${fieldId}-help` : undefined}
          onClick={() => !disabled && onChange(field.key, !value)}
          disabled={disabled}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
            value ? 'bg-primary-600' : 'bg-neutral-300'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              value ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
        <span className="text-sm text-neutral-600">{value ? 'Yes' : 'No'}</span>
      </div>
    </FieldWrapper>
  );
}
