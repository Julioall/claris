export type CleanupCategory =
  | 'preferences'
  | 'academic'
  | 'tasks'
  | 'messaging'
  | 'ai'
  | 'observability';

export type CleanupSelectionId =
  | 'sync_preferences'
  | 'ignored_courses'
  | 'moodle_reauthorization'
  | 'course_catalog'
  | 'students'
  | 'academic_activities'
  | 'attendance'
  | 'sync_snapshots'
  | 'notes'
  | 'pending_tasks'
  | 'task_templates'
  | 'workspace_tasks'
  | 'moodle_conversations'
  | 'bulk_messaging'
  | 'claris_history'
  | 'ai_grading'
  | 'background_jobs'
  | 'support_tickets'
  | 'usage_metrics'
  | 'error_logs'
  | 'service_runtime';

export interface CleanupOption {
  category: CleanupCategory;
  clearsCourseCache?: true;
  description: string;
  id: CleanupSelectionId;
  label: string;
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
    id: 'sync_preferences',
    label: 'Preferencias de sincronizacao',
    description: 'Remove preferencias operacionais salvas pelos usuarios.',
    category: 'preferences',
  },
  {
    id: 'ignored_courses',
    label: 'Cursos ignorados',
    description: 'Remove a lista global de cursos ignorados.',
    category: 'preferences',
  },
  {
    id: 'moodle_reauthorization',
    label: 'Credenciais Moodle salvas',
    description: 'Remove as credenciais criptografadas usadas para reautenticacao.',
    category: 'preferences',
  },
  {
    id: 'course_catalog',
    label: 'Cursos e vinculos',
    description: 'Remove cursos, vinculos, agregados e historicos operacionais dependentes do catalogo academico.',
    category: 'academic',
    clearsCourseCache: true,
  },
  {
    id: 'students',
    label: 'Alunos e historico vinculado',
    description: 'Remove o cadastro de alunos e todo o historico diretamente vinculado a eles.',
    category: 'academic',
  },
  {
    id: 'academic_activities',
    label: 'Atividades, notas e correcao IA',
    description: 'Remove atividades sincronizadas, notas e historico da correcao com IA.',
    category: 'academic',
  },
  {
    id: 'attendance',
    label: 'Frequencia',
    description: 'Remove configuracoes e registros de frequencia.',
    category: 'academic',
  },
  {
    id: 'sync_snapshots',
    label: 'Snapshots de sync de alunos',
    description: 'Remove snapshots auxiliares gerados durante o sync de alunos.',
    category: 'academic',
  },
  {
    id: 'notes',
    label: 'Anotacoes',
    description: 'Remove todas as anotacoes registradas na base.',
    category: 'tasks',
  },
  {
    id: 'pending_tasks',
    label: 'Pendencias e recorrencias',
    description: 'Remove pendencias operacionais, notas vinculadas e configuracoes de recorrencia.',
    category: 'tasks',
  },
  {
    id: 'task_templates',
    label: 'Modelos de pendencias',
    description: 'Remove modelos de pendencias e as pendencias vinculadas a eles.',
    category: 'tasks',
  },
  {
    id: 'workspace_tasks',
    label: 'Tarefas modernas e agenda',
    description: 'Remove tarefas do workspace, comentarios, historico, tags e eventos de agenda.',
    category: 'tasks',
  },
  {
    id: 'moodle_conversations',
    label: 'Conversas do Moodle',
    description: 'Remove conversas e mensagens sincronizadas do Moodle.',
    category: 'messaging',
  },
  {
    id: 'bulk_messaging',
    label: 'Envios em massa e modelos',
    description: 'Remove agendamentos, jobs, destinatarios e modelos de mensagem.',
    category: 'messaging',
  },
  {
    id: 'claris_history',
    label: 'Claris IA',
    description: 'Remove conversas, sugestoes e auditoria da Claris IA.',
    category: 'ai',
  },
  {
    id: 'ai_grading',
    label: 'Jobs de correcao com IA',
    description: 'Remove jobs e historico de sugestao de nota com IA.',
    category: 'ai',
  },
  {
    id: 'background_jobs',
    label: 'Background jobs',
    description: 'Remove filas, itens e eventos de jobs em segundo plano.',
    category: 'ai',
  },
  {
    id: 'support_tickets',
    label: 'Chamados de suporte',
    description: 'Remove todos os tickets e observacoes de suporte.',
    category: 'observability',
  },
  {
    id: 'usage_metrics',
    label: 'Metricas de uso',
    description: 'Remove eventos de telemetria e uso da aplicacao.',
    category: 'observability',
  },
  {
    id: 'error_logs',
    label: 'Logs de erro',
    description: 'Remove registros de erro coletados pela aplicacao.',
    category: 'observability',
  },
  {
    id: 'service_runtime',
    label: 'Runtime dos servicos',
    description: 'Remove eventos, health logs, jobs e webhooks dos servicos compartilhados.',
    category: 'observability',
  },
];

const CLEANUP_OPTIONS_BY_ID = new Map(
  CLEANUP_OPTIONS.map((option) => [option.id, option] as const),
);

export function getCleanupOption(selectionId: string) {
  return CLEANUP_OPTIONS_BY_ID.get(selectionId as CleanupSelectionId);
}

export function shouldClearCoursesCache(selectionIds: CleanupSelectionId[]) {
  return selectionIds.some((selectionId) => getCleanupOption(selectionId)?.clearsCourseCache);
}
