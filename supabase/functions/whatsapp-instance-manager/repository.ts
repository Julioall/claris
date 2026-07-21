import { isApplicationAdmin, userHasPermission } from '../_shared/auth/mod.ts'
import {
  createServiceClient,
  type AppSupabaseClient,
  type Json,
  type Tables,
} from '../_shared/db/mod.ts'

export type ServiceInstanceRow = Tables<'app_service_instances'>
export type ServiceInstanceEventRow = Tables<'app_service_instance_events'>

export type CreateServiceInstanceResult =
  | { kind: 'created'; instance: ServiceInstanceRow }
  | { kind: 'conflict' }

export interface ServiceInstanceRepository {
  createInstance(input: {
    actorId: string
    adminNotes: string | null
    description: string | null
    evolutionInstanceName: string
    name: string
    ownerUserId: string | null
    phoneNumber: string | null
    scope: 'personal' | 'shared'
  }): Promise<CreateServiceInstanceResult>
  deleteInstance(instanceId: string): Promise<void>
  findInstance(instanceId: string): Promise<ServiceInstanceRow | null>
  findPersonalWhatsAppInstance(actorId: string): Promise<ServiceInstanceRow | null>
  hasActiveSharedWhatsAppInstance(): Promise<boolean>
  hasPermission(actorId: string, permissionKey: string): Promise<boolean>
  isApplicationAdmin(actorId: string): Promise<boolean>
  listEvents(instanceId: string, limit: number): Promise<ServiceInstanceEventRow[]>
  listSharedWhatsAppInstances(): Promise<ServiceInstanceRow[]>
  recordEvent(input: {
    actorId: string
    context?: Json
    correlationId: string
    eventType: string
    instanceId: string
    instanceScope: string
    origin: 'admin' | 'user'
    status?: 'failure' | 'pending' | 'success'
  }): Promise<void>
  recordHealth(input: {
    connectionStatus: string
    details: unknown
    healthStatus: string
    instanceId: string
    timestamp: string
  }): Promise<void>
  setActive(instanceId: string, actorId: string, active: boolean): Promise<void>
  setBlocked(instanceId: string, actorId: string, blocked: boolean): Promise<void>
  setExternalId(instanceId: string, externalId: string): Promise<void>
  setPendingConnection(instanceId: string, actorId: string): Promise<void>
  setStatus(input: {
    actorId: string
    connectionStatus: string
    healthStatus: string
    instanceId: string
    silent: boolean
    timestamp: string
  }): Promise<void>
  updateInstance(instanceId: string, actorId: string, input: {
    adminNotes?: string | null
    description?: string | null
    name: string
  }): Promise<ServiceInstanceRow>
}

function errorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object' || Array.isArray(error)) return null
  const code = (error as Record<string, unknown>).code
  return typeof code === 'string' ? code : null
}

function throwIfError(error: unknown): void {
  if (error) throw error
}

