import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LoginPage from './LoginPage.jsx';
import { AuthContext } from '../../../app/providers/AuthProvider.jsx';

function renderLoginPage({ signIn = vi.fn().mockResolvedValue() } = {}) {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthContext.Provider
        value={{
          user: null,
          loading: false,
          error: null,
          isAuthenticated: false,
          signIn,
          signUp: vi.fn(),
          signOut: vi.fn(),
        }}
      >
        <LoginPage />
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

describe('LoginPage', () => {
  it('renders login form fields', () => {
    renderLoginPage();

    expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign in/i })).toBeInTheDocument();
  });

  it('shows validation errors for empty fields', () => {
    renderLoginPage();

    fireEvent.click(screen.getByRole('button', { name: /Sign in/i }));

    expect(screen.getByText(/Email is required/i)).toBeInTheDocument();
    expect(screen.getByText(/Password is required/i)).toBeInTheDocument();
  });

  it('shows validation error for invalid email', () => {
    renderLoginPage();

    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'not-an-email' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign in/i }));

    expect(screen.getByText(/Please enter a valid email address/i)).toBeInTheDocument();
  });

  it('submits valid credentials and calls signIn', async () => {
    const signIn = vi.fn().mockResolvedValue();
    renderLoginPage({ signIn });

    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'alice@example.com' } });
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign in/i }));

    await waitFor(() => {
      expect(signIn).toHaveBeenCalledWith({
        email: 'alice@example.com',
        password: 'password123',
      });
    });
  });
});
