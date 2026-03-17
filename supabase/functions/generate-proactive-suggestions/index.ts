/**
 * generate-proactive-suggestions
 *
 * Analyses platform data across 6 trigger engines and creates
 * proactive suggestions for the authenticated tutor/monitor.
 *
 * Engines:
 *  1. Communication  — unanswered messages, interrupted contacts
 *  2. Agenda         — events without prep, schedule conflicts
 *  3. Tasks          — overdue / stalled tasks
 *  4. Academic       — students/classes/UCs without activity
 *  5. Operational    — old pendings, manual recurring flows
 *  6. Platform Usage — unused modules, repetitive patterns
 *
 * Each engine checks cooldowns before generating to avoid repetition.
 */

import { createHandler, jsonResponse } from '../_shared/http/mod.ts'
import { createServiceClient } from '../_shared/db/mod.ts'
import { runEngines } from './service.ts'

Deno.serve(createHandler(async ({ user }) => {
  const supabase = createServiceClient()
  const result = await runEngines(user.id, supabase)
  return jsonResponse(result)
}, { requireAuth: true }))
