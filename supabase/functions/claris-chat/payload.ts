import {
  RequestBodyValidationError,
  expectBodyObject,
  readOptionalUuid,
  readRequiredString,
} from '../_shared/http/mod.ts'

export interface ChatHistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ClarisChatAction {
  kind: 'quick_reply'
  value: string
  jobId?: string
}

export interface ClarisChatMessagePayload {
  operation: 'send_message'
  requestVersion: 'v1'
  message: string
  history: ChatHistoryMessage[]
  connectionId?: string
  action?: ClarisChatAction
}

export interface ClarisAvailabilityPayload {
  operation: 'get_availability'
  requestVersion: 'v1'
}

export type ClarisChatPayload = ClarisChatMessagePayload | ClarisAvailabilityPayload

const WHOLE_CODE_BLOCK_RE = /^```(?:json|javascript|js)?\s*([\s\S]*?)\s*```$/i
const ANY_CODE_BLOCK_RE = /```(?:json|javascript|js)?\s*([\s\S]*?)\s*```/gi

const V1_FIELDS = {
  get_availability: new Set(['operation']),
  send_message: new Set(['operation', 'message', 'history', 'action', 'connectionId']),
} as const

function invalid(message: string): never {
  throw new RequestBodyValidationError(message, 422)
}

function assertExactFields(
  body: Record<string, unknown>,
  operation: keyof typeof V1_FIELDS,
): void {
  if (Object.keys(body).some((field) => !V1_FIELDS[operation].has(field))) {
    invalid('Invalid request fields')
  }
}

function parseV1Payload(rawBody: unknown): ClarisChatPayload {
  const body = expectBodyObject(rawBody)
  const operation = body.operation
  if (operation !== 'get_availability' && operation !== 'send_message') {
    invalid('Invalid operation')
  }
  assertExactFields(body, operation)

  if (operation === 'get_availability') {
    return { operation, requestVersion: 'v1' }
  }

  const action = parseV1Action(body.action)
  return {
    operation,
    requestVersion: 'v1',
    message: optimizeChatTextForLlm(readRequiredString(body, 'message', 32000)),
    history: parseV1History(body.history),
    ...(readOptionalUuid(body, 'connectionId') ? { connectionId: readOptionalUuid(body, 'connectionId') } : {}),
    ...(action ? { action } : {}),
  }
}

export function parseClarisChatPayload(rawBody: unknown): ClarisChatPayload {
  return parseV1Payload(rawBody)
}

export function optimizeChatTextForLlm(input: string): string {
  const normalized = input.replace(/\r\n?/g, '\n').trim()
  if (!normalized) return ''

  const compactWholeJson = compactJson(normalized)
  if (compactWholeJson) {
    return compactWholeJson
  }

  const withoutVerboseJsonBlocks = normalized.replace(ANY_CODE_BLOCK_RE, (match, block) => {
    const rawBlock = typeof block === 'string' ? block.trim() : ''
    const compactBlockJson = compactJson(rawBlock)
    if (compactBlockJson) {
      return compactBlockJson
    }

    const unwrapped = unwrapSingleCodeBlock(match)
    return compactFormattedText(unwrapped)
  })

  return compactFormattedText(withoutVerboseJsonBlocks)
}

function parseV1Action(raw: unknown): ClarisChatAction | undefined {
  if (raw === undefined) return undefined
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) invalid('Invalid action')

  const action = raw as Record<string, unknown>
  if (Object.keys(action).some((field) => !['kind', 'value', 'jobId'].includes(field))) {
    invalid('Invalid action fields')
  }
  if (action.kind !== 'quick_reply') invalid('Invalid action kind')

  const value = typeof action.value === 'string' ? action.value.trim() : ''
  if (!value || value.length > 2000) invalid('Invalid action value')
  const jobId = action.jobId
  if (jobId !== undefined && (typeof jobId !== 'string' || !jobId.trim() || jobId.length > 128)) {
    invalid('Invalid action jobId')
  }

  return {
    kind: 'quick_reply',
    value,
    ...(typeof jobId === 'string' ? { jobId: jobId.trim() } : {}),
  }
}

function parseV1History(raw: unknown): ChatHistoryMessage[] {
  if (!Array.isArray(raw)) invalid('Invalid history')

  return raw.slice(-20).map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) invalid('Invalid history item')
    const entry = item as Record<string, unknown>
    if (Object.keys(entry).some((field) => !['role', 'content'].includes(field))) {
      invalid('Invalid history item fields')
    }
    if (entry.role !== 'user' && entry.role !== 'assistant') invalid('Invalid history role')
    if (typeof entry.content !== 'string' || !entry.content.trim()) invalid('Invalid history content')

    return {
      role: entry.role,
      content: optimizeChatTextForLlm(entry.content).slice(0, 2000),
    }
  })
}

function compactJson(input: string): string | null {
  const candidate = unwrapSingleCodeBlock(input)
  if (!candidate || !/^(?:\[|\{)/.test(candidate)) {
    return null
  }

  try {
    return JSON.stringify(JSON.parse(candidate))
  } catch {
    return null
  }
}

function unwrapSingleCodeBlock(input: string): string {
  const match = input.trim().match(WHOLE_CODE_BLOCK_RE)
  return match?.[1]?.trim() ?? input.trim()
}

function compactFormattedText(input: string): string {
  const cleaned = input
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map(compactFormattedLine)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return cleaned
}

function compactFormattedLine(line: string): string {
  const trimmed = line.trim()
  if (!trimmed) return ''

  return trimmed
    .replace(/^#{1,6}\s+/, '')
    .replace(/^>\s+/, '')
    .replace(/^[-*+]\s+/, '- ')
    .replace(/^(\d+)(?:[.)\]])\s+/, '$1. ')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1: $2')
    .replace(/[ \t]{2,}/g, ' ')
}
