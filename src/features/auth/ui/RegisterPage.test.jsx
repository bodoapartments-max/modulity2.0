import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RegisterPage from './RegisterPage.jsx';
import { AuthContext } from '../../../app/providers/AuthProvider.jsx';

function renderRegisterPage({ signUp = vi.fn().mockResolvedValue() } = {}) {
  return render(
    <MemoryRouter initialEntries={['/register']}>
      <AuthContext.Provider
        value={{
          user: null,
          loading: false,
          error: null,
          isAuthenticated: false,
          signUp,
          signIn: vi.fn(),
          signOut: vi.fn(),
        }}
      >
        <RegisterPage />
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

describe('RegisterPage', () => {
  it('renders registration form fields', () => {
    renderRegisterPage();

    expect(screen.getByLabelText(/Display Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Confirm Password/i)).toBeInTheDocument();
  });

  it('shows validation errors for empty fields', () => {
    renderRegisterPage();

    fireEvent.click(screen.getByRole('button', { name: /Create account/i }));

    expect(screen.getByText(/Display name is required/i)).toBeInTheDocument();
    expect(screen.getByText(/Email is required/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Password is required/i).length).toBeGreaterThan(0);
  });

  it('shows error when passwords do not match', () => {
    renderRegisterPage();

    fireEvent.change(screen.getByLabelText(/^Password/i), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText(/Confirm Password/i), { target: { value: 'different' } });
    fireEvent.click(screen.getByRole('button', { name: /Create account/i }));

    expect(screen.getByText(/Passwords do not match/i)).toBeInTheDocument();
  });

  it('submits valid registration data and calls signUp', async () => {
    const signUp = vi.fn().mockResolvedValue();
    renderRegisterPage({ signUp });

    fireEvent.change(screen.getByLabelText(/Display Name/i), { target: { value: 'Alice' } });
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'alice@example.com' } });
    fireEvent.change(screen.getByLabelText(/^Password/i), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText(/Confirm Password/i), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /Create account/i }));

    await waitFor(() => {
      expect(signUp).toHaveBeenCalledWith({
        displayName: 'Alice',
        email: 'alice@example.com',
        password: 'password123',
      });
    });
  });
});
