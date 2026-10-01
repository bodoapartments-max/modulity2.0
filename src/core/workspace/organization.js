/**
 * Modulity 2.0 — Organization Domain Model
 *
 * An Organization is the generic platform concept for any type of
 * business, institution or group: company, hotel, school, theatre, etc.
 *
 * UI may display "Organization" or a friendlier label; the internal
 * concept is always Organization.
 */

export const ORGANIZATION_TYPES = Object.freeze({
  COMPANY: 'COMPANY',
  HOTEL: 'HOTEL',
  SCHOOL: 'SCHOOL',
  THEATRE: 'THEATRE',
  ASSOCIATION: 'ASSOCIATION',
  CONSTRUCTION: 'CONSTRUCTION',
  SERVICE: 'SERVICE',
  OTHER: 'OTHER',
});

/**
 * @typedef {Object} Organization
 * @property {string} organizationId
 * @property {string} name
 * @property {string} type          — one of ORGANIZATION_TYPES
 * @property {string} country
 * @property {string} description
 * @property {string} createdByUserId
 * @property {string} createdAt     — ISO 8601
 * @property {string} updatedAt     — ISO 8601
 */

/**
 * Creates an Organization value object.
 *
 * @param {Object} params
 * @returns {Organization}
 */
export function createOrganization({
  organizationId,
  name,
  type,
  country,
  description = '',
  createdByUserId,
  createdAt,
  updatedAt,
}) {
  if (!organizationId) throw new Error('organizationId is required');
  if (!name || name.trim() === '') throw new Error('Organization name is required');
  if (!ORGANIZATION_TYPES[type]) throw new Error(`Invalid organization type: ${type}`);
  if (!country || country.trim() === '') throw new Error('Country is required');
  if (!createdByUserId) throw new Error('createdByUserId is required');

  return Object.freeze({
    organizationId,
    name: name.trim(),
    type,
    country: country.trim(),
    description: description.trim(),
    createdByUserId,
    createdAt: createdAt || new Date().toISOString(),
    updatedAt: updatedAt || new Date().toISOString(),
  });
}
