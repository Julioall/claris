import { createHandler } from '../_shared/http/mod.ts'
import { login, fallbackLogin } from './service.ts'
import { parseMoodleAuthPayload } from './payload.ts'

Deno.serve(createHandler(async ({ body }) => {
  const { moodleUrl, username, password, service } = body

  return await login({
    moodleUrl,
    username,
    password,
    service: service || 'moodle_mobile_app',
    onMoodleUnavailable: (tokenResponse) => fallbackLogin(username, password, tokenResponse),
  })
}, { parseBody: parseMoodleAuthPayload }))
