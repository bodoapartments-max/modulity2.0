/**
 * PasswordInput
 *
 * Text input for passwords with a visibility toggle.
 */

import { useState, forwardRef } from 'react';
import Input from '../Input/Input.jsx';
import IconButton from '../IconButton/IconButton.jsx';

// Minimal inline SVG icons to avoid adding an icon library dependency.
function EyeIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.68 7.36 4.5 12 4.5c4.638 0 8.573 3.18 9.96 7.455.127.388.19.8.19 1.233 0 .433-.063.845-.19 1.233C20.573 16.32 16.638 19.5 12 19.5c-4.64 0-8.577-3.18-9.96-7.455z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function EyeSlashIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12c1.28 4.09 5.09 7.123 9.066 7.123 1.54 0 2.99-.37 4.273-1.027m2.377-1.09a10.503 10.503 0 002.392-4.244M3.686 3.686l16.629 16.629M12 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

const PasswordInput = forwardRef(function PasswordInput({ className = '', ...rest }, ref) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input
        ref={ref}
        type={visible ? 'text' : 'password'}
        className={`pr-10 ${className}`}
        {...rest}
      />
      <div className="absolute inset-y-0 right-0 flex items-center pr-2">
        <IconButton
          icon={visible ? EyeSlashIcon : EyeIcon}
          label={visible ? 'Hide password' : 'Show password'}
          variant="ghost"
          size="sm"
          onClick={() => setVisible((v) => !v)}
          type="button"
        />
      </div>
    </div>
  );
});

export default PasswordInput;
