import {
  RequestBodyValidationError,
  expectBodyObject,
  isApiV1Request,
  readOptionalString,
} from '../_shared/http/mod.ts'

export interface ClarisLlmTestPayload {
  requestVersion: 'legacy' | 'v1'
  provider?: string
  model?: string
  baseUrl?: string
  apiKey?: string
}

function parseFields(body: Record<string, unknown>, requestVersion: 'legacy' | 'v1'): ClarisLlmTestPayload {
  return {
    requestVersion,
    provider: readOptionalString(body, 'provider', 120),
    model: readOptionalString(body, 'model', 200),
    baseUrl: readOptionalString(body, 'baseUrl', 2048),
    apiKey: readOptionalString(body, 'apiKey', 4096),
  }
}

export function parseClarisLlmTestPayload(rawBody: unknown, req?: Request): ClarisLlmTestPayload {
  const body = expectBodyObject(rawBody)
  if (req && isApiV1Request(req)) {
    const allowedFields = new Set(['action', 'provider', 'model', 'baseUrl', 'apiKey'])
    if (body.action !== 'test_connection' || Object.keys(body).some((field) => !allowedFields.has(field))) {
      throw new RequestBodyValidationError('Invalid request fields', 422)
    }
    return parseFields(body, 'v1')
  }

  return parseFields(body, 'legacy')
}
