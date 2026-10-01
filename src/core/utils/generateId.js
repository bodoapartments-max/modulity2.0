/**
 * Modulity 2.0 — ID Generation Utility
 *
 * Generates collision-resistant unique IDs.
 * Uses crypto.randomUUID() which is available in modern browsers and Node 19+.
 */

/**
 * Generates a unique ID string.
 *
 * @returns {string}
 */
export function generateId() {
  return crypto.randomUUID();
}
