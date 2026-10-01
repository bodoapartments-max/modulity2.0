/**
 * PageHeader
 *
 * Consistent page title area with optional action slot.
 */

function PageHeader({ title, description, action, className = '', ...rest }) {
  return (
    <div className={`mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between ${className}`} {...rest}>
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-neutral-600">{description}</p>
        )}
      </div>
      {action && <div className="mt-2 sm:mt-0">{action}</div>}
    </div>
  );
}

export default PageHeader;
