// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../edge-runtime.d.ts" />

/**
 * Receive WhatsApp Webhook
 *
 * Accepts incoming webhook events from Evolution API v2.
 * Stores raw payload in app_service_webhook_events and updates
 * the corresponding instance's connection/health status.
 *
 * This endpoint does NOT require user auth – it uses a shared secret
 * header (X-Webhook-Secret) that must match WEBHOOK_SECRET env var.
 */

import { corsHeaders } from '../_shared/http/cors.ts'
import { jsonResponse, errorResponse } from '../_shared/http/response.ts'
import { createServiceClient } from '../_shared/db/mod.ts'

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify shared secret
    const webhookSecret = Deno.env.get('WEBHOOK_SECRET')
    if (webhookSecret) {
      const headerSecret = req.headers.get('X-Webhook-Secret') ?? req.headers.get('apikey') ?? ''
      if (headerSecret !== webhookSecret) {
        return errorResponse('Unauthorized', 401)
      }
    }

    let payload: Record<string, unknown> = {}
    try {
      payload = await req.json()
    } catch {
      return errorResponse('Invalid JSON body', 400)
    }

    const evolutionInstanceName = (payload.instance as string) ?? ''
    const eventType = (payload.event as string) ?? 'unknown'

    const db = createServiceClient()

    // Look up the instance by evolution name
    const { data: instance } = await db
      .from('app_service_instances')
      .select('id, scope, connection_status')
      .eq('evolution_instance_name', evolutionInstanceName)
      .maybeSingle()

    // Store raw webhook event
    const { data: webhookEvent } = await db
      .from('app_service_webhook_events')
      .insert({
        instance_id: instance?.id ?? null,
        evolution_instance_name: evolutionInstanceName,
        event_type: eventType,
        payload,
        processed: false,
      })
      .select('id')
      .single()

    // React to connection update events
    if (eventType === 'connection.update' || eventType === 'CONNECTION_UPDATE') {
      const data = payload.data as Record<string, unknown> | undefined
      const state = (data?.state as string) ?? ''

      let newStatus: string = instance?.connection_status ?? 'disconnected'
      if (state === 'open') newStatus = 'connected'
      else if (state === 'close') newStatus = 'disconnected'
      else if (state === 'connecting') newStatus = 'pending_connection'

      if (instance && newStatus !== instance.connection_status) {
        await db
          .from('app_service_instances')
          .update({
            connection_status: newStatus,
            operational_status: newStatus,
            last_activity_at: new Date().toISOString(),
          })
          .eq('id', instance.id)

        await db.from('app_service_instance_events').insert({
          instance_id: instance.id,
          instance_scope: instance.scope,
          event_type: newStatus === 'connected' ? 'connected' : 'disconnected',
          origin: 'webhook',
          context: { state, raw_event: eventType },
          status: 'success',
        })
      }
    }

    // Update last_activity_at on any message event
    if (
      (eventType.includes('message') || eventType.includes('MESSAGE')) &&
      instance
    ) {
      await db
        .from('app_service_instances')
        .update({ last_activity_at: new Date().toISOString() })
        .eq('id', instance.id)

      await db.from('app_service_instance_events').insert({
        instance_id: instance.id,
        instance_scope: instance.scope,
        event_type: 'webhook_received',
        origin: 'webhook',
        context: { event_type: eventType },
        status: 'success',
      })
    }

    // Mark this specific webhook event as processed
    if (webhookEvent?.id) {
      await db
        .from('app_service_webhook_events')
        .update({ processed: true, processed_at: new Date().toISOString() })
        .eq('id', webhookEvent.id)
    }

    return jsonResponse({ received: true })
  } catch (error) {
    console.error('Webhook processing error:', error)
    return errorResponse('Internal server error', 500)
  }
})
