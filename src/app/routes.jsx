/**
 * Application Routes
 *
 * Central route table for the authenticated application shell.
 * Lazy-loaded feature pages keep the initial bundle small.
 */

import { lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

const DashboardPage = lazy(() => import('../features/dashboard/ui/DashboardPage.jsx'));
const CreateOrganizationPage = lazy(() => import('../features/organization/ui/CreateOrganizationPage.jsx'));
const OrganizationSettingsPage = lazy(() => import('../features/organization/ui/OrganizationSettingsPage.jsx'));
const PeoplePage = lazy(() => import('../features/people/ui/PeoplePage.jsx'));
const GroupsPage = lazy(() => import('../features/groups/ui/GroupsPage.jsx'));
const EntityTypesPage = lazy(() => import('../features/entities/ui/EntityTypesPage.jsx'));
const EntityTypeDetailPage = lazy(() => import('../features/entities/ui/EntityTypeDetailPage.jsx'));
const EntityListPage = lazy(() => import('../features/entities/ui/EntityListPage.jsx'));
const EntityFormPage = lazy(() => import('../features/entities/ui/EntityFormPage.jsx'));
const EntitiesPage = lazy(() => import('../features/entities/ui/EntitiesPage.jsx'));
const EntityDetailPage = lazy(() => import('../features/entities/ui/EntityDetailPage.jsx'));
const ModulesPage = lazy(() => import('../features/modules/ui/ModulesPage.jsx'));
const CreateModulePage = lazy(() => import('../features/modules/ui/CreateModulePage.jsx'));
const ModuleDetailPage = lazy(() => import('../features/modules/ui/ModuleDetailPage.jsx'));
const EditModulePage = lazy(() => import('../features/modules/ui/EditModulePage.jsx'));
const ModuleFormPage = lazy(() => import('../features/modules/ui/ModuleFormPage.jsx'));
const RecordDetailPage = lazy(() => import('../features/records/ui/RecordDetailPage.jsx'));
const RecordListPage = lazy(() => import('../features/records/ui/RecordListPage.jsx'));
const ModuleRecordListPage = lazy(() => import('../features/records/ui/ModuleRecordListPage.jsx'));
const LedgerListPage = lazy(() => import('../features/ledger/ui/LedgerListPage.jsx'));
const LedgerBookPage = lazy(() => import('../features/ledger/ui/LedgerBookPage.jsx'));
const CreateLedgerBookPage = lazy(() => import('../features/ledger/ui/CreateLedgerBookPage.jsx'));
const LedgerEntryDetailPage = lazy(() => import('../features/ledger/ui/LedgerEntryDetailPage.jsx'));
const WorksetsPage = lazy(() => import('../features/worksets/ui/WorksetsPage.jsx'));
const CreateWorksetPage = lazy(() => import('../features/worksets/ui/CreateWorksetPage.jsx'));
const WorksetDetailPage = lazy(() => import('../features/worksets/ui/WorksetDetailPage.jsx'));
const WidgetsPage = lazy(() => import('../features/widgets/ui/WidgetsPage.jsx'));
const NotificationsPage = lazy(() => import('../features/notifications/ui/NotificationsPage.jsx'));
const ChatPage = lazy(() => import('../features/chat/ui/ChatPage.jsx'));
const ReportsPage = lazy(() => import('../features/reports/ui/ReportsPage.jsx'));
const ReportBuilderPage = lazy(() => import('../features/reports/ui/ReportBuilderPage.jsx'));
const ReportDetailPage = lazy(() => import('../features/reports/ui/ReportDetailPage.jsx'));
const AutomatPlannerPage = lazy(() => import('../features/automat/ui/AutomatPlannerPage.jsx'));
const CalendarPage = lazy(() => import('../features/calendar/ui/CalendarPage.jsx'));
const ManageCalendarsPage = lazy(() => import('../features/calendar/ui/ManageCalendarsPage.jsx'));

export default function AppRoutes() {
  return (
    <Routes>
      <Route index element={<DashboardPage />} />
      <Route path="create-organization" element={<CreateOrganizationPage />} />
      <Route path="settings" element={<OrganizationSettingsPage />} />
      <Route path="people" element={<PeoplePage />} />
      <Route path="groups" element={<GroupsPage />} />
      <Route path="entity-types" element={<EntityTypesPage />} />
      <Route path="entity-types/:entityTypeId" element={<EntityTypeDetailPage />} />
      <Route path="entity-types/:entityTypeId/entities" element={<EntityListPage />} />
      <Route path="entity-types/:entityTypeId/entities/new" element={<EntityFormPage />} />
      <Route path="entities" element={<EntitiesPage />} />
      <Route path="entities/:entityId" element={<EntityDetailPage />} />
      <Route path="entities/:entityId/edit" element={<EntityFormPage />} />
      <Route path="modules" element={<ModulesPage />} />
      <Route path="modules/new" element={<CreateModulePage />} />
      <Route path="modules/:moduleId" element={<ModuleDetailPage />} />
      <Route path="modules/:moduleId/edit" element={<EditModulePage />} />
      <Route path="modules/:moduleId/form" element={<ModuleFormPage />} />
      <Route path="modules/:moduleId/records" element={<ModuleRecordListPage />} />
      <Route path="records" element={<RecordListPage />} />
      <Route path="records/:recordId" element={<RecordDetailPage />} />
      <Route path="worksets" element={<WorksetsPage />} />
      <Route path="worksets/new" element={<CreateWorksetPage />} />
      <Route path="worksets/:worksetId" element={<WorksetDetailPage />} />
      <Route path="widgets" element={<WidgetsPage />} />
      <Route path="notifications" element={<NotificationsPage />} />
      <Route path="chat" element={<ChatPage />} />
      <Route path="reports" element={<ReportsPage />} />
      <Route path="reports/new" element={<ReportBuilderPage />} />
      <Route path="reports/:reportId" element={<ReportDetailPage />} />
      <Route path="reports/:reportId/edit" element={<ReportBuilderPage />} />
      <Route path="automat" element={<AutomatPlannerPage />} />
      <Route path="calendar" element={<CalendarPage />} />
      <Route path="calendars/manage" element={<ManageCalendarsPage />} />
      <Route path="ledger" element={<LedgerListPage />} />
      <Route path="ledger/new" element={<CreateLedgerBookPage />} />
      <Route path="ledger/:ledgerBookId" element={<LedgerBookPage />} />
      <Route path="ledger/:ledgerBookId/entry/:ledgerEntryId" element={<LedgerEntryDetailPage />} />
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  );
}
