/**
 * Badge
 *
 * Small status/decorative label.
 */

const variants = {
  default: 'bg-neutral-100 text-neutral-700',
  primary: 'bg-primary-100 text-primary-700',
  success: 'bg-green-100 text-green-700',
  warning: 'bg-amber-100 text-amber-700',
  danger: 'bg-red-100 text-red-700',
  info: 'bg-blue-100 text-blue-700',
};

function Badge({ children, variant = 'default', className = '', ...rest }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${variants[variant]} ${className}`}
      {...rest}
    >
      {children}
    </span>
  );
}

export default Badge;
