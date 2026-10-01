/**
 * AuthProvider
 *
 * React boundary for authentication state. Wraps the configured identity provider
 * and exposes a provider-independent auth context to the rest of the app.
 *
 * On startup the provider resolves the current auth state before rendering
 * children, preventing protected content from flashing for unauthenticated
 * users.
 */

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import identityProvider from '../../infrastructure/identity/identityProvider.js';
import { AuthError } from '../../core/errors/appError.js';

export const AuthContext = createContext(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function AuthProvider({ children, provider = identityProvider }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let unsubscribe;

    try {
      unsubscribe = provider.subscribeToAuthState((nextUser) => {
        setUser(nextUser);
        setLoading(false);
      });
    } catch (err) {
      setError(
        err instanceof AuthError
          ? err
          : new AuthError('auth_init_failed', 'Failed to initialize authentication.', err),
      );
      setLoading(false);
    }

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [provider]);

  const value = useMemo(
    () => ({
      user,
      loading,
      error,
      isAuthenticated: Boolean(user),
      signUp: provider.signUp.bind(provider),
      signIn: provider.signIn.bind(provider),
      signOut: provider.signOut.bind(provider),
    }),
    [user, loading, error, provider],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export default AuthProvider;
