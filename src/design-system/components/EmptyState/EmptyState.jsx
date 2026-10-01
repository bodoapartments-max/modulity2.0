/**
 * EmptyState
 *
 * Used when a list or view has no items to display.
 */

function EmptyState({ title = 'No items', description, className = '', children, ...rest }) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center ${className}`}
      {...rest}
    >
      <h3 className="text-base font-medium text-neutral-900">{title}</h3>
      {description && <p className="max-w-sm text-sm text-neutral-600">{description}</p>}
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}

export default EmptyState;
