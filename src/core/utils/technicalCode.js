/**
 * Modulity 2.0 — Technical Identifier Utility (pure)
 *
 * HUMANS PROVIDE BUSINESS MEANING. MODULITY GENERATES TECHNICAL IDENTIFIERS.
 *
 * A technical identifier (moduleCode, categoryCode, type code, ...) is:
 * - deterministic: same display label → same base code
 * - normalized: UPPER_SNAKE, ASCII letters+digits+underscore
 * - collision-stable: the SAME label always proposes the SAME base —
 *   collision suffixes (_2, _3, ...) are applied by the caller with the
 *   canonical identity registry (moduleCodes, ledgerCodes, categoryCodes)
 * - STABLE after creation: renaming the display label NEVER renames the code
 *
 * @module core/utils/technicalCode
 */

const FALLBACK_CODE = 'ITEM';

/**
 * Normalizes an arbitrary display label into a technical code stem.
 * "Holiday Request" → "HOLIDAY_REQUEST", "  Goods-Receipt! " → "GOODS_RECEIPT".
 * @param {string} label
 * @returns {string}
 */
export function generateTechnicalCode(label) {
  const words = String(label || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.toUpperCase());
  if (!words.length) return FALLBACK_CODE;
  let code = words.join('_');
  if (!/^[A-Z]/.test(code)) code = `${FALLBACK_CODE}_${code}`;
  return code.slice(0, 64);
}

/**
 * Resolves a collision-safe final code against existing reserved codes.
 * "HOLIDAY_REQUEST" + existing [HOLIDAY_REQUEST] → "HOLIDAY_REQUEST_2".
 *
 * @param {string} base — output of generateTechnicalCode
 * @param {string[]|Set<string>} existingCodes
 * @returns {string}
 */
export function resolveCodeCollision(base, existingCodes) {
  const existing = new Set(existingCodes);
  if (!existing.has(base)) return base;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}_${suffix}`;
    if (!existing.has(candidate)) return candidate;
  }
}

/**
 * Splits a user-visible label into a deterministic code suggestion.
 * Convenience for form auto-fill flows.
 */
export function suggestTechnicalCode(label, existingCodes = []) {
  return resolveCodeCollision(generateTechnicalCode(label), existingCodes);
}
