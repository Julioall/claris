// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../edge-runtime.d.ts" />

/**
 * WhatsApp Instance Manager
 *
 * Handles all operations against Evolution API v2 for WhatsApp instances.
 * Supports: personal (one per user) and shared (admin-managed) instances.
 *
 * Actions (passed as ?action= query param or body.action):
 *   create          - Create a new instance (personal or shared)
 *   connect         - Initiate connection / generate QR code
 *   status          - Get current status from Evolution API
 *   qrcode          - Fetch QR code for pending connection
 *   configure-webhook - Register the webhook URL in Evolution API
 *   deactivate      - Disable the instance in Evolution API
 *   delete          - Remove instance from Evolution API and DB
 *   list            - List instances accessible to the current user
 */

import { createHandler, errorResponse, jsonResponse } from '../_shared/http/mod.ts'
import type { AuthenticatedHandlerContext } from '../_shared/http/mod.ts'
import { createServiceClient } from '../_shared/db/mod.ts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RequestBody {
  action: string
  instance_id?: string
  name?: string
  description?: string
  scope?: 'personal' | 'shared'
  // For create/update
  evolution_instance_name?: string
  send_window?: Record<string, unknown>
  limits?: Record<string, unknown>
  admin_notes?: string
  metadata?: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Helpers – Evolution API v2
// ---------------------------------------------------------------------------

function getEvolutionBaseUrl(): string {
  return Deno.env.get('EVOLUTION_API_URL') ?? ''
}

function getEvolutionApiKey(): string {
  return Deno.env.get('EVOLUTION_API_KEY') ?? ''
}

