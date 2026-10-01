/**
 * Dropdown
 *
 * Simple dropdown menu triggered by a button. Supports keyboard navigation and
 * click-outside dismissal.
 */

import { useEffect, useRef, useState } from 'react';

function Dropdown({ trigger, children, align = 'left', className = '' }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const alignmentClass = align === 'right' ? 'right-0' : 'left-0';

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      <div onClick={() => setOpen((prev) => !prev)}>{trigger}</div>
      {open && (
        <div
          className={`absolute z-50 mt-1 min-w-[12rem] rounded-md border border-neutral-200 bg-white py-1 shadow-lg ${alignmentClass}`}
          role="menu"
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function DropdownItem({ children, onClick, disabled = false, className = '' }) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={`block w-full px-4 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

export default Dropdown;
