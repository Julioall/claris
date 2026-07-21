import {
  RequestBodyValidationError,
  expectBodyObject,
  readOptionalInteger,
  readOptionalLiteral,
  readOptionalString,
  readRequiredLiteral,
  readRequiredString,
  readRequiredUuid,
} from '../_shared/http/mod.ts'

const TICKET_TYPES = ['problema', 'sugestao', 'duvida', 'outro'] as const
const TICKET_STATUSES = ['aberto', 'em_andamento', 'resolvido', 'fechado'] as const

export type SupportTicketsPayload =
  | {
      action: 'create_ticket'
      description: string
      route: string
      title: string
      type: typeof TICKET_TYPES[number]
    }
  | {
      action: 'list_tickets'
      page: number
      pageSize: number
      search?: string
      status?: typeof TICKET_STATUSES[number]
      type?: typeof TICKET_TYPES[number]
    }
  | {
      action: 'update_ticket'
      adminNotes: string
      status: typeof TICKET_STATUSES[number]
      ticketId: string
    }

const ACTIONS = ['create_ticket', 'list_tickets', 'update_ticket'] as const
const ACTION_FIELDS: Record<SupportTicketsPayload['action'], ReadonlySet<string>> = {
  create_ticket: new Set(['action', 'type', 'title', 'description', 'route']),
  list_tickets: new Set(['action', 'status', 'type', 'search', 'page', 'pageSize']),
  update_ticket: new Set(['action', 'ticketId', 'status', 'adminNotes']),
}

function invalid(message: string): never {
  throw new RequestBodyValidationError(message, 422)
}

function assertExactFields(body: Record<string, unknown>, action: SupportTicketsPayload['action']) {
  if (Object.keys(body).some((field) => !ACTION_FIELDS[action].has(field))) {
    invalid('Invalid request fields')
  }
}

function readStringAllowEmpty(
  body: Record<string, unknown>,
  field: string,
  maxLength: number,
): string {
  const value = body[field]
  if (typeof value !== 'string' || value.length > maxLength) invalid(`Invalid ${field}`)
  return value.trim()
}

export function parseSupportTicketsPayload(rawBody: unknown): SupportTicketsPayload {
  const body = expectBodyObject(rawBody)
  const action = readRequiredLiteral(body, 'action', ACTIONS)
  assertExactFields(body, action)

  if (action === 'create_ticket') {
    const route = readRequiredString(body, 'route', 2048).trim()
    const title = readRequiredString(body, 'title', 240).trim()
    const description = readRequiredString(body, 'description', 10000).trim()
    if (!route.startsWith('/') || route.startsWith('//')) invalid('Invalid route')
    if (!title) invalid('Invalid title')
    if (!description) invalid('Invalid description')
    return {
      action,
      type: readRequiredLiteral(body, 'type', TICKET_TYPES),
      title,
      description,
      route,
    }
  }

  if (action === 'list_tickets') {
    return {
      action,
      status: readOptionalLiteral(body, 'status', TICKET_STATUSES),
      type: readOptionalLiteral(body, 'type', TICKET_TYPES),
      search: readOptionalString(body, 'search', 500)?.trim(),
      page: readOptionalInteger(body, 'page', 1) ?? 1,
      pageSize: readOptionalInteger(body, 'pageSize', 1, 100) ?? 30,
    }
  }

  return {
    action,
    ticketId: readRequiredUuid(body, 'ticketId'),
    status: readRequiredLiteral(body, 'status', TICKET_STATUSES),
    adminNotes: readStringAllowEmpty(body, 'adminNotes', 10000),
  }
}
