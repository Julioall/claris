import {
  expectBodyObject,
  readOptionalString,
  readRequiredMoodleUrl,
  readRequiredString,
} from '../_shared/http/mod.ts'

export interface MoodleAuthPayload {
  backgroundReauthEnabled?: boolean
  moodleUrl: string
  password: string
  service?: string
  username: string
}

export function parseMoodleAuthPayload(rawBody: unknown): MoodleAuthPayload {
  const body = expectBodyObject(rawBody)

  return {
    backgroundReauthEnabled:
      typeof body.backgroundReauthEnabled === 'boolean'
        ? body.backgroundReauthEnabled
        : undefined,
    moodleUrl: readRequiredMoodleUrl(body),
    password: readRequiredString(body, 'password', 1024),
    service: readOptionalString(body, 'service', 128),
    username: readRequiredString(body, 'username', 255),
  }
}
