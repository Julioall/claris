import { expectBodyObject, readOptionalString } from '../_shared/http/mod.ts'

export interface ClarisLlmTestPayload {
  provider?: string
  model?: string
  baseUrl?: string
  apiKey?: string
}

export function parseClarisLlmTestPayload(rawBody: unknown): ClarisLlmTestPayload {
  const body = expectBodyObject(rawBody)

  return {
    provider: readOptionalString(body, 'provider', 120),
    model: readOptionalString(body, 'model', 200),
    baseUrl: readOptionalString(body, 'baseUrl', 2048),
    apiKey: readOptionalString(body, 'apiKey', 2048),
  }
}
