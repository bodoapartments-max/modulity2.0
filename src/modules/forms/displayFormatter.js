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
 * Parses a stored date/datetime value as local wall-clock time when it carries
 * no timezone information. A bare 'YYYY-MM-DD' string parses as UTC midnight
 * under `new Date()`, which renders the previous day in negative-offset
 * timezones — this helper keeps calendar dates on the intended day.
 *
 * @param {*} value — canonical stored value
 * @returns {Date}
 */
export function parseLocalDateTime(value) {
  if (typeof value === 'string') {
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (dateOnly) {
      return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
    }
    const localDateTime = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(value);
    if (localDateTime) {
      return new Date(
        Number(localDateTime[1]), Number(localDateTime[2]) - 1, Number(localDateTime[3]),
        Number(localDateTime[4]), Number(localDateTime[5]),
        Number(localDateTime[6] || 0), Number(localDateTime[7] || 0),
      );
    }
  }
  return new Date(value);
}

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

    case FIELD_TYPES.DATETIME_RANGE: {
      if (typeof value !== 'object' || value === null) return String(value);
      const { start, end } = value;
      if (!start || !end) return String(value);
      const sameDay = isSameCalendarDate(start, end);
      if (sameDay) return `${formatDate(start)}, ${formatTime(start)}–${formatTime(end)}`;
      return `${formatDateTime(start)} – ${formatDateTime(end)}`;
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
    const date = parseLocalDateTime(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return String(value);
  }
}

function formatDateTime(value) {
  try {
    const date = parseLocalDateTime(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString(undefined, {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return String(value);
  }
}

function formatTime(value) {
  try {
    const date = parseLocalDateTime(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  } catch {
    return String(value);
  }
}

function isSameCalendarDate(start, end) {
  try {
    const startDate = parseLocalDateTime(start).toDateString();
    const endDate = parseLocalDateTime(end).toDateString();
    return startDate === endDate;
  } catch {
    return false;
  }
}
