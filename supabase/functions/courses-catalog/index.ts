// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../edge-runtime.d.ts" />

import { apiSuccessResponse, createHandler } from '../_shared/http/mod.ts'
import { COURSE_CATALOG_MAX_BODY_BYTES } from './contract.ts'
import { parseCourseCatalogPayload } from './payload.ts'
import { createCourseCatalogRepository } from './repository.ts'
import { canExecuteCourseCatalogAction } from './rules.ts'
import { executeCourseCatalogAction } from './service.ts'

const repository = createCourseCatalogRepository()

Deno.serve(createHandler(async ({ body, correlationId, user }) => {
  const result = await executeCourseCatalogAction(repository, user.id, body)
  return apiSuccessResponse(result, correlationId)
}, {
  authorize: ({ body, user }) => canExecuteCourseCatalogAction(
    body.action,
    (permission) => repository.userHasPermission(user.id, permission),
  ),
  maxBodyBytes: COURSE_CATALOG_MAX_BODY_BYTES,
  parseBody: parseCourseCatalogPayload,
  requireAuth: true,
}))
