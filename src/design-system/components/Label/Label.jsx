/**
 * Label
 *
 * Accessible form label. Use with Input and other form controls.
 */

function Label({ children, htmlFor, required = false, className = '', ...rest }) {
  return (
    <label
      htmlFor={htmlFor}
      className={`block text-sm font-medium text-neutral-700 ${className}`}
      {...rest}
    >
      {children}
      {required && <span aria-hidden="true" className="ml-1 text-danger">*</span>}
    </label>
  );
}

export default Label;
