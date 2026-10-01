/**
 * Dialog
 *
 * Accessible modal dialog. Uses a portal-like rendering approach.
 */

import { useEffect, useRef } from 'react';

function Dialog({ open, onClose, title, children, className = '', ...rest }) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="presentation"
      {...rest}
    >
      <div
        className="absolute inset-0 bg-neutral-950/50"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'dialog-title' : undefined}
        className={`relative w-full max-w-lg rounded-xl bg-white p-6 shadow-lg ${className}`}
      >
        {title && (
          <h2 id="dialog-title" className="mb-4 text-lg font-semibold text-neutral-900">
            {title}
          </h2>
        )}
        {children}
      </div>
    </div>
  );
}

export default Dialog;
