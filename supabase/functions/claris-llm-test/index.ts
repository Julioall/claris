// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../edge-runtime.d.ts" />

import { apiSuccessResponse, createHandler, jsonResponse } from '../_shared/http/mod.ts'
import { CLARIS_LLM_TEST_CONTRACT_VERSION } from './contract.ts'
import { parseClarisLlmTestPayload } from './payload.ts'
import { createClarisLlmTestRepository } from './repository.ts'
import { testClarisLlmConnection } from './service.ts'

const repository = createClarisLlmTestRepository()

Deno.serve(createHandler(async ({ body, correlationId }) => {
  const result = await testClarisLlmConnection(repository, body)

  return body.requestVersion === 'v1'
    ? apiSuccessResponse({
        contractVersion: CLARIS_LLM_TEST_CONTRACT_VERSION,
        latencyMs: result.latencyMs,
      }, correlationId)
    : jsonResponse({ success: true, ...result })
}, {
  authorize: ({ user }) => repository.isApplicationAdmin(user.id),
  maxBodyBytes: 16 * 1024,
  parseBody: parseClarisLlmTestPayload,
  requireAuth: true,
}))
