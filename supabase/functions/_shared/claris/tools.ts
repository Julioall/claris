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
]
