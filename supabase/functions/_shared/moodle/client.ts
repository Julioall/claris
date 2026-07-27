import type {
  MoodleTokenResponse,
  MoodleCourse,
  MoodleCategory,
  MoodleEnrolledUser,
  MoodleSiteInfo,
  MoodleUserProfile,
  MoodleCourseUpdatesSince,
} from './types.ts'

const INVALID_PARAMETER_MESSAGE = 'valor invalido de parametro'
const NUMERIC_CATEGORY_PATTERN = /^\d+$/
const USER_PROFILE_BATCH_SIZE = 25
const USER_PROFILE_BATCH_DELAY_MS = 300
const DEFAULT_PAGE_SIZE = 100
const DEFAULT_RESPONSE_LIMIT_BYTES = 16 * 1024 * 1024
const DEFAULT_MAX_RETRIES = 3
const ENROLLED_USERS_OPTIONAL_FIELDS = [
  'id',
  'username',
  'firstname',
  'lastname',
  'fullname',
  'email',
  'address',
  'phone1',
  'phone2',
  'department',
  'institution',
  'idnumber',
  'city',
  'profileimageurl',
  'lastaccess',
  'lastcourseaccess',
  'roles',
  'groups',
  'suspended',
].join(',')

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function normalizeForComparison(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

export type MoodleApiErrorCategory =
  | 'authentication'
  | 'permission'
  | 'rate_limit'
  | 'transient'
  | 'invalid_payload'
  | 'response_too_large'
  | 'unknown'

/**
 * Safe transport facts for one HTTP attempt. The observer deliberately has no
 * URL, token, parameters, response body or Moodle identity. Callers fold these
 * facts into bounded per-item metadata instead of writing a database row for
 * every provider request.
 */
export interface MoodleApiAttemptMetric {
  attempt: number
  durationMs: number
  outcome: 'error' | 'success'
  responseBytes: number
  status: number | null
  wsfunction: string
}

export interface MoodleApiTelemetry {
  onAttempt?: (metric: MoodleApiAttemptMetric) => void
}

export function combineMoodleApiTelemetry(
  ...telemetries: Array<MoodleApiTelemetry | undefined>
): MoodleApiTelemetry | undefined {
  const handlers = telemetries
    .map((telemetry) => telemetry?.onAttempt)
    .filter((handler): handler is NonNullable<MoodleApiTelemetry['onAttempt']> => Boolean(handler))
  if (handlers.length === 0) return undefined
  return {
    onAttempt(metric) {
      for (const handler of handlers) {
        try {
          handler(metric)
        } catch {
          // Independent telemetry consumers must not affect the provider call.
        }
      }
    },
  }
}

export class MoodleApiError extends Error {
  readonly category: MoodleApiErrorCategory
  readonly code: string
  readonly retryAfterMs: number | null
  readonly responseBytes: number
  readonly status: number | null

  constructor(input: {
    category: MoodleApiErrorCategory
    code: string
    message: string
    retryAfterMs?: number | null
    responseBytes?: number
    status?: number | null
    cause?: unknown
  }) {
    super(input.message, { cause: input.cause })
    this.name = 'MoodleApiError'
    this.category = input.category
    this.code = input.code
    this.retryAfterMs = input.retryAfterMs ?? null
    this.responseBytes = Number.isSafeInteger(input.responseBytes) && input.responseBytes >= 0
      ? input.responseBytes
      : 0
    this.status = input.status ?? null
  }
}

function isInvalidParameterError(error: unknown): boolean {
  if (error instanceof MoodleApiError && error.category === 'invalid_payload') return true
  const message = error instanceof Error ? normalizeForComparison(error.message) : ''
  return message.includes(INVALID_PARAMETER_MESSAGE)
}

function isExceptionPayload(
  value: unknown,
): value is { errorcode?: unknown; exception: unknown; message?: unknown } {
  return Boolean(value) && typeof value === 'object' && 'exception' in value
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - Date.now()) : null
}

function classifyMoodleException(errorCode: string, exceptionName: string): MoodleApiErrorCategory {
  const normalized = `${errorCode} ${exceptionName}`.toLowerCase()
  if (/invalidtoken|requirelogin|servicenotavailable/.test(normalized)) return 'authentication'
  if (/accesscontrol|nopermissions|permission|forbidden/.test(normalized)) return 'permission'
  if (/invalidparam|missingparam|invalid_parameter/.test(normalized)) return 'invalid_payload'
  if (/ratelimit|too_many_requests/.test(normalized)) return 'rate_limit'
  return 'unknown'
}

