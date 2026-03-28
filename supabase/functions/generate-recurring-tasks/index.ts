import { createHandler, errorResponse, jsonResponse } from '../_shared/http/mod.ts'
import { userHasPermission } from '../_shared/auth/mod.ts'
import { createServiceClient } from '../_shared/db/mod.ts'
import { generateRecurringTasks } from './service.ts'

Deno.serve(createHandler(async ({ user }) => {
  const supabase = createServiceClient()
  const canUseAutomations = await userHasPermission(supabase, user.id, 'automations.view')

  if (!canUseAutomations) {
    return errorResponse('Permission denied for recurring automations.', 403)
  }

  const result = await generateRecurringTasks(user.id)
  return jsonResponse(result)
}, { requireAuth: true }))
