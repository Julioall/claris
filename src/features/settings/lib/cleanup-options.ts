export type CleanupCategory =
  | 'preferences'
  | 'academic'
  | 'tasks'
  | 'messaging'
  | 'ai'
  | 'observability';

export interface CleanupOption {
  id: string;
  label: string;
  description: string;
  category: CleanupCategory;
  tables: string[];
}

export const CLEANUP_CATEGORY_LABELS: Record<CleanupCategory, string> = {
  preferences: 'Preferencias e credenciais',
  academic: 'Base academica',
  tasks: 'Tarefas e agenda',
  messaging: 'Mensageria',
  ai: 'IA e automacoes',
  observability: 'Suporte e observabilidade',
};

export const CLEANUP_OPTIONS: CleanupOption[] = [
  {
    id: 'user_sync_preferences',
    label: 'Preferencias de sincronizacao',
    description: 'Remove preferencias operacionais salvas pelos usuarios.',
    category: 'preferences',
    tables: ['user_sync_preferences'],
  },
  {
    id: 'user_ignored_courses',
    label: 'Cursos ignorados',
    description: 'Remove a lista global de cursos ignorados.',
    category: 'preferences',
    tables: ['user_ignored_courses'],
  },
  {
    id: 'user_moodle_reauth_credentials',
    label: 'Credenciais Moodle salvas',
    description: 'Remove as credenciais criptografadas usadas para reautenticacao.',
    category: 'preferences',
    tables: ['user_moodle_reauth_credentials'],
  },
  {
    id: 'courses',
    label: 'Cursos e vinculos',
    description: 'Remove cursos, vinculos, agregados e historicos operacionais dependentes do catalogo academico.',
    category: 'academic',
    tables: [
      'background_job_events',
      'background_job_items',
      'background_jobs',
      'ai_grade_suggestion_job_items',
      'ai_grade_suggestion_history',
      'ai_grade_suggestion_jobs',
      'activity_feed',
      'attendance_records',
      'attendance_course_settings',
      'dashboard_course_activity_aggregates',
      'student_sync_snapshots',
      'student_activities',
      'student_course_grades',
      'student_courses',
      'user_courses',
      'user_ignored_courses',
      'courses',
    ],
  },
  {
    id: 'students',
    label: 'Alunos e historico vinculado',
    description: 'Remove o cadastro de alunos e todo o historico diretamente vinculado a eles.',
    category: 'academic',
    tables: [
      'ai_grade_suggestion_job_items',
      'ai_grade_suggestion_history',
      'activity_feed',
      'attendance_records',
      'notes',
      'pending_tasks',
      'risk_history',
      'student_sync_snapshots',
      'student_activities',
      'student_course_grades',
      'student_courses',
      'task_recurrence_configs',
      'students',
    ],
  },
  {
    id: 'activities',
    label: 'Atividades, notas e correcao IA',
    description: 'Remove atividades sincronizadas, notas e historico da correcao com IA.',
    category: 'academic',
    tables: [
      'ai_grade_suggestion_job_items',
      'ai_grade_suggestion_history',
      'ai_grade_suggestion_jobs',
      'dashboard_course_activity_aggregates',
      'student_activities',
      'student_course_grades',
    ],
  },
  {
    id: 'attendance',
    label: 'Frequencia',
    description: 'Remove configuracoes e registros de frequencia.',
    category: 'academic',
    tables: ['attendance_records', 'attendance_course_settings'],
  },
  {
    id: 'student_sync_snapshots',
    label: 'Snapshots de sync de alunos',
    description: 'Remove snapshots auxiliares gerados durante o sync de alunos.',
    category: 'academic',
    tables: ['student_sync_snapshots'],
  },
  {
    id: 'notes',
    label: 'Anotacoes',
    description: 'Remove todas as anotacoes registradas na base.',
    category: 'tasks',
    tables: ['notes'],
  },
  {
    id: 'pending_tasks',
    label: 'Pendencias e recorrencias',
    description: 'Remove pendencias operacionais, notas vinculadas e configuracoes de recorrencia.',
    category: 'tasks',
    tables: ['notes', 'pending_tasks', 'task_recurrence_configs'],
  },
  {
    id: 'task_templates',
    label: 'Modelos de pendencias',
    description: 'Remove modelos de pendencias e as pendencias vinculadas a eles.',
    category: 'tasks',
    tables: ['notes', 'pending_tasks', 'task_templates'],
  },
  {
    id: 'workspace_tasks',
    label: 'Tarefas modernas e agenda',
    description: 'Remove tarefas do workspace, comentarios, historico, tags e eventos de agenda.',
    category: 'tasks',
    tables: ['task_tags', 'task_comments', 'task_history', 'calendar_events', 'tasks', 'tags'],
  },
  {
    id: 'moodle_conversations',
    label: 'Conversas do Moodle',
    description: 'Remove conversas e mensagens sincronizadas do Moodle.',
    category: 'messaging',
    tables: ['moodle_messages', 'moodle_conversations'],
  },
  {
    id: 'bulk_messaging',
    label: 'Envios em massa e modelos',
    description: 'Remove agendamentos, jobs, destinatarios e modelos de mensagem.',
    category: 'messaging',
    tables: ['scheduled_messages', 'bulk_message_recipients', 'bulk_message_jobs', 'message_templates'],
  },
  {
    id: 'claris_history',
    label: 'Claris IA',
    description: 'Remove conversas, sugestoes e auditoria da Claris IA.',
    category: 'ai',
    tables: ['claris_suggestion_cooldowns', 'claris_suggestions', 'claris_ai_actions', 'claris_conversations'],
  },
  {
    id: 'ai_grading',
    label: 'Jobs de correcao com IA',
    description: 'Remove jobs e historico de sugestao de nota com IA.',
    category: 'ai',
    tables: ['ai_grade_suggestion_job_items', 'ai_grade_suggestion_history', 'ai_grade_suggestion_jobs'],
  },
  {
    id: 'background_jobs',
    label: 'Background jobs',
    description: 'Remove filas, itens e eventos de jobs em segundo plano.',
    category: 'ai',
    tables: ['background_job_events', 'background_job_items', 'background_jobs'],
  },
  {
    id: 'support_tickets',
    label: 'Chamados de suporte',
    description: 'Remove todos os tickets e observacoes de suporte.',
    category: 'observability',
    tables: ['support_tickets'],
  },
  {
    id: 'app_usage_events',
    label: 'Metricas de uso',
    description: 'Remove eventos de telemetria e uso da aplicacao.',
    category: 'observability',
    tables: ['app_usage_events'],
  },
  {
    id: 'app_error_logs',
    label: 'Logs de erro',
    description: 'Remove registros de erro coletados pela aplicacao.',
    category: 'observability',
    tables: ['app_error_logs'],
  },
  {
    id: 'service_runtime_logs',
    label: 'Runtime dos servicos',
    description: 'Remove eventos, health logs, jobs e webhooks dos servicos compartilhados.',
    category: 'observability',
    tables: [
      'app_service_webhook_events',
      'app_service_instance_events',
      'app_service_instance_health_logs',
      'app_service_instance_jobs',
    ],
  },
];

const CLEANUP_OPTIONS_BY_ID = new Map(CLEANUP_OPTIONS.map((option) => [option.id, option]));
const COURSE_CACHE_TABLES = new Set(['courses', 'user_courses']);

export function getCleanupOption(selectionId: string) {
  return CLEANUP_OPTIONS_BY_ID.get(selectionId);
}

export function resolveCleanupTables(selectionIds: string | string[]) {
  const normalizedSelectionIds = Array.isArray(selectionIds) ? selectionIds : [selectionIds];
  const tables = normalizedSelectionIds.flatMap((selectionId) => getCleanupOption(selectionId)?.tables ?? []);
  return Array.from(new Set(tables));
}

export function shouldClearCoursesCache(selectionIds: string[]) {
  return resolveCleanupTables(selectionIds).some((table) => COURSE_CACHE_TABLES.has(table));
}