function statusCategory(status: number): MoodleApiErrorCategory {
  if (status === 401) return 'authentication'
  if (status === 403) return 'permission'
  if (status === 429) return 'rate_limit'
  if (status >= 500) return 'transient'
  if (status >= 400) return 'invalid_payload'
  return 'unknown'
}

interface ParsedMoodleResponse {
  data: unknown
  responseBytes: number
}

interface MoodleApiRequestResult extends ParsedMoodleResponse {
  status: number
}

function safelyReportMoodleAttempt(
  telemetry: MoodleApiTelemetry | undefined,
  metric: MoodleApiAttemptMetric,
): void {
  try {
    telemetry?.onAttempt?.(metric)
  } catch {
    // Metrics must never interfere with a Moodle request or its retry policy.
  }
}

async function parseMoodleResponseBody(
  response: Response,
  maxResponseBytes = DEFAULT_RESPONSE_LIMIT_BYTES,
): Promise<ParsedMoodleResponse> {
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maxResponseBytes) {
    throw new MoodleApiError({
      category: 'response_too_large',
      code: 'response_too_large',
      message: 'Moodle response exceeded the configured size limit.',
      status: response.status,
    })
  }
  const rawText = await response.text()
  const responseBytes = new TextEncoder().encode(rawText).byteLength
  if (responseBytes > maxResponseBytes) {
    throw new MoodleApiError({
      category: 'response_too_large',
      code: 'response_too_large',
      message: 'Moodle response exceeded the configured size limit.',
      responseBytes,
      status: response.status,
    })
  }
  const trimmed = rawText.trim()

  if (!trimmed) {
    return { data: null, responseBytes }
  }

  try {
    return { data: JSON.parse(trimmed), responseBytes }
  } catch {
    throw new MoodleApiError({
      category: response.ok ? 'invalid_payload' : statusCategory(response.status),
      code: response.ok ? 'invalid_json' : `http_${response.status}`,
      message: response.ok
        ? 'Moodle returned an invalid JSON response.'
        : `Moodle API returned HTTP ${response.status}.`,
      responseBytes,
      retryAfterMs: parseRetryAfter(response.headers.get('retry-after')),
      status: response.status,
    })
  }
}

async function callGetEnrolledUsers(
  moodleUrl: string,
  token: string,
  courseId: number,
  extraParams: Record<string, string | number> = {},
): Promise<unknown[]> {
  const result = await callMoodleApi(moodleUrl, token, 'core_enrol_get_enrolled_users', {
    courseid: courseId,
    ...extraParams,
  })

  return Array.isArray(result) ? result : []
}

export async function getMoodleToken(
  moodleUrl: string,
  username: string,
  password: string,
  service = 'moodle_mobile_app',
): Promise<MoodleTokenResponse> {
  const tokenUrl = `${moodleUrl}/login/token.php`
  const params = new URLSearchParams({ username, password, service })

  console.log('[moodle] Requesting token.', { service })

  try {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      redirect: 'manual',
      signal: AbortSignal.timeout(25_000),
    })
    if (response.status >= 300 && response.status < 400) {
      return {
        error: 'O endpoint Moodle tentou redirecionar para outro endereco.',
        errorcode: 'redirect_not_allowed',
      }
    }
    const contentType = response.headers.get('content-type') || ''
    const text = await response.text()

    console.log('[moodle] Token request completed.', { status: response.status })

    if (
      contentType.includes('text/html') ||
      text.trim().startsWith('<!DOCTYPE') ||
      text.trim().startsWith('<html')
    ) {
      console.error('[moodle] Token endpoint returned a non-JSON response.', { status: response.status })
      return {
        error: `O servico "${service}" nao esta disponivel neste Moodle. Verifique com o administrador se os Web Services estao habilitados.`,
        errorcode: 'service_unavailable',
      }
    }

    try {
      const data = JSON.parse(text)
      console.log('[moodle] Token response parsed.', {
        errorCode: typeof data?.errorcode === 'string' ? data.errorcode : null,
        success: typeof data?.token === 'string' && data.token.length > 0,
      })
      return data
    } catch {
      console.error('[moodle] Token endpoint returned invalid JSON.', { status: response.status })
      return { error: 'Resposta invalida do Moodle. Verifique a URL.', errorcode: 'parse_error' }
    }
  } catch (fetchError) {
    console.error('[moodle] Token request failed.', {
      errorType: fetchError instanceof Error ? fetchError.name : 'unknown',
    })
    return {
      error: 'Nao foi possivel conectar ao Moodle.',
      errorcode: 'network_error',
    }
  }
}

