/**
 * Claris IA — Agent loop.
 * Calls the LLM, handles tool_calls, and iterates until a final text reply.
 */
import { CLARIS_TOOLS, ToolDefinition } from './tools.ts'
import { executeToolCall, ToolCallArgs, ToolExecutionContext } from './executors.ts'
import {
  buildRequestMessagesForModel,
  summarizeToolResultForModel,
  type LoopChatMessage,
} from './loop-optimization.ts'

export interface LLMSettings {
  provider: string
  model: string
  baseUrl: string
  apiKey: string
}

interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export type ChatMessage = LoopChatMessage

interface ResponsesFunctionCall {
  type: 'function_call'
  call_id?: string
  id?: string
  name: string
  arguments: string
}

type ResponsesInputItem =
  | { role: 'user' | 'assistant'; content: string }
  | { type: 'function_call_output'; call_id: string; output: string }
  | Record<string, unknown>

interface ResponsesRequestContext {
  instructions: string
  input: ResponsesInputItem[]
}

export interface ClarisUiAction {
  id: string
  label: string
  value: string
  kind: 'quick_reply'
  job_id?: string
}

export interface ClarisRichRow {
  [key: string]: string
}

export interface ClarisDataTableBlock {
  type: 'data_table'
  tool: string
  title: string
  empty_message: string
  columns: Array<{ key: string; label: string }>
  rows: ClarisRichRow[]
}

export interface ClarisStatCard {
  label: string
  value: string
  variant: 'default' | 'warning' | 'danger'
}

export interface ClarisStatCardsBlock {
  type: 'stat_cards'
  title: string
  stats: ClarisStatCard[]
}

export type ClarisRichBlock = ClarisDataTableBlock | ClarisStatCardsBlock

/** Maximum number of tool-call iterations to prevent infinite loops. */
const MAX_ITERATIONS = 15

const supportsTemperature = (model: string): boolean => {
  const normalizedModel = model.trim().toLowerCase()
  return !normalizedModel.startsWith('gpt-5') && !normalizedModel.startsWith('o')
}

const prefersResponsesApi = (model: string): boolean => {
  const normalizedModel = model.trim().toLowerCase()
  return normalizedModel.startsWith('gpt-5') || normalizedModel.startsWith('o')
}

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}

const asString = (value: unknown): string =>
  typeof value === 'string' ? value : ''

function buildResponsesRequestContext(messages: ChatMessage[]): ResponsesRequestContext {
  const requestMessages = buildRequestMessagesForModel(messages)
  const instructionLines: string[] = []
  const input: ResponsesInputItem[] = []

  for (const message of requestMessages) {
    if (message.role === 'system') {
      if (message.content) instructionLines.push(message.content)
      continue
    }

    if (message.role === 'tool') {
      if (message.tool_call_id) {
        input.push({
          type: 'function_call_output',
          call_id: message.tool_call_id,
          output: message.content ?? '',
        })
      }
      continue
    }

    if (message.role === 'assistant' && Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
      for (const toolCall of message.tool_calls) {
        input.push({
          type: 'function_call',
          call_id: toolCall.id,
          id: toolCall.id,
          name: toolCall.function.name,
          arguments: toolCall.function.arguments,
        })
      }
      continue
    }

    input.push({
      role: message.role,
      content: message.content ?? '',
    })
  }

  return {
    instructions: instructionLines.join('\n\n'),
    input,
  }
}

function toResponsesTools(tools: ToolDefinition[]): Array<Record<string, unknown>> {
  return tools.map((tool) => ({
    type: 'function',
    name: tool.function.name,
    description: tool.function.description,
    parameters: tool.function.parameters,
  }))
}

function extractResponsesText(payload: Record<string, unknown>): string {
  const directOutputText = asString(payload.output_text).trim()
  if (directOutputText) return directOutputText

  const outputs = Array.isArray(payload.output) ? payload.output : []
  for (const output of outputs) {
    const outputObject = asObject(output)
    const content = Array.isArray(outputObject.content) ? outputObject.content : []

    for (const item of content) {
      const itemObject = asObject(item)
      const text = asString(itemObject.text).trim()
      if ((itemObject.type === 'output_text' || itemObject.type === 'text') && text) {
        return text
      }
    }
  }

  return ''
}