async function evolutionRequest(
  path: string,
  method: 'GET' | 'POST' | 'DELETE' | 'PUT',
  body?: unknown
): Promise<unknown> {
  const baseUrl = getEvolutionBaseUrl()
  const apiKey = getEvolutionApiKey()

  if (!baseUrl || !apiKey) {
    throw new Error('Evolution API not configured. Set EVOLUTION_API_URL and EVOLUTION_API_KEY.')
  }

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      apikey: apiKey,
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Evolution API error ${res.status}: ${text}`)
  }

  return res.json().catch(() => null)
}

// ---------------------------------------------------------------------------
// Helpers – Admin check
// ---------------------------------------------------------------------------

async function isAdmin(db: ReturnType<typeof createServiceClient>, userId: string): Promise<boolean> {
  const { data } = await db
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'admin')
    .maybeSingle()
  return !!data
}

// ---------------------------------------------------------------------------
// Helpers – Instance conflict check
// ---------------------------------------------------------------------------

/**
 * Returns true if a shared instance already exists for the same service_type.
 * Used to prevent creating a duplicate personal instance.
 */
async function sharedInstanceExists(
  db: ReturnType<typeof createServiceClient>,
  serviceType: string
): Promise<boolean> {
  const { data } = await db
    .from('app_service_instances')
    .select('id')
    .eq('service_type', serviceType)
    .eq('scope', 'shared')
    .eq('is_active', true)
    .maybeSingle()
  return !!data
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

async function handleCreate(
  db: ReturnType<typeof createServiceClient>,
  userId: string,
  body: RequestBody
): Promise<Response> {
  const scope = body.scope ?? 'personal'

  // Only admins can create shared instances
  if (scope === 'shared') {
    const admin = await isAdmin(db, userId)
    if (!admin) return errorResponse('Only administrators can create shared instances', 403)
  }

  if (scope === 'personal') {
    // Check for existing personal instance
    const { data: existing } = await db
      .from('app_service_instances')
      .select('id')
      .eq('owner_user_id', userId)
      .eq('service_type', 'whatsapp')
      .eq('scope', 'personal')
      .maybeSingle()

    if (existing) {
      return errorResponse('Você já possui uma instância pessoal de WhatsApp.', 409)
    }

    // Check conflict with shared instance
    const hasShared = await sharedInstanceExists(db, 'whatsapp')
    if (hasShared) {
      return errorResponse(
        'Já existe uma instância compartilhada de WhatsApp disponível no sistema. ' +
        'Utilize a instância compartilhada em vez de criar uma pessoal. ' +
        'Se você não tiver acesso, solicite ao administrador.',
        409
      )
    }
  }

  const randomSuffix = Math.random().toString(36).slice(2, 10)
  const instanceName = body.evolution_instance_name ?? `claris-${scope === 'personal' ? 'personal' : 'shared'}-${randomSuffix}`
  const displayName = body.name ?? (scope === 'personal' ? 'WhatsApp Pessoal' : 'WhatsApp Compartilhado')

  // Create in Evolution API
  let evolutionData: Record<string, unknown> = {}
  let externalId: string | null = null
  try {
    evolutionData = (await evolutionRequest('/instance/create', 'POST', {
      instanceName,
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS',
    })) as Record<string, unknown>
    const evoInstance = evolutionData.instance
    if (evoInstance && typeof evoInstance === 'object') {
      const instanceObj = evoInstance as Record<string, unknown>
      externalId = typeof instanceObj.instanceId === 'string' ? instanceObj.instanceId : null
    }
  } catch (err) {
    console.error('Evolution API create failed:', err)
    // Continue – instance will be in draft state
  }

  const { data: instance, error } = await db
    .from('app_service_instances')
    .insert({
      name: displayName,
      description: body.description ?? null,
      service_type: 'whatsapp',
      provider: 'evolution_api',
      scope,
      owner_user_id: scope === 'personal' ? userId : null,
      evolution_instance_name: instanceName,
      external_id: externalId,
      connection_status: 'draft',
      operational_status: 'draft',
      health_status: 'healthy',
      send_window: body.send_window ?? null,
      limits: body.limits ?? null,
      metadata: body.metadata ?? {},
      created_by_user_id: userId,
      updated_by_user_id: userId,
    })
    .select()
    .single()

  if (error) {
    console.error('DB insert error:', error)
    return errorResponse('Failed to create instance: ' + error.message, 500)
  }

  // Log event
  await db.from('app_service_instance_events').insert({
    instance_id: instance.id,
    instance_scope: scope,
    event_type: 'instance_created',
    origin: 'user',
    context: { name: displayName, scope },
    status: 'success',
    actor_user_id: userId,
  })

  return jsonResponse({ instance, evolution: evolutionData })
}

async function handleConnect(
  db: ReturnType<typeof createServiceClient>,
  userId: string,
  body: RequestBody
): Promise<Response> {
  if (!body.instance_id) return errorResponse('instance_id required', 400)

  const { data: instance } = await db
    .from('app_service_instances')
    .select('*')
    .eq('id', body.instance_id)
    .maybeSingle()

  if (!instance) return errorResponse('Instance not found', 404)

  // Permission check
  if (instance.scope === 'personal' && instance.owner_user_id !== userId) {
    return errorResponse('Forbidden', 403)
  }
  if (instance.scope === 'shared') {
    const admin = await isAdmin(db, userId)
    if (!admin) return errorResponse('Only administrators can connect shared instances', 403)
  }

  let evolutionData: unknown = {}
  try {
    evolutionData = await evolutionRequest(
      `/instance/connect/${instance.evolution_instance_name}`,
      'GET'
    )
  } catch (err) {
    console.error('Evolution connect error:', err)
  }

  // Update status
  await db
    .from('app_service_instances')
    .update({
      connection_status: 'pending_connection',
      operational_status: 'pending_connection',
      updated_by_user_id: userId,
    })
    .eq('id', instance.id)

  await db.from('app_service_instance_events').insert({
    instance_id: instance.id,
    instance_scope: instance.scope,
    event_type: 'connected',
    origin: 'user',
    context: { action: 'connect_initiated' },
    status: 'pending',
    actor_user_id: userId,
  })

  return jsonResponse({ evolution: evolutionData })
}

async function handleStatus(
  db: ReturnType<typeof createServiceClient>,
  userId: string,
  body: RequestBody
): Promise<Response> {
  if (!body.instance_id) return errorResponse('instance_id required', 400)

  const { data: instance } = await db
    .from('app_service_instances')
    .select('*')
    .eq('id', body.instance_id)
    .maybeSingle()

  if (!instance) return errorResponse('Instance not found', 404)

  // Permission check
  if (instance.scope === 'personal' && instance.owner_user_id !== userId) {
    return errorResponse('Forbidden', 403)
  }

  let evolutionStatus: Record<string, unknown> = {}
  let connectionStatus = instance.connection_status
  let healthStatus = instance.health_status

  try {
    evolutionStatus = (await evolutionRequest(
      `/instance/connectionState/${instance.evolution_instance_name}`,
      'GET'
    )) as Record<string, unknown>

    // Map Evolution states to our statuses
    const evoInstance = evolutionStatus.instance
    if (evoInstance && typeof evoInstance === 'object') {
      const instanceObj = evoInstance as Record<string, unknown>
      const state = typeof instanceObj.state === 'string' ? instanceObj.state : ''
      if (state === 'open') {
        connectionStatus = 'connected'
        healthStatus = 'healthy'
      } else if (state === 'close') {
        connectionStatus = 'disconnected'
      } else if (state === 'connecting') {
        connectionStatus = 'pending_connection'
      }
    }
  } catch (err) {
    console.error('Evolution status error:', err)
    healthStatus = 'warning'
  }

  // Update DB
  const now = new Date().toISOString()
  await db
    .from('app_service_instances')
    .update({
      connection_status: connectionStatus,
      health_status: healthStatus,
      last_sync_at: now,
      updated_by_user_id: userId,
    })
    .eq('id', instance.id)

  // Log health check
  await db.from('app_service_instance_health_logs').insert({
    instance_id: instance.id,
    health_status: healthStatus,
    connection_status: connectionStatus,
    details: evolutionStatus,
    checked_at: now,
  })

  await db.from('app_service_instance_events').insert({
    instance_id: instance.id,
    instance_scope: instance.scope,
    event_type: 'status_synced',
    origin: 'user',
    context: { connection_status: connectionStatus, health_status: healthStatus },
    status: 'success',
    actor_user_id: userId,
  })

  return jsonResponse({
    connection_status: connectionStatus,
    health_status: healthStatus,
    evolution: evolutionStatus,
  })
}

async function handleQrCode(
  db: ReturnType<typeof createServiceClient>,
  userId: string,
  body: RequestBody
): Promise<Response> {
  if (!body.instance_id) return errorResponse('instance_id required', 400)

  const { data: instance } = await db
    .from('app_service_instances')
    .select('*')
    .eq('id', body.instance_id)
    .maybeSingle()

  if (!instance) return errorResponse('Instance not found', 404)

  if (instance.scope === 'personal' && instance.owner_user_id !== userId) {
    return errorResponse('Forbidden', 403)
  }
  if (instance.scope === 'shared') {
    const admin = await isAdmin(db, userId)
    if (!admin) return errorResponse('Only administrators can access shared instance QR code', 403)
  }

  try {
    const data = await evolutionRequest(
      `/instance/connect/${instance.evolution_instance_name}`,
      'GET'
    )
    return jsonResponse({ qrcode: data })
  } catch (err) {
    return errorResponse(`Failed to get QR code: ${err instanceof Error ? err.message : 'Unknown error'}`, 500)
  }
}

async function handleConfigureWebhook(
  db: ReturnType<typeof createServiceClient>,
  userId: string,
  body: RequestBody
): Promise<Response> {
  if (!body.instance_id) return errorResponse('instance_id required', 400)

  const { data: instance } = await db
    .from('app_service_instances')
    .select('*')
    .eq('id', body.instance_id)
    .maybeSingle()

  if (!instance) return errorResponse('Instance not found', 404)

  if (instance.scope === 'shared') {
    const admin = await isAdmin(db, userId)
    if (!admin) return errorResponse('Forbidden', 403)
  } else if (instance.owner_user_id !== userId) {
    return errorResponse('Forbidden', 403)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const webhookUrl = `${supabaseUrl}/functions/v1/receive-whatsapp-webhook`

  try {
    const data = await evolutionRequest(
      `/webhook/set/${instance.evolution_instance_name}`,
      'POST',
      {
        webhook: {
          enabled: true,
          url: webhookUrl,
          webhookByEvents: false,
          webhookBase64: false,
          events: [
            'QRCODE_UPDATED',
            'CONNECTION_UPDATE',
            'MESSAGES_UPSERT',
            'MESSAGES_UPDATE',
            'SEND_MESSAGE',
          ],
        },
      }
    )
    return jsonResponse({ webhook: data, url: webhookUrl })
  } catch (err) {
    return errorResponse(`Failed to configure webhook: ${err instanceof Error ? err.message : 'Unknown error'}`, 500)
  }
}

async function handleDeactivate(
  db: ReturnType<typeof createServiceClient>,
  userId: string,
  body: RequestBody
): Promise<Response> {
  if (!body.instance_id) return errorResponse('instance_id required', 400)

  const { data: instance } = await db
    .from('app_service_instances')
    .select('*')
    .eq('id', body.instance_id)
    .maybeSingle()

  if (!instance) return errorResponse('Instance not found', 404)

  if (instance.scope === 'shared') {
    const admin = await isAdmin(db, userId)
    if (!admin) return errorResponse('Forbidden', 403)
  } else if (instance.owner_user_id !== userId) {
    return errorResponse('Forbidden', 403)
  }

  try {
    await evolutionRequest(`/instance/logout/${instance.evolution_instance_name}`, 'DELETE')
  } catch (err) {
    console.error('Evolution deactivate error:', err)
  }

  await db
    .from('app_service_instances')
    .update({
      connection_status: 'disconnected',
      operational_status: 'disabled',
      is_active: false,
      updated_by_user_id: userId,
    })
    .eq('id', instance.id)

  await db.from('app_service_instance_events').insert({
    instance_id: instance.id,
    instance_scope: instance.scope,
    event_type: 'disconnected',
    origin: 'user',
    context: { action: 'deactivate' },
    status: 'success',
    actor_user_id: userId,
  })

  return jsonResponse({ success: true })
}

async function handleDelete(
  db: ReturnType<typeof createServiceClient>,
  userId: string,
  body: RequestBody
): Promise<Response> {
  if (!body.instance_id) return errorResponse('instance_id required', 400)

  const { data: instance } = await db
    .from('app_service_instances')
    .select('*')
    .eq('id', body.instance_id)
    .maybeSingle()

  if (!instance) return errorResponse('Instance not found', 404)

  if (instance.scope === 'shared') {
    const admin = await isAdmin(db, userId)
    if (!admin) return errorResponse('Forbidden', 403)
  } else if (instance.owner_user_id !== userId) {
    return errorResponse('Forbidden', 403)
  }

  // Remove from Evolution API
  try {
    await evolutionRequest(`/instance/delete/${instance.evolution_instance_name}`, 'DELETE')
  } catch (err) {
    console.error('Evolution delete error:', err)
  }

  // Log before deleting (cascade will remove related records)
  await db.from('app_service_instance_events').insert({
    instance_id: instance.id,
    instance_scope: instance.scope,
    event_type: 'instance_deleted',
    origin: 'user',
    context: { name: instance.name },
    status: 'success',
    actor_user_id: userId,
  })

  const { error } = await db
    .from('app_service_instances')
    .delete()
    .eq('id', instance.id)

  if (error) return errorResponse('Failed to delete instance: ' + error.message, 500)

  return jsonResponse({ success: true })
}

async function handleList(
  db: ReturnType<typeof createServiceClient>,
  userId: string
): Promise<Response> {
  const admin = await isAdmin(db, userId)

  let query = db
    .from('app_service_instances')
    .select('id, name, description, service_type, scope, connection_status, operational_status, health_status, is_active, is_blocked, last_activity_at, last_sync_at, created_at, owner_user_id, evolution_instance_name')
    .order('created_at', { ascending: false })

  if (!admin) {
    // Non-admins can see their personal instance + shared instances
    query = query.or(`owner_user_id.eq.${userId},scope.eq.shared`)
  }

  const { data, error } = await query

  if (error) return errorResponse('Failed to list instances: ' + error.message, 500)

  return jsonResponse({ instances: data ?? [] })
}

async function handleUpdate(
  db: ReturnType<typeof createServiceClient>,
  userId: string,
  body: RequestBody
): Promise<Response> {
  if (!body.instance_id) return errorResponse('instance_id required', 400)

  const { data: instance } = await db
    .from('app_service_instances')
    .select('*')
    .eq('id', body.instance_id)
    .maybeSingle()

  if (!instance) return errorResponse('Instance not found', 404)

  if (instance.scope === 'shared') {
    const admin = await isAdmin(db, userId)
    if (!admin) return errorResponse('Forbidden', 403)
  } else if (instance.owner_user_id !== userId) {
    return errorResponse('Forbidden', 403)
  }

  const updates: Record<string, unknown> = { updated_by_user_id: userId }
  if (body.name !== undefined) updates.name = body.name
  if (body.description !== undefined) updates.description = body.description
  if (body.send_window !== undefined) updates.send_window = body.send_window
  if (body.limits !== undefined) updates.limits = body.limits
  if (body.admin_notes !== undefined && (await isAdmin(db, userId))) {
    updates.admin_notes = body.admin_notes
  }
  if (body.metadata !== undefined) updates.metadata = body.metadata

  const { data: updated, error } = await db
    .from('app_service_instances')
    .update(updates)
    .eq('id', instance.id)
    .select()
    .single()

  if (error) return errorResponse('Failed to update instance: ' + error.message, 500)

  await db.from('app_service_instance_events').insert({
    instance_id: instance.id,
    instance_scope: instance.scope,
    event_type: 'instance_updated',
    origin: 'user',
    context: { fields: Object.keys(updates) },
    status: 'success',
    actor_user_id: userId,
  })

  return jsonResponse({ instance: updated })
}

async function handleToggleBlock(
  db: ReturnType<typeof createServiceClient>,
  userId: string,
  body: RequestBody & { blocked: boolean }
): Promise<Response> {
  if (!body.instance_id) return errorResponse('instance_id required', 400)

  const admin = await isAdmin(db, userId)
  if (!admin) return errorResponse('Only administrators can block/unblock instances', 403)

  const { data: instance } = await db
    .from('app_service_instances')
    .select('id, scope')
    .eq('id', body.instance_id)
    .maybeSingle()

  if (!instance) return errorResponse('Instance not found', 404)

  await db
    .from('app_service_instances')
    .update({ is_blocked: body.blocked, updated_by_user_id: userId })
    .eq('id', body.instance_id)

  await db.from('app_service_instance_events').insert({
    instance_id: instance.id,
    instance_scope: instance.scope,
    event_type: 'preventive_blocked',
    origin: 'admin',
    context: { blocked: body.blocked },
    status: 'success',
    actor_user_id: userId,
  })

  return jsonResponse({ success: true, blocked: body.blocked })
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

async function handleSetActive(
  db: ReturnType<typeof createServiceClient>,
  userId: string,
  body: RequestBody,
  active: boolean
): Promise<Response> {
  if (!body.instance_id) return errorResponse('instance_id required', 400)

  const { data: instance } = await db
    .from('app_service_instances')
    .select('id, scope, owner_user_id')
    .eq('id', body.instance_id)
    .maybeSingle()

  if (!instance) return errorResponse('Instance not found', 404)

  if (instance.scope === 'shared') {
    const admin = await isAdmin(db, userId)
    if (!admin) return errorResponse('Forbidden', 403)
  } else if (instance.owner_user_id !== userId) {
    return errorResponse('Forbidden', 403)
  }

  await db
    .from('app_service_instances')
    .update({ is_active: active, updated_by_user_id: userId })
    .eq('id', body.instance_id)

  return jsonResponse({ success: true, is_active: active })
}

const handler = async ({ body, user }: AuthenticatedHandlerContext<RequestBody>): Promise<Response> => {
  const db = createServiceClient()
  const userId = user.id
  const action = body.action

  switch (action) {
    case 'create':        return handleCreate(db, userId, body)
    case 'connect':       return handleConnect(db, userId, body)
    case 'status':        return handleStatus(db, userId, body)
    case 'qrcode':        return handleQrCode(db, userId, body)
    case 'configure-webhook': return handleConfigureWebhook(db, userId, body)
    case 'deactivate':    return handleDeactivate(db, userId, body)
    case 'delete':        return handleDelete(db, userId, body)
    case 'list':          return handleList(db, userId)
    case 'update':        return handleUpdate(db, userId, body)
    case 'block':
      return handleToggleBlock(db, userId, { ...body, blocked: true })
    case 'unblock':
      return handleToggleBlock(db, userId, { ...body, blocked: false })
    case 'activate':
      return handleSetActive(db, userId, body, true)
    default:
      return errorResponse(`Unknown action: ${action}`, 400)
  }
}

Deno.serve(createHandler(handler, { requireAuth: true }))
