/**
 * Spinner
 *
 * Accessible loading indicator. Used inside buttons, loading states, and async
 * boundaries.
 */

function Spinner({ size = 'md', className = '' }) {
  const sizeClasses = {
    sm: 'h-4 w-4 border-2',
    md: 'h-5 w-5 border-2',
    lg: 'h-8 w-8 border-4',
  };

  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block animate-spin rounded-full border-current border-t-transparent ${sizeClasses[size]} ${className}`}
    >
      <span className="sr-only">Loading</span>
    </span>
  );
}

export default Spinner;
