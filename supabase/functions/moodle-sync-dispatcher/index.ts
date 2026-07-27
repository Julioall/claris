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
import { dispatchDueMoodleSyncs } from './service.ts'

interface DispatcherPayload {
  limit: number
}

const ALLOWED_FIELDS = new Set(['limit'])

function parseBody(raw: unknown): DispatcherPayload {
  const body = expectBodyObject(raw)
  if (Object.keys(body).some((field) => !ALLOWED_FIELDS.has(field))) {
    throw new RequestBodyValidationError('Invalid request fields', 422)
  }

  if (body.limit === undefined) return { limit: 25 }
  if (!Number.isSafeInteger(body.limit) || Number(body.limit) < 1 || Number(body.limit) > 100) {
    throw new RequestBodyValidationError('Invalid limit', 422)
  }
  return { limit: Number(body.limit) }
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

const handler = async ({ body, req }: HandlerContext<DispatcherPayload>): Promise<Response> => {
  if (!isAuthorized(req)) return errorResponse('Unauthorized', 401)

  const result = await dispatchDueMoodleSyncs(createServiceClient(), body.limit)

  return jsonResponse({
    contract_version: 2,
    ...result,
  })
}

Deno.serve(createHandler(handler, {
  maxBodyBytes: 8 * 1024,
  parseBody,
}))
