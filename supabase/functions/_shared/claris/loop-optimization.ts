interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface LoopChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
  name?: string
}

const MAX_RECENT_CONVERSATION_MESSAGES = 6
const MAX_OLDER_CONVERSATION_SUMMARY_MESSAGES = 8
const MAX_SUMMARY_OBJECT_KEYS = 8
const MAX_SUMMARY_ARRAY_ITEMS = 4
const MAX_MESSAGE_TEXT_LENGTH = 900
const MAX_SUMMARY_TEXT_LENGTH = 220

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function truncateText(value: string, maxLength: number): string {
  const compact = compactWhitespace(value)
  if (compact.length <= maxLength) return compact
  return `${compact.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

function summarizeUnknownValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === 'string') {
    return truncateText(value, depth === 0 ? MAX_MESSAGE_TEXT_LENGTH : MAX_SUMMARY_TEXT_LENGTH)
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value
  }

  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_SUMMARY_ARRAY_ITEMS)
      .map((item) => summarizeUnknownValue(item, depth + 1))

    return {
      count: value.length,
      items,
      ...(value.length > items.length ? { omitted_count: value.length - items.length } : {}),
    }
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    const preferredKeys = [
      'success',
      'error',
      'created',
      'updated',
      'deleted',
      'prepared',
      'requires_confirmation',
      'job_id',
      'count',
      'id',
      'student_id',
      'title',
      'full_name',
      'status',
      'priority',
      'type',
      'start_at',
      'end_at',
      'due_date',
      'message_preview',
      'reason',
    ]
    const entries = Object.entries(record)
      .sort(([leftKey], [rightKey]) => {
        const leftIndex = preferredKeys.indexOf(leftKey)
        const rightIndex = preferredKeys.indexOf(rightKey)
        const leftPriority = leftIndex === -1 ? preferredKeys.length : leftIndex
        const rightPriority = rightIndex === -1 ? preferredKeys.length : rightIndex
        return leftPriority - rightPriority
      })
      .slice(0, MAX_SUMMARY_OBJECT_KEYS)

    const summary: Record<string, unknown> = {}
    for (const [key, entryValue] of entries) {
      summary[key] = summarizeUnknownValue(entryValue, depth + 1)
    }

    return summary
  }

  return truncateText(String(value), MAX_SUMMARY_TEXT_LENGTH)
}

function compactMessageContent(message: LoopChatMessage): LoopChatMessage {
  if (message.role === 'tool') {
    return {
      role: 'tool',
      content: message.content,
      tool_call_id: message.tool_call_id,
    }
  }

  return {
    role: message.role,
    content: typeof message.content === 'string'
      ? truncateText(message.content, MAX_MESSAGE_TEXT_LENGTH)
      : message.content,
    ...(message.tool_calls ? { tool_calls: message.tool_calls } : {}),
  }
}

function summarizeConversationMessages(messages: LoopChatMessage[]): string | null {
  if (messages.length === 0) return null

  const sample = messages.slice(-MAX_OLDER_CONVERSATION_SUMMARY_MESSAGES)
  const summaryLines = sample.flatMap((message) => {
    if (!message.content) return []
    return [`- ${message.role}: ${truncateText(message.content, MAX_SUMMARY_TEXT_LENGTH)}`]
  })

  if (summaryLines.length === 0) return null

  const omittedCount = Math.max(0, messages.length - sample.length)
  const header = omittedCount > 0
    ? `Resumo curto da conversa anterior (${omittedCount} mensagens omitidas):`
    : 'Resumo curto da conversa anterior:'

  return [header, ...summaryLines].join('\n')
}

export function summarizeToolResultForModel(toolName: string, toolResult: unknown): string {
  return JSON.stringify({
    tool: toolName,
    result: summarizeUnknownValue(toolResult),
  })
}

export function buildRequestMessagesForModel(messages: LoopChatMessage[]): LoopChatMessage[] {
  if (messages.length === 0) return []

  const [firstMessage, ...remainingMessages] = messages
  const firstToolPhaseIndex = remainingMessages.findIndex(
    (message) => message.role === 'tool' || (message.role === 'assistant' && Array.isArray(message.tool_calls) && message.tool_calls.length > 0),
  )

  const conversationMessages = firstToolPhaseIndex === -1
    ? remainingMessages
    : remainingMessages.slice(0, firstToolPhaseIndex)
  const toolPhaseMessages = firstToolPhaseIndex === -1
    ? []
    : remainingMessages.slice(firstToolPhaseIndex)

  const recentConversation = conversationMessages
    .slice(-MAX_RECENT_CONVERSATION_MESSAGES)
    .map(compactMessageContent)
  const olderConversation = conversationMessages.slice(0, Math.max(0, conversationMessages.length - MAX_RECENT_CONVERSATION_MESSAGES))
  const summarizedConversation = summarizeConversationMessages(olderConversation)

  return [
    compactMessageContent(firstMessage),
    ...(summarizedConversation ? [{ role: 'system', content: summarizedConversation } as LoopChatMessage] : []),
    ...recentConversation,
    ...toolPhaseMessages.map(compactMessageContent),
  ]
}
