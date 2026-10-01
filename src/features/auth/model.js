/**
 * Modulity 2.0 — Authentication Feature Model
 *
 * Pure validation and form-state helpers for login and registration. No
 * Firebase-specific code lives here.
 */

import { ValidationError } from '../../core/errors/appError.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6;

export function validateLogin({ email, password }) {
  const errors = {};

  if (!email || email.trim() === '') {
    errors.email = 'Email is required';
  } else if (!EMAIL_REGEX.test(email)) {
    errors.email = 'Please enter a valid email address';
  }

  if (!password || password === '') {
    errors.password = 'Password is required';
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Login form validation failed', errors);
  }
}

export function validateRegister({ displayName, email, password, confirmPassword }) {
  const errors = {};

  if (!displayName || displayName.trim() === '') {
    errors.displayName = 'Display name is required';
  } else if (displayName.trim().length < 2) {
    errors.displayName = 'Display name must be at least 2 characters';
  }

  if (!email || email.trim() === '') {
    errors.email = 'Email is required';
  } else if (!EMAIL_REGEX.test(email)) {
    errors.email = 'Please enter a valid email address';
  }

  if (!password || password === '') {
    errors.password = 'Password is required';
  } else if (password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }

  if (password !== confirmPassword) {
    errors.confirmPassword = 'Passwords do not match';
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Registration form validation failed', errors);
  }
}

export function createInitialFormState() {
  return {
    values: {
      displayName: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
    errors: {},
    touched: {},
  };
}

export function updateField(state, field, value) {
  return {
    ...state,
    values: { ...state.values, [field]: value },
    errors: { ...state.errors, [field]: undefined },
    touched: { ...state.touched, [field]: true },
  };
}

export function setErrors(state, errors) {
  return {
    ...state,
    errors,
  };
}
