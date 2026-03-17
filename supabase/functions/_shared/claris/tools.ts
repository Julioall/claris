/**
 * Claris IA — Tool definitions (OpenAI function-calling format).
 * Add new tools here and implement their executors in executors.ts.
 */
export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, unknown>
      required: string[]
    }
  }
}

export const CLARIS_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'get_dashboard_summary',
      description:
        'Retorna um resumo geral do sistema: contagem de alunos por nível de risco, tarefas pedagógicas abertas e atividades aguardando correção. Use quando o usuário pedir uma visão geral, resumo ou situação atual.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_students_at_risk',
      description:
        'Lista alunos com nível de risco elevado (atenção, risco ou crítico). Use quando o usuário perguntar sobre alunos em risco, com dificuldades ou que precisam de atenção.',
      parameters: {
        type: 'object',
        properties: {
          risk_levels: {
            type: 'array',
            items: { type: 'string', enum: ['atencao', 'risco', 'critico'] },
            description: 'Filtrar por níveis específicos. Padrão: todos os elevados.',
          },
          limit: {
            type: 'integer',
            description: 'Número máximo de alunos. Padrão: 10. Máximo: 50.',
            minimum: 1,
            maximum: 50,
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_pending_tasks',
      description:
        'Lista tarefas pedagógicas pendentes ou em andamento. Use quando o usuário perguntar sobre tarefas, pendências ou o que precisa fazer.',
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['aberta', 'em_andamento'],
            description: 'Filtrar por status. Padrão: ambos.',
          },
          limit: {
            type: 'integer',
            description: 'Número máximo de tarefas. Padrão: 10. Máximo: 50.',
            minimum: 1,
            maximum: 50,
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_student_details',
      description:
        'Retorna perfil completo de um aluno: dados básicos, nível de risco, tarefas pendentes e notas por curso. Use quando o usuário perguntar sobre um aluno específico pelo nome.',
      parameters: {
        type: 'object',
        properties: {
          student_name: {
            type: 'string',
            description: 'Nome ou parte do nome do aluno.',
          },
        },
        required: ['student_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_activities_to_review',
      description:
        'Lista atividades de alunos que foram entregues mas ainda não foram corrigidas ou avaliadas. Use quando o usuário perguntar o que precisa corrigir ou avaliar.',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'integer',
            description: 'Número máximo de atividades. Padrão: 10. Máximo: 50.',
            minimum: 1,
            maximum: 50,
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_students_for_messaging',
      description:
        'Busca alunos por nome para envio individual, retornando lista com identificador e cursos/turmas. Use para desambiguação quando houver nomes parecidos (ex.: duas Steffany).',
      parameters: {
        type: 'object',
        properties: {
          student_name_query: {
            type: 'string',
            description: 'Nome completo ou parcial do aluno.',
          },
          limit: {
            type: 'integer',
            description: 'Máximo de resultados. Padrão: 10. Máximo: 30.',
            minimum: 1,
            maximum: 30,
          },
        },
        required: ['student_name_query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'prepare_single_student_message_send',
      description:
        'Prepara (SEM enviar) mensagem para um aluno específico. Se houver homônimos e não houver student_id, retorna lista para desambiguação. Após preparar, exija confirmação explícita.',
      parameters: {
        type: 'object',
        properties: {
          student_id: {
            type: 'string',
            description: 'ID interno do aluno selecionado.',
          },
          student_name_query: {
            type: 'string',
            description: 'Nome do aluno para busca/desambiguação, quando student_id não for informado.',
          },
          message: {
            type: 'string',
            description: 'Mensagem final a ser enviada para o aluno.',
          },
        },
        required: ['message'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'confirm_single_student_message_send',
      description:
        'Confirma e executa o envio individual previamente preparado para um aluno. Requer confirmação explícita do usuário na última mensagem.',
      parameters: {
        type: 'object',
        properties: {
          job_id: {
            type: 'string',
            description: 'ID do job retornado por prepare_single_student_message_send.',
          },
        },
        required: ['job_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_message_templates',
      description:
        'Lista modelos de mensagem disponíveis para envio em massa, incluindo categoria e variáveis usadas. Use antes de preparar envio com template.',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            description: 'Categoria opcional do modelo (ex.: acompanhamento, cobranca, webconferencia).',
          },
          limit: {
            type: 'integer',
            description: 'Máximo de modelos retornados. Padrão: 20. Máximo: 50.',
            minimum: 1,
            maximum: 50,
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_notifications',
      description:
        'Lê notificações internas do sistema para o tutor/monitor (activity_feed), ordenadas da mais recente para a mais antiga. Use quando o usuário pedir notificações, alertas ou avisos.',
      parameters: {
        type: 'object',
        properties: {
          event_type: {
            type: 'string',
            description: 'Filtra por tipo de evento específico (ex.: claris_notification, bulk_message_job).',
          },
          limit: {
            type: 'integer',
            description: 'Número máximo de notificações. Padrão: 10. Máximo: 50.',
            minimum: 1,
            maximum: 50,
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'notify_user',
      description:
        'Cria uma notificação interna para o tutor/monitor no sistema (activity_feed). Use para alertas importantes, confirmações de ações ou situações que exigem acompanhamento.',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Título curto da notificação.',
          },
          description: {
            type: 'string',
            description: 'Descrição objetiva da notificação.',
          },
          severity: {
            type: 'string',
            enum: ['info', 'warning', 'critical'],
            description: 'Nível de severidade da notificação.',
          },
        },
        required: ['title', 'description'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'prepare_bulk_message_send',
      description:
        'Prepara (SEM enviar) um disparo de mensagem em lote para alunos. Permite texto direto ou uso de template/modelo. Cria um job pendente com prévia de destinatários e conteúdo, com validação anti-duplicidade. Sempre use esta tool antes de qualquer envio.',
      parameters: {
        type: 'object',
        properties: {
          audience: {
            type: 'string',
            enum: ['students_at_risk', 'students_with_pending_activities', 'course_students'],
            description:
              'Público-alvo do envio. students_at_risk = risco elevado; students_with_pending_activities = atividades pendentes; course_students = alunos de curso filtrado.',
          },
          message: {
            type: 'string',
            description: 'Mensagem a ser enviada para os alunos. Opcional quando template_id ou template_title_query for informado.',
          },
          template_id: {
            type: 'string',
            description: 'ID do modelo salvo em message_templates.',
          },
          template_title_query: {
            type: 'string',
            description: 'Busca por título do modelo (quando não tiver template_id).',
          },
          course_name_query: {
            type: 'string',
            description: 'Obrigatório quando audience=course_students. Exemplo: web, web design, programação web.',
          },
          school: {
            type: 'string',
            description: 'Filtro de escola para contexto de template.',
          },
          course: {
            type: 'string',
            description: 'Filtro de curso para contexto de template.',
          },
          class_name: {
            type: 'string',
            description: 'Filtro de turma para contexto de template.',
          },
          uc: {
            type: 'string',
            description: 'Filtro obrigatório para templates que usam variáveis de UC/nota/pendências.',
          },
          student_status: {
            type: 'string',
            enum: ['ativo', 'concluido', 'suspenso', 'inativo'],
            description: 'Filtra destinatários pelo status do aluno.',
          },
          limit: {
            type: 'integer',
            description: 'Número máximo de destinatários. Padrão: 50. Máximo: 200.',
            minimum: 1,
            maximum: 200,
          },
        },
        required: ['audience'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'confirm_bulk_message_send',
      description:
        'Confirma e executa um envio em lote previamente preparado. Só deve ser usado após confirmação explícita do tutor/monitor na conversa.',
      parameters: {
        type: 'object',
        properties: {
          job_id: {
            type: 'string',
            description: 'ID do job retornado por prepare_bulk_message_send.',
          },
        },
        required: ['job_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancel_bulk_message_send',
      description:
        'Cancela um envio em lote ou individual previamente preparado que ainda esteja com status pending. Use quando o tutor/monitor pedir para cancelar, desistir ou não quer mais enviar.',
      parameters: {
        type: 'object',
        properties: {
          job_id: {
            type: 'string',
            description: 'ID do job a ser cancelado.',
          },
        },
        required: ['job_id'],
      },
    },
  },
  // -------------------------------------------------------------------------
  // Task management tools
  // -------------------------------------------------------------------------
  {
    type: 'function',
    function: {
      name: 'create_task',
      description:
        'Cria uma tarefa de acompanhamento ou pendência para o tutor/monitor. Use quando o usuário pedir para criar uma tarefa, lembrete ou acompanhamento de aluno/UC/turma. Para tarefas de baixo risco (lembretes pessoais, rascunhos), pode criar diretamente. Para ações que impactam terceiros, peça confirmação antes.',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Título objetivo da tarefa.',
          },
          description: {
            type: 'string',
            description: 'Descrição detalhada da tarefa, contexto e próximo passo esperado.',
          },
          priority: {
            type: 'string',
            enum: ['low', 'medium', 'high', 'urgent'],
            description: 'Prioridade da tarefa. Padrão: medium.',
          },
          due_date: {
            type: 'string',
            description: 'Data limite (YYYY-MM-DD). Opcional.',
          },
          entity_type: {
            type: 'string',
            enum: ['student', 'course', 'uc', 'class', 'custom'],
            description: 'Tipo de entidade relacionada (aluno, curso, UC, turma). Opcional.',
          },
          entity_id: {
            type: 'string',
            description: 'ID da entidade relacionada (ex.: student_id, course_id). Opcional.',
          },
          origin_reason: {
            type: 'string',
            description: 'Motivo que originou esta tarefa (ex.: "aluno com baixa participação na semana 3").',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Tags para categorização (ex.: ["aluno", "recuperacao", "uc"]).',
          },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_task',
      description:
        'Atualiza campos de uma tarefa existente (título, descrição, prioridade, prazo, etc.). Use quando o usuário pedir para editar ou modificar uma tarefa.',
      parameters: {
        type: 'object',
        properties: {
          task_id: {
            type: 'string',
            description: 'ID da tarefa a ser atualizada.',
          },
          title: {
            type: 'string',
            description: 'Novo título da tarefa.',
          },
          description: {
            type: 'string',
            description: 'Nova descrição da tarefa.',
          },
          priority: {
            type: 'string',
            enum: ['low', 'medium', 'high', 'urgent'],
            description: 'Nova prioridade.',
          },
          due_date: {
            type: 'string',
            description: 'Nova data limite (YYYY-MM-DD).',
          },
          origin_reason: {
            type: 'string',
            description: 'Motivo atualizado da tarefa.',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Novas tags para a tarefa.',
          },
        },
        required: ['task_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'change_task_status',
      description:
        'Altera o status de uma tarefa (todo → in_progress → done). Use quando o usuário marcar uma tarefa como concluída, em andamento ou quiser reabrir.',
      parameters: {
        type: 'object',
        properties: {
          task_id: {
            type: 'string',
            description: 'ID da tarefa.',
          },
          status: {
            type: 'string',
            enum: ['todo', 'in_progress', 'done'],
            description: 'Novo status da tarefa.',
          },
        },
        required: ['task_id', 'status'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_tasks',
      description:
        'Lista as tarefas criadas pelo tutor/monitor, com filtros opcionais. Use quando o usuário pedir para ver suas tarefas, pendências ou checklist de trabalho.',
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['todo', 'in_progress', 'done'],
            description: 'Filtrar por status. Sem filtro retorna todo e in_progress.',
          },
          priority: {
            type: 'string',
            enum: ['low', 'medium', 'high', 'urgent'],
            description: 'Filtrar por prioridade.',
          },
          entity_type: {
            type: 'string',
            enum: ['student', 'course', 'uc', 'class', 'custom'],
            description: 'Filtrar por tipo de entidade vinculada.',
          },
          limit: {
            type: 'integer',
            description: 'Número máximo de tarefas. Padrão: 10. Máximo: 50.',
            minimum: 1,
            maximum: 50,
          },
        },
        required: [],
      },
    },
  },
  // -------------------------------------------------------------------------
  // Agenda / calendar tools
  // -------------------------------------------------------------------------
  {
    type: 'function',
    function: {
      name: 'create_event',
      description:
        'Cria um evento na agenda do tutor/monitor (web aula, alinhamento, reunião, entrega, etc.). Para eventos pessoais e lembretes, pode criar diretamente. Para eventos compartilhados que impactam terceiros, peça confirmação antes.',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Título do evento.',
          },
          description: {
            type: 'string',
            description: 'Descrição ou pauta do evento.',
          },
          start_at: {
            type: 'string',
            description: 'Data/hora de início em ISO 8601 (ex.: 2026-03-20T14:00:00-03:00).',
          },
          end_at: {
            type: 'string',
            description: 'Data/hora de término em ISO 8601. Opcional.',
          },
          all_day: {
            type: 'boolean',
            description: 'Indica se o evento é de dia inteiro.',
          },
          type: {
            type: 'string',
            enum: ['manual', 'webclass', 'meeting', 'alignment', 'delivery', 'other'],
            description: 'Tipo do evento. Padrão: manual.',
          },
          location: {
            type: 'string',
            description: 'Local ou link do evento.',
          },
          related_entity_type: {
            type: 'string',
            enum: ['student', 'course', 'uc', 'class', 'custom'],
            description: 'Tipo de entidade relacionada ao evento. Opcional.',
          },
          related_entity_id: {
            type: 'string',
            description: 'ID da entidade relacionada. Opcional.',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Tags do evento (ex.: ["web_aula", "uc", "alinhamento"]).',
          },
          ia_source: {
            type: 'string',
            enum: ['manual', 'ia', 'sugestao_confirmada'],
            description: 'Origem do evento: manual (tutor), ia (criado pela IA), sugestao_confirmada (sugerido pela IA e confirmado). Padrão: ia.',
          },
        },
        required: ['title', 'start_at'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_event',
      description:
        'Atualiza campos de um evento existente na agenda. Use quando o usuário pedir para editar, reagendar ou modificar um evento.',
      parameters: {
        type: 'object',
        properties: {
          event_id: {
            type: 'string',
            description: 'ID do evento a ser atualizado.',
          },
          title: {
            type: 'string',
            description: 'Novo título.',
          },
          description: {
            type: 'string',
            description: 'Nova descrição.',
          },
          start_at: {
            type: 'string',
            description: 'Nova data/hora de início (ISO 8601).',
          },
          end_at: {
            type: 'string',
            description: 'Nova data/hora de término (ISO 8601).',
          },
          all_day: {
            type: 'boolean',
            description: 'Evento de dia inteiro.',
          },
          location: {
            type: 'string',
            description: 'Novo local ou link.',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Novas tags.',
          },
        },
        required: ['event_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_event',
      description:
        'Remove um evento da agenda. Use SOMENTE com confirmação explícita do usuário para eventos que impactam agenda compartilhada ou terceiros.',
      parameters: {
        type: 'object',
        properties: {
          event_id: {
            type: 'string',
            description: 'ID do evento a ser removido.',
          },
        },
        required: ['event_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_events',
      description:
        'Lista eventos da agenda do tutor/monitor em um período. Use quando o usuário perguntar sobre sua agenda, compromissos ou eventos próximos.',
      parameters: {
        type: 'object',
        properties: {
          start_date: {
            type: 'string',
            description: 'Data de início do período (YYYY-MM-DD). Padrão: hoje.',
          },
          end_date: {
            type: 'string',
            description: 'Data de término do período (YYYY-MM-DD). Padrão: 7 dias à frente.',
          },
          type: {
            type: 'string',
            enum: ['manual', 'webclass', 'meeting', 'alignment', 'delivery', 'other'],
            description: 'Filtrar por tipo de evento.',
          },
          limit: {
            type: 'integer',
            description: 'Número máximo de eventos. Padrão: 10. Máximo: 50.',
            minimum: 1,
            maximum: 50,
          },
        },
        required: [],
      },
    },
  },
]
