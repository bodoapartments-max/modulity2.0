import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthContext } from './providers/AuthProvider.jsx';

describe('App shell', () => {
  it('renders the login page for unauthenticated users', () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthContext.Provider
          value={{
            user: null,
            loading: false,
            error: null,
            isAuthenticated: false,
            signUp: () => Promise.resolve(),
            signIn: () => Promise.resolve(),
            signOut: () => Promise.resolve(),
          }}
        >
          <App />
        </AuthContext.Provider>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: /Sign in to Modulity/i })).toBeInTheDocument();
  });
});
