/**
 * AppShell
 *
 * Responsive authenticated application shell.
 *
 * Desktop: fixed header + persistent sidebar + main content area.
 * Mobile: fixed header + collapsible drawer sidebar.
 */

import { lazy, Suspense, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Header from './Header.jsx';
import Sidebar from './Sidebar.jsx';
import MobileDrawer from './MobileDrawer.jsx';
import LoadingState from '../../design-system/components/LoadingState/LoadingState.jsx';

const DashboardPage = lazy(() => import('../../features/dashboard/ui/DashboardPage.jsx'));
const CreateOrganizationPage = lazy(() => import('../../features/organization/ui/CreateOrganizationPage.jsx'));
const OrganizationSettingsPage = lazy(() => import('../../features/organization/ui/OrganizationSettingsPage.jsx'));
const PeoplePage = lazy(() => import('../../features/people/ui/PeoplePage.jsx'));
const GroupsPage = lazy(() => import('../../features/groups/ui/GroupsPage.jsx'));
const EntityTypesPage = lazy(() => import('../../features/entities/ui/EntityTypesPage.jsx'));
const EntitiesPage = lazy(() => import('../../features/entities/ui/EntitiesPage.jsx'));
const EntityDetailPage = lazy(() => import('../../features/entities/ui/EntityDetailPage.jsx'));
const ModulesPage = lazy(() => import('../../features/modules/ui/ModulesPage.jsx'));
const CreateModulePage = lazy(() => import('../../features/modules/ui/CreateModulePage.jsx'));
const ModuleDetailPage = lazy(() => import('../../features/modules/ui/ModuleDetailPage.jsx'));
const EditModulePage = lazy(() => import('../../features/modules/ui/EditModulePage.jsx'));
const ModuleFormPage = lazy(() => import('../../features/modules/ui/ModuleFormPage.jsx'));
const RecordDetailPage = lazy(() => import('../../features/records/ui/RecordDetailPage.jsx'));

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

        <main className="flex-1 lg:pl-64">
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route index element={<DashboardPage />} />
              <Route path="create-organization" element={<CreateOrganizationPage />} />
              <Route path="settings" element={<OrganizationSettingsPage />} />
              <Route path="people" element={<PeoplePage />} />
              <Route path="groups" element={<GroupsPage />} />
              <Route path="entity-types" element={<EntityTypesPage />} />
              <Route path="entities" element={<EntitiesPage />} />
              <Route path="entities/:entityId" element={<EntityDetailPage />} />
              <Route path="modules" element={<ModulesPage />} />
              <Route path="modules/new" element={<CreateModulePage />} />
              <Route path="modules/:moduleId" element={<ModuleDetailPage />} />
              <Route path="modules/:moduleId/edit" element={<EditModulePage />} />
              <Route path="modules/:moduleId/form" element={<ModuleFormPage />} />
              <Route path="records/:recordId" element={<RecordDetailPage />} />
              <Route path="*" element={<Navigate to="/app" replace />} />
            </Routes>
          </Suspense>
        </main>
      </div>

      <MobileDrawer open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
    </div>
  );
}

export default AppShell;
