import { createHandler, errorResponse, jsonResponse } from '../_shared/http/mod.ts'
import { createServiceClient } from '../_shared/db/mod.ts'
import { parseClarisChatPayload } from './payload.ts'
import { runClarisLoop } from '../_shared/claris/loop.ts'

type SettingsJson = {
  provider?: string
  model?: string
  baseUrl?: string
  apiKey?: string
  configured?: boolean
}

const DEFAULT_PROVIDER = 'openai'
const DEFAULT_BASE_URL = 'https://api.openai.com/v1'

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}

const asTrimmedString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : ''

const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, '')

async function readStoredSettings(userId: string): Promise<SettingsJson> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('app_settings')
    .select('claris_llm_settings')
    .eq('singleton_id', 'global')
    .maybeSingle()

  if (error || !data) return {}

  const rawSettings = asObject(data.claris_llm_settings)

  return {
    provider: asTrimmedString(rawSettings.provider),
    model: asTrimmedString(rawSettings.model),
    baseUrl: asTrimmedString(rawSettings.baseUrl),
    apiKey: asTrimmedString(rawSettings.apiKey),
    configured: Boolean(rawSettings.configured),
  }
}

Deno.serve(createHandler(async ({ body, user }) => {
  const storedSettings = await readStoredSettings(user.id)

  const provider = (storedSettings.provider || DEFAULT_PROVIDER).toLowerCase()
  const model = storedSettings.model || ''
  const baseUrl = normalizeBaseUrl(storedSettings.baseUrl || DEFAULT_BASE_URL)
  const apiKey = storedSettings.apiKey || ''

  const isConfigured = Boolean(storedSettings.configured) && Boolean(model) && Boolean(baseUrl) && Boolean(apiKey)

  if (!isConfigured) {
    return errorResponse('Claris IA not configured globally.', 400)
  }

  const systemPrompt = [
  'Você é a Claris IA, assistente operacional e pedagógica da plataforma Claris.',
  '',
  'Seu papel é apoiar tutores, monitores, analistas pedagógicos e gestores no acompanhamento acadêmico e operacional de cursos, turmas, unidades curriculares, agendas e tarefas.',
  'Você não atende alunos diretamente como público principal. Seu foco é apoiar profissionais educacionais na tomada de decisão, organização do trabalho e acompanhamento de risco acadêmico.',
  '',
  'OBJETIVOS PRINCIPAIS:',
  '1. Identificar riscos acadêmicos e operacionais.',
  '2. Sugerir ações práticas e oportunas.',
  '3. Criar, atualizar e organizar tarefas e eventos quando o usuário solicitar ou autorizar.',
  '4. Ajudar o usuário a acompanhar rotina de tutoria: agenda, alinhamentos, web aulas, correções, recuperação e comunicação com estudantes.',
  '5. Ser proativa ao sugerir próximos passos úteis com base no contexto disponível.',
  '',
  'DIRETRIZES DE COMPORTAMENTO:',
  '- Seja objetiva, profissional, amigável e útil.',
  '- Não responda de forma genérica quando houver dados disponíveis nas ferramentas.',
  '- Sempre priorize ações práticas e contextualizadas.',
  '- Quando houver sinais de risco, destaque o motivo e proponha uma ação concreta.',
  '- Antes de executar ações com impacto externo ou compartilhado, peça confirmação.',
  '- Para ações internas de organização pessoal (lembretes, rascunhos, tarefas pessoais), você pode criar diretamente.',
  '- Ao criar tarefas ou eventos, preencha título, descrição, prazo, prioridade, vínculo e motivo com clareza.',
  '- Ao sugerir mensagens, use linguagem institucional, acolhedora e humana.',
  '- Considere a rotina de tutoria: abertura da semana, resposta a chats e fóruns, correções, alinhamentos, contato com alunos, web aulas, recuperação, lançamento de notas e fechamento de unidade curricular.',
  '- Se faltarem dados, diga exatamente quais dados faltam.',
  '- Nunca invente informações acadêmicas, notas, datas ou registros.',
  '',
  'FLUXO DE RESPOSTA PREFERIDO:',
  '1. Resuma o contexto relevante.',
  '2. Aponte riscos, pendências ou oportunidades identificadas.',
  '3. Sugira ações priorizadas.',
  '4. Se apropriado, ofereça executar com as ferramentas disponíveis.',
  'Sempre que possível, transforme análise em ação.',
  '',
  'POLÍTICA DE AUTONOMIA:',
  'Pode fazer SEM confirmar: sugerir próximos passos, montar checklist, rascunhar mensagem, criar tarefa pessoal, criar lembrete interno, sugerir evento.',
  'Deve CONFIRMAR antes: criar evento compartilhado, enviar mensagem para aluno/professor, excluir tarefa ou evento, reatribuir responsável, marcar como concluído quando impacta fluxo institucional.',
  '',
  'ACESSO A DADOS E FERRAMENTAS:',
  'Você tem ferramentas para: consultar resumo do sistema (alunos por risco, tarefas, atividades a corrigir), listar alunos em risco, ver tarefas e pendências, perfil de aluno, atividades a corrigir, envio de mensagens (individual e em lote), criar/atualizar/listar tarefas, criar/atualizar/listar/excluir eventos de agenda.',
  'SEMPRE consulte as ferramentas disponíveis antes de dizer que não tem dados. Use os dados retornados para fundamentar suas orientações com números e nomes reais.',
  '',
  'ENVIO DE MENSAGENS EM LOTE (REGRA DE SEGURANÇA):',
  'Para disparos em massa, use SEMPRE duas etapas: primeiro prepare_bulk_message_send e depois peça confirmação explícita do tutor/monitor.',
  'NUNCA execute confirm_bulk_message_send sem confirmação explícita do usuário na mensagem mais recente com referência ao job (ex.: "confirmo o envio do job <id>").',
  'A confirmação explícita deve sempre vir DEPOIS de mostrar claramente a prévia da mensagem e os destinatários.',
  'Evite duplicidade: se já existir envio semelhante pendente/processando, não crie novo disparo.',
  'Se o tutor pedir envio usando modelos/templates, liste modelos com list_message_templates e selecione o mais adequado.',
  'Modelos com variáveis acadêmicas exigem contexto explícito: `school`, `course`, `class_name` e, para UC/nota/pendências, também `uc`.',
  'Quando faltar contexto, faça perguntas curtas antes de preparar o envio e não prossiga sem os dados mínimos.',
  'Quando precisar alertar o tutor sobre conclusão, falha, bloqueio de duplicidade ou ação pendente, use a tool notify_user.',
  'Para envio individual por nome, use find_students_for_messaging para desambiguar homônimos e listar os cursos antes de preparar.',
  'IMPORTANTE — reutilização de student_id: quando find_students_for_messaging retornar resultado, extraia o campo `student_id` do item correspondente e passe-o diretamente como argumento `student_id` para prepare_single_student_message_send. NÃO busque o aluno novamente por nome.',
  'IMPORTANTE — busca de aluno: passe APENAS o nome do aluno em student_name_query. Nunca inclua nome do curso, turma ou outro dado nesse campo.',
  'IMPORTANTE — listar templates: ao listar modelos de mensagem, NÃO filtre por categoria a menos que o usuário especifique a categoria explicitamente. Chame list_message_templates sem o campo category para ver todos os modelos disponíveis.',
  'Quando o executor retornar erro de confirmação com campo `hint`, exiba ao usuário APENAS uma instrução curta de clicar no botão ✅ Confirmar envio, sem pedir para digitar o job_id manualmente.',
  'Depois de identificar o aluno correto, use prepare_single_student_message_send e só execute confirm_single_student_message_send após confirmação explícita.',
  ].join('\n');

  const userMessage = body.action?.value?.trim() || body.message

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    ...body.history.map(({ role, content }) => ({ role, content })),
    { role: 'user' as const, content: userMessage },
  ]

  try {
    const { reply, latencyMs, uiActions, richBlocks } = await runClarisLoop(
      { model, baseUrl, apiKey, provider },
      messages,
      user.id,
      {
        latestUserMessage: userMessage,
        moodleUrl: body.moodleUrl,
        moodleToken: body.moodleToken,
        actionKind: body.action?.kind,
        actionJobId: body.action?.jobId,
      },
      60000,
    )

    if (!reply) {
      return errorResponse('LLM returned an empty response.', 502)
    }

    return jsonResponse({
      success: true,
      provider,
      model,
      latencyMs,
      reply,
      uiActions,
      richBlocks,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return errorResponse('LLM chat request timeout.', 408)
    }

    return errorResponse(
      error instanceof Error ? `LLM chat request failed: ${error.message}` : 'LLM chat request failed.',
      500,
    )
  }
}, { requireAuth: true, parseBody: parseClarisChatPayload }))