export function createServiceInstanceRepository(
  supabase: AppSupabaseClient = createServiceClient(),
): ServiceInstanceRepository {
  return {
    isApplicationAdmin(actorId) {
      return isApplicationAdmin(supabase, actorId)
    },

    hasPermission(actorId, permissionKey) {
      return userHasPermission(supabase, actorId, permissionKey)
    },

    async findPersonalWhatsAppInstance(actorId) {
      const { data, error } = await supabase
        .from('app_service_instances')
        .select('*')
        .eq('owner_user_id', actorId)
        .eq('service_type', 'whatsapp')
        .eq('scope', 'personal')
        .maybeSingle()
      throwIfError(error)
      return data
    },

    async listEvents(instanceId, limit) {
      const { data, error } = await supabase
        .from('app_service_instance_events')
        .select('*')
        .eq('instance_id', instanceId)
        .order('created_at', { ascending: false })
        .limit(limit)
      throwIfError(error)
      return data ?? []
    },

    async listSharedWhatsAppInstances() {
      const { data, error } = await supabase
        .from('app_service_instances')
        .select('*')
        .eq('service_type', 'whatsapp')
        .eq('scope', 'shared')
        .order('created_at', { ascending: false })
      throwIfError(error)
      return data ?? []
    },

    async findInstance(instanceId) {
      const { data, error } = await supabase
        .from('app_service_instances')
        .select('*')
        .eq('id', instanceId)
        .maybeSingle()
      throwIfError(error)
      return data
    },

    async hasActiveSharedWhatsAppInstance() {
      const { data, error } = await supabase
        .from('app_service_instances')
        .select('id')
        .eq('service_type', 'whatsapp')
        .eq('scope', 'shared')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle()
      throwIfError(error)
      return data !== null
    },

    async createInstance(input) {
      const { data, error } = await supabase
        .from('app_service_instances')
        .insert({
          name: input.name,
          description: input.description,
          service_type: 'whatsapp',
          provider: 'evolution_api',
          scope: input.scope,
          owner_user_id: input.ownerUserId,
          evolution_instance_name: input.evolutionInstanceName,
          connection_status: 'draft',
          operational_status: 'draft',
          health_status: 'healthy',
          admin_notes: input.adminNotes,
          metadata: input.phoneNumber ? { phone_number: input.phoneNumber } : {},
          created_by_user_id: input.actorId,
          updated_by_user_id: input.actorId,
        })
        .select('*')
        .single()
      if (errorCode(error) === '23505') return { kind: 'conflict' }
      throwIfError(error)
      if (!data) throw new Error('Service instance insert returned no row')
      return { kind: 'created', instance: data }
    },

    async updateInstance(instanceId, actorId, input) {
      const { data, error } = await supabase
        .from('app_service_instances')
        .update({
          name: input.name,
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.adminNotes !== undefined ? { admin_notes: input.adminNotes } : {}),
          updated_by_user_id: actorId,
        })
        .eq('id', instanceId)
        .select('*')
        .single()
      throwIfError(error)
      if (!data) throw new Error('Service instance update returned no row')
      return data
    },

    async setExternalId(instanceId, externalId) {
      const { error } = await supabase
        .from('app_service_instances')
        .update({ external_id: externalId })
        .eq('id', instanceId)
      throwIfError(error)
    },

    async setPendingConnection(instanceId, actorId) {
      const { error } = await supabase
        .from('app_service_instances')
        .update({
          connection_status: 'pending_connection',
          operational_status: 'pending_connection',
          updated_by_user_id: actorId,
        })
        .eq('id', instanceId)
      throwIfError(error)
    },

    async setStatus(input) {
      const { error } = await supabase
        .from('app_service_instances')
        .update({
          connection_status: input.connectionStatus,
          health_status: input.healthStatus,
          last_sync_at: input.timestamp,
          ...(!input.silent ? { updated_by_user_id: input.actorId } : {}),
        })
        .eq('id', input.instanceId)
      throwIfError(error)
    },

    async setBlocked(instanceId, actorId, blocked) {
      const { error } = await supabase
        .from('app_service_instances')
        .update({ is_blocked: blocked, updated_by_user_id: actorId })
        .eq('id', instanceId)
      throwIfError(error)
    },

    async setActive(instanceId, actorId, active) {
      const { error } = await supabase
        .from('app_service_instances')
        .update({
          is_active: active,
          ...(!active
            ? { connection_status: 'disconnected', operational_status: 'disabled' }
            : {}),
          updated_by_user_id: actorId,
        })
        .eq('id', instanceId)
      throwIfError(error)
    },

    async deleteInstance(instanceId) {
      const { error } = await supabase
        .from('app_service_instances')
        .delete()
        .eq('id', instanceId)
      throwIfError(error)
    },

    async recordEvent(input) {
      const { error } = await supabase.from('app_service_instance_events').insert({
        instance_id: input.instanceId,
        instance_scope: input.instanceScope,
        event_type: input.eventType,
        origin: input.origin,
        context: input.context ?? {},
        status: input.status ?? 'success',
        actor_user_id: input.actorId,
        correlation_id: input.correlationId,
      })
      throwIfError(error)
    },

    async recordHealth(input) {
      const { error } = await supabase.from('app_service_instance_health_logs').insert({
        instance_id: input.instanceId,
        health_status: input.healthStatus,
        connection_status: input.connectionStatus,
        details: input.details as Json,
        checked_at: input.timestamp,
      })
      throwIfError(error)
    },
  }
}
