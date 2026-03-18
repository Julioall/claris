import type { MoodleTokenResponse, MoodleCourse, MoodleCategory, MoodleEnrolledUser, MoodleSiteInfo } from './types.ts'

const INVALID_PARAMETER_MESSAGE = 'valor inválido de parâmetro'

function isInvalidParameterError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  return message.includes(INVALID_PARAMETER_MESSAGE)
}

async function callGetEnrolledUsers(
  moodleUrl: string,
  token: string,
  courseId: number,
  extraParams: Record<string, string | number> = {}
): Promise<unknown[]> {
  const result = await callMoodleApi(moodleUrl, token, 'core_enrol_get_enrolled_users', {
    courseid: courseId,
    ...extraParams,
  })

  return Array.isArray(result) ? result : []
}

/**
 * Get Moodle token using username/password.
 */
export async function getMoodleToken(
  moodleUrl: string,
  username: string,
  password: string,
  service = 'moodle_mobile_app'
): Promise<MoodleTokenResponse> {
  const tokenUrl = `${moodleUrl}/login/token.php`
  const params = new URLSearchParams({ username, password, service })

  console.log(`Requesting token from: ${tokenUrl} with service: ${service}`)

  try {
    const response = await fetch(`${tokenUrl}?${params.toString()}`)
    const contentType = response.headers.get('content-type') || ''
    const text = await response.text()

    console.log(`Response status: ${response.status}, content-type: ${contentType}`)
    console.log(`Response body (first 500 chars): ${text.substring(0, 500)}`)

    if (
      contentType.includes('text/html') ||
      text.trim().startsWith('<!DOCTYPE') ||
      text.trim().startsWith('<html')
    ) {
      console.error('Moodle returned HTML instead of JSON')
      return {
        error: `O serviço "${service}" não está disponível neste Moodle. Verifique com o administrador se os Web Services estão habilitados.`,
        errorcode: 'service_unavailable',
      }
    }

    try {
      const data = JSON.parse(text)
      console.log('Token response:', JSON.stringify(data))
      return data
    } catch {
      console.error('Failed to parse JSON response:', text.substring(0, 200))
      return { error: 'Resposta inválida do Moodle. Verifique a URL.', errorcode: 'parse_error' }
    }
  } catch (fetchError) {
    console.error('Fetch error:', fetchError)
    return {
      error: `Erro de conexão: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}`,
      errorcode: 'network_error',
    }
  }
}

/**
 * Call a Moodle Web Service API function (GET-style via query params).
 */
export async function callMoodleApi(
  moodleUrl: string,
  token: string,
  wsfunction: string,
  params: Record<string, string | number> = {},
  timeoutMs = 25_000,
): Promise<unknown> {
  const apiUrl = `${moodleUrl}/webservice/rest/server.php`
  const queryParams = new URLSearchParams({
    wstoken: token,
    wsfunction,
    moodlewsrestformat: 'json',
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  })

  console.log(`Calling Moodle API: ${wsfunction}`)

  const response = await fetch(`${apiUrl}?${queryParams.toString()}`, {
    signal: AbortSignal.timeout(timeoutMs),
  })
  const data = await response.json()

  if (data.exception) {
    console.error(`Moodle API error: ${data.message}`)
    throw new Error(data.message || 'Moodle API error')
  }

  return data
}

/**
 * Call a Moodle Web Service API function via POST (required for some endpoints).
 */
export async function callMoodleApiPost(
  moodleUrl: string,
  token: string,
  wsfunction: string,
  params: Record<string, string | number>,
  timeoutMs = 25_000,
): Promise<unknown> {
  const apiUrl = `${moodleUrl}/webservice/rest/server.php`
  const formData = new URLSearchParams({
    wstoken: token,
    wsfunction,
    moodlewsrestformat: 'json',
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  })

  console.log(`Calling Moodle API (POST): ${wsfunction}`)

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData.toString(),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const data = await response.json()

  if (data.exception) {
    console.error(`Moodle API error: ${data.message}`)
    throw new Error(data.message || 'Moodle API error')
  }

  return data
}

/**
 * Get current user info from Moodle.
 */
export async function getSiteInfo(moodleUrl: string, token: string): Promise<MoodleSiteInfo> {
  return await callMoodleApi(moodleUrl, token, 'core_webservice_get_site_info')
}

