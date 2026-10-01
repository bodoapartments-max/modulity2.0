/**
 * Modulity 2.0 — Core User Identity
 *
 * A provider-independent representation of an authenticated user.
 * Firebase User objects (or any other identity provider representation)
 * must be mapped into this shape before crossing into Core or UI layers.
 */

export class UserIdentity {
  constructor({ userId, email, displayName, emailVerified }) {
    this.userId = userId;
    this.email = email;
    this.displayName = displayName || '';
    this.emailVerified = Boolean(emailVerified);
    Object.freeze(this);
  }
}

/**
 * Maps a provider-specific user object to a Core UserIdentity.
 *
 * @param {Object} providerUser
 * @param {string} providerUser.uid
 * @param {string|null} providerUser.email
 * @param {string|null} providerUser.displayName
 * @param {boolean} providerUser.emailVerified
 * @returns {UserIdentity}
 */
export function toUserIdentity(providerUser) {
  if (!providerUser) return null;

  return new UserIdentity({
    userId: providerUser.uid,
    email: providerUser.email || '',
    displayName: providerUser.displayName || '',
    emailVerified: providerUser.emailVerified,
  });
}

/**
 * Identity provider-independent registration request.
 */
export class SignUpRequest {
  constructor({ email, password, displayName }) {
    this.email = email;
    this.password = password;
    this.displayName = displayName || '';
    Object.freeze(this);
  }
}

/**
 * Identity provider-independent sign-in request.
 */
export class SignInRequest {
  constructor({ email, password }) {
    this.email = email;
    this.password = password;
    Object.freeze(this);
  }
}
