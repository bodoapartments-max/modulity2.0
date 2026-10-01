/**
 * Modulity 2.0 — Organization Feature Model
 *
 * Validation and form state helpers for organization creation/editing.
 */

import { ORGANIZATION_TYPES } from '../../core/workspace/organization.js';
import { ValidationError } from '../../core/errors/appError.js';

export { ORGANIZATION_TYPES };

export function validateCreateOrganization({ name, type, country }) {
  const errors = {};

  if (!name || name.trim() === '') {
    errors.name = 'Organization name is required';
  } else if (name.trim().length < 2) {
    errors.name = 'Organization name must be at least 2 characters';
  }

  if (!type || !ORGANIZATION_TYPES[type]) {
    errors.type = 'Please select an organization type';
  }

  if (!country || country.trim() === '') {
    errors.country = 'Country is required';
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Organization form validation failed', errors);
  }
}

export function createOrgFormState() {
  return {
    values: {
      name: '',
      type: '',
      country: '',
      description: '',
    },
    errors: {},
    touched: {},
  };
}

export function updateOrgField(state, field, value) {
  return {
    ...state,
    values: { ...state.values, [field]: value },
    errors: { ...state.errors, [field]: undefined },
    touched: { ...state.touched, [field]: true },
  };
}

export const ORGANIZATION_TYPE_LABELS = {
  [ORGANIZATION_TYPES.COMPANY]: 'Company',
  [ORGANIZATION_TYPES.HOTEL]: 'Hotel',
  [ORGANIZATION_TYPES.SCHOOL]: 'School',
  [ORGANIZATION_TYPES.THEATRE]: 'Theatre',
  [ORGANIZATION_TYPES.ASSOCIATION]: 'Association',
  [ORGANIZATION_TYPES.CONSTRUCTION]: 'Construction',
  [ORGANIZATION_TYPES.SERVICE]: 'Service',
  [ORGANIZATION_TYPES.OTHER]: 'Other',
};
