/**
 * Modulity 2.0 — Person / Profile Domain Model
 *
 * A Person is presentation/profile information associated with a User.
 * It is NOT an Employee, NOT a Membership, NOT authentication credentials.
 *
 * The authenticated account identity remains User (core/identity/user.js).
 * This is the human-facing profile layer.
 */

/**
 * @typedef {Object} Person
 * @property {string} userId
 * @property {string} displayName
 * @property {string} email
 * @property {string} phone
 * @property {string} avatarUrl
 * @property {string} createdAt       — ISO 8601
 * @property {string} updatedAt       — ISO 8601
 */

/**
 * Creates a Person/Profile value object.
 *
 * @param {Object} params
 * @returns {Person}
 */
export function createPerson({
  userId,
  displayName,
  email,
  phone = '',
  avatarUrl = '',
  createdAt,
  updatedAt,
}) {
  if (!userId) throw new Error('userId is required');
  if (!displayName || displayName.trim() === '') throw new Error('displayName is required');
  if (!email || email.trim() === '') throw new Error('email is required');

  return Object.freeze({
    userId,
    displayName: displayName.trim(),
    email: email.trim().toLowerCase(),
    phone: phone.trim(),
    avatarUrl: avatarUrl.trim(),
    createdAt: createdAt || new Date().toISOString(),
    updatedAt: updatedAt || new Date().toISOString(),
  });
}
