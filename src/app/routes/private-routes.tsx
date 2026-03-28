import { Route } from 'react-router-dom';

import { AppLayout } from '@/components/layout/AppLayout';

import {
  AgendaPage,
  AutomationsPage,
  ClarisPage,
  CoursePanelPage,
  DashboardPage,
  MessagesPage,
  MyCoursesPage,
  MyServicesPage,
  NoAccessPage,
  ReportsPage,
  SchoolsPage,
  SettingsPage,
  StudentProfilePage,
  StudentsPage,
  TasksPage,
  WhatsAppPage,
} from './lazy-pages';
import { PermissionRoute } from './PermissionRoute';
import { ProtectedRoute } from './ProtectedRoute';
import { APP_PERMISSIONS } from '@/lib/access-control';

export function renderPrivateRoutes() {
  return (
    <Route
      element={(
        <ProtectedRoute>
          <AppLayout />
        </ProtectedRoute>
      )}
    >
      <Route path="/" element={<PermissionRoute permission={APP_PERMISSIONS.DASHBOARD_VIEW}><DashboardPage /></PermissionRoute>} />
      <Route path="/meus-cursos" element={<PermissionRoute permission={APP_PERMISSIONS.COURSES_CATALOG_VIEW}><MyCoursesPage /></PermissionRoute>} />
      <Route path="/escolas" element={<PermissionRoute permission={APP_PERMISSIONS.SCHOOLS_VIEW}><SchoolsPage /></PermissionRoute>} />
      <Route path="/cursos/:id" element={<PermissionRoute permission={APP_PERMISSIONS.COURSES_PANEL_VIEW}><CoursePanelPage /></PermissionRoute>} />
      <Route path="/alunos" element={<PermissionRoute permission={APP_PERMISSIONS.STUDENTS_VIEW}><StudentsPage /></PermissionRoute>} />
      <Route path="/alunos/:id" element={<PermissionRoute permission={APP_PERMISSIONS.STUDENTS_VIEW}><StudentProfilePage /></PermissionRoute>} />
      <Route path="/tarefas" element={<PermissionRoute permission={APP_PERMISSIONS.TASKS_VIEW}><TasksPage /></PermissionRoute>} />
      <Route path="/agenda" element={<PermissionRoute permission={APP_PERMISSIONS.AGENDA_VIEW}><AgendaPage /></PermissionRoute>} />
      <Route path="/mensagens" element={<PermissionRoute permission={APP_PERMISSIONS.MESSAGES_VIEW}><MessagesPage /></PermissionRoute>} />
      <Route path="/whatsapp" element={<PermissionRoute permission={APP_PERMISSIONS.WHATSAPP_VIEW}><WhatsAppPage /></PermissionRoute>} />
      <Route path="/claris" element={<PermissionRoute permission={APP_PERMISSIONS.CLARIS_VIEW}><ClarisPage /></PermissionRoute>} />
      <Route path="/automacoes" element={<PermissionRoute permission={APP_PERMISSIONS.AUTOMATIONS_VIEW}><AutomationsPage /></PermissionRoute>} />
      <Route path="/relatorios" element={<PermissionRoute permission={APP_PERMISSIONS.REPORTS_VIEW}><ReportsPage /></PermissionRoute>} />
      <Route path="/configuracoes" element={<PermissionRoute permission={APP_PERMISSIONS.SETTINGS_VIEW}><SettingsPage /></PermissionRoute>} />
      <Route path="/meus-servicos" element={<PermissionRoute permission={APP_PERMISSIONS.SERVICES_VIEW}><MyServicesPage /></PermissionRoute>} />
      <Route path="/sem-acesso" element={<NoAccessPage />} />
    </Route>
  );
}
