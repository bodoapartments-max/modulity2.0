/**
 * Alert
 *
 * Inline alert for errors, warnings, successes, and informational messages.
 */

const variants = {
  info: 'bg-primary-50 text-primary-800 border-primary-200',
  success: 'bg-green-50 text-green-800 border-green-200',
  warning: 'bg-amber-50 text-amber-800 border-amber-200',
  error: 'bg-red-50 text-red-800 border-red-200',
};

function Alert({ children, variant = 'info', title, className = '', ...rest }) {
  return (
    <div
      role="alert"
      className={`rounded-md border p-4 ${variants[variant]} ${className}`}
      {...rest}
    >
      {title && <h3 className="mb-1 text-sm font-semibold">{title}</h3>}
      <div className="text-sm">{children}</div>
    </div>
  );
}

export default Alert;
