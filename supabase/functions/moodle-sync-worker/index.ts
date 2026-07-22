// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../edge-runtime.d.ts" />

import { createServiceClient } from '../_shared/db/mod.ts'
import {
  createHandler,
  errorResponse,
  expectBodyObject,
  jsonResponse,
  RequestBodyValidationError,
  type HandlerContext,
} from '../_shared/http/mod.ts'
import {
  DEFAULT_MOODLE_SYNC_BUDGET_MS,
  DEFAULT_MOODLE_SYNC_LEASE_SECONDS,
  runMoodleSyncJob,
} from '../_shared/domain/moodle-sync/job-runner.ts'
import { validateUuid } from '../_shared/validation/mod.ts'

interface WorkerPayload {
  budgetMs: number
  jobId: string | null
  leaseSeconds: number
  maxConnectionLeases: number
  maxSiteLeases: number
}

const ALLOWED_FIELDS = new Set([
  'budget_ms',
  'job_id',
  'lease_seconds',
  'max_connection_leases',
  'max_site_leases',
])

function boundedInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
  field: string,
): number {
  if (value === undefined) return fallback
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    throw new RequestBodyValidationError(`Invalid ${field}`, 422)
  }
  return Number(value)
}

function parseBody(raw: unknown): WorkerPayload {
  const body = expectBodyObject(raw)
  if (Object.keys(body).some((field) => !ALLOWED_FIELDS.has(field))) {
    throw new RequestBodyValidationError('Invalid request fields', 422)
  }

  const rawJobId = body.job_id
  const jobId = rawJobId === undefined || rawJobId === null
    ? null
    : typeof rawJobId === 'string' && validateUuid(rawJobId)
    ? rawJobId.toLowerCase()
    : null
  if (rawJobId !== undefined && rawJobId !== null && jobId === null) {
    throw new RequestBodyValidationError('Invalid job_id', 422)
  }

  const maxConnectionLeases = boundedInteger(
    body.max_connection_leases,
    2,
    1,
    20,
    'max_connection_leases',
  )
  const maxSiteLeases = boundedInteger(body.max_site_leases, 4, 1, 100, 'max_site_leases')
  if (maxConnectionLeases > maxSiteLeases) {
    throw new RequestBodyValidationError(
      'max_connection_leases cannot exceed max_site_leases',
      422,
    )
  }

  return {
    budgetMs: boundedInteger(body.budget_ms, DEFAULT_MOODLE_SYNC_BUDGET_MS, 1_000, 55_000, 'budget_ms'),
    jobId,
    leaseSeconds: boundedInteger(
      body.lease_seconds,
      DEFAULT_MOODLE_SYNC_LEASE_SECONDS,
      10,
      300,
      'lease_seconds',
    ),
    maxConnectionLeases,
    maxSiteLeases,
  }
}

function requestSecret(req: Request): string | null {
  return req.headers.get('x-moodle-sync-worker-secret')?.trim()
    || req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
    || null
}

function isAuthorized(req: Request): boolean {
  const expected = (Deno.env.get('MOODLE_SYNC_WORKER_CRON_SECRET') ?? '').trim()
  return expected.length >= 32 && requestSecret(req) === expected
}

const handler = async ({ body, req }: HandlerContext<WorkerPayload>): Promise<Response> => {
  if (!isAuthorized(req)) return errorResponse('Unauthorized', 401)

  const result = await runMoodleSyncJob(body.jobId, createServiceClient(), {
    budgetMs: body.budgetMs,
    leaseSeconds: body.leaseSeconds,
    maxConnectionLeases: body.maxConnectionLeases,
    maxSiteLeases: body.maxSiteLeases,
  })

  return jsonResponse({
    contract_version: 2,
    ...result,
  })
}

Deno.serve(createHandler(handler, {
  maxBodyBytes: 8 * 1024,
  parseBody,
}))
