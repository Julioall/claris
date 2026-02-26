import { createHandler } from '../_shared/http/mod.ts'
import { jsonResponse } from '../_shared/http/mod.ts'
import { generateRecurringTasks } from './service.ts'

Deno.serve(createHandler(async ({ req, body, user }) => {
  const result = await generateRecurringTasks(user.id)
  return jsonResponse(result)
}, { requireAuth: true }))
