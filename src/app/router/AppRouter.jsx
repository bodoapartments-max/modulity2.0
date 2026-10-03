/**
 * AppRouter
 *
 * Central application routing. Feature routes should be registered here so
 * App.jsx does not become a giant routing file.
 */

import { Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from '../../features/auth/ui/LoginPage.jsx';
import RegisterPage from '../../features/auth/ui/RegisterPage.jsx';
import AppShell from '../shell/AppShell.jsx';
import ProtectedRoute from './ProtectedRoute.jsx';
import GuestRoute from './GuestRoute.jsx';
import ToastProvider from '../../design-system/components/Toast/ToastProvider.jsx';

function AppRouter() {
  return (
    <ToastProvider>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />

      <Route
        path="/login"
        element={
          <GuestRoute>
            <LoginPage />
          </GuestRoute>
        }
      />

      <Route
        path="/register"
        element={
          <GuestRoute>
            <RegisterPage />
          </GuestRoute>
        }
      />

      <Route
        path="/app/*"
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      />
      </Routes>
    </ToastProvider>
  );
}

export default AppRouter;
