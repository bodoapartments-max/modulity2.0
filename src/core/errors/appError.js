/**
 * Modulity 2.0 — Application Error Model
 *
 * Provider-specific errors (Firebase, network, etc.) are translated into these
 * user-safe application errors. UI layers should display `message` without
 * leaking technical details.
 */

export class AppError extends Error {
  /**
   * @param {string} code Machine-readable error code
   * @param {string} message User-safe message
   * @param {Error|null} cause Original error for development logs
   */
  constructor(code, message, cause = null) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.cause = cause;
  }
}

export class ValidationError extends AppError {
  constructor(message, errors = {}) {
    super('validation_error', message);
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

export class AuthError extends AppError {
  constructor(code, message, cause = null) {
    super(code, message, cause);
    this.name = 'AuthError';
  }
}

export class ConfigurationError extends AppError {
  constructor(message, cause = null) {
    super('configuration_error', message, cause);
    this.name = 'ConfigurationError';
  }
}

/**
 * Translates a Firebase Auth error code into a user-safe AuthError.
 *
 * @param {Error} error
 * @returns {AuthError}
 */
export function fromFirebaseAuthError(error) {
  const code = error?.code || 'unknown';

  switch (code) {
    case 'auth/invalid-email':
    case 'auth/invalid-credential':
      return new AuthError('invalid_credentials', 'The email or password you entered is incorrect.', error);
    case 'auth/user-disabled':
      return new AuthError('account_disabled', 'This account has been disabled. Please contact support.', error);
    case 'auth/user-not-found':
      return new AuthError('invalid_credentials', 'The email or password you entered is incorrect.', error);
    case 'auth/wrong-password':
      return new AuthError('invalid_credentials', 'The email or password you entered is incorrect.', error);
    case 'auth/email-already-in-use':
      return new AuthError('email_in_use', 'An account with this email already exists.', error);
    case 'auth/weak-password':
      return new AuthError('weak_password', 'Password should be at least 6 characters.', error);
    case 'auth/network-request-failed':
      return new AuthError('network_error', 'Network error. Please check your connection and try again.', error);
    case 'auth/too-many-requests':
      return new AuthError('too_many_requests', 'Too many attempts. Please try again later.', error);
    default:
      return new AuthError('auth_failed', 'Authentication failed. Please try again.', error);
  }
}
