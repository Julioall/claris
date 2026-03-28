export const APP_PERMISSIONS = {
  DASHBOARD_VIEW: 'dashboard.view',
  COURSES_CATALOG_VIEW: 'courses.catalog.view',
  COURSES_PANEL_VIEW: 'courses.panel.view',
  SCHOOLS_VIEW: 'schools.view',
  STUDENTS_VIEW: 'students.view',
  TASKS_VIEW: 'tasks.view',
  AGENDA_VIEW: 'agenda.view',
  MESSAGES_VIEW: 'messages.view',
  MESSAGES_BULK_SEND: 'messages.bulk_send',
  WHATSAPP_VIEW: 'whatsapp.view',
  AUTOMATIONS_VIEW: 'automations.view',
  SERVICES_VIEW: 'services.view',
  CLARIS_VIEW: 'claris.view',
  CLARIS_PROACTIVE_GENERATE: 'claris.proactive.generate',
  GRADES_SUGGESTIONS_MANAGE: 'grades.suggestions.manage',
  REPORTS_VIEW: 'reports.view',
  SETTINGS_VIEW: 'settings.view',
} as const;

export type AppPermissionKey = typeof APP_PERMISSIONS[keyof typeof APP_PERMISSIONS];

export const NO_ACCESS_ROUTE = '/sem-acesso';

export const PRIVATE_ROUTE_PERMISSIONS: Array<{ path: string; permission: AppPermissionKey }> = [
  { path: '/', permission: APP_PERMISSIONS.DASHBOARD_VIEW },
  { path: '/meus-cursos', permission: APP_PERMISSIONS.COURSES_CATALOG_VIEW },
  { path: '/escolas', permission: APP_PERMISSIONS.SCHOOLS_VIEW },
  { path: '/alunos', permission: APP_PERMISSIONS.STUDENTS_VIEW },
  { path: '/tarefas', permission: APP_PERMISSIONS.TASKS_VIEW },
  { path: '/agenda', permission: APP_PERMISSIONS.AGENDA_VIEW },
  { path: '/mensagens', permission: APP_PERMISSIONS.MESSAGES_VIEW },
  { path: '/whatsapp', permission: APP_PERMISSIONS.WHATSAPP_VIEW },
  { path: '/campanhas', permission: APP_PERMISSIONS.MESSAGES_BULK_SEND },
  { path: '/claris', permission: APP_PERMISSIONS.CLARIS_VIEW },
  { path: '/automacoes', permission: APP_PERMISSIONS.AUTOMATIONS_VIEW },
  { path: '/relatorios', permission: APP_PERMISSIONS.REPORTS_VIEW },
  { path: '/configuracoes', permission: APP_PERMISSIONS.SETTINGS_VIEW },
  { path: '/meus-servicos', permission: APP_PERMISSIONS.SERVICES_VIEW },
];

export function getFirstAccessiblePrivatePath(params: {
  can: (permission: AppPermissionKey) => boolean;
  isAdmin: boolean;
}) {
  if (params.isAdmin) {
    return PRIVATE_ROUTE_PERMISSIONS[0]?.path ?? NO_ACCESS_ROUTE;
  }

  const match = PRIVATE_ROUTE_PERMISSIONS.find(({ permission }) => params.can(permission));
  return match?.path ?? NO_ACCESS_ROUTE;
}
