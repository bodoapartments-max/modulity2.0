import { FieldWrapper } from './FieldWrapper.jsx';

export function NumberField({ field, value, onChange, error, disabled }) {
  const fieldId = `field-${field.key}`;
  return (
    <FieldWrapper field={field} error={error}>
      <input
        id={fieldId}
        type="number"
        value={value ?? ''}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(field.key, raw === '' ? undefined : Number(raw));
        }}
        disabled={disabled}
        placeholder={field.placeholder || ''}
        min={field.min}
        max={field.max}
        step={field.step || 'any'}
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