export async function callMoodleApi(
  moodleUrl: string,
  token: string,
  wsfunction: string,
  params: Record<string, string | number> = {},
  timeoutMs = 25_000,
  telemetry?: MoodleApiTelemetry,
): Promise<unknown> {
  return callMoodleApiWithRetry(() =>
    performMoodleApiRequest(moodleUrl, token, wsfunction, params, timeoutMs),
    wsfunction,
    telemetry,
  )
}

export async function callMoodleApiPost(
  moodleUrl: string,
  token: string,
  wsfunction: string,
  params: Record<string, string | number>,
  timeoutMs = 25_000,
  telemetry?: MoodleApiTelemetry,
): Promise<unknown> {
  return callMoodleApiWithRetry(() =>
    performMoodleApiRequest(moodleUrl, token, wsfunction, params, timeoutMs),
    wsfunction,
    telemetry,
  )
}

/**
 * Wraps Moodle API calls with exponential backoff retry logic.
 * Retries on network errors, timeouts, 5xx errors, and specific transient Moodle errors.
 * Does NOT retry on 4xx errors (auth, validation, etc.) or permanent failures.
 */
async function callMoodleApiWithRetry(
  apiFn: (attempt: number) => Promise<MoodleApiRequestResult>,
  wsfunction: string,
  telemetry?: MoodleApiTelemetry,
  maxRetries = DEFAULT_MAX_RETRIES,
  baseDelayMs = 500,
): Promise<unknown> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const attemptStartedAt = Date.now()
    try {
      const result = await apiFn(attempt + 1)
      safelyReportMoodleAttempt(telemetry, {
        attempt: attempt + 1,
        durationMs: Math.max(0, Date.now() - attemptStartedAt),
        outcome: 'success',
        responseBytes: result.responseBytes,
        status: result.status,
        wsfunction,
      })
      return result.data
    } catch (error) {
      safelyReportMoodleAttempt(telemetry, {
        attempt: attempt + 1,
        durationMs: Math.max(0, Date.now() - attemptStartedAt),
        outcome: 'error',
        responseBytes: error instanceof MoodleApiError ? error.responseBytes : 0,
        status: error instanceof MoodleApiError ? error.status : null,
        wsfunction,
      })
      lastError = error instanceof Error ? error : new Error('Unknown Moodle request failure')
      const retryable = error instanceof MoodleApiError
        ? error.category === 'transient' || error.category === 'rate_limit'
        : error instanceof TypeError || error instanceof DOMException

      if (!retryable) {
        throw lastError
      }

      if (attempt < maxRetries) {
        const retryAfterMs = error instanceof MoodleApiError ? error.retryAfterMs : null
        const delayMs = retryAfterMs ?? Math.round(
          baseDelayMs * Math.pow(2, attempt) * (0.75 + Math.random() * 0.5),
        )
        console.warn(
          '[moodle] Transient request failure; retry scheduled.',
          { attempt: attempt + 1, delayMs },
        )
        await wait(delayMs)
      }
    }
  }

  throw lastError || new Error('Unknown error in Moodle API retry loop')
}

