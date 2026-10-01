/**
 * LoadingState
 *
 * Full-region loading indicator with optional message.
 */

import Spinner from '../Spinner/Spinner.jsx';

function LoadingState({ message = 'Loading...', className = '', ...rest }) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 p-8 text-neutral-600 ${className}`}
      role="status"
      aria-live="polite"
      {...rest}
    >
      <Spinner size="lg" />
      {message && <p className="text-sm">{message}</p>}
    </div>
  );
}

export default LoadingState;
