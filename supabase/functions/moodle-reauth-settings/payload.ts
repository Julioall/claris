import {
  expectBodyObject,
  readOptionalLiteral,
  readRequiredBoolean,
} from '../_shared/http/mod.ts'

export type MoodleReauthSettingsPayload =
  | { action: 'get_settings' }
  | { action: 'update_settings'; enabled: boolean }

const ACTIONS = ['get_settings', 'update_settings'] as const

export function parseMoodleReauthSettingsPayload(rawBody: unknown): MoodleReauthSettingsPayload {
  const body = expectBodyObject(rawBody)
  const action = readOptionalLiteral(body, 'action', ACTIONS) ?? 'update_settings'

  if (action === 'get_settings') return { action }
  return { action, enabled: readRequiredBoolean(body, 'enabled') }
}