/**
 * Get user's enrolled courses.
 */
export async function getUserCourses(
  moodleUrl: string,
  token: string,
  userId: number
): Promise<MoodleCourse[]> {
  return await callMoodleApi(moodleUrl, token, 'core_enrol_get_users_courses', { userid: userId })
}

/**
 * Get all categories from Moodle.
 */
export async function getCategories(moodleUrl: string, token: string): Promise<MoodleCategory[]> {
  try {
    const data = await callMoodleApi(moodleUrl, token, 'core_course_get_categories')
    return data || []
  } catch (error) {
    console.error('Error fetching categories:', error)
    return []
  }
}

/**
 * Build category name with full hierarchy path (e.g., "Parent > Child > SubChild").
 */
export function buildCategoryPath(categoryId: number, categories: MoodleCategory[]): string {
  const categoryMap = new Map(categories.map((c) => [c.id, c]))
  const category = categoryMap.get(categoryId)

  if (!category) return ''

  const pathIds = category.path
    .split('/')
    .filter((id) => id !== '')
    .map((id) => parseInt(id, 10))

  const pathNames = pathIds
    .map((id) => categoryMap.get(id)?.name)
    .filter((name): name is string => !!name)

  return pathNames.join(' > ')
}

/**
 * Get enrolled users in a course.
 */
export async function getCourseEnrolledUsers(
  moodleUrl: string,
  token: string,
  courseId: number
): Promise<MoodleEnrolledUser[]> {
  try {
    return await callGetEnrolledUsers(moodleUrl, token, courseId, { onlyactive: 0 })
  } catch (error) {
    if (isInvalidParameterError(error)) {
      console.warn(
        `Moodle for course ${courseId} does not accept onlyactive=0. Retrying with options[onlyactive]=0.`
      )
      try {
        return await callGetEnrolledUsers(moodleUrl, token, courseId, {
          'options[0][name]': 'onlyactive',
          'options[0][value]': 0,
        })
      } catch {
        console.warn(
          `Moodle for course ${courseId} also rejected options[onlyactive]. Retrying without filter options.`
        )
        try {
          return await callGetEnrolledUsers(moodleUrl, token, courseId)
        } catch (fallbackError) {
          console.error(`Fallback failed fetching enrolled users for course ${courseId}:`, fallbackError)
          return []
        }
      }
    }

    console.error(`Error fetching enrolled users for course ${courseId}:`, error)
    return []
  }
}

/**
 * Get suspended user IDs in a course.
 */
export async function getCourseSuspendedUserIds(
  moodleUrl: string,
  token: string,
  courseId: number
): Promise<Set<number>> {
  try {
    const users = await callGetEnrolledUsers(moodleUrl, token, courseId, { onlysuspended: 1 })

    return new Set<number>(
      users
        .map((user: { id?: number }) => user.id)
        .filter((id): id is number => typeof id === 'number')
    )
  } catch (error) {
    if (isInvalidParameterError(error)) {
      console.warn(
        `Moodle for course ${courseId} does not accept onlysuspended=1. Retrying with options[onlysuspended]=1.`
      )

      try {
        const suspendedViaOptions = await callGetEnrolledUsers(moodleUrl, token, courseId, {
          'options[0][name]': 'onlysuspended',
          'options[0][value]': 1,
        })

        // Trust the result directly — an empty array means no suspended users,
        // not that the filter was ignored. Falling through to inference here was
        // the root cause of falsely marking students with recent access as
        // suspended (inference: all enrolled − active enrolled = suspended is
        // unreliable across Moodle versions).
        const suspendedIds = new Set<number>(
          suspendedViaOptions
            .map((user: { id?: number }) => user.id)
            .filter((id): id is number => typeof id === 'number')
        )
        console.log(
          `Fetched suspended users via options for course ${courseId}: suspended=${suspendedIds.size}`
        )
        return suspendedIds
      } catch (fallbackError) {
        console.error(`Fallback failed fetching suspended users for course ${courseId}:`, fallbackError)
        return new Set<number>()
      }
    }

    console.error(`Error fetching suspended users for course ${courseId}:`, error)
    return new Set<number>()
  }
}
