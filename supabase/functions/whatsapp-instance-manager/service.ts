import { ApiError } from '../_shared/http/mod.ts'
import {
  SERVICE_INTEGRATIONS_CONTRACT_VERSION,
  type PersonalServiceOverviewDto,
  type ServiceInstanceCommandDto,
  type ServiceInstanceMutationDto,
  type ServiceInstanceQrDto,
  type ServiceInstanceStatusDto,
  type SharedServiceInstancesDto,
} from './contract.ts'
import type { EvolutionInstanceGateway } from './evolution-gateway.ts'
import {
  mapAdminServiceInstance,
  mapServiceInstance,
  mapServiceInstanceEvent,
  serviceInstanceCommand,
} from './mapper.ts'
import type { ServiceIntegrationPayload } from './payload.ts'
import type { ServiceInstanceRepository, ServiceInstanceRow } from './repository.ts'

type ServiceIntegrationResult =
  | PersonalServiceOverviewDto
  | ServiceInstanceCommandDto
  | ServiceInstanceMutationDto
  | ServiceInstanceQrDto
  | ServiceInstanceStatusDto
  | SharedServiceInstancesDto

export function authorizeServiceIntegration(
  repository: ServiceInstanceRepository,
  actorId: string,
): Promise<boolean> {
  return repository.hasPermission(actorId, 'services.view')
}

async function requireAdmin(
  repository: ServiceInstanceRepository,
  actorId: string,
): Promise<void> {
  if (!await repository.isApplicationAdmin(actorId)) {
    throw ApiError.forbidden('Administrator access required.')
  }
}

async function authorizedInstance(
  repository: ServiceInstanceRepository,
  actorId: string,
  instanceId: string,
): Promise<ServiceInstanceRow> {
  const instance = await repository.findInstance(instanceId)
  if (!instance) throw ApiError.notFound('Service instance not found.')
  if (instance.scope === 'personal') {
    if (instance.owner_user_id !== actorId) throw ApiError.forbidden()
    return instance
  }
  await requireAdmin(repository, actorId)
  return instance
}

function configuredInstanceName(instance: ServiceInstanceRow): string {
  if (!instance.evolution_instance_name) {
    throw ApiError.conflict('Service instance is not configured in the provider.')
  }
  return instance.evolution_instance_name
}

function upstreamError(operation: string, error: unknown): ApiError {
  console.error('Evolution instance operation failed.', {
    operation,
    message: error instanceof Error ? error.message : 'Unknown error',
  })
  return new ApiError(
    'upstream_unavailable',
    'O provedor do WhatsApp não está disponível no momento.',
    502,
  )
}

async function ensureProviderInstance(
  repository: ServiceInstanceRepository,
  evolution: EvolutionInstanceGateway,
  instance: ServiceInstanceRow,
): Promise<string> {
  const instanceName = configuredInstanceName(instance)
  try {
    const externalId = await evolution.ensureInstance(
      instanceName,
      mapServiceInstance(instance).phoneNumber,
    )
    if (externalId) await repository.setExternalId(instance.id, externalId)
    return instanceName
  } catch (error) {
    throw upstreamError('ensure_instance', error)
  }
}

function connectionState(
  currentConnectionStatus: string,
  currentHealthStatus: string,
  state: 'close' | 'connecting' | 'open' | 'unknown',
) {
  if (state === 'open') return { connectionStatus: 'connected', healthStatus: 'healthy' }
  if (state === 'close') return { connectionStatus: 'disconnected', healthStatus: currentHealthStatus }
  if (state === 'connecting') {
    return { connectionStatus: 'pending_connection', healthStatus: currentHealthStatus }
  }
  return { connectionStatus: currentConnectionStatus, healthStatus: currentHealthStatus }
}

