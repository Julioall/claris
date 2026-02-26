import { createHandler } from '../_shared/http/mod.ts'
import { jsonResponse, errorResponse } from '../_shared/http/mod.ts'
import { generateTasks } from './service.ts'

Deno.serve(createHandler(async ({ body }) => {
  const { user_id } = body as { user_id?: string }
  const { automation_types } = body as { automation_types?: string[] }

  if (!user_id) {
    return errorResponse('Missing required field: user_id', 400)
  }

  const result = await generateTasks(user_id, automation_types)
  return jsonResponse(result)
}))
