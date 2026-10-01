/**
 * Input
 *
 * Standard text input. Supports error state and full width layout.
 */

import { forwardRef } from 'react';

const Input = forwardRef(function Input(
  { error, className = '', ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={`
        block w-full rounded-md border px-3 py-2 text-sm
        placeholder:text-neutral-400
        focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500
        disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-500
        ${error
          ? 'border-danger text-danger-900 focus:ring-danger focus:border-danger'
          : 'border-neutral-300 text-neutral-900'}
        ${className}
      `}
      aria-invalid={Boolean(error)}
      {...rest}
    />
  );
});

export default Input;
