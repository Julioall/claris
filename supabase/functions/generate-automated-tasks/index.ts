import { createHandler, errorResponse, jsonResponse } from '../_shared/http/mod.ts'
import { userHasPermission } from '../_shared/auth/mod.ts'
import { createServiceClient } from '../_shared/db/mod.ts'
import { generateTasks } from './service.ts'
import { parseGenerateAutomatedTasksPayload } from './payload.ts'

Deno.serve(createHandler(async ({ body, user }) => {
  const supabase = createServiceClient()
  const canUseAutomations = await userHasPermission(supabase, user.id, 'automations.view')

  if (!canUseAutomations) {
    return errorResponse('Permission denied for automations.', 403)
  }

  const result = await generateTasks(user.id, body.automationTypes)
  return jsonResponse(result)
}, { requireAuth: true, parseBody: parseGenerateAutomatedTasksPayload }))
