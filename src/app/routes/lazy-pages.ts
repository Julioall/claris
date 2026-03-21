import { lazy } from 'react';

export const LoginPage = lazy(() => import('@/pages/Login'));
export const DashboardPage = lazy(() => import('@/pages/Dashboard'));
export const MyCoursesPage = lazy(() => import('@/features/courses/pages/MyCoursesPage'));
export const SchoolsPage = lazy(() => import('@/features/courses/pages/SchoolsPage'));
export const CoursePanelPage = lazy(() => import('@/features/courses/pages/CoursePanelPage'));
export const StudentsPage = lazy(() => import('@/features/students/pages/StudentsPage'));
export const StudentProfilePage = lazy(() => import('@/features/students/pages/StudentProfilePage'));
export const TasksPage = lazy(() => import('@/features/tasks/pages/TasksPage'));
export const AgendaPage = lazy(() => import('@/features/agenda/pages/AgendaPage'));
export const MessagesPage = lazy(() => import('@/pages/Messages'));
export const WhatsAppPage = lazy(() => import('@/pages/WhatsApp'));
export const SettingsPage = lazy(() => import('@/pages/Settings'));
export const ReportsPage = lazy(() => import('@/pages/Reports'));
export const ClarisPage = lazy(() => import('@/pages/Claris'));
export const AutomationsPage = lazy(() => import('@/pages/Automacoes'));
export const MyServicesPage = lazy(() => import('@/pages/MeusServicos'));
export const NotFoundPage = lazy(() => import('@/pages/NotFound'));

export const AdminDashboardPage = lazy(() => import('@/pages/admin/AdminDashboard'));
export const AdminSettingsPage = lazy(() => import('@/pages/admin/AdminConfiguracoes'));
export const AdminUsersPage = lazy(() => import('@/pages/admin/AdminUsuarios'));
export const AdminMetricsPage = lazy(() => import('@/pages/admin/AdminMetricas'));
export const AdminErrorLogsPage = lazy(() => import('@/pages/admin/AdminLogsErros'));
export const AdminSupportPage = lazy(() => import('@/pages/admin/AdminSuporte'));
export const AdminClarisConversationsPage = lazy(() => import('@/pages/admin/AdminConversasClaris'));
export const AdminFeatureFlagsPage = lazy(() => import('@/pages/admin/AdminFeatureFlags'));
export const AdminApplicationServicesPage = lazy(() => import('@/pages/admin/AdminServicosAplicacao'));
