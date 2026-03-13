import { createHandler } from '../_shared/http/mod.ts'
import { jsonResponse } from '../_shared/http/mod.ts'
import { generateTasks } from './service.ts'
import { parseGenerateAutomatedTasksPayload } from './payload.ts'

Deno.serve(createHandler(async ({ body, user }) => {
  const result = await generateTasks(user.id, body.automationTypes)
  return jsonResponse(result)
}, { requireAuth: true, parseBody: parseGenerateAutomatedTasksPayload }))
