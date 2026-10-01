/**
 * Shared field wrapper — label, required indicator, error, help text.
 * All field components use this for consistent structure and accessibility.
 */
export function FieldWrapper({ field, error, children }) {
  const fieldId = `field-${field.key}`;
  const errorId = `${fieldId}-error`;
  const helpId = `${fieldId}-help`;
  const widthClass = field.width === 'HALF' ? 'sm:w-1/2' : field.width === 'THIRD' ? 'sm:w-1/3' : 'w-full';

  return (
    <div className={`${widthClass} px-1 mb-4`}>
      <label htmlFor={fieldId} className="block text-sm font-medium text-neutral-700 mb-1">
        {field.label}
        {field.required && <span className="text-red-500 ml-0.5" aria-label="required">*</span>}
      </label>
      {children}
      {field.helpText && (
        <p id={helpId} className="mt-1 text-xs text-neutral-500">{field.helpText}</p>
      )}
      {error && (
        <p id={errorId} role="alert" className="mt-1 text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}
