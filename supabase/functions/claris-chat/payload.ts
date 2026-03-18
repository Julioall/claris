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

export function parseClarisChatPayload(rawBody: unknown): ClarisChatPayload {
  const body = expectBodyObject(rawBody)

  return {
    message: readRequiredString(body, 'message', 32000),
    history: parseHistory(body.history),
    moodleUrl: body.moodleUrl ? readRequiredMoodleUrl(body) : undefined,
    moodleToken: readOptionalString(body, 'moodleToken', 4096),
    action: parseAction(body.action),
  }
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
      content: content.slice(0, 2000),
    }))
}
