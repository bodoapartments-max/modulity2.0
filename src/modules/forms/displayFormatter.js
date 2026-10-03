/**
 * Modulity 2.0 — Display Value Formatter
 *
 * Formats canonical Record values for human display.
 * Stored values remain unchanged — this is presentation only.
 *
 * @module modules/forms/displayFormatter
 */

import { FIELD_TYPES } from '../../core/data/entityType.js';

/**
 * Formats a stored value for human-readable display.
 *
 * @param {*} value — canonical stored value
 * @param {import('../../core/data/entityType.js').FieldDefinition} field
 * @param {Object} [context] — optional context for resolution
 * @param {Object<string, string>} [context.entityNames] — entityId → displayName map
 * @returns {string}
 */
export function formatDisplayValue(value, field, context = {}) {
  if (value === undefined || value === null || value === '') {
    return '—';
  }

  switch (field.type) {
    case FIELD_TYPES.BOOLEAN:
      return value ? 'Yes' : 'No';

    case FIELD_TYPES.DATE:
      return formatDate(value);

    case FIELD_TYPES.DATETIME:
      return formatDateTime(value);

    case FIELD_TYPES.DATE_RANGE: {
      if (typeof value !== 'object' || value === null) return String(value);
      const { start, end } = value;
      if (!start || !end) return String(value);
      return `${formatDate(start)} – ${formatDate(end)}`;
    }

    case FIELD_TYPES.SELECT: {
      // If options are {value, label} objects, resolve the label
      if (Array.isArray(field.options)) {
        const opt = field.options.find((o) =>
          typeof o === 'object' && o !== null ? o.value === value : o === value,
        );
        if (opt && typeof opt === 'object') return opt.label;
      }
      return String(value);
    }

    case FIELD_TYPES.ENTITY_REFERENCE: {
      if (typeof value === 'object' && value.entityId) {
        // Resolve display name from context if available
        const name = context.entityNames?.[value.entityId];
        return name || `Entity ${value.entityId.slice(0, 8)}...`;
      }
      return String(value);
    }

    case FIELD_TYPES.NUMBER:
      return typeof value === 'number' ? value.toLocaleString() : String(value);

    case FIELD_TYPES.URL:
      return String(value);

    default:
      return String(value);
  }
}

function formatDate(value) {
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return String(value);
  }
}

function formatDateTime(value) {
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString(undefined, {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return String(value);
  }
}
