import {
  SERVICE_INTEGRATIONS_CONTRACT_VERSION,
  type AdminServiceInstanceDto,
  type ServiceInstanceDto,
  type ServiceInstanceEventDto,
  type ServiceInstanceScope,
} from './contract.ts'
import type { ServiceInstanceEventRow, ServiceInstanceRow } from './repository.ts'

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function phoneNumber(row: ServiceInstanceRow): string | null {
  const value = asRecord(row.metadata)?.phone_number
  return typeof value === 'string' && value ? value : null
}

function scope(value: string): ServiceInstanceScope {
  return value === 'shared' ? 'shared' : 'personal'
}

export function mapServiceInstance(row: ServiceInstanceRow): ServiceInstanceDto {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    serviceType: row.service_type,
    scope: scope(row.scope),
    connectionStatus: row.connection_status,
    operationalStatus: row.operational_status,
    healthStatus: row.health_status,
    isActive: row.is_active,
    isBlocked: row.is_blocked,
    evolutionInstanceName: row.evolution_instance_name,
    phoneNumber: phoneNumber(row),
    lastActivityAt: row.last_activity_at,
    lastSyncAt: row.last_sync_at,
    createdAt: row.created_at,
  }
}

export function mapAdminServiceInstance(row: ServiceInstanceRow): AdminServiceInstanceDto {
  return {
    ...mapServiceInstance(row),
    adminNotes: row.admin_notes,
  }
}

export function mapServiceInstanceEvent(row: ServiceInstanceEventRow): ServiceInstanceEventDto {
  return {
    id: row.id,
    eventType: row.event_type,
    origin: row.origin,
    status: row.status,
    errorSummary: row.error_summary,
    createdAt: row.created_at,
  }
}

export function serviceInstanceCommand(instanceId: string) {
  return {
    contractVersion: SERVICE_INTEGRATIONS_CONTRACT_VERSION,
    instanceId,
    success: true as const,
  }
}
