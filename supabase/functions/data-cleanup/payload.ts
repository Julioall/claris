import { expectBodyObject, readRequiredLiteral } from '../_shared/http/mod.ts'

const CLEANUP_MODES = ['full_cleanup'] as const

export type CleanupMode = typeof CLEANUP_MODES[number]

export interface DataCleanupPayload {
  mode: CleanupMode
}

export function parseDataCleanupPayload(rawBody: unknown): DataCleanupPayload {
  const body = expectBodyObject(rawBody)

  return {
    mode: readRequiredLiteral(body, 'mode', CLEANUP_MODES),
  }
}