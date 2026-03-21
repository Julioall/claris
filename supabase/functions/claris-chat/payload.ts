import { expectBodyObject, readOptionalString, readRequiredMoodleUrl, readRequiredString } from '../_shared/http/mod.ts'

export interface ChatHistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ClarisChatPayload {
  message: string
  history: ChatHistoryMessage[]
  moodleUrl?: string
  moodleToken?: string
  action?: {
    kind: 'quick_reply'
    value: string
    jobId?: string
  }
}

const WHOLE_CODE_BLOCK_RE = /^```(?:json|javascript|js)?\s*([\s\S]*?)\s*```$/i
const ANY_CODE_BLOCK_RE = /```(?:json|javascript|js)?\s*([\s\S]*?)\s*```/gi

export function parseClarisChatPayload(rawBody: unknown): ClarisChatPayload {
  const body = expectBodyObject(rawBody)

  return {
    message: optimizeChatTextForLlm(readRequiredString(body, 'message', 32000)),
    history: parseHistory(body.history),
    moodleUrl: body.moodleUrl ? readRequiredMoodleUrl(body) : undefined,
    moodleToken: readOptionalString(body, 'moodleToken', 4096),
    action: parseAction(body.action),
  }
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

function parseAction(raw: unknown): ClarisChatPayload['action'] | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return undefined
  }

  const kind = (raw as { kind?: unknown }).kind
  const value = (raw as { value?: unknown }).value
  const jobId = (raw as { jobId?: unknown }).jobId

  if (kind !== 'quick_reply' || typeof value !== 'string' || !value.trim()) {
    return undefined
  }

  return {
    kind: 'quick_reply',
    value: value.slice(0, 2000),
    jobId: typeof jobId === 'string' && jobId.trim() ? jobId.slice(0, 128) : undefined,
  }
}

function parseHistory(raw: unknown): ChatHistoryMessage[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(
      (item): item is { role: string; content: string } =>
        item !== null &&
        typeof item === 'object' &&
        (item.role === 'user' || item.role === 'assistant') &&
        typeof item.content === 'string',
    )
    .slice(-20) // cap at 20 messages to control token usage
    .map(({ role, content }) => ({
      role: role as 'user' | 'assistant',
      content: optimizeChatTextForLlm(content).slice(0, 2000),
    }))
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
