import { Route } from 'react-router-dom';

import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminRoute } from '@/components/admin/AdminRoute';

import {
  AdminApplicationServicesPage,
  AdminClarisConversationsPage,
  AdminDashboardPage,
  AdminErrorLogsPage,
  AdminFeatureFlagsPage,
  AdminMetricsPage,
  AdminSettingsPage,
  AdminSupportPage,
  AdminUsersPage,
} from './lazy-pages';

export function renderAdminRoutes() {
  return (
    <Route
      element={(
        <AdminRoute>
          <AdminLayout />
        </AdminRoute>
      )}
    >
      <Route path="/admin" element={<AdminDashboardPage />} />
      <Route path="/admin/configuracoes" element={<AdminSettingsPage />} />
      <Route path="/admin/usuarios" element={<AdminUsersPage />} />
      <Route path="/admin/metricas" element={<AdminMetricsPage />} />
      <Route path="/admin/logs-erros" element={<AdminErrorLogsPage />} />
      <Route path="/admin/suporte" element={<AdminSupportPage />} />
      <Route path="/admin/conversas-claris" element={<AdminClarisConversationsPage />} />
      <Route path="/admin/feature-flags" element={<AdminFeatureFlagsPage />} />
      <Route path="/admin/servicos-aplicacao" element={<AdminApplicationServicesPage />} />
    </Route>
  );
}
