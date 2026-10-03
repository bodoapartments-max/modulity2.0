/**
 * Toast
 *
 * Transient feedback notification. Not the canonical Notification capability.
 */
const VARIANTS = {
  info: 'bg-neutral-800 text-white',
  success: 'bg-success text-white',
  warning: 'bg-warning text-white',
  error: 'bg-danger text-white',
};

export default function Toast({ variant = 'info', onClose, children }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-auto flex min-w-[12rem] max-w-xs items-start gap-2 rounded-lg px-4 py-3 text-sm shadow-lg ${VARIANTS[variant]}`}
    >
      <span className="flex-1">{children}</span>
      {onClose && (
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="ml-2 opacity-80 hover:opacity-100"
        >
          ×
        </button>
      )}
    </div>
  );
}
