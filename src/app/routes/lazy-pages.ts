import { lazy } from 'react';

export const LoginPage = lazy(() => import('@/pages/Login'));
export const DashboardPage = lazy(() => import('@/features/dashboard/pages/DashboardPage'));
export const MyCoursesPage = lazy(() => import('@/features/courses/pages/MyCoursesPage'));
export const SchoolsPage = lazy(() => import('@/features/courses/pages/SchoolsPage'));
export const CoursePanelPage = lazy(() => import('@/features/courses/pages/CoursePanelPage'));
export const StudentsPage = lazy(() => import('@/features/students/pages/StudentsPage'));
export const StudentProfilePage = lazy(() => import('@/features/students/pages/StudentProfilePage'));
export const TasksPage = lazy(() => import('@/features/tasks/pages/TasksPage'));
export const AgendaPage = lazy(() => import('@/features/agenda/pages/AgendaPage'));
export const MessagesPage = lazy(() => import('@/features/messages/pages/MessagesPage'));
export const WhatsAppPage = lazy(() => import('@/features/whatsapp/pages/WhatsAppPage'));
export const SettingsPage = lazy(() => import('@/pages/Settings'));
export const ReportsPage = lazy(() => import('@/pages/Reports'));
export const ClarisPage = lazy(() => import('@/features/claris/pages/ClarisPage'));
export const AutomationsPage = lazy(() => import('@/features/automations/pages/AutomacoesPage'));
export const MyServicesPage = lazy(() => import('@/features/services/pages/MyServicesPage'));
export const NotFoundPage = lazy(() => import('@/pages/NotFound'));

export const AdminDashboardPage = lazy(() => import('@/features/admin/pages/AdminDashboard'));
export const AdminSettingsPage = lazy(() => import('@/features/admin/pages/AdminConfiguracoes'));
export const AdminUsersPage = lazy(() => import('@/features/admin/pages/AdminUsuarios'));
export const AdminMetricsPage = lazy(() => import('@/features/admin/pages/AdminMetricas'));
export const AdminErrorLogsPage = lazy(() => import('@/features/admin/pages/AdminLogsErros'));
export const AdminSupportPage = lazy(() => import('@/features/admin/pages/AdminSuporte'));
export const AdminClarisConversationsPage = lazy(() => import('@/features/admin/pages/AdminConversasClaris'));
export const AdminFeatureFlagsPage = lazy(() => import('@/features/admin/pages/AdminFeatureFlags'));
export const AdminApplicationServicesPage = lazy(() => import('@/features/admin/pages/AdminServicosAplicacao'));
