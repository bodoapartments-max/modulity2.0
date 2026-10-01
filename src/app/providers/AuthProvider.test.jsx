import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AuthProvider, { useAuth } from './AuthProvider.jsx';

function TestConsumer() {
  const { user, isAuthenticated, loading } = useAuth();
  return (
    <div>
      <span data-testid="loading">{loading ? 'loading' : 'ready'}</span>
      <span data-testid="auth">{isAuthenticated ? 'authenticated' : 'guest'}</span>
      <span data-testid="user">{user ? user.email : 'none'}</span>
    </div>
  );
}

function createMockProvider(initialUser = null) {
  return {
    signUp: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
    getCurrentUser: vi.fn().mockReturnValue(initialUser),
    subscribeToAuthState: vi.fn().mockImplementation((callback) => {
      callback(initialUser);
      return vi.fn();
    }),
  };
}

describe('AuthProvider', () => {
  it('resolves to unauthenticated state and stops loading', async () => {
    render(
      <MemoryRouter>
        <AuthProvider provider={createMockProvider(null)}>
          <TestConsumer />
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('ready');
    });

    expect(screen.getByTestId('auth')).toHaveTextContent('guest');
    expect(screen.getByTestId('user')).toHaveTextContent('none');
  });

  it('reflects authenticated user when auth state resolves', async () => {
    const provider = createMockProvider({
      userId: 'user-1',
      email: 'alice@example.com',
      displayName: 'Alice',
      emailVerified: true,
    });

    render(
      <MemoryRouter>
        <AuthProvider provider={provider}>
          <TestConsumer />
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('auth')).toHaveTextContent('authenticated');
    });

    expect(screen.getByTestId('user')).toHaveTextContent('alice@example.com');
  });
});
