import {
  RequestBodyValidationError,
  expectBodyObject,
  readOptionalBoolean,
  readOptionalString,
  readRequiredBoolean,
  readRequiredLiteral,
  readRequiredUuid,
} from '../_shared/http/mod.ts'
import type { ServiceInstanceScope } from './contract.ts'

export type ServiceIntegrationPayload =
  | { action: 'get_my_overview' }
  | { action: 'list_shared_instances' }
  | {
      action: 'create_instance'
      adminNotes?: string | null
      description?: string | null
      evolutionInstanceName?: string
      name: string
      phoneNumber?: string
      scope: ServiceInstanceScope
    }
  | {
      action: 'update_instance'
      adminNotes?: string | null
      description?: string | null
      instanceId: string
      name: string
    }
  | { action: 'connect_instance'; instanceId: string }
  | { action: 'sync_instance_status'; instanceId: string; silent: boolean }
  | { action: 'get_instance_qr'; instanceId: string }
  | { action: 'configure_instance_webhook'; instanceId: string }
  | { action: 'deactivate_instance'; instanceId: string }
  | { action: 'delete_instance'; instanceId: string }
  | { action: 'set_instance_blocked'; blocked: boolean; instanceId: string }
  | { action: 'set_instance_active'; active: boolean; instanceId: string }

const ACTIONS = [
  'get_my_overview',
  'list_shared_instances',
  'create_instance',
  'update_instance',
  'connect_instance',
  'sync_instance_status',
  'get_instance_qr',
  'configure_instance_webhook',
  'deactivate_instance',
  'delete_instance',
  'set_instance_blocked',
  'set_instance_active',
] as const

const ACTION_FIELDS: Record<ServiceIntegrationPayload['action'], ReadonlySet<string>> = {
  get_my_overview: new Set(['action']),
  list_shared_instances: new Set(['action']),
  create_instance: new Set([
    'action',
    'scope',
    'name',
    'description',
    'evolutionInstanceName',
    'phoneNumber',
    'adminNotes',
  ]),
  update_instance: new Set(['action', 'instanceId', 'name', 'description', 'adminNotes']),
  connect_instance: new Set(['action', 'instanceId']),
  sync_instance_status: new Set(['action', 'instanceId', 'silent']),
  get_instance_qr: new Set(['action', 'instanceId']),
  configure_instance_webhook: new Set(['action', 'instanceId']),
  deactivate_instance: new Set(['action', 'instanceId']),
  delete_instance: new Set(['action', 'instanceId']),
  set_instance_blocked: new Set(['action', 'instanceId', 'blocked']),
  set_instance_active: new Set(['action', 'instanceId', 'active']),
}

function invalid(message: string): never {
  throw new RequestBodyValidationError(message, 422)
}

function assertExactFields(body: Record<string, unknown>, action: ServiceIntegrationPayload['action']) {
  if (Object.keys(body).some((field) => !ACTION_FIELDS[action].has(field))) {
    invalid('Invalid request fields')
  }
}

function requiredTrimmedString(
  body: Record<string, unknown>,
  field: string,
  maxLength: number,
): string {
  const value = body[field]
  if (typeof value !== 'string') invalid(`Invalid ${field}`)
  const normalized = value.trim()
  if (!normalized || normalized.length > maxLength) invalid(`Invalid ${field}`)
  return normalized
}

function nullableTrimmedString(
  body: Record<string, unknown>,
  field: string,
  maxLength: number,
): string | null | undefined {
  const value = body[field]
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  if (typeof value !== 'string') invalid(`Invalid ${field}`)
  const normalized = value.trim()
  if (normalized.length > maxLength) invalid(`Invalid ${field}`)
  return normalized || null
}

function evolutionInstanceName(body: Record<string, unknown>): string | undefined {
  const value = readOptionalString(body, 'evolutionInstanceName', 100)?.trim()
  if (value && !/^[a-z0-9][a-z0-9_-]{0,99}$/i.test(value)) {
    invalid('Invalid evolutionInstanceName')
  }
  return value || undefined
}

function phoneNumber(body: Record<string, unknown>): string | undefined {
  const value = readOptionalString(body, 'phoneNumber', 32)
  if (!value) return undefined
  const normalized = value.replace(/\D/g, '')
  if (!/^\d{10,15}$/.test(normalized)) invalid('Invalid phoneNumber')
  return normalized
}

function instanceAction(
  action: Exclude<ServiceIntegrationPayload['action'],
    | 'get_my_overview'
    | 'list_shared_instances'
    | 'create_instance'
    | 'update_instance'
    | 'sync_instance_status'
    | 'set_instance_blocked'
    | 'set_instance_active'>,
  body: Record<string, unknown>,
): ServiceIntegrationPayload {
  return { action, instanceId: readRequiredUuid(body, 'instanceId') }
}

export function parseServiceIntegrationPayload(rawBody: unknown): ServiceIntegrationPayload {
  const body = expectBodyObject(rawBody)
  const action = readRequiredLiteral(body, 'action', ACTIONS)
  assertExactFields(body, action)

  if (action === 'get_my_overview' || action === 'list_shared_instances') return { action }

  if (action === 'create_instance') {
    return {
      action,
      scope: readRequiredLiteral(body, 'scope', ['personal', 'shared'] as const),
      name: requiredTrimmedString(body, 'name', 120),
      description: nullableTrimmedString(body, 'description', 1000),
      evolutionInstanceName: evolutionInstanceName(body),
      phoneNumber: phoneNumber(body),
      adminNotes: nullableTrimmedString(body, 'adminNotes', 2000),
    }
  }

  if (action === 'update_instance') {
    return {
      action,
      instanceId: readRequiredUuid(body, 'instanceId'),
      name: requiredTrimmedString(body, 'name', 120),
      description: nullableTrimmedString(body, 'description', 1000),
      adminNotes: nullableTrimmedString(body, 'adminNotes', 2000),
    }
  }

  if (action === 'sync_instance_status') {
    return {
      action,
      instanceId: readRequiredUuid(body, 'instanceId'),
      silent: readOptionalBoolean(body, 'silent') ?? false,
    }
  }

  if (action === 'set_instance_blocked') {
    return {
      action,
      instanceId: readRequiredUuid(body, 'instanceId'),
      blocked: readRequiredBoolean(body, 'blocked'),
    }
  }

  if (action === 'set_instance_active') {
    return {
      action,
      instanceId: readRequiredUuid(body, 'instanceId'),
      active: readRequiredBoolean(body, 'active'),
    }
  }

  return instanceAction(action, body)
}
