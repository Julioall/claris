import { createHandler } from '../_shared/http/mod.ts'
import { login, fallbackLogin } from './service.ts'
import { parseMoodleAuthPayload } from './payload.ts'

Deno.serve(createHandler(async ({ body }) => {
  const { backgroundReauthEnabled, moodleUrl, username, password, service } = body

  return await login({
    backgroundReauthEnabled,
    moodleUrl,
    username,
    password,
    service: service || 'moodle_mobile_app',
    onMoodleUnavailable: (tokenResponse) =>
      fallbackLogin(
        username,
        password,
        tokenResponse,
        moodleUrl,
        service || 'moodle_mobile_app',
        backgroundReauthEnabled,
      ),
  })
}, { parseBody: parseMoodleAuthPayload }))
