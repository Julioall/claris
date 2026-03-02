import { createHandler } from '../_shared/http/mod.ts'
import { jsonResponse } from '../_shared/http/mod.ts'
import { generateTasks } from './service.ts'

Deno.serve(createHandler(async ({ body, user }) => {
  const { automation_types } = body as { automation_types?: string[] }

  const result = await generateTasks(user.id, automation_types)
  return jsonResponse(result)
}, { requireAuth: true }))
