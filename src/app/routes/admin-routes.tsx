import { Route } from 'react-router-dom';

import {
  AdminApplicationServicesPage,
  AdminClarisConversationsPage,
  AdminDashboardPage,
  AdminErrorLogsPage,
  AdminGroupEditorPage,
  AdminGroupsPage,
  AdminJobsPage,
  AdminMetricsPage,
  AdminSettingsPage,
  AdminSupportPage,
  AdminUsersPage,
} from './lazy-pages';
import { AdminErrorBoundary } from './admin/AdminErrorBoundary';
import { AdminLayout } from './admin/AdminLayout';
import { AdminRoute } from './admin/AdminRoute';

export function renderAdminRoutes() {
  return (
    <Route
      element={(
        <AdminRoute>
          <AdminErrorBoundary>
            <AdminLayout />
          </AdminErrorBoundary>
        </AdminRoute>
      )}
    >
      <Route path="/admin" element={<AdminDashboardPage />} />
      <Route path="/admin/configuracoes" element={<AdminSettingsPage />} />
      <Route path="/admin/jobs" element={<AdminJobsPage />} />
      <Route path="/admin/usuarios" element={<AdminUsersPage />} />
      <Route path="/admin/grupos" element={<AdminGroupsPage />} />
      <Route path="/admin/grupos/novo" element={<AdminGroupEditorPage />} />
      <Route path="/admin/grupos/:groupId" element={<AdminGroupEditorPage />} />
      <Route path="/admin/metricas" element={<AdminMetricsPage />} />
      <Route path="/admin/logs-erros" element={<AdminErrorLogsPage />} />
      <Route path="/admin/suporte" element={<AdminSupportPage />} />
      <Route path="/admin/conversas-claris" element={<AdminClarisConversationsPage />} />
      <Route path="/admin/servicos-aplicacao" element={<AdminApplicationServicesPage />} />
    </Route>
  );
}
