/**
 * Select
 *
 * Generic form select primitive. Renders a native <select> for accessibility
 * and predictable form behavior, with consistent styling.
 */
import { forwardRef } from 'react';
import Label from '../Label/Label.jsx';

const Select = forwardRef(function Select({
  id,
  label,
  options,
  value,
  placeholder,
  disabled = false,
  required = false,
  error,
  helperText,
  onChange,
  className = '',
  ...rest
}, ref) {
  const selectId = id || `select-${Math.random().toString(36).slice(2, 9)}`;
  return (
    <div className={className}>
      {label && <Label htmlFor={selectId} required={required}>{label}</Label>}
      <select
        ref={ref}
        id={selectId}
        value={value}
        disabled={disabled}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={helperText ? `${selectId}-helper` : undefined}
        onChange={onChange}
        className={`
          block w-full rounded-md border bg-white px-3 py-2 text-sm
          focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500
          disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-500
          ${error
            ? 'border-danger focus:ring-danger focus:border-danger'
            : 'border-neutral-300 text-neutral-900'}
          ${label ? 'mt-1' : ''}
        `}
        {...rest}
      >
        {placeholder && (
          <option value="" disabled={required}>{placeholder}</option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {helperText && (
        <p id={`${selectId}-helper`} className="mt-1 text-xs text-neutral-500">
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

export default Select;