async function performMoodleApiRequest(
  moodleUrl: string,
  token: string,
  wsfunction: string,
  params: Record<string, string | number>,
  timeoutMs: number,
): Promise<MoodleApiRequestResult> {
  const apiUrl = `${moodleUrl}/webservice/rest/server.php`
  const formData = new URLSearchParams({
    wstoken: token,
    wsfunction,
    moodlewsrestformat: 'json',
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  })

  console.log('[moodle] Calling API.', { wsfunction })

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData.toString(),
    redirect: 'manual',
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (response.status >= 300 && response.status < 400) {
    throw new MoodleApiError({
      category: 'invalid_payload',
      code: 'redirect_not_allowed',
      message: 'Moodle API redirects are not allowed.',
      status: response.status,
    })
  }
  const parsed = await parseMoodleResponseBody(response)
  const data = parsed.data

  if (isExceptionPayload(data)) {
    const errorCode = typeof data.errorcode === 'string' ? data.errorcode : 'moodle_exception'
    const exceptionName = typeof data.exception === 'string' ? data.exception : 'moodle_exception'
    const category = classifyMoodleException(errorCode, exceptionName)
    console.error('[moodle] API returned a functional exception.', {
      category,
      errorCode,
      wsfunction,
    })
    throw new MoodleApiError({
      category,
      code: errorCode,
      message: `Moodle API rejected ${wsfunction} (${errorCode}).`,
      responseBytes: parsed.responseBytes,
      status: response.status,
    })
  }

  if (!response.ok) {
    throw new MoodleApiError({
      category: statusCategory(response.status),
      code: `http_${response.status}`,
      message: `Moodle API returned HTTP ${response.status}.`,
      responseBytes: parsed.responseBytes,
      retryAfterMs: parseRetryAfter(response.headers.get('retry-after')),
      status: response.status,
    })
  }

  return {
    data,
    responseBytes: parsed.responseBytes,
    status: response.status,
  }
}

export async function getSiteInfo(moodleUrl: string, token: string): Promise<MoodleSiteInfo> {
  return await callMoodleApi(moodleUrl, token, 'core_webservice_get_site_info') as MoodleSiteInfo
}

export async function getUserCourses(
  moodleUrl: string,
  token: string,
  userId: number,
): Promise<MoodleCourse[]> {
  return await callMoodleApi(moodleUrl, token, 'core_enrol_get_users_courses', { userid: userId }) as MoodleCourse[]
}

/** Consultative delta signal; warnings or ambiguity must keep full sync enabled. */
export async function getCourseUpdatesSince(
  moodleUrl: string,
  token: string,
  courseId: number,
  since: Date,
  telemetry?: MoodleApiTelemetry,
): Promise<MoodleCourseUpdatesSince> {
  const sinceSeconds = Math.floor(since.getTime() / 1000)
  if (!Number.isSafeInteger(courseId) || courseId <= 0 || !Number.isSafeInteger(sinceSeconds)) {
    throw new MoodleApiError({
      category: 'invalid_payload',
      code: 'invalid_updates_since_parameters',
      message: 'Invalid course delta parameters.',
    })
  }
  const response = await callMoodleApiPost(
    moodleUrl,
    token,
    'core_course_get_updates_since',
    { courseid: courseId, since: sinceSeconds },
    25_000,
    telemetry,
  )
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    throw new MoodleApiError({
      category: 'invalid_payload',
      code: 'invalid_updates_since_response',
      message: 'Moodle returned an invalid course delta response.',
    })
  }
  return response as MoodleCourseUpdatesSince
}

export async function getCategories(moodleUrl: string, token: string): Promise<MoodleCategory[]> {
  const data = await callMoodleApi(moodleUrl, token, 'core_course_get_categories')
  if (!Array.isArray(data)) {
    throw new MoodleApiError({
      category: 'invalid_payload',
      code: 'invalid_categories_payload',
      message: 'Moodle returned an invalid category list.',
    })
  }
  return data as MoodleCategory[]
}

export function buildCategoryPath(categoryId: number, categories: MoodleCategory[]): string {
  const categoryMap = new Map(categories.map((c) => [c.id, c]))
  const category = categoryMap.get(categoryId)

  if (!category) return ''

  const pathIds = category.path
    .split('/')
    .filter((id) => id !== '')
    .map((id) => parseInt(id, 10))
    .filter((id) => Number.isFinite(id))

  const effectivePathIds = pathIds.length > 0 ? pathIds : [category.id]
  const pathNames: string[] = []

  for (const id of effectivePathIds) {
    const name = categoryMap.get(id)?.name?.trim()
    if (!name) return ''
    pathNames.push(name)
  }

  return pathNames.join(' > ')
}

function isUsableResolvedCategory(categoryName: string | null | undefined): categoryName is string {
  const normalized = categoryName?.trim()
  return Boolean(normalized) && !NUMERIC_CATEGORY_PATTERN.test(normalized)
}

