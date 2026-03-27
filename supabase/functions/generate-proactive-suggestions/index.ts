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
import {
  appendBackgroundJobEvent,
  createBackgroundJobItems,
  upsertBackgroundJob,
} from '../_shared/domain/background-jobs/repository.ts'
import { runEngines } from './service.ts'

const ENGINE_LABELS = {
  communication: 'Comunicacao',
  agenda: 'Agenda',
  tasks: 'Tarefas',
  academic: 'Academico',
  operational: 'Operacional',
  platform_usage: 'Uso da plataforma',
} as const

type EngineKey = keyof typeof ENGINE_LABELS

async function syncBackgroundJob(task: () => Promise<void>) {
  try {
    await task()
  } catch (error) {
    console.error('[generate-proactive-suggestions][background-jobs] sync failed:', error)
  }
}

async function recordSuccessfulProactiveSuggestionJob(
  supabase: ReturnType<typeof createServiceClient>,
  input: {
    completedAt: string
    details: Record<EngineKey, number>
    startedAt: string
    suggestionsCreated: number
    userId: string
  },
) {
  if (input.suggestionsCreated <= 0) return

  const jobId = crypto.randomUUID()
  const engineEntries = Object.entries(input.details) as Array<[EngineKey, number]>

  await upsertBackgroundJob(supabase, {
    id: jobId,
    userId: input.userId,
    jobType: 'proactive_suggestion_generation',
    source: 'claris',
    title: 'Geracao de sugestoes proativas',
    description: 'Execucao dos motores de sugestao da Claris IA.',
    status: 'completed',
    totalItems: engineEntries.length,
    processedItems: engineEntries.length,
    successCount: engineEntries.length,
    errorCount: 0,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    metadata: {
      background_activity_visibility: 'hidden',
      suggestions_created: input.suggestionsCreated,
    },
  })

  await createBackgroundJobItems(supabase, engineEntries.map(([engine, createdCount]) => ({
    jobId,
    userId: input.userId,
    itemKey: engine,
    label: ENGINE_LABELS[engine],
    status: 'completed',
    progressCurrent: createdCount,
    progressTotal: createdCount,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    metadata: {
      suggestions_created: createdCount,
      trigger_engine: engine,
    },
  })))

  await appendBackgroundJobEvent(supabase, {
    userId: input.userId,
    jobId,
    eventType: 'job_completed',
    message: `${input.suggestionsCreated} sugestao(oes) proativa(s) gerada(s).`,
    metadata: {
      details: input.details,
    },
  })
}

async function recordFailedProactiveSuggestionJob(
  supabase: ReturnType<typeof createServiceClient>,
  input: {
    completedAt: string
    errorMessage: string
    startedAt: string
    userId: string
  },
) {
  const jobId = crypto.randomUUID()

  await upsertBackgroundJob(supabase, {
    id: jobId,
    userId: input.userId,
    jobType: 'proactive_suggestion_generation',
    source: 'claris',
    title: 'Geracao de sugestoes proativas',
    description: 'Execucao dos motores de sugestao da Claris IA.',
    status: 'failed',
    totalItems: 0,
    processedItems: 0,
    successCount: 0,
    errorCount: 1,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    errorMessage: input.errorMessage,
    metadata: {
      background_activity_visibility: 'hidden',
    },
  })

  await appendBackgroundJobEvent(supabase, {
    userId: input.userId,
    jobId,
    eventType: 'job_failed',
    level: 'error',
    message: input.errorMessage,
  })
}

Deno.serve(createHandler(async ({ user }) => {
  const supabase = createServiceClient()
  const startedAt = new Date().toISOString()

  try {
    const result = await runEngines(user.id, supabase)

    await syncBackgroundJob(async () => {
      await recordSuccessfulProactiveSuggestionJob(supabase, {
        completedAt: new Date().toISOString(),
        details: result.details,
        startedAt,
        suggestionsCreated: result.suggestions_created,
        userId: user.id,
      })
    })

    return jsonResponse(result)
  } catch (error) {
    const errorMessage = error instanceof Error
      ? error.message
      : 'Falha inesperada ao gerar sugestoes proativas.'

    await syncBackgroundJob(async () => {
      await recordFailedProactiveSuggestionJob(supabase, {
        completedAt: new Date().toISOString(),
        errorMessage,
        startedAt,
        userId: user.id,
      })
    })

    throw error
  }
}, { requireAuth: true }))
