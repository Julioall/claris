import {
  RequestBodyValidationError,
  expectBodyObject,
  readOptionalUuid,
  readRequiredBoolean,
  readRequiredLiteral,
  readRequiredUuid,
} from '../_shared/http/mod.ts'
import { MOODLE_SYNC_ROLLOUT_CAPABILITIES, type MoodleSyncRolloutCapability } from '../_shared/domain/moodle-sync/rollout.ts'

export type MoodleSyncRolloutsPayload =
  | { action: 'list_rollouts' }
  | {
      action: 'set_rollout'
      capability: MoodleSyncRolloutCapability
      enabled: boolean
      moodleSiteId: string
      userId?: string
    }

function invalid(message: string): never {
  throw new RequestBodyValidationError(message, 422)
}

export function parseMoodleSyncRolloutsPayload(raw: unknown): MoodleSyncRolloutsPayload {
  const body = expectBodyObject(raw)
  if (body.action === 'list_rollouts') {
    if (Object.keys(body).some((key) => key !== 'action')) invalid('Invalid request fields')
    return { action: 'list_rollouts' }
  }
  if (body.action === 'set_rollout') {
    const allowed = new Set(['action', 'capability', 'enabled', 'moodleSiteId', 'userId'])
    if (Object.keys(body).some((key) => !allowed.has(key))) invalid('Invalid request fields')
    return {
      action: 'set_rollout',
      capability: readRequiredLiteral(body, 'capability', MOODLE_SYNC_ROLLOUT_CAPABILITIES),
      enabled: readRequiredBoolean(body, 'enabled'),
      moodleSiteId: readRequiredUuid(body, 'moodleSiteId'),
      userId: readOptionalUuid(body, 'userId'),
    }
  }
  return invalid('Invalid action')
}
