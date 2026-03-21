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
  ReportsPage,
  SchoolsPage,
  SettingsPage,
  StudentProfilePage,
  StudentsPage,
  TasksPage,
  WhatsAppPage,
} from './lazy-pages';
import { ProtectedRoute } from './ProtectedRoute';

export function renderPrivateRoutes() {
  return (
    <Route
      element={(
        <ProtectedRoute>
          <AppLayout />
        </ProtectedRoute>
      )}
    >
      <Route path="/" element={<DashboardPage />} />
      <Route path="/meus-cursos" element={<MyCoursesPage />} />
      <Route path="/escolas" element={<SchoolsPage />} />
      <Route path="/cursos/:id" element={<CoursePanelPage />} />
      <Route path="/alunos" element={<StudentsPage />} />
      <Route path="/alunos/:id" element={<StudentProfilePage />} />
      <Route path="/tarefas" element={<TasksPage />} />
      <Route path="/agenda" element={<AgendaPage />} />
      <Route path="/mensagens" element={<MessagesPage />} />
      <Route path="/whatsapp" element={<WhatsAppPage />} />
      <Route path="/claris" element={<ClarisPage />} />
      <Route path="/automacoes" element={<AutomationsPage />} />
      <Route path="/relatorios" element={<ReportsPage />} />
      <Route path="/configuracoes" element={<SettingsPage />} />
      <Route path="/meus-servicos" element={<MyServicesPage />} />
    </Route>
  );
}
