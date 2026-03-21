import { CLARIS_TOOLS, ToolDefinition } from './tools.ts'

type ChatHistoryEntry = {
  role: 'user' | 'assistant'
  content: string
}

type ToolSelectionInput = {
  latestUserMessage: string
  history?: ChatHistoryEntry[]
  actionKind?: 'quick_reply'
  actionJobId?: string
}

const BASE_TOOL_NAMES = [
  'get_dashboard_summary',
  'get_notifications',
  'get_platform_help',
  'notify_user',
  'save_suggestion',
  'create_support_ticket',
] as const

const AGENDA_TOOL_NAMES = [
  'get_upcoming_calendar_commitments',
  'create_event',
  'batch_create_events',
  'update_event',
  'delete_event',
  'list_events',
] as const

const TASK_TOOL_NAMES = [
  'get_pending_tasks',
  'create_task',
  'batch_create_tasks',
  'update_task',
  'change_task_status',
  'add_tag_to_task',
  'list_tasks',
  'generate_weekly_checklist',
] as const

const MESSAGING_TOOL_NAMES = [
  'find_students_for_messaging',
  'prepare_single_student_message_send',
  'confirm_single_student_message_send',
  'list_message_templates',
  'prepare_bulk_message_send',
  'confirm_bulk_message_send',
  'cancel_bulk_message_send',
] as const

const ANALYTICS_TOOL_NAMES = [
  'get_students_at_risk',
  'get_student_details',
  'get_activities_to_review',
  'get_student_summary',
  'get_student_history',
  'get_grade_risk',
  'get_engagement_signals',
  'get_recent_attendance_risk',
  'get_upcoming_calendar_commitments',
] as const

const ROUTINE_TOOL_NAMES = [
  'get_tutor_routine_suggestions',
  'generate_weekly_checklist',
  'run_proactive_engines',
  'save_suggestion',
] as const

const HELP_TOOL_NAMES = [
  'get_platform_help',
  'notify_user',
  'create_support_ticket',
] as const

const SYSTEM_PROMPT_LINES = [
  'Voce e a Claris IA, assistente operacional e pedagogica da plataforma Claris.',
  'Atenda tutores, monitores, analistas pedagogicos e gestores com base em dados reais do sistema.',
  'Objetivos: resumir contexto, identificar riscos, priorizar proximos passos e executar acoes permitidas.',
  'Seja objetiva, pratica e profissional. Nao invente notas, datas, registros ou confirmacoes.',
  'Use ferramentas antes de dizer que faltam dados.',
  'Quando houver risco ou pendencia, explique o motivo e sugira a acao concreta mais util.',
  'Pode agir sem confirmar: checklist, lembrete interno, tarefa pessoal, notificacao interna e save_suggestion.',
  'Precisa confirmar antes: criar ou alterar agenda compartilhada, enviar mensagem a terceiros, excluir tarefa ou evento, ou qualquer acao com impacto institucional.',
  'Para listas de tarefas, checklists ou varios eventos de uma vez, prefira batch_create_tasks e batch_create_events.',
  'Para mensagens em lote, sempre prepare antes e so confirme depois de confirmacao explicita do usuario na mensagem mais recente.',
  'Para envio individual com nomes ambiguos, use find_students_for_messaging e reutilize o student_id retornado.',
  'Quando o usuario pedir ajuda sobre a plataforma, use get_platform_help.',
  'Fluxo preferido: 1) resumir contexto 2) apontar riscos ou pendencias 3) sugerir acoes 4) executar se permitido.',
] as const

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function addTools(target: Set<string>, names: readonly string[]) {
  for (const name of names) {
    target.add(name)
  }
}

function hasAnyKeyword(text: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword))
}

