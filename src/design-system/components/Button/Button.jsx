/**
 * Button
 *
 * Primary action component. Supports variants, sizes, loading, disabled, and icon
 * placement. All styling uses Tailwind utilities derived from design tokens.
 */

import Spinner from '../Spinner/Spinner.jsx';

const variants = {
  primary:
    'bg-primary-600 text-white hover:bg-primary-700 focus:ring-primary-500 active:bg-primary-800',
  secondary:
    'bg-primary-50 text-primary-700 hover:bg-primary-100 focus:ring-primary-500 active:bg-primary-200',
  outline:
    'border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 focus:ring-primary-500 active:bg-neutral-100',
  ghost:
    'bg-transparent text-neutral-700 hover:bg-neutral-100 focus:ring-primary-500 active:bg-neutral-200',
  danger:
    'bg-danger text-white hover:bg-red-700 focus:ring-danger active:bg-red-800',
};

const sizes = {
  sm: 'px-2.5 py-1.5 text-xs gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
  lg: 'px-6 py-3 text-base gap-2.5',
};

function Button({
  children,
  type = 'button',
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon: Icon,
  iconPosition = 'left',
  className = '',
  onClick,
  ...rest
}) {
  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      disabled={isDisabled}
      onClick={onClick}
      className={`
        inline-flex items-center justify-center rounded-md font-medium
        transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1
        disabled:cursor-not-allowed disabled:opacity-60
        ${variants[variant]}
        ${sizes[size]}
        ${className}
      `}
      aria-busy={loading}
      {...rest}
    >
      {loading && <Spinner size={size === 'lg' ? 'md' : 'sm'} />}
      {!loading && Icon && iconPosition === 'left' && (
        <Icon className="h-4 w-4" aria-hidden="true" />
      )}
      <span>{children}</span>
      {!loading && Icon && iconPosition === 'right' && (
        <Icon className="h-4 w-4" aria-hidden="true" />
      )}
    </button>
  );
}

export default Button;
