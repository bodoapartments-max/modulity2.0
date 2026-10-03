/**
 * Textarea
 *
 * Generic multi-line text input primitive.
 */
import { forwardRef } from 'react';
import Label from '../Label/Label.jsx';

const Textarea = forwardRef(function Textarea({
  id,
  label,
  value,
  placeholder,
  disabled = false,
  required = false,
  rows = 3,
  error,
  helperText,
  onChange,
  className = '',
  ...rest
}, ref) {
  const textareaId = id || `textarea-${Math.random().toString(36).slice(2, 9)}`;
  return (
    <div className={className}>
      {label && <Label htmlFor={textareaId} required={required}>{label}</Label>}
      <textarea
        ref={ref}
        id={textareaId}
        rows={rows}
        value={value}
        disabled={disabled}
        required={required}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        aria-describedby={helperText ? `${textareaId}-helper` : undefined}
        onChange={onChange}
        className={`
          block w-full rounded-md border px-3 py-2 text-sm
          focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500
          placeholder:text-neutral-400
          disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-500
          ${error
            ? 'border-danger text-danger-900 focus:ring-danger focus:border-danger'
            : 'border-neutral-300 text-neutral-900'}
          ${label ? 'mt-1' : ''}
        `}
        {...rest}
      />
      {helperText && (
        <p id={`${textareaId}-helper`} className="mt-1 text-xs text-neutral-500">
          {helperText}
        </p>
      )}
      {error && (
        <p className="mt-1 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
});

export default Textarea;