function extractResponsesFunctionCalls(payload: Record<string, unknown>): ResponsesFunctionCall[] {
  const outputs = Array.isArray(payload.output) ? payload.output : []
  return outputs.flatMap((output): ResponsesFunctionCall[] => {
    const outputObject = asObject(output)
    if (outputObject.type !== 'function_call') return []

    const name = asString(outputObject.name)
    const args = asString(outputObject.arguments)
    const callId = asString(outputObject.call_id) || asString(outputObject.id)

    if (!name || !callId) return []

    return [{
      type: 'function_call',
      call_id: callId,
      id: asString(outputObject.id) || callId,
      name,
      arguments: args,
    }]
  })
}

// ---------------------------------------------------------------------------
// Rich block helpers

function richDate(value: unknown): string {
  if (typeof value !== 'string' || !value) return '—'
  const d = new Date(value)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function richRisk(value: unknown): string {
  const map: Record<string, string> = {
    normal: 'Normal',
    atencao: 'Atenção',
    risco: 'Risco',
    critico: 'Crítico',
    inativo: 'Inativo',
  }
  const key = typeof value === 'string' ? value.toLowerCase() : ''
  return map[key] ?? (key || '—')
}

function richStr(value: unknown): string {
  if (typeof value === 'string') return value.trim() || '—'
  if (typeof value === 'number') return String(value)
  return '—'
}

function nestedStr(obj: unknown, key: string): string {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return '—'
  return richStr((obj as Record<string, unknown>)[key])
}

function generateRichBlocks(toolName: string, toolResult: unknown): ClarisRichBlock[] {
  if (!toolResult) return []

  if (toolName === 'get_activities_to_review') {
    if (!Array.isArray(toolResult)) return []
    const rows: ClarisRichRow[] = toolResult.map((item: unknown) => {
      if (!item || typeof item !== 'object') return null
      const r = item as Record<string, unknown>
      return {
        aluno: nestedStr(r.students, 'full_name'),
        risco: richRisk(nestedStr(r.students, 'current_risk_level')),
        curso: nestedStr(r.courses, 'short_name'),
        atividade: richStr(r.activity_name),
        entregue: richDate(r.submitted_at),
        vence: richDate(r.due_date),
      }
    }).filter((row): row is ClarisRichRow => row !== null)
    if (rows.length === 0) return []
    return [{
      type: 'data_table',
      tool: toolName,
      title: `Atividades para Corrigir (${rows.length})`,
      empty_message: 'Nenhuma atividade pendente de correção.',
      columns: [
        { key: 'aluno', label: 'Aluno' },
        { key: 'curso', label: 'Curso' },
        { key: 'atividade', label: 'Atividade' },
        { key: 'entregue', label: 'Entregue' },
        { key: 'vence', label: 'Vence' },
        { key: 'risco', label: 'Risco' },
      ],
      rows,
    }]
  }

  if (toolName === 'get_pending_tasks') {
    if (!Array.isArray(toolResult)) return []
    const rows: ClarisRichRow[] = toolResult.map((item: unknown) => {
      if (!item || typeof item !== 'object') return null
      const r = item as Record<string, unknown>
      return {
        titulo: richStr(r.title),
        aluno: nestedStr(r.students, 'full_name'),
        curso: nestedStr(r.courses, 'short_name'),
        status: richStr(r.status),
        prioridade: richStr(r.priority),
        vence: richDate(r.due_date),
      }
    }).filter((row): row is ClarisRichRow => row !== null)
    if (rows.length === 0) return []
    return [{
      type: 'data_table',
      tool: toolName,
      title: `Tarefas Pendentes (${rows.length})`,
      empty_message: 'Nenhuma tarefa pendente.',
      columns: [
        { key: 'titulo', label: 'Título' },
        { key: 'aluno', label: 'Aluno' },
        { key: 'curso', label: 'Curso' },
        { key: 'prioridade', label: 'Prioridade' },
        { key: 'status', label: 'Status' },
        { key: 'vence', label: 'Vence' },
      ],
      rows,
    }]
  }

  if (toolName === 'get_students_at_risk') {
    if (!Array.isArray(toolResult)) return []
    const rows: ClarisRichRow[] = toolResult.map((item: unknown) => {
      if (!item || typeof item !== 'object') return null
      const r = item as Record<string, unknown>
      return {
        nome: richStr(r.full_name),
        risco: richRisk(r.current_risk_level),
        ultimo_acesso: richDate(r.last_access),
        email: richStr(r.email),
      }
    }).filter((row): row is ClarisRichRow => row !== null)
    if (rows.length === 0) return []
    return [{
      type: 'data_table',
      tool: toolName,
      title: `Alunos em Risco (${rows.length})`,
      empty_message: 'Nenhum aluno em situação de risco.',
      columns: [
        { key: 'nome', label: 'Nome' },
        { key: 'risco', label: 'Risco' },
        { key: 'ultimo_acesso', label: 'Últ. Acesso' },
        { key: 'email', label: 'E-mail' },
      ],
      rows,
    }]
  }

  if (toolName === 'find_students_for_messaging') {
    if (!toolResult || typeof toolResult !== 'object' || Array.isArray(toolResult)) return []
    const parsed = toolResult as Record<string, unknown>
    const students = Array.isArray(parsed.students) ? parsed.students : []
    if (students.length === 0) return []
    const rows: ClarisRichRow[] = students.map((item: unknown) => {
      if (!item || typeof item !== 'object') return null
      const r = item as Record<string, unknown>
      const courses = Array.isArray(r.courses)
        ? r.courses.filter((c: unknown): c is string => typeof c === 'string').join(', ')
        : '—'
      return {
        nome: richStr(r.full_name),
        cursos: courses || '—',
        id: richStr(r.student_id),
      }
    }).filter((row): row is ClarisRichRow => row !== null)
    if (rows.length === 0) return []
    return [{
      type: 'data_table',
      tool: toolName,
      title: `Alunos Encontrados (${rows.length})`,
      empty_message: 'Nenhum aluno encontrado.',
      columns: [
        { key: 'nome', label: 'Nome' },
        { key: 'cursos', label: 'Cursos' },
      ],
      rows,
    }]
  }

  if (toolName === 'get_dashboard_summary') {
    if (!toolResult || typeof toolResult !== 'object' || Array.isArray(toolResult)) return []
    const d = toolResult as Record<string, unknown>
    const students = d.students && typeof d.students === 'object' && !Array.isArray(d.students)
      ? d.students as Record<string, unknown>
      : {}
    const tasks = d.pending_tasks && typeof d.pending_tasks === 'object' && !Array.isArray(d.pending_tasks)
      ? d.pending_tasks as Record<string, unknown>
      : {}
    return [{
      type: 'stat_cards',
      title: 'Visão Geral',
      stats: [
        { label: 'Cursos', value: richStr(d.courses), variant: 'default' },
        { label: 'Total de Alunos', value: richStr(students.total), variant: 'default' },
        { label: 'Em Atenção', value: richStr(students.atencao), variant: 'warning' },
        { label: 'Em Risco', value: richStr(students.risco), variant: 'warning' },
        { label: 'Críticos', value: richStr(students.critico), variant: 'danger' },
        { label: 'Atividades a Corrigir', value: richStr(d.activities_to_review), variant: 'default' },
        { label: 'Tarefas Abertas', value: richStr(tasks.total), variant: 'default' },
      ],
    }]
  }

  return []
}

// ---------------------------------------------------------------------------

function createConfirmActions(toolResult: Record<string, unknown>): ClarisUiAction[] {
  const prepared = Boolean(toolResult.prepared)
  const requiresConfirmation = Boolean(toolResult.requires_confirmation)
  const jobId = typeof toolResult.job_id === 'string' ? toolResult.job_id.trim() : ''
  const messagePreview = typeof toolResult.message_preview === 'string' ? toolResult.message_preview.trim() : ''

  if (!prepared || !requiresConfirmation || !jobId || !messagePreview) {
    return []
  }

  return [
    {
      id: `confirm-send-${jobId}`,
      label: '✅ Confirmar envio',
      value: `Confirmo o envio do job ${jobId}.`,
      kind: 'quick_reply',
      job_id: jobId,
    },
    {
      id: `review-send-${jobId}`,
      label: '✏️ Revisar mensagem',
      value: `Não confirmo o envio do job ${jobId} agora. Quero revisar a mensagem.`,
      kind: 'quick_reply',
      job_id: jobId,
    },
    {
      id: `cancel-send-${jobId}`,
      label: '❌ Cancelar envio',
      value: `Cancelar o envio do job ${jobId}.`,
      kind: 'quick_reply',
      job_id: jobId,
    },
  ]
}

function createDisambiguationActions(toolResult: Record<string, unknown>): ClarisUiAction[] {
  const requiresDisambiguation = Boolean(toolResult.requires_disambiguation)
  if (!requiresDisambiguation) return []

  const candidates = Array.isArray(toolResult.candidates) ? toolResult.candidates : []
  return candidates.slice(0, 6).flatMap((candidate, index) => {
    if (!candidate || typeof candidate !== 'object') return []

    const studentId = typeof candidate.student_id === 'string' ? candidate.student_id.trim() : ''
    const fullName = typeof candidate.full_name === 'string' ? candidate.full_name.trim() : ''
    const courses = Array.isArray(candidate.courses)
      ? candidate.courses.filter((course: unknown): course is string => typeof course === 'string' && course.trim().length > 0)
      : []

    if (!studentId || !fullName) return []

    const courseLabel = courses[0] ?? 'Curso não informado'

    return [{
      id: `student-pick-${studentId}-${index}`,
      label: `${fullName} — ${courseLabel}`,
      value: `Seleciono o aluno ${fullName} com student_id ${studentId}.`,
      kind: 'quick_reply',
    }]
  })
}

function collectUiActions(toolResult: unknown): ClarisUiAction[] {
  if (!toolResult || typeof toolResult !== 'object' || Array.isArray(toolResult)) {
    return []
  }

  const parsed = toolResult as Record<string, unknown>
  const actions = [
    ...createConfirmActions(parsed),
    ...createDisambiguationActions(parsed),
  ]

  const unique = new Map<string, ClarisUiAction>()
  for (const action of actions) {
    unique.set(action.id, action)
  }

  return Array.from(unique.values())
}

export async function runClarisLoop(
  settings: LLMSettings,
  messages: ChatMessage[],
  userId: string,
  context: ToolExecutionContext,
  timeoutMs = 60000,
  tools: ToolDefinition[] = CLARIS_TOOLS,
): Promise<{ reply: string; latencyMs: number; uiActions: ClarisUiAction[]; richBlocks: ClarisRichBlock[] }> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  const start = Date.now()

  // Work on a shallow copy so callers are not affected
  const history = [...messages]
  let uiActions: ClarisUiAction[] = []
  let richBlocks: ClarisRichBlock[] = []

  try {
    if (prefersResponsesApi(settings.model)) {
      const responsesRequestContext = buildResponsesRequestContext(history)
      const responsesInput = [...responsesRequestContext.input]
      const responseTools = toResponsesTools(tools)

      for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
        const requestBody: Record<string, unknown> = {
          model: settings.model,
          max_output_tokens: 4000,
          tools: responseTools,
          input: responsesInput,
        }

        if (responsesRequestContext.instructions) {
          requestBody.instructions = responsesRequestContext.instructions
        }

        const response = await fetch(`${settings.baseUrl}/responses`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${settings.apiKey}`,
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        })

        let payload: Record<string, unknown> = {}
        try {
          payload = await response.json() as Record<string, unknown>
        } catch {
          payload = {}
        }

        if (!response.ok) {
          const errorMessage =
            asString(asObject(payload.error).message) ||
            asString(payload.error) ||
            asString(payload.message) ||
            `LLM returned status ${response.status}`
          throw new Error(`LLM returned status ${response.status}: ${errorMessage}`)
        }

        const functionCalls = extractResponsesFunctionCalls(payload)
        if (functionCalls.length === 0) {
          return {
            reply: extractResponsesText(payload),
            latencyMs: Date.now() - start,
            uiActions,
            richBlocks,
          }
        }

        const outputItems = Array.isArray(payload.output)
          ? payload.output.filter((item): item is Record<string, unknown> => (
              item !== null && typeof item === 'object' && !Array.isArray(item)
            ))
          : []
        responsesInput.push(...outputItems)

        for (const toolCall of functionCalls) {
          let toolResult: unknown
          try {
            const args = JSON.parse(toolCall.arguments || '{}') as ToolCallArgs
            toolResult = await executeToolCall(toolCall.name, args, userId, context)
          } catch (err) {
            toolResult = { error: err instanceof Error ? err.message : 'Tool execution failed.' }
          }

          responsesInput.push({
            type: 'function_call_output',
            call_id: toolCall.call_id || toolCall.id || toolCall.name,
            output: summarizeToolResultForModel(toolCall.name, toolResult),
          })

          const actionsFromTool = collectUiActions(toolResult)
          if (actionsFromTool.length > 0) {
            uiActions = actionsFromTool
          }

          const blocksFromTool = generateRichBlocks(toolCall.name, toolResult)
          if (blocksFromTool.length > 0) {
            richBlocks = blocksFromTool
          }
        }
      }

      throw new Error('Max tool-call iterations reached without a final response.')
    }

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      const requestMessages = buildRequestMessagesForModel(history)
      const requestBody: Record<string, unknown> = {
        model: settings.model,
        max_tokens: 4000,
        tools,
        tool_choice: 'auto',
        messages: requestMessages,
      }

      if (supportsTemperature(settings.model)) {
        requestBody.temperature = 0.3
      }

      const response = await fetch(`${settings.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${settings.apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      })

      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new Error(`LLM returned status ${response.status}: ${text}`)
      }

      const payload = await response.json() as {
        choices: Array<{
          finish_reason: string
          message: {
            role: string
            content: string | null
            tool_calls?: ToolCall[]
          }
        }>
      }

      const choice = payload.choices?.[0]
      if (!choice) throw new Error('LLM returned no choices.')

      const assistantMsg = choice.message

      // No tool calls — final text response
      if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
        return {
          reply: assistantMsg.content ?? '',
          latencyMs: Date.now() - start,
          uiActions,
          richBlocks,
        }
      }

      // Append assistant message with tool_calls to history
      history.push({
        role: 'assistant',
        content: assistantMsg.content ?? null,
        tool_calls: assistantMsg.tool_calls,
      })

      // Execute each tool and append results
      for (const toolCall of assistantMsg.tool_calls) {
        let toolResult: unknown
        try {
          const args = JSON.parse(toolCall.function.arguments) as ToolCallArgs
          toolResult = await executeToolCall(toolCall.function.name, args, userId, context)
        } catch (err) {
          toolResult = { error: err instanceof Error ? err.message : 'Tool execution failed.' }
        }

        history.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          name: toolCall.function.name,
          content: summarizeToolResultForModel(toolCall.function.name, toolResult),
        })

        const actionsFromTool = collectUiActions(toolResult)
        if (actionsFromTool.length > 0) {
          uiActions = actionsFromTool
        }

        const blocksFromTool = generateRichBlocks(toolCall.function.name, toolResult)
        if (blocksFromTool.length > 0) {
          richBlocks = blocksFromTool
        }
      }
    }

    throw new Error('Max tool-call iterations reached without a final response.')
  } finally {
    clearTimeout(timeoutId)
  }
}
