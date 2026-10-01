/**
 * AppShell
 *
 * Responsive authenticated application shell.
 *
 * Desktop: fixed header + persistent sidebar + main content area.
 * Mobile: fixed header + collapsible drawer sidebar.
 */

import { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Header from './Header.jsx';
import Sidebar from './Sidebar.jsx';
import MobileDrawer from './MobileDrawer.jsx';
import PageContainer from '../../design-system/components/PageContainer/PageContainer.jsx';
import PageHeader from '../../design-system/components/PageHeader/PageHeader.jsx';
import EmptyState from '../../design-system/components/EmptyState/EmptyState.jsx';

function DashboardPlaceholder() {
  return (
    <PageContainer>
      <PageHeader
        title="Dashboard"
        description="Your modular operations platform overview."
      />
      <EmptyState
        title="Welcome to Modulity 2.0"
        description="The dashboard is being prepared. Use the sidebar to navigate once features are available."
      />
    </PageContainer>
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

        <main className="flex-1 lg:pl-64">
          <Routes>
            <Route index element={<DashboardPlaceholder />} />
            <Route path="*" element={<Navigate to="/app" replace />} />
          </Routes>
        </main>
      </div>

      <MobileDrawer open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)}>
        <Sidebar onNavigate={() => setMobileMenuOpen(false)} />
      </MobileDrawer>
    </div>
  );
}

export default AppShell;
