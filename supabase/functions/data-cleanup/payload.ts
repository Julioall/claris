import {
  RequestBodyValidationError,
  expectBodyObject,
  readRequiredLiteral,
  readRequiredStringArray,
} from '../_shared/http/mod.ts'
import {
  CLEANUP_SELECTION_IDS,
  DATA_CLEANUP_CONFIRMATION,
  type CleanupMode,
  type CleanupSelectionId,
} from './contract.ts'

const CLEANUP_MODES = ['full_cleanup', 'selected_cleanup'] as const

export interface DataCleanupPayload {
  action: 'execute_cleanup'
  confirmation: typeof DATA_CLEANUP_CONFIRMATION
  mode: CleanupMode
  selectionIds?: CleanupSelectionId[]
}

function invalid(message: string): never {
  throw new RequestBodyValidationError(message, 422)
}

export function parseDataCleanupPayload(rawBody: unknown): DataCleanupPayload {
  const body = expectBodyObject(rawBody)
  const action = readRequiredLiteral(body, 'action', ['execute_cleanup'] as const)
  const mode = readRequiredLiteral(body, 'mode', CLEANUP_MODES)
  if (body.confirmation !== DATA_CLEANUP_CONFIRMATION) invalid('Invalid confirmation')
  const confirmation = DATA_CLEANUP_CONFIRMATION
  const allowedFields = mode === 'selected_cleanup'
    ? new Set(['action', 'confirmation', 'mode', 'selectionIds'])
    : new Set(['action', 'confirmation', 'mode'])

  if (Object.keys(body).some((field) => !allowedFields.has(field))) {
    invalid('Invalid request fields')
  }

  if (mode === 'selected_cleanup') {
    const selectionIds = readRequiredStringArray(body, 'selectionIds')
    if (
      selectionIds.length === 0
      || selectionIds.length > CLEANUP_SELECTION_IDS.length
      || new Set(selectionIds).size !== selectionIds.length
      || selectionIds.some((selectionId) => (
        !CLEANUP_SELECTION_IDS.includes(selectionId as CleanupSelectionId)
      ))
    ) {
      invalid('Invalid selectionIds')
    }

    return {
      action,
      confirmation,
      mode,
      selectionIds: selectionIds as CleanupSelectionId[],
    }
  }

  return { action, confirmation, mode }
}
