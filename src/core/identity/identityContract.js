/**
 * Modulity 2.0 — Identity Provider Contract
 *
 * Every identity adapter must implement this interface. The application layer
 * consumes only this contract; it never depends on Firebase Auth or any other
 * provider directly.
 *
 * @typedef {import('./user.js').UserIdentity} UserIdentity
 * @typedef {import('./user.js').SignUpRequest} SignUpRequest
 * @typedef {import('./user.js').SignInRequest} SignInRequest
 */

/**
 * @typedef {Object} IdentityProvider
 * @property {(request: SignUpRequest) => Promise<UserIdentity>} signUp
 * @property {(request: SignInRequest) => Promise<UserIdentity>} signIn
 * @property {() => Promise<void>} signOut
 * @property {() => UserIdentity | null} getCurrentUser
 * @property {(callback: (user: UserIdentity | null) => void) => () => void} subscribeToAuthState
 */

/**
 * Validates that an object implements the expected IdentityProvider shape.
 * This is a runtime guard used when registering adapters.
 *
 * @param {unknown} adapter
 * @returns {asserts adapter is IdentityProvider}
 */
export function validateIdentityProvider(adapter) {
  const requiredMethods = [
    'signUp',
    'signIn',
    'signOut',
    'getCurrentUser',
    'subscribeToAuthState',
  ];

  if (!adapter || typeof adapter !== 'object') {
    throw new Error('Identity adapter must be an object');
  }

  for (const method of requiredMethods) {
    if (typeof adapter[method] !== 'function') {
      throw new Error(`Identity adapter missing required method: ${method}`);
    }
  }
}
