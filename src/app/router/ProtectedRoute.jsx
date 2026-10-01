/**
 * ProtectedRoute
 *
 * Renders children only when the user is authenticated. Redirects unauthenticated
 * users to /login. Shows a loading state while auth state is resolving.
 */

import { Navigate } from 'react-router-dom';
import { useAuth } from '../providers/AuthProvider.jsx';
import LoadingState from '../../design-system/components/LoadingState/LoadingState.jsx';

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState message="Checking authentication..." />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

export default ProtectedRoute;