function looksLikeBulkSchedule(text: string): boolean {
  return (
    text.includes('"datahorainicio"') ||
    text.includes('"datahorafim"') ||
    text.includes('"tipoevento"') ||
    (text.includes('18/03/20') && text.includes(' as ')) ||
    (text.includes(' - ') && text.includes('tipo:') && text.includes('descricao:'))
  )
}

export function buildClarisSystemPrompt(activeTools: ToolDefinition[]): string {
  const toolNames = activeTools.map((tool) => tool.function.name).join(', ')
  return [...SYSTEM_PROMPT_LINES, `Ferramentas ativas nesta conversa: ${toolNames}.`].join('\n')
}

export function selectClarisToolsForMessage(input: ToolSelectionInput): ToolDefinition[] {
  const recentHistory = (input.history ?? []).slice(-4).map((entry) => entry.content)
  const combinedText = normalizeText([input.latestUserMessage, ...recentHistory].join('\n'))
  const selectedToolNames = new Set<string>(BASE_TOOL_NAMES)
  let matchedDomain = false

  if (
    input.actionKind === 'quick_reply' ||
    Boolean(input.actionJobId) ||
    hasAnyKeyword(combinedText, [
      'confirmo o envio do job',
      'cancelar o envio do job',
      'nao confirmo o envio',
      'enviar mensagem',
      'mensagem em lote',
      'whatsapp',
      'template',
      'destinatario',
    ])
  ) {
    addTools(selectedToolNames, MESSAGING_TOOL_NAMES)
    matchedDomain = true
  }

  if (
    looksLikeBulkSchedule(combinedText) ||
    hasAnyKeyword(combinedText, [
      'agenda',
      'evento',
      'eventos',
      'reuniao',
      'alinhamento',
      'webaula',
      'web aula',
      'compromisso',
      'calendario',
      'cronograma',
      'treinamento',
    ])
  ) {
    addTools(selectedToolNames, AGENDA_TOOL_NAMES)
    matchedDomain = true
  }

  if (
    hasAnyKeyword(combinedText, [
      'tarefa',
      'tarefas',
      'lista de tarefas',
      'plano de acao',
      'pendencia',
      'pendencias',
      'checklist',
      'todo',
      'prazo',
      'prioridade',
      'kanban',
    ])
  ) {
    addTools(selectedToolNames, TASK_TOOL_NAMES)
    matchedDomain = true
  }

  if (
    hasAnyKeyword(combinedText, [
      'aluno',
      'alunos',
      'risco',
      'nota',
      'notas',
      'frequencia',
      'engajamento',
      'acesso',
      'curso',
      'turma',
      'historico',
      'desistente',
      'atividade pendente',
      'correcao',
    ])
  ) {
    addTools(selectedToolNames, ANALYTICS_TOOL_NAMES)
    matchedDomain = true
  }

  if (
    hasAnyKeyword(combinedText, [
      'rotina',
      'proativo',
      'sugestao do dia',
      'hoje',
      'essa semana',
      'esta semana',
      'semana',
      'planejamento',
    ])
  ) {
    addTools(selectedToolNames, ROUTINE_TOOL_NAMES)
    matchedDomain = true
  }

  if (
    hasAnyKeyword(combinedText, [
      'ajuda',
      'como usar',
      'como faco',
      'onde fica',
      'onde encontro',
      'fluxo',
      'tutorial',
      'configurar',
      'configuracao',
      'funciona',
      'o que e',
      'o que significa',
    ])
  ) {
    addTools(selectedToolNames, HELP_TOOL_NAMES)
    matchedDomain = true
  }

  if (
    hasAnyKeyword(combinedText, [
      'erro',
      'bug',
      'problema',
      'suporte',
      'chamado',
      'ticket',
      'falha',
    ])
  ) {
    selectedToolNames.add('create_support_ticket')
    matchedDomain = true
  }

  if (!matchedDomain) {
    return CLARIS_TOOLS
  }

  return CLARIS_TOOLS.filter((tool) => selectedToolNames.has(tool.function.name))
}
