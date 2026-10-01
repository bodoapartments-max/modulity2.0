/**
 * Drawer
 *
 * Slide-out panel used primarily for mobile navigation. Anchor defaults to left.
 */

import { useEffect } from 'react';

function Drawer({ open, onClose, anchor = 'left', children, className = '', ...rest }) {
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

  const positionClasses = {
    left: 'left-0 h-full w-72',
    right: 'right-0 h-full w-72',
    top: 'top-0 w-full h-72',
    bottom: 'bottom-0 w-full h-72',
  };

  return (
    <div className="fixed inset-0 z-50" {...rest}>
      <div
        className="absolute inset-0 bg-neutral-950/50"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={`absolute bg-white shadow-xl transition-transform ${positionClasses[anchor]} ${className}`}
      >
        {children}
      </div>
    </div>
  );
}

export default Drawer;
