import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute.jsx';
import { AuthContext } from '../providers/AuthProvider.jsx';

function renderWithAuth(authState, initialEntries = ['/app']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AuthContext.Provider value={authState}>
        <ProtectedRoute>
          <div data-testid="protected-content">Protected</div>
        </ProtectedRoute>
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

describe('ProtectedRoute', () => {
  it('renders a loading state while auth is loading', () => {
    renderWithAuth({ isAuthenticated: false, loading: true });

    expect(screen.getByText(/Checking authentication/i)).toBeInTheDocument();
  });

  it('redirects unauthenticated users to login', () => {
    renderWithAuth({ isAuthenticated: false, loading: false });

    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });

  it('renders children when authenticated', () => {
    renderWithAuth({ isAuthenticated: true, loading: false });

    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
  });
});
