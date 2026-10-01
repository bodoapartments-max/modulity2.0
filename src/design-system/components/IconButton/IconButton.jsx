/**
 * IconButton
 *
 * Button that displays only an icon. Requires an accessible label.
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
  sm: 'p-1',
  md: 'p-2',
  lg: 'p-3',
};

function IconButton({
  icon: Icon,
  label,
  variant = 'ghost',
  size = 'md',
  loading = false,
  disabled = false,
  className = '',
  onClick,
  ...rest
}) {
  const isDisabled = disabled || loading;

  return (
    <button
      type="button"
      aria-label={label}
      disabled={isDisabled}
      onClick={onClick}
      className={`
        inline-flex items-center justify-center rounded-md
        transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1
        disabled:cursor-not-allowed disabled:opacity-60
        ${variants[variant]}
        ${sizes[size]}
        ${className}
      `}
      aria-busy={loading}
      {...rest}
    >
      {loading ? (
        <Spinner size={size} />
      ) : (
        <Icon className="h-5 w-5" aria-hidden="true" />
      )}
    </button>
  );
}

export default IconButton;
