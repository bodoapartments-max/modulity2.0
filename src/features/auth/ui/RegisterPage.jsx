/**
 * RegisterPage
 *
 * Email/password registration page. Minimal professional layout.
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../app/providers/AuthProvider.jsx';
import { validateRegister, createInitialFormState, updateField } from '../model.js';
import Button from '../../../design-system/components/Button/Button.jsx';
import Input from '../../../design-system/components/Input/Input.jsx';
import Label from '../../../design-system/components/Label/Label.jsx';
import Alert from '../../../design-system/components/Alert/Alert.jsx';
import Card from '../../../design-system/components/Card/Card.jsx';

function RegisterPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(createInitialFormState());
  const [submitError, setSubmitError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (field) => (event) => {
    setForm((prev) => updateField(prev, field, event.target.value));
    setSubmitError(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError(null);

    try {
      validateRegister(form.values);
    } catch (error) {
      const touched = { displayName: true, email: true, password: true, confirmPassword: true };
      setForm((prev) => ({ ...prev, errors: error.errors, touched }));
      return;
    }

    setSubmitting(true);
    try {
      await signUp({
        email: form.values.email,
        password: form.values.password,
        displayName: form.values.displayName,
      });
      navigate('/app');
    } catch (error) {
      setSubmitError(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 py-12 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
            Create your account
          </h1>
          <p className="mt-2 text-sm text-neutral-600">
            Start building your modular operations platform.
          </p>
        </div>

        {submitError && (
          <Alert variant="error" className="mb-6">
            {submitError}
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <div>
            <Label htmlFor="displayName" required>
              Display Name
            </Label>
            <Input
              id="displayName"
              name="displayName"
              type="text"
              autoComplete="name"
              placeholder="Alice Smith"
              value={form.values.displayName}
              onChange={handleChange('displayName')}
              error={form.errors.displayName}
              className="mt-1"
            />
            {form.errors.displayName && (
              <p className="mt-1 text-sm text-danger" role="alert">
                {form.errors.displayName}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="email" required>
              Email
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={form.values.email}
              onChange={handleChange('email')}
              error={form.errors.email}
              className="mt-1"
            />
            {form.errors.email && (
              <p className="mt-1 text-sm text-danger" role="alert">
                {form.errors.email}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="password" required>
              Password
            </Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={form.values.password}
              onChange={handleChange('password')}
              error={form.errors.password}
              className="mt-1"
            />
            {form.errors.password && (
              <p className="mt-1 text-sm text-danger" role="alert">
                {form.errors.password}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="confirmPassword" required>
              Confirm Password
            </Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={form.values.confirmPassword}
              onChange={handleChange('confirmPassword')}
              error={form.errors.confirmPassword}
              className="mt-1"
            />
            {form.errors.confirmPassword && (
              <p className="mt-1 text-sm text-danger" role="alert">
                {form.errors.confirmPassword}
              </p>
            )}
          </div>

          <Button type="submit" loading={submitting} className="w-full">
            Create account
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-neutral-600">
          Already have an account?{' '}
          <Link
            to="/login"
            className="font-medium text-primary-600 hover:text-primary-500"
          >
            Sign in
          </Link>
        </p>
      </Card>
    </div>
  );
}

export default RegisterPage;
