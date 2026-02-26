import { createHandler } from '../_shared/http/mod.ts'
import { jsonResponse } from '../_shared/http/mod.ts'
import { validateMoodleUrl, validateString } from '../_shared/validation/mod.ts'
import { login, fallbackLogin } from './service.ts'

Deno.serve(createHandler(async ({ body }) => {
  const { moodleUrl, username, password, service } = body as Record<string, string>

  if (!moodleUrl || !validateMoodleUrl(moodleUrl)) {
    return jsonResponse({ error: 'Invalid Moodle URL format.' }, 400)
  }
  if (!username || !validateString(username, 255)) {
    return jsonResponse({ error: 'Invalid username.' }, 400)
  }
  if (!password || !validateString(password, 1024)) {
    return jsonResponse({ error: 'Invalid password.' }, 400)
  }
  if (service !== undefined && !validateString(service, 128)) {
    return jsonResponse({ error: 'Invalid service name.' }, 400)
  }

  return await login({
    moodleUrl,
    username,
    password,
    service: service || 'moodle_mobile_app',
    onMoodleUnavailable: (tokenResponse) => fallbackLogin(username, password, tokenResponse),
  })
}))
