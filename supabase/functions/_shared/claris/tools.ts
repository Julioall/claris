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
        'Cria uma tarefa de acompanhamento ou pendência para o tutor/monitor. Use quando o usuário pedir para criar uma tarefa, lembrete ou acompanhamento de aluno/UC/turma/escola/curso. IMPORTANTE: sempre preencha entity_type e entity_id quando houver contexto de aluno, UC, turma ou curso na conversa. Também preencha as tags com rótulos descritivos e origin_reason com o motivo. Para tarefas de baixo risco (lembretes pessoais, rascunhos), pode criar diretamente. Para ações que impactam terceiros, peça confirmação antes.',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Título objetivo da tarefa.',
          },
          description: {
            type: 'string',
            description: 'Descrição detalhada da tarefa, incluindo contexto completo: escola, curso, turma, aluno (se aplicável) e próximo passo esperado.',
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
            description: 'Tipo de entidade relacionada. Use "student" para tarefas de acompanhamento de aluno, "course" para curso, "uc" para unidade curricular, "class" para turma. SEMPRE informe quando houver contexto.',
          },
          entity_id: {
            type: 'string',
            description: 'ID da entidade relacionada (student_id, course_id, etc.). SEMPRE informe quando houver contexto na conversa.',
          },
          origin_reason: {
            type: 'string',
            description: 'Motivo que originou esta tarefa com contexto rico (ex.: "Aluno João Silva do curso Engenharia, turma 2024-1, com baixa participação na semana 3 — necessita de contato de acompanhamento"). Inclua escola, curso, turma e aluno quando disponíveis.',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Tags para categorização que preservam o contexto. Inclua o nome do aluno, curso, turma ou escola como tags (ex.: ["aluno:joao-silva", "curso:engenharia", "turma:2024-1", "recuperacao"]).',
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
      name: 'add_tag_to_task',
      description:
        'Adiciona uma tag a uma tarefa existente. Use quando o usuário pedir para etiquetar, categorizar ou marcar uma tarefa com uma tag. Se a tarefa não tiver a tag, ela é adicionada.',
      parameters: {
        type: 'object',
        properties: {
          task_id: {
            type: 'string',
            description: 'ID da tarefa à qual a tag será adicionada.',
          },
          tag: {
            type: 'string',
            description: 'Texto da tag a adicionar (ex.: "aluno", "recuperacao", "uc", "urgente").',
          },
        },
        required: ['task_id', 'tag'],
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
            enum: ['manual', 'webclass', 'meeting', 'alignment', 'delivery', 'training', 'other'],
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
      name: 'batch_create_events',
      description:
        'Cria vários eventos de agenda em uma única chamada. Use sempre que o usuário enviar uma lista de eventos, um cronograma, vários alinhamentos ou múltiplas web aulas para cadastrar de uma vez.',
      parameters: {
        type: 'object',
        properties: {
          events: {
            type: 'array',
            description: 'Lista de eventos a criar em lote.',
            items: {
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
                  description: 'Data/hora de início em ISO 8601.',
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
                  enum: ['manual', 'webclass', 'meeting', 'alignment', 'delivery', 'training', 'other'],
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
                  description: 'Tags do evento.',
                },
                ia_source: {
                  type: 'string',
                  enum: ['manual', 'ia', 'sugestao_confirmada'],
                  description: 'Origem do evento. Padrão: ia.',
                },
              },
              required: ['title', 'start_at'],
            },
          },
        },
        required: ['events'],
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
          type: {
            type: 'string',
            enum: ['manual', 'webclass', 'meeting', 'alignment', 'delivery', 'training', 'other'],
            description: 'Novo tipo do evento.',
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
            enum: ['manual', 'webclass', 'meeting', 'alignment', 'delivery', 'training', 'other'],
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
  // -------------------------------------------------------------------------
  // Phase 2 – Academic context reading tools
  // -------------------------------------------------------------------------
  {
    type: 'function',
    function: {
      name: 'get_student_summary',
      description:
        'Retorna resumo acadêmico completo de um aluno: risco atual, motivos, atividades atrasadas, nota média, último acesso e tarefas abertas. Informe student_id (preferível) ou student_name. Use quando precisar analisar um aluno específico em profundidade.',
      parameters: {
        type: 'object',
        properties: {
          student_name: {
            type: 'string',
            description: 'Nome ou parte do nome do aluno. Use quando não tiver o student_id.',
          },
          student_id: {
            type: 'string',
            description: 'ID do aluno (preferível ao nome para evitar ambiguidade).',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_student_history',
      description:
        'Retorna o histórico de estados do aluno ao longo das sincronizações com o Moodle: evolução do nível de risco, dias sem acesso, atividades pendentes e atrasadas em cada ponto no tempo. Use para avaliar se intervenções tiveram efeito, identificar tendências ou detectar possíveis desistentes (sem acesso há mais de 90 dias).',
      parameters: {
        type: 'object',
        properties: {
          student_id: {
            type: 'string',
            description: 'ID do aluno.',
          },
          student_name: {
            type: 'string',
            description: 'Nome ou parte do nome do aluno. Use quando não tiver student_id.',
          },
          limit: {
            type: 'integer',
            description: 'Número máximo de snapshots retornados. Padrão: 30. Máximo: 60.',
            minimum: 1,
            maximum: 60,
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_grade_risk',
      description:
        'Lista alunos com risco de reprovação por nota: notas abaixo do limiar mínimo, tendência de queda ou sem nota lançada. Use para priorizar intervenções de recuperação.',
      parameters: {
        type: 'object',
        properties: {
          threshold_percentage: {
            type: 'number',
            description: 'Percentual mínimo de aprovação (padrão: 60). Alunos abaixo disso aparecem no resultado.',
          },
          limit: {
            type: 'integer',
            description: 'Número máximo de alunos retornados. Padrão: 10. Máximo: 50.',
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
      name: 'get_engagement_signals',
      description:
        'Retorna sinais de desengajamento acadêmico: alunos sem acesso recente, sem entrega recente ou com queda na participação. Use para identificar alunos em risco de evasão antes que apareçam como crítico.',
      parameters: {
        type: 'object',
        properties: {
          days_without_access: {
            type: 'integer',
            description: 'Dias sem acesso para considerar desengajado. Padrão: 7.',
          },
          limit: {
            type: 'integer',
            description: 'Máximo de alunos retornados. Padrão: 10. Máximo: 50.',
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
      name: 'get_recent_attendance_risk',
      description:
        'Retorna alunos com alto índice de ausências registradas. Use para identificar risco por frequência antes de gerar intervenção.',
      parameters: {
        type: 'object',
        properties: {
          min_absences: {
            type: 'integer',
            description: 'Mínimo de ausências para aparecer no resultado. Padrão: 2.',
          },
          limit: {
            type: 'integer',
            description: 'Máximo de alunos retornados. Padrão: 10. Máximo: 50.',
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
      name: 'get_upcoming_calendar_commitments',
      description:
        'Lista os próximos compromissos da agenda do tutor/monitor nos próximos dias (web aulas, alinhamentos, entregas). Use para contextualizar a semana e sugerir preparativos.',
      parameters: {
        type: 'object',
        properties: {
          days_ahead: {
            type: 'integer',
            description: 'Quantos dias à frente verificar. Padrão: 7. Máximo: 30.',
            minimum: 1,
            maximum: 30,
          },
        },
        required: [],
      },
    },
  },
  // -------------------------------------------------------------------------
  // Phase 3 – Routine automation and smart checklists
  // -------------------------------------------------------------------------
  {
    type: 'function',
    function: {
      name: 'get_tutor_routine_suggestions',
      description:
        'Retorna sugestões proativas baseadas na rotina do tutor/monitor e no dia da semana atual: abertura de semana na segunda, verificação de chats e fóruns, correções pendentes, contato com alunos em risco, preparativos para web aula, etc. Use para gerar a lista de próximos passos do dia.',
      parameters: {
        type: 'object',
        properties: {
          include_academic_context: {
            type: 'boolean',
            description: 'Se true, cruza com dados acadêmicos reais do sistema. Padrão: true.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_weekly_checklist',
      description:
        'Gera um checklist semanal estruturado para o tutor/monitor com base em: alunos em risco, atividades a corrigir, mensagens a responder, alinhamentos agendados e encerramento de UCs. Ideal para início de semana ou planejamento.',
      parameters: {
        type: 'object',
        properties: {
          week_context: {
            type: 'string',
            enum: ['current', 'next'],
            description: 'Semana de referência. Padrão: current (semana atual).',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_proactive_engines',
      description:
        'Executa os 6 motores de sugestão proativa da Claris IA (comunicação, agenda, tarefas, acadêmico, operacional, plataforma) e gera sugestões automaticamente com base nos dados reais da plataforma. Use quando o usuário pedir para atualizar sugestões, ou ao identificar que há sinais não capturados ainda. As sugestões são persistidas no painel do tutor.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_suggestion',
      description:
        'Persiste uma sugestão proativa gerada pela Claris IA no painel do tutor/monitor (aparece como card na home). Use após analisar contexto e identificar uma ação recomendada que o tutor pode aceitar ou dispensar depois. Inclua sempre reason, analysis e expected_impact para fornecer contexto completo.',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: [
              'task_followup', 'weekly_message', 'correction_followup', 'alignment_event',
              'recovery_followup', 'grade_risk', 'attendance_risk', 'engagement_risk',
              'uc_closing', 'routine_reminder', 'custom',
              'unanswered_message', 'interrupted_contact', 'channel_ineffective',
              'event_no_prep', 'schedule_conflict', 'recurring_event_manual',
              'overdue_task', 'stalled_task', 'task_no_context',
              'student_no_activity', 'class_no_followup', 'uc_no_update',
              'manual_flow_recurring', 'old_pending', 'interrupted_process',
              'unused_module', 'repetitive_pattern', 'unorganized_messages',
            ],
            description: 'Tipo da sugestão.',
          },
          title: {
            type: 'string',
            description: 'Título curto e objetivo da sugestão.',
          },
          body: {
            type: 'string',
            description: 'Descrição detalhada da sugestão com contexto e ação recomendada.',
          },
          reason: {
            type: 'string',
            description: 'Motivo objetivo que gerou esta sugestão (ex.: "Aluno em risco crítico sem contato há 30 dias").',
          },
          analysis: {
            type: 'string',
            description: 'Análise contextual que fundamenta a sugestão, cruzando sinais de dados da plataforma.',
          },
          expected_impact: {
            type: 'string',
            description: 'Impacto esperado se o tutor aceitar e executar a ação sugerida.',
          },
          trigger_engine: {
            type: 'string',
            enum: ['communication', 'agenda', 'tasks', 'academic', 'operational', 'platform_usage', 'manual'],
            description: 'Motor de detecção que gerou esta sugestão. Use "manual" quando gerado diretamente pelo chat.',
          },
          priority: {
            type: 'string',
            enum: ['low', 'medium', 'high', 'urgent'],
            description: 'Prioridade da sugestão. Padrão: medium.',
          },
          entity_type: {
            type: 'string',
            enum: ['student', 'course', 'uc', 'class', 'custom'],
            description: 'Tipo da entidade relacionada.',
          },
          entity_id: {
            type: 'string',
            description: 'ID da entidade relacionada.',
          },
          entity_name: {
            type: 'string',
            description: 'Nome legível da entidade (ex.: nome do aluno, nome do curso).',
          },
          action_type: {
            type: 'string',
            enum: ['create_task', 'create_event', 'open_chat'],
            description: 'Tipo de ação quando o tutor aceitar a sugestão.',
          },
          action_payload: {
            type: 'object',
            description: 'Dados para executar a ação (ex.: campos de tarefa ou evento a criar).',
            properties: {},
          },
          expires_in_hours: {
            type: 'integer',
            description: 'Horas até a sugestão expirar. Padrão: 48.',
          },
        },
        required: ['type', 'title', 'body'],
      },
    },
  },
  // Platform help / documentation
  {
    type: 'function',
    function: {
      name: 'get_platform_help',
      description:
        'Retorna documentação e guias sobre a plataforma Claris: como usar cada seção, fluxos de trabalho recomendados, níveis de risco, rotina de tutores, perguntas frequentes e como a Claris IA pode ajudar. Use sempre que o usuário perguntar como usar a plataforma, onde encontrar algo, qual fluxo seguir, tirar dúvidas ou pedir ajuda sobre funcionalidades.',
      parameters: {
        type: 'object',
        properties: {
          topic: {
            type: 'string',
            description:
              'Tópico específico sobre o qual o usuário quer ajuda. Exemplos: "navegação", "risco", "tarefas", "agenda", "mensagens", "claris ia", "rotina semanal", "faq", "automações", "permissões". Use "all" ou omita para retornar toda a documentação.',
          },
        },
        required: [],
      },
    },
  },
  // Support ticket creation
  {
    type: 'function',
    function: {
      name: 'create_support_ticket',
      description:
        'Registra um problema, bug, sugestão ou dúvida no sistema de suporte. Use quando o usuário relatar um problema técnico, quiser sugerir uma melhoria, ou pedir ajuda com algo que não funciona corretamente. Pode ser usado de forma autônoma ao detectar problemas ou de forma sugestiva pedindo confirmação ao usuário. IMPORTANTE: preencha a descrição com máximo de contexto — inclua exatamente o que o usuário tentou fazer, a sequência de ações executadas, a mensagem de erro ou comportamento inesperado, e o impacto. Informe a rota (route) onde ocorreu. Para problemas da Claris IA, inclua o tool chamado, os parâmetros usados e o erro retornado.',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Título curto e descritivo do ticket (máx. 120 caracteres). Seja específico: inclua o nome da funcionalidade e o comportamento incorreto (ex: "Erro ao adicionar tag em tarefa existente", "Calendário da agenda não exibe eventos").',
          },
          description: {
            type: 'string',
            description: 'Descrição detalhada e rica do problema, sugestão ou dúvida. Estruture assim:\n1. O que o usuário tentou fazer (ação exata)\n2. O que era esperado acontecer\n3. O que realmente aconteceu (erro, comportamento inesperado, mensagem de erro completa)\n4. Passos para reproduzir\n5. Impacto no fluxo de trabalho\n6. Tool da Claris IA envolvida (se aplicável), com parâmetros e resposta de erro.\nQuanto mais contexto, mais fácil será para o suporte resolver.',
          },
          type: {
            type: 'string',
            enum: ['problema', 'sugestao', 'duvida', 'outro'],
            description: 'Tipo do ticket: "problema" para bugs/erros, "sugestao" para melhorias, "duvida" para perguntas.',
          },
          priority: {
            type: 'string',
            enum: ['baixa', 'normal', 'alta', 'critica'],
            description: 'Prioridade do ticket. Use "critica" apenas para problemas que impedem o uso do sistema. Use "alta" para problemas que comprometem fluxos importantes (ex: não consegue criar tarefas, não consegue ver alunos em risco).',
          },
          route: {
            type: 'string',
            description: 'Rota ou página da aplicação onde o problema ocorreu (ex: "/tarefas", "/alunos", "/agenda", "/chat"). Informe sempre que possível.',
          },
          steps_to_reproduce: {
            type: 'string',
            description: 'Sequência exata de passos que levaram ao problema (ex: "1. Abriei uma tarefa existente, 2. Pedi à Claris para adicionar a tag \'recuperacao\', 3. Claris retornou erro"). Opcional mas muito útil.',
          },
          error_message: {
            type: 'string',
            description: 'Mensagem de erro exata exibida ao usuário ou retornada pelo sistema/Claris IA. Copie literalmente sem parafrasear.',
          },
        },
        required: ['title', 'description', 'type'],
      },
    },
  },
]
