/**
 * Toast Provider
 *
 * Presents transient UI feedback. Feature code calls showToast through the hook.
 * This is presentation-only, not the canonical Notification capability.
 */
import { createContext, useCallback, useContext, useState } from 'react';
import Toast from './Toast.jsx';

const ToastContext = createContext({ showToast: () => {} });

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

export default function ToastProvider({ children, autoClose = 5000 }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(({ message, variant = 'info' }) => {
    const id = Math.random().toString(36).slice(2, 11);
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => removeToast(id), autoClose);
  }, [removeToast, autoClose]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed right-4 top-4 z-50 flex flex-col gap-2"
      >
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            variant={toast.variant}
            onClose={() => removeToast(toast.id)}
          >
            {toast.message}
          </Toast>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
