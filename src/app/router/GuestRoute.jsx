/**
 * GuestRoute
 *
 * Renders children only when the user is NOT authenticated. Redirects
 * authenticated users to /app.
 */

import { Navigate } from 'react-router-dom';
import { useAuth } from '../providers/AuthProvider.jsx';
import LoadingState from '../../design-system/components/LoadingState/LoadingState.jsx';

function GuestRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState message="Checking authentication..." />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/app" replace />;
  }

  return children;
}

export default GuestRoute;
