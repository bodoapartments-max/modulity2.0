import { describe, it, expect } from 'vitest';
import {
  validateCreateOrganization,
  createOrgFormState,
  updateOrgField,
} from './model.js';
import { ValidationError } from '../../core/errors/appError.js';

describe('validateCreateOrganization', () => {
  it('throws ValidationError when name is empty', () => {
    expect(() =>
      validateCreateOrganization({ name: '', type: 'HOTEL', country: 'Hungary' }),
    ).toThrow(ValidationError);
  });

  it('throws ValidationError when type is invalid or empty', () => {
    expect(() =>
      validateCreateOrganization({ name: 'Grand Hotel', type: 'INVALID', country: 'Hungary' }),
    ).toThrow(ValidationError);
  });

  it('throws ValidationError when country is empty', () => {
    expect(() =>
      validateCreateOrganization({ name: 'Grand Hotel', type: 'HOTEL', country: '' }),
    ).toThrow(ValidationError);
  });

  it('passes with valid data', () => {
    expect(() =>
      validateCreateOrganization({ name: 'Grand Hotel', type: 'HOTEL', country: 'Hungary' }),
    ).not.toThrow();
  });
});

describe('organization form state helpers', () => {
  it('creates the initial state', () => {
    expect(createOrgFormState()).toEqual({
      values: { name: '', type: '', country: '', description: '' },
      errors: {},
      touched: {},
    });
  });

  it('updates a field value and clears its error', () => {
    const state = createOrgFormState();
    state.errors.name = 'Organization name is required';

    const next = updateOrgField(state, 'name', 'Grand Hotel');

    expect(next.values.name).toBe('Grand Hotel');
    expect(next.errors.name).toBeUndefined();
    expect(next.touched.name).toBe(true);
  });
});