export async function executeServiceIntegration(
  repository: ServiceInstanceRepository,
  evolution: EvolutionInstanceGateway,
  actorId: string,
  correlationId: string,
  payload: ServiceIntegrationPayload,
): Promise<ServiceIntegrationResult> {
  if (payload.action === 'get_my_overview') {
    const instance = await repository.findPersonalWhatsAppInstance(actorId)
    return {
      contractVersion: SERVICE_INTEGRATIONS_CONTRACT_VERSION,
      instance: instance ? mapServiceInstance(instance) : null,
      events: instance
        ? (await repository.listEvents(instance.id, 20)).map(mapServiceInstanceEvent)
        : [],
    }
  }

  if (payload.action === 'list_shared_instances') {
    await requireAdmin(repository, actorId)
    return {
      contractVersion: SERVICE_INTEGRATIONS_CONTRACT_VERSION,
      items: (await repository.listSharedWhatsAppInstances()).map(mapAdminServiceInstance),
    }
  }

  if (payload.action === 'create_instance') {
    const isShared = payload.scope === 'shared'
    if (isShared) await requireAdmin(repository, actorId)
    if (!isShared && payload.adminNotes !== undefined) {
      throw ApiError.unprocessable('adminNotes is only available for shared instances.')
    }
    if (!isShared && await repository.hasActiveSharedWhatsAppInstance()) {
      throw ApiError.conflict(
        'Já existe uma instância compartilhada de WhatsApp disponível no sistema.',
      )
    }

    const evolutionInstanceName = payload.evolutionInstanceName
      ?? `claris-${isShared ? 'shared' : 'personal'}-${crypto.randomUUID().slice(0, 8)}`
    const created = await repository.createInstance({
      actorId,
      name: payload.name,
      description: payload.description ?? null,
      scope: payload.scope,
      ownerUserId: isShared ? null : actorId,
      evolutionInstanceName,
      phoneNumber: payload.phoneNumber ?? null,
      adminNotes: isShared ? payload.adminNotes ?? null : null,
    })
    if (created.kind === 'conflict') {
      throw ApiError.conflict('Você já possui uma instância pessoal de WhatsApp.')
    }

    await repository.recordEvent({
      actorId,
      correlationId,
      eventType: 'instance_created',
      instanceId: created.instance.id,
      instanceScope: created.instance.scope,
      origin: isShared ? 'admin' : 'user',
      context: { name: payload.name, scope: payload.scope },
    })

    try {
      const externalId = await evolution.createInstance(
        evolutionInstanceName,
        payload.phoneNumber ?? null,
      )
      if (externalId) await repository.setExternalId(created.instance.id, externalId)
    } catch (error) {
      console.warn('Evolution instance creation deferred.', {
        instanceId: created.instance.id,
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }

    return {
      contractVersion: SERVICE_INTEGRATIONS_CONTRACT_VERSION,
      instance: mapServiceInstance(created.instance),
    }
  }

  if (payload.action === 'set_instance_blocked') {
    await requireAdmin(repository, actorId)
    const instance = await repository.findInstance(payload.instanceId)
    if (!instance) throw ApiError.notFound('Service instance not found.')
    await repository.setBlocked(instance.id, actorId, payload.blocked)
    await repository.recordEvent({
      actorId,
      correlationId,
      eventType: 'preventive_blocked',
      instanceId: instance.id,
      instanceScope: instance.scope,
      origin: 'admin',
      context: { blocked: payload.blocked },
    })
    return serviceInstanceCommand(instance.id)
  }

  const instance = await authorizedInstance(repository, actorId, payload.instanceId)

  if (payload.action === 'update_instance') {
    if (instance.scope === 'personal' && payload.adminNotes !== undefined) {
      throw ApiError.unprocessable('adminNotes is only available for shared instances.')
    }
    const updated = await repository.updateInstance(instance.id, actorId, {
      name: payload.name,
      description: payload.description,
      ...(instance.scope === 'shared' ? { adminNotes: payload.adminNotes } : {}),
    })
    await repository.recordEvent({
      actorId,
      correlationId,
      eventType: 'instance_updated',
      instanceId: instance.id,
      instanceScope: instance.scope,
      origin: instance.scope === 'shared' ? 'admin' : 'user',
      context: { fields: ['name', 'description'] },
    })
    return {
      contractVersion: SERVICE_INTEGRATIONS_CONTRACT_VERSION,
      instance: mapServiceInstance(updated),
    }
  }

  if (payload.action === 'connect_instance') {
    const instanceName = await ensureProviderInstance(repository, evolution, instance)
    try {
      await evolution.connect(instanceName, mapServiceInstance(instance).phoneNumber)
    } catch (error) {
      throw upstreamError('connect', error)
    }
    await repository.setPendingConnection(instance.id, actorId)
    await repository.recordEvent({
      actorId,
      correlationId,
      eventType: 'connected',
      instanceId: instance.id,
      instanceScope: instance.scope,
      origin: instance.scope === 'shared' ? 'admin' : 'user',
      status: 'pending',
      context: { action: 'connect_initiated' },
    })
    return serviceInstanceCommand(instance.id)
  }

  if (payload.action === 'sync_instance_status') {
    const instanceName = configuredInstanceName(instance)
    let details: unknown = {}
    let statuses = {
      connectionStatus: instance.connection_status,
      healthStatus: instance.health_status,
    }
    try {
      const result = await evolution.getStatus(instanceName)
      details = result.details
      statuses = connectionState(
        instance.connection_status,
        instance.health_status,
        result.state,
      )
    } catch (error) {
      console.warn('Evolution status synchronization failed.', {
        instanceId: instance.id,
        message: error instanceof Error ? error.message : 'Unknown error',
      })
      statuses.healthStatus = 'warning'
    }
    const timestamp = new Date().toISOString()
    await repository.setStatus({
      actorId,
      instanceId: instance.id,
      ...statuses,
      silent: payload.silent,
      timestamp,
    })
    if (!payload.silent) {
      await repository.recordHealth({
        instanceId: instance.id,
        ...statuses,
        details,
        timestamp,
      })
      await repository.recordEvent({
        actorId,
        correlationId,
        eventType: 'status_synced',
        instanceId: instance.id,
        instanceScope: instance.scope,
        origin: instance.scope === 'shared' ? 'admin' : 'user',
        context: {
          connection_status: statuses.connectionStatus,
          health_status: statuses.healthStatus,
        },
      })
    }
    return {
      contractVersion: SERVICE_INTEGRATIONS_CONTRACT_VERSION,
      instanceId: instance.id,
      ...statuses,
    }
  }

  if (payload.action === 'get_instance_qr') {
    const instanceName = await ensureProviderInstance(repository, evolution, instance)
    try {
      const qr = await evolution.getQrCode(instanceName, mapServiceInstance(instance).phoneNumber)
      return {
        contractVersion: SERVICE_INTEGRATIONS_CONTRACT_VERSION,
        instanceId: instance.id,
        ...qr,
      }
    } catch (error) {
      throw upstreamError('get_qr_code', error)
    }
  }

  if (payload.action === 'configure_instance_webhook') {
    try {
      await evolution.configureWebhook(configuredInstanceName(instance))
    } catch (error) {
      throw upstreamError('configure_webhook', error)
    }
    return serviceInstanceCommand(instance.id)
  }

  if (payload.action === 'deactivate_instance') {
    try {
      await evolution.logout(configuredInstanceName(instance))
    } catch (error) {
      console.warn('Evolution logout failed; local instance will still be disabled.', {
        instanceId: instance.id,
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
    await repository.setActive(instance.id, actorId, false)
    await repository.recordEvent({
      actorId,
      correlationId,
      eventType: 'disconnected',
      instanceId: instance.id,
      instanceScope: instance.scope,
      origin: instance.scope === 'shared' ? 'admin' : 'user',
      context: { action: 'deactivate' },
    })
    return serviceInstanceCommand(instance.id)
  }

  if (payload.action === 'delete_instance') {
    try {
      await evolution.deleteInstance(configuredInstanceName(instance))
    } catch (error) {
      console.warn('Evolution deletion failed; local instance will still be removed.', {
        instanceId: instance.id,
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
    await repository.deleteInstance(instance.id)
    return serviceInstanceCommand(instance.id)
  }

  if (!payload.active) {
    try {
      await evolution.logout(configuredInstanceName(instance))
    } catch (error) {
      console.warn('Evolution logout failed while disabling the instance.', {
        instanceId: instance.id,
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }
  await repository.setActive(instance.id, actorId, payload.active)
  await repository.recordEvent({
    actorId,
    correlationId,
    eventType: 'instance_updated',
    instanceId: instance.id,
    instanceScope: instance.scope,
    origin: instance.scope === 'shared' ? 'admin' : 'user',
    context: { active: payload.active },
  })
  return serviceInstanceCommand(instance.id)
}