export function resolveCourseCategoryName(
  categoryId: number | undefined,
  categories: MoodleCategory[],
  existingCategory: string | null | undefined,
): string | null {
  if (typeof categoryId === 'number') {
    const resolvedCategory = buildCategoryPath(categoryId, categories)
    if (isUsableResolvedCategory(resolvedCategory)) {
      return resolvedCategory
    }
  }

  if (isUsableResolvedCategory(existingCategory)) {
    return existingCategory.trim()
  }

  return null
}

export async function getCourseEnrolledUsers(
  moodleUrl: string,
  token: string,
  courseId: number,
  pageSize = DEFAULT_PAGE_SIZE,
): Promise<MoodleEnrolledUser[]> {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000) {
    throw new RangeError('pageSize must be between 1 and 1000')
  }

  const baseOptions: Record<string, string | number> = {
    'options[0][name]': 'onlyactive',
    'options[0][value]': 0,
    'options[1][name]': 'userfields',
    'options[1][value]': ENROLLED_USERS_OPTIONAL_FIELDS,
  }

  const usersById = new Map<number, MoodleEnrolledUser>()
  let offset = 0

  while (true) {
    let page: unknown[]
    try {
      page = await callGetEnrolledUsers(moodleUrl, token, courseId, {
        ...baseOptions,
        limitfrom: offset,
        limitnumber: pageSize,
      })
    } catch (error) {
      if (!isInvalidParameterError(error)) throw error
      console.warn('[moodle] Enrolment endpoint rejected userfields; using minimal paginated fields.', {
        courseId,
      })
      page = await callGetEnrolledUsers(moodleUrl, token, courseId, {
        'options[0][name]': 'onlyactive',
        'options[0][value]': 0,
        limitfrom: offset,
        limitnumber: pageSize,
      })
    }

    for (const rawUser of page) {
      const user = rawUser as MoodleEnrolledUser
      if (typeof user.id !== 'number' || !Number.isFinite(user.id)) {
        throw new MoodleApiError({
          category: 'invalid_payload',
          code: 'invalid_enrolled_user',
          message: 'Moodle returned an enrolled user without a valid id.',
        })
      }
      usersById.set(user.id, user)
    }

    if (page.length < pageSize) break
    offset += pageSize
  }

  return Array.from(usersById.values()).sort((left, right) => left.id - right.id)
}

export async function getCourseSuspendedUserIds(
  moodleUrl: string,
  token: string,
  courseId: number,
): Promise<Set<number>> {
  const suspendedViaOptions = await callGetEnrolledUsers(moodleUrl, token, courseId, {
    'options[0][name]': 'onlysuspended',
    'options[0][value]': 1,
  })

  return new Set<number>(
    suspendedViaOptions
      .map((user: { id?: number }) => user.id)
      .filter((id): id is number => typeof id === 'number'),
  )
}

export async function getUserProfilesByIds(
  moodleUrl: string,
  token: string,
  userIds: number[],
): Promise<Map<number, MoodleUserProfile>> {
  const uniqueIds = Array.from(new Set(userIds.filter((id) => Number.isFinite(id) && id > 0)))
  if (uniqueIds.length === 0) return new Map()

  const profilesById = new Map<number, MoodleUserProfile>()

  for (let i = 0; i < uniqueIds.length; i += USER_PROFILE_BATCH_SIZE) {
    const batch = uniqueIds.slice(i, i + USER_PROFILE_BATCH_SIZE)
    const params: Record<string, string | number> = { field: 'id' }

    for (let index = 0; index < batch.length; index += 1) {
      params[`values[${index}]`] = String(batch[index])
    }

    const response = await callMoodleApi(moodleUrl, token, 'core_user_get_users_by_field', params)
    if (!Array.isArray(response)) {
      throw new MoodleApiError({
        category: 'invalid_payload',
        code: 'invalid_user_profiles_payload',
        message: 'Moodle returned an invalid user profile list.',
      })
    }
    const users = response as MoodleUserProfile[]

    for (const user of users) {
      if (typeof user?.id === 'number' && Number.isFinite(user.id)) {
        profilesById.set(user.id, user)
      }
    }

    if (i + USER_PROFILE_BATCH_SIZE < uniqueIds.length) {
      await wait(USER_PROFILE_BATCH_DELAY_MS)
    }
  }

  return profilesById
}
