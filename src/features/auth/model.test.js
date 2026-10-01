import { describe, it, expect } from 'vitest';
import {
  validateLogin,
  validateRegister,
  createInitialFormState,
  updateField,
  setErrors,
} from './model.js';
import { ValidationError } from '../../core/errors/appError.js';

describe('validateLogin', () => {
  it('throws ValidationError when email is missing', () => {
    expect(() => validateLogin({ email: '', password: 'secret' })).toThrow(ValidationError);
    try {
      validateLogin({ email: '', password: 'secret' });
    } catch (error) {
      expect(error.errors.email).toBe('Email is required');
    }
  });

  it('throws ValidationError when email format is invalid', () => {
    expect(() => validateLogin({ email: 'not-an-email', password: 'secret' })).toThrow(ValidationError);
  });

  it('throws ValidationError when password is missing', () => {
    expect(() => validateLogin({ email: 'test@example.com', password: '' })).toThrow(ValidationError);
  });

  it('passes with valid credentials', () => {
    expect(() =>
      validateLogin({ email: 'test@example.com', password: 'secret123' }),
    ).not.toThrow();
  });
});

describe('validateRegister', () => {
  it('throws ValidationError with all missing fields', () => {
    expect(() => validateRegister({
      displayName: '',
      email: '',
      password: '',
      confirmPassword: '',
    })).toThrow(ValidationError);
  });

  it('throws when passwords do not match', () => {
    expect(() =>
      validateRegister({
        displayName: 'Alice',
        email: 'alice@example.com',
        password: 'password123',
        confirmPassword: 'different',
      }),
    ).toThrow(ValidationError);
  });

  it('throws when password is too short', () => {
    expect(() =>
      validateRegister({
        displayName: 'Alice',
        email: 'alice@example.com',
        password: '123',
        confirmPassword: '123',
      }),
    ).toThrow(ValidationError);
  });

  it('passes with valid registration data', () => {
    expect(() =>
      validateRegister({
        displayName: 'Alice',
        email: 'alice@example.com',
        password: 'password123',
        confirmPassword: 'password123',
      }),
    ).not.toThrow();
  });
});

describe('form state helpers', () => {
  it('creates initial state', () => {
    const state = createInitialFormState();
    expect(state.values.email).toBe('');
    expect(state.errors).toEqual({});
    expect(state.touched).toEqual({});
  });

  it('updates a field value and clears its error', () => {
    const state = createInitialFormState();
    const next = updateField(state, 'email', 'a@b.com');
    expect(next.values.email).toBe('a@b.com');
    expect(next.touched.email).toBe(true);
  });

  it('sets errors', () => {
    const state = createInitialFormState();
    const next = setErrors(state, { email: 'Required' });
    expect(next.errors.email).toBe('Required');
  });
});
