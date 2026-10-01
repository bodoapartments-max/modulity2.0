/**
 * ErrorState
 *
 * Displays a user-safe error with an optional retry action.
 */

import Alert from '../Alert/Alert.jsx';
import Button from '../Button/Button.jsx';

function ErrorState({ title = 'Something went wrong', message, retry, className = '', ...rest }) {
  return (
    <div className={`p-6 ${className}`} {...rest}>
      <Alert variant="error" title={title}>
        <div className="flex flex-col gap-4">
          {message && <p>{message}</p>}
          {retry && (
            <div>
              <Button onClick={retry} variant="outline" size="sm">
                Try again
              </Button>
            </div>
          )}
        </div>
      </Alert>
    </div>
  );
}

export default ErrorState;
