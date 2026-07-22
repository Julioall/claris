import {
  RequestBodyValidationError,
  expectBodyObject,
  readRequiredLiteral,
  readRequiredString,
  readRequiredUuid,
} from '../_shared/http/mod.ts'

const ACTIONS = ['list', 'create', 'resend', 'revoke', 'provision_account'] as const

export type ClarisInvitationsPayload =
  | { action: 'list' }
  | { action: 'create'; appRole: 'tutor'; email: string; fullName: string }
  | { action: 'resend'; invitationId: string }
  | { action: 'revoke'; invitationId: string }
  | { action: 'provision_account' }

function invalid(message: string): never {
  throw new RequestBodyValidationError(message, 422)
}

function exact(body: Record<string, unknown>, fields: string[]): void {
  const allowed = new Set(fields)
  if (Object.keys(body).some((field) => !allowed.has(field))) invalid('Invalid request fields')
}

function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase()
  if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) invalid('Invalid email')
  return email
}

export function parseClarisInvitationsPayload(rawBody: unknown): ClarisInvitationsPayload {
  const body = expectBodyObject(rawBody)
  const action = readRequiredLiteral(body, 'action', ACTIONS)
  if (action === 'list' || action === 'provision_account') {
    exact(body, ['action'])
    return { action }
  }
  if (action === 'resend' || action === 'revoke') {
    exact(body, ['action', 'invitationId'])
    return { action, invitationId: readRequiredUuid(body, 'invitationId') }
  }

  exact(body, ['action', 'appRole', 'email', 'fullName'])
  if (body.appRole !== 'tutor') invalid('Invalid appRole')
  const fullName = readRequiredString(body, 'fullName', 200).trim().replace(/\s+/g, ' ')
  if (!fullName) invalid('Invalid fullName')
  return {
    action,
    appRole: 'tutor',
    email: normalizeEmail(readRequiredString(body, 'email', 320)),
    fullName,
  }
}
