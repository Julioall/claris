import { expectBodyObject, readOptionalLiteral, readOptionalStringArray } from '../_shared/http/mod.ts'

const CLEANUP_MODES = ['full_cleanup', 'selected_cleanup'] as const

export type CleanupMode = typeof CLEANUP_MODES[number]

export interface DataCleanupPayload {
  mode: CleanupMode
  tables?: string[]
}

export function parseDataCleanupPayload(rawBody: unknown): DataCleanupPayload {
  const body = expectBodyObject(rawBody)

  return {
    mode: readOptionalLiteral(body, 'mode', CLEANUP_MODES) ?? 'full_cleanup',
    tables: readOptionalStringArray(body, 'tables'),
  }
}
