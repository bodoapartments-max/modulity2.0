/**
 * Modulity 2.0 — Ledger Source Definition (pure, typed, declarative)
 *
 * A Ledger Book is an organizational/register view over canonical evidence.
 * The sourceDefinition declares WHICH canonical evidence stream feeds the
 * book. It is intentionally a closed, typed union — never arbitrary Firestore
 * queries, collection paths, operators or executable configuration.
 *
 * v1 sources:
 *   MODULE — all official submissions of one Module (form definition)
 *
 * Future types (RECORD_TYPE etc.) extend the union here, validated the same
 * way, so Users and Automat/Agent plans converge on the same canonical
 * definition.
 *
 * @module core/ledger/ledgerSourceDefinition
 */

export const LEDGER_SOURCE_TYPES = Object.freeze({
  MODULE: 'MODULE',
});

export const LEDGER_BOOK_PROVISIONERS = Object.freeze({
  AUTO: 'AUTO',
  USER: 'USER',
});

const MAX_SOURCE_KEYS = 2;

/**
 * @param {*} raw
 * @returns {{ valid: boolean, errors: string[], value: Object|null }}
 */
export function validateLedgerSourceDefinition(raw) {
  const errors = [];
  if (raw === undefined || raw === null) {
    return { valid: true, errors: [], value: null };
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { valid: false, errors: ['sourceDefinition must be an object'], value: null };
  }
  const keys = Object.keys(raw);
  for (const key of keys) {
    if (!['type', 'moduleId'].includes(key)) {
      errors.push(`sourceDefinition.${key} is not a supported key`);
    }
  }
  if (keys.length > MAX_SOURCE_KEYS) {
    errors.push('sourceDefinition exceeds the maximum key count');
  }
  if (!raw.type || !LEDGER_SOURCE_TYPES[raw.type]) {
    errors.push(`sourceDefinition.type must be one of: ${Object.keys(LEDGER_SOURCE_TYPES).join(', ')}`);
  }
  if (raw.type === LEDGER_SOURCE_TYPES.MODULE) {
    if (!raw.moduleId || typeof raw.moduleId !== 'string') {
      errors.push('sourceDefinition.moduleId is required for MODULE sources');
    }
  }
  if (errors.length) return { valid: false, errors, value: null };
  return { valid: true, errors: [], value: Object.freeze({ type: raw.type, moduleId: raw.moduleId }) };
}

/**
 * Does this source accept a Record with the given module identity?
 * @param {Object|null} sourceDefinition
 * @param {Object} record — canonical Record (moduleId, recordType)
 */
export function ledgerSourceMatchesRecord(sourceDefinition, record) {
  if (!sourceDefinition) return true; // source-less manual book: manual registration only
  if (sourceDefinition.type === LEDGER_SOURCE_TYPES.MODULE) {
    return record?.moduleId === sourceDefinition.moduleId;
  }
  return false;
}
