/**
 * AppShell
 *
 * Responsive authenticated application shell.
 *
 * Desktop: fixed header + persistent sidebar + main content area.
 * Mobile: fixed header + collapsible drawer sidebar.
 */

import { Suspense, useState } from 'react';
import Header from './Header.jsx';
import Sidebar from './Sidebar.jsx';
import MobileDrawer from './MobileDrawer.jsx';
import AppRoutes from '../routes.jsx';
import LoadingState from '../../design-system/components/LoadingState/LoadingState.jsx';

function PageLoader() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <LoadingState message="Loading..." />
    </div>
  );
}

function AppShell() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50">
      <Header onOpenMobileMenu={() => setMobileMenuOpen(true)} />

      <div className="flex flex-1 pt-16">
        <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:top-16 lg:z-30 lg:flex lg:w-64 lg:flex-col lg:border-r lg:border-neutral-200 lg:bg-white">
          <Sidebar />
        </aside>

        <main className="min-w-0 flex-1 lg:pl-64">
          <Suspense fallback={<PageLoader />}>
            <AppRoutes />
          </Suspense>
        </main>
      </div>

      <MobileDrawer open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
    </div>
  );
}

export default AppShell;
