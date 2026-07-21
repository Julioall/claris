import { execFileSync } from 'node:child_process'

const RUNNER_CONTAINER = process.env.SUPABASE_RUNNER_CONTAINER || 'claris-supabase'
const DATABASE_CONTAINER = process.env.SUPABASE_DATABASE_CONTAINER || 'supabase_db_local'
const SCHEDULED_MESSAGES_SECRET =
  process.env.SCHEDULED_MESSAGES_CRON_SECRET || 'claris-scheduled-messages-local-secret'

const seed = {
  courseMoodleId: 'smoke-course-001',
  courseName: 'Curso Smoke Edge',
  courseShortName: 'SMOKE-EDGE',
  email: process.env.EDGE_SMOKE_EMAIL || 'smoke.edge.local@example.com',
  fullName: 'Smoke Edge Local',
  moodleUserId: 'smoke-user-001',
  password: process.env.EDGE_SMOKE_PASSWORD || 'SmokeEdge#2026',
  studentFullName: 'Aluno Smoke Edge',
  studentMoodleUserId: 'smoke-student-001',
  username: 'smoke.edge.local',
}

function log(message) {
  console.log(`[smoke-edge] ${message}`)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function fail(message) {
  throw new Error(message)
}

function extractJsonBlock(rawOutput) {
  const firstBrace = rawOutput.indexOf('{')
  const lastBrace = rawOutput.lastIndexOf('}')

  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    fail('Nao foi possivel ler o JSON do status local do Supabase.')
  }

  return rawOutput.slice(firstBrace, lastBrace + 1)
}

function getLocalSupabaseStatus() {
  const rawOutput = execFileSync(
    'docker',
    ['exec', RUNNER_CONTAINER, 'supabase', 'status', '--output', 'json'],
    { encoding: 'utf8' },
  )

  return JSON.parse(extractJsonBlock(rawOutput))
}

async function getLocalSupabaseStatusWithRetry() {
  const maxAttempts = 30

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const status = getLocalSupabaseStatus()
      const requiredFields = ['API_URL', 'FUNCTIONS_URL', 'PUBLISHABLE_KEY', 'REST_URL', 'SERVICE_ROLE_KEY']
      const isReady = requiredFields.every((field) => typeof status[field] === 'string' && status[field].length > 0)

      if (isReady) {
        return status
      }
    } catch {
      // The local stack may still be starting; retry below.
    }

    await sleep(2000)
  }

  fail('O stack local do Supabase nao ficou pronto a tempo para o smoke test.')
}

async function waitForEdgeFunctions(status) {
  const maxAttempts = 20
  const testUrl = `${status.FUNCTIONS_URL}/moodle-auth`
  const testBody = { moodleUrl: 'https://example.com', username: 'warmup', password: 'warmup' }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(testUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: status.PUBLISHABLE_KEY,
        },
        body: JSON.stringify(testBody),
      })

      if (response.status !== 502) {
        return
      }
    } catch {
      // Network error while the runtime is still initialising; retry below.
    }

    await sleep(2000)
  }

  fail('Edge Functions nao ficaram prontas a tempo para o smoke test.')
}

async function requestJson(url, {
  acceptStatuses = [200],
  body,
  headers = {},
  method = 'GET',
} = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      ...headers,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  const text = await response.text()
  const data = text ? (() => {
    try {
      return JSON.parse(text)
    } catch {
      return text
    }
  })() : null

  if (!acceptStatuses.includes(response.status)) {
    fail(`HTTP ${response.status} em ${method} ${url}: ${typeof data === 'string' ? data : JSON.stringify(data)}`)
  }

  return { data, response, text }
}

function adminHeaders(status) {
  return {
    apikey: status.SERVICE_ROLE_KEY,
    Authorization: `Bearer ${status.SERVICE_ROLE_KEY}`,
  }
}

function publishableHeaders(status, accessToken) {
  return {
    apikey: status.PUBLISHABLE_KEY,
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  }
}

async function listAdminUsers(status) {
  const { data } = await requestJson(`${status.API_URL}/auth/v1/admin/users?page=1&per_page=1000`, {
    headers: adminHeaders(status),
  })

  return Array.isArray(data?.users) ? data.users : []
}

async function ensureAuthUser(status) {
  const users = await listAdminUsers(status)
  const existingUser = users.find((user) => user.email === seed.email)

  if (existingUser) {
    await requestJson(`${status.API_URL}/auth/v1/admin/users/${existingUser.id}`, {
      acceptStatuses: [200],
      body: {
        email_confirm: true,
        password: seed.password,
        user_metadata: { full_name: seed.fullName },
      },
      headers: adminHeaders(status),
      method: 'PUT',
    })

    return existingUser.id
  }

  const { data } = await requestJson(`${status.API_URL}/auth/v1/admin/users`, {
    acceptStatuses: [200, 201],
    body: {
      email: seed.email,
      email_confirm: true,
      password: seed.password,
      user_metadata: { full_name: seed.fullName },
    },
    headers: adminHeaders(status),
    method: 'POST',
  })

  const userId = data?.user?.id || data?.id
  if (!userId) {
    fail('A criacao do usuario auth local nao retornou um id.')
  }

  return userId
}

async function signInSeedUser(status) {
  const { data } = await requestJson(`${status.API_URL}/auth/v1/token?grant_type=password`, {
    acceptStatuses: [200],
    body: {
      email: seed.email,
      password: seed.password,
    },
    headers: {
      apikey: status.PUBLISHABLE_KEY,
    },
    method: 'POST',
  })

  if (!data?.access_token) {
    fail('O login do usuario seedado nao retornou access_token.')
  }

  return data.access_token
}

async function upsertRows(status, table, onConflict, payload) {
  const query = new URLSearchParams({ on_conflict: onConflict, select: '*' })
  const { data } = await requestJson(`${status.REST_URL}/${table}?${query.toString()}`, {
    acceptStatuses: [200, 201],
    body: Array.isArray(payload) ? payload : [payload],
    headers: {
      ...adminHeaders(status),
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    method: 'POST',
  })

  return Array.isArray(data) ? data : []
}

async function deleteRows(status, table, filters, select = 'id') {
  const query = new URLSearchParams({ select })

  for (const [column, value] of Object.entries(filters)) {
    query.set(column, `eq.${value}`)
  }

  await requestJson(`${status.REST_URL}/${table}?${query.toString()}`, {
    acceptStatuses: [200, 204],
    headers: {
      ...adminHeaders(status),
      Prefer: 'return=representation',
    },
    method: 'DELETE',
  })
}

function queryLocalDatabase(sql) {
  const output = execFileSync(
    'docker',
    [
      'exec',
      DATABASE_CONTAINER,
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-X',
      '-A',
      '-t',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      sql,
    ],
    { encoding: 'utf8' },
  ).trim()

  if (!output) fail('A consulta de privilegios do banco local nao retornou dados.')
  return output
}

async function selectRows(status, table, filters, headers = adminHeaders(status)) {
  const query = new URLSearchParams({ select: '*' })

  for (const [column, value] of Object.entries(filters)) {
    query.set(column, `eq.${value}`)
  }

  const { data } = await requestJson(`${status.REST_URL}/${table}?${query.toString()}`, {
    acceptStatuses: [200],
    headers,
  })

  return Array.isArray(data) ? data : []
}

async function seedGenerateAutomatedTasksScenario(status, authUserId) {
  await upsertRows(status, 'users', 'id', {
    email: seed.email,
    full_name: seed.fullName,
    id: authUserId,
    moodle_user_id: seed.moodleUserId,
    moodle_username: seed.username,
  })

  const [course] = await upsertRows(status, 'courses', 'moodle_course_id', {
    moodle_course_id: seed.courseMoodleId,
    name: seed.courseName,
    short_name: seed.courseShortName,
  })

  if (!course?.id) {
    fail('Nao foi possivel seedar o curso de smoke.')
  }

  const [student] = await upsertRows(status, 'students', 'moodle_user_id', {
    current_risk_level: 'risco',
    full_name: seed.studentFullName,
    moodle_user_id: seed.studentMoodleUserId,
  })

  if (!student?.id) {
    fail('Nao foi possivel seedar o aluno de smoke.')
  }

  await upsertRows(status, 'user_courses', 'user_id,course_id', {
    course_id: course.id,
    role: 'tutor',
    user_id: authUserId,
  })

  await upsertRows(status, 'student_courses', 'student_id,course_id', {
    course_id: course.id,
    enrollment_status: 'ativo',
    student_id: student.id,
  })

  const [tutorGroup] = await selectRows(status, 'app_groups', { slug: 'tutor' })

  if (!tutorGroup?.id) {
    fail('Nao foi possivel encontrar o grupo tutor para seedar permissoes de smoke.')
  }

  await upsertRows(status, 'user_group_memberships', 'user_id', {
    assigned_by: null,
    group_id: tutorGroup.id,
    user_id: authUserId,
  })

  return { courseId: course.id, studentId: student.id }
}

async function cleanupAutomatedTaskArtifacts(status, authUserId, studentId) {
  await deleteRows(status, 'pending_tasks', {
    automation_type: 'auto_at_risk',
    created_by_user_id: authUserId,
    student_id: studentId,
  })
}

async function callEdgeFunction(status, functionName, body, accessToken, headers = {}) {
  const { data, response } = await requestJson(`${status.FUNCTIONS_URL}/${functionName}`, {
    acceptStatuses: [200, 400, 401, 403, 404, 409, 422],
    body,
    headers: {
      ...publishableHeaders(status, accessToken),
      ...headers,
    },
    method: 'POST',
  })

  return { data, status: response.status }
}

async function callV1EdgeFunction(status, functionName, body, {
  accessToken,
  acceptStatuses,
  correlationId,
}) {
  return requestJson(`${status.FUNCTIONS_URL}/${functionName}`, {
    acceptStatuses,
    body,
    headers: {
      ...publishableHeaders(status, accessToken),
      'x-claris-api-version': '1',
      'x-correlation-id': correlationId,
    },
    method: 'POST',
  })
}

function assertV1Response(result, { code, correlationId, status }) {
  if (result.response.status !== status) {
    fail(`Contrato V1 esperava HTTP ${status}, recebeu ${result.response.status}: ${JSON.stringify(result.data)}`)
  }

  const contentType = result.response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    fail(`Contrato V1 retornou Content-Type inesperado: ${contentType}`)
  }

  if (result.response.headers.get('x-correlation-id') !== correlationId) {
    fail('Contrato V1 nao propagou x-correlation-id no header.')
  }

  const bodyCorrelationId = code ? result.data?.error?.correlationId : result.data?.correlationId
  if (bodyCorrelationId !== correlationId) {
    fail(`Contrato V1 nao propagou correlationId no body: ${JSON.stringify(result.data)}`)
  }

  if (code && result.data?.error?.code !== code) {
    fail(`Contrato V1 esperava erro ${code}: ${JSON.stringify(result.data)}`)
  }
}

async function callScheduledMessageProcessor(status, body, secret) {
  const headers = {
    apikey: status.PUBLISHABLE_KEY,
    ...(secret ? { 'x-scheduled-messages-secret': secret } : {}),
  }

  const { data, response } = await requestJson(`${status.FUNCTIONS_URL}/process-scheduled-messages`, {
    acceptStatuses: [200, 401],
    body,
    headers,
    method: 'POST',
  })

  return { data, status: response.status }
}

async function runUnauthenticatedContractChecks(status) {
  const cases = [
    {
      body: { moodleUrl: 'foo', password: 'demo123', username: 'demo' },
      expectedStatus: 400,
      name: 'moodle-auth invalid-url',
      path: 'moodle-auth',
    },
    {
      body: { action: 'unknown' },
      expectedStatus: 422,
      name: 'bulk-message-send invalid-action',
      path: 'bulk-message-send',
    },
    {
      body: {
        action: 'retry_send',
        jobId: '00000000-0000-4000-8000-000000000001',
        moodleUrl: 'https://example.com',
        token: 'token-demo',
      },
      expectedStatus: 401,
      name: 'bulk-message-send valid-no-auth',
      path: 'bulk-message-send',
    },
    {
      body: {
        action: 'start_send',
        messageContent: 'Mensagem smoke',
        moodleUrl: 'https://example.com',
        origin: 'manual',
        recipients: [{
          personalizedMessage: 'Mensagem smoke',
          studentId: '00000000-0000-4000-8000-000000000001',
        }],
        token: 'token-demo',
      },
      expectedStatus: 401,
      name: 'bulk-message-send create-no-auth',
      path: 'bulk-message-send',
    },
    {
      body: { action: 'get_audience' },
      expectedStatus: 401,
      name: 'bulk-message-audience valid-no-auth',
      path: 'bulk-message-audience',
    },
    {
      body: { action: 'list_templates' },
      expectedStatus: 401,
      name: 'message-templates valid-no-auth',
      path: 'message-templates',
    },
    {
      body: { action: 'list_bulk_jobs', filters: {}, order: 'createdAtDesc', page: 1, pageSize: 10 },
      expectedStatus: 401,
      name: 'campaigns valid-no-auth',
      path: 'campaigns',
    },
    {
      body: { action: 'list_instances' },
      expectedStatus: 401,
      name: 'whatsapp-messaging valid-no-auth',
      path: 'whatsapp-messaging',
    },
    {
      body: { action: 'get_contacts', instance_id: '00000000-0000-4000-8000-000000000001' },
      expectedStatus: 422,
      name: 'whatsapp-messaging rejects-snake-case',
      path: 'whatsapp-messaging',
    },
    {
      body: { automation_types: 'auto_at_risk' },
      expectedStatus: 400,
      name: 'generate-automated-tasks invalid-types',
      path: 'generate-automated-tasks',
    },
    {
      body: { automation_types: ['auto_at_risk'] },
      expectedStatus: 401,
      name: 'generate-automated-tasks valid-no-auth',
      path: 'generate-automated-tasks',
    },
    {
      body: { mode: 'truncate_everything' },
      expectedStatus: 400,
      name: 'data-cleanup invalid-mode',
      path: 'data-cleanup',
    },
    {
      body: { mode: 'full_cleanup' },
      expectedStatus: 401,
      name: 'data-cleanup valid-no-auth',
      path: 'data-cleanup',
    },
    {
      body: { action: 'bad_action' },
      expectedStatus: 422,
      name: 'moodle-sync-courses invalid-action',
      path: 'moodle-sync-courses',
    },
    {
      body: {
        action: 'link_selected_courses',
        selectedCourseIds: [
          '00000000-0000-4000-8000-000000000001',
          '00000000-0000-4000-8000-000000000002',
        ],
      },
      expectedStatus: 401,
      name: 'moodle-sync-courses valid-no-auth',
      path: 'moodle-sync-courses',
    },
    {
      body: { action: 'list_active_jobs' },
      expectedStatus: 401,
      name: 'moodle-sync-jobs valid-no-auth',
      path: 'moodle-sync-jobs',
    },
    {
      body: { action: 'list_active_jobs', userId: '00000000-0000-4000-8000-000000000001' },
      expectedStatus: 422,
      name: 'moodle-sync-jobs rejects-browser-identity',
      path: 'moodle-sync-jobs',
    },
    {
      body: { action: 'start_initial_sync', courseIds: ['00000000-0000-4000-8000-000000000001'], token: 'browser-token' },
      expectedStatus: 422,
      name: 'moodle-sync-jobs rejects-browser-credential',
      path: 'moodle-sync-jobs',
    },
    {
      body: { action: 'list_active' },
      expectedStatus: 401,
      name: 'background-jobs valid-no-auth',
      path: 'background-jobs',
    },
    {
      body: { action: 'list_active', user_id: '00000000-0000-4000-8000-000000000001' },
      expectedStatus: 422,
      name: 'background-jobs rejects-browser-identity',
      path: 'background-jobs',
    },
    {
      body: { action: 'list', limit: 20 },
      expectedStatus: 401,
      name: 'activity-feed valid-no-auth',
      path: 'activity-feed',
    },
    {
      body: { action: 'list', limit: 20, userId: '00000000-0000-4000-8000-000000000001' },
      expectedStatus: 422,
      name: 'activity-feed rejects-browser-identity',
      path: 'activity-feed',
    },
    {
      body: { action: 'list', limit: 30 },
      expectedStatus: 401,
      name: 'claris-conversations valid-no-auth',
      path: 'claris-conversations',
    },
    {
      body: { action: 'list', limit: 30, userId: '00000000-0000-4000-8000-000000000001' },
      expectedStatus: 422,
      name: 'claris-conversations rejects-browser-identity',
      path: 'claris-conversations',
    },
    {
      body: { action: 'list_pending', limit: 10 },
      expectedStatus: 401,
      name: 'claris-suggestions valid-no-auth',
      path: 'claris-suggestions',
    },
    {
      body: { action: 'list_pending', limit: 10, userId: '00000000-0000-4000-8000-000000000001' },
      expectedStatus: 422,
      name: 'claris-suggestions rejects-browser-identity',
      path: 'claris-suggestions',
    },
    {
      body: { courseId: 1, moodleUrl: 'https://example.com', token: 'token-demo' },
      expectedStatus: 401,
      name: 'moodle-sync-students valid-no-auth',
      path: 'moodle-sync-students',
    },
    {
      body: { courseId: 1, moodleUrl: 'https://example.com', token: 'token-demo' },
      expectedStatus: 401,
      name: 'moodle-sync-activities valid-no-auth',
      path: 'moodle-sync-activities',
    },
    {
      body: { action: 'debug_grades', courseId: 1, userId: 1, moodleUrl: 'https://example.com', token: 'token-demo' },
      expectedStatus: 401,
      name: 'moodle-sync-grades debug-no-auth',
      path: 'moodle-sync-grades',
    },
    {
      body: { action: 'bad_action' },
      expectedStatus: 422,
      headers: { 'x-claris-api-version': '1' },
      name: 'moodle-messaging invalid-action',
      path: 'moodle-messaging',
    },
    {
      body: { action: 'get_messages', limit: 10, moodleUserId: 1 },
      expectedStatus: 401,
      headers: { 'x-claris-api-version': '1' },
      name: 'moodle-messaging valid-no-auth',
      path: 'moodle-messaging',
    },
    {
      body: { action: 'get_conversations', moodleUrl: 'https://example.com', token: 'token-demo' },
      expectedStatus: 422,
      headers: { 'x-claris-api-version': '1' },
      name: 'moodle-messaging rejects-browser-credentials',
      path: 'moodle-messaging',
    },
    {
      body: {},
      expectedStatus: 401,
      name: 'generate-proactive-suggestions no-auth',
      path: 'generate-proactive-suggestions',
    },
    {
      body: { action: 'track_usage', eventType: 'smoke_unauthenticated' },
      expectedStatus: 401,
      name: 'app-telemetry valid-no-auth',
      path: 'app-telemetry',
    },
    {
      body: { action: 'search_suggestions', prefix: 'aluno', query: '' },
      expectedStatus: 401,
      name: 'task-tag-suggestions valid-no-auth',
      path: 'task-tag-suggestions',
    },
    {
      body: { action: 'get_summary', week: 'current' },
      expectedStatus: 401,
      name: 'dashboard-summary valid-no-auth',
      path: 'dashboard-summary',
    },
    {
      body: { action: 'get_catalog' },
      expectedStatus: 401,
      name: 'courses-catalog valid-no-auth',
      path: 'courses-catalog',
    },
    {
      body: { action: 'get_panel', courseId: '00000000-0000-4000-8000-000000000001' },
      expectedStatus: 401,
      name: 'course-panel valid-no-auth',
      path: 'course-panel',
    },
    {
      body: {
        action: 'get_overview',
        courseId: '00000000-0000-4000-8000-000000000001',
      },
      expectedStatus: 401,
      name: 'course-attendance valid-no-auth',
      path: 'course-attendance',
    },
    {
      body: { action: 'list_students', page: 1, pageSize: 30 },
      expectedStatus: 401,
      name: 'students valid-no-auth',
      path: 'students',
    },
    {
      body: { action: 'list_courses' },
      expectedStatus: 401,
      name: 'academic-reports valid-no-auth',
      path: 'academic-reports',
    },
    {
      body: {
        action: 'find_latest_relevant',
        activityId: '00000000-0000-4000-8000-000000000001',
        courseId: '00000000-0000-4000-8000-000000000001',
      },
      expectedStatus: 401,
      name: 'grade-suggestion-jobs valid-no-auth',
      path: 'grade-suggestion-jobs',
    },
    {
      body: { action: 'list_tasks', filters: {}, order: 'createdAtDesc', page: 1, pageSize: 100 },
      expectedStatus: 401,
      name: 'tasks valid-no-auth',
      path: 'tasks',
    },
    {
      body: { action: 'list_events', filters: {}, order: 'startAtAsc', page: 1, pageSize: 100 },
      expectedStatus: 401,
      name: 'calendar-events valid-no-auth',
      path: 'calendar-events',
    },
    {
      body: {},
      expectedStatus: 401,
      name: 'process-scheduled-messages no-secret',
      path: 'process-scheduled-messages',
    },
  ]

  const failures = []

  for (const testCase of cases) {
    const result = await callEdgeFunction(status, testCase.path, testCase.body, undefined, testCase.headers)
    const pass = result.status === testCase.expectedStatus

    console.log(`${pass ? 'PASS' : 'FAIL'} ${testCase.name} -> ${result.status}`)

    if (!pass) {
      failures.push({ ...testCase, receivedStatus: result.status })
    }
  }

  if (failures.length > 0) {
    fail(`Falhas nos contratos HTTP sem auth: ${JSON.stringify(failures)}`)
  }

  const unauthorized = await callV1EdgeFunction(
    status,
    'moodle-reauth-settings',
    { action: 'get_settings' },
    { acceptStatuses: [401], correlationId: 'smoke-v1-unauthorized' },
  )
  assertV1Response(unauthorized, {
    code: 'unauthorized',
    correlationId: 'smoke-v1-unauthorized',
    status: 401,
  })

  const invalid = await callV1EdgeFunction(
    status,
    'moodle-reauth-settings',
    { action: 'update_settings', enabled: 'invalid' },
    { acceptStatuses: [422], correlationId: 'smoke-v1-validation' },
  )
  assertV1Response(invalid, {
    code: 'validation_failed',
    correlationId: 'smoke-v1-validation',
    status: 422,
  })

  const communicationCases = [
    ['bulk-message-audience', { action: 'get_audience' }],
    ['message-templates', { action: 'list_templates' }],
    ['campaigns', { action: 'list_bulk_jobs', filters: {}, order: 'createdAtDesc', page: 1, pageSize: 10 }],
    ['whatsapp-messaging', { action: 'list_instances' }],
    ['moodle-sync-jobs', { action: 'list_active_jobs' }],
    ['background-jobs', { action: 'list_active' }],
    ['activity-feed', { action: 'list', limit: 20 }],
    ['claris-conversations', { action: 'list', limit: 30 }],
    ['claris-suggestions', { action: 'list_pending', limit: 10 }],
    ['claris-chat', { operation: 'get_availability' }],
    ['app-settings', { action: 'get_public' }],
    ['support-tickets', {
      action: 'create_ticket',
      type: 'problema',
      title: 'Smoke sem auth',
      description: 'Deve ser bloqueado.',
      route: '/smoke',
    }],
    ['admin-observability', { action: 'get_dashboard' }],
    ['access-control', { action: 'get_context' }],
    ['whatsapp-instance-manager', { action: 'get_my_overview' }],
  ]
  for (const [path, body] of communicationCases) {
    const correlationId = `smoke-v1-${path}-unauthorized`
    const result = await callV1EdgeFunction(status, path, body, {
      acceptStatuses: [401],
      correlationId,
    })
    assertV1Response(result, { code: 'unauthorized', correlationId, status: 401 })
  }

  const whatsappPersistencePayload = await callV1EdgeFunction(
    status,
    'whatsapp-messaging',
    { action: 'get_contacts', instance_id: '00000000-0000-4000-8000-000000000001' },
    { acceptStatuses: [422], correlationId: 'smoke-v1-whatsapp-persistence-field' },
  )
  assertV1Response(whatsappPersistencePayload, {
    code: 'validation_failed',
    correlationId: 'smoke-v1-whatsapp-persistence-field',
    status: 422,
  })

  const clarisCredentialPayload = await callV1EdgeFunction(
    status,
    'claris-chat',
    { operation: 'send_message', message: 'Oi', history: [], moodleToken: 'browser-token' },
    { acceptStatuses: [422], correlationId: 'smoke-v1-claris-browser-credential' },
  )
  assertV1Response(clarisCredentialPayload, {
    code: 'validation_failed',
    correlationId: 'smoke-v1-claris-browser-credential',
    status: 422,
  })

  const appSettingsIdentityPayload = await callV1EdgeFunction(
    status,
    'app-settings',
    { action: 'get_admin', userId: 'browser-controlled' },
    { acceptStatuses: [422], correlationId: 'smoke-v1-app-settings-identity' },
  )
  assertV1Response(appSettingsIdentityPayload, {
    code: 'validation_failed',
    correlationId: 'smoke-v1-app-settings-identity',
    status: 422,
  })

  const supportIdentityPayload = await callV1EdgeFunction(
    status,
    'support-tickets',
    {
      action: 'create_ticket',
      type: 'problema',
      title: 'Smoke identity',
      description: 'Payload controlado pelo browser.',
      route: '/smoke',
      userId: '00000000-0000-4000-8000-000000000001',
    },
    { acceptStatuses: [422], correlationId: 'smoke-v1-support-identity' },
  )
  assertV1Response(supportIdentityPayload, {
    code: 'validation_failed',
    correlationId: 'smoke-v1-support-identity',
    status: 422,
  })

  const observabilityResolutionPayload = await callV1EdgeFunction(
    status,
    'admin-observability',
    {
      action: 'resolve_error_log',
      logId: '00000000-0000-4000-8000-000000000001',
      resolvedBy: '00000000-0000-4000-8000-000000000001',
    },
    { acceptStatuses: [422], correlationId: 'smoke-v1-observability-identity' },
  )
  assertV1Response(observabilityResolutionPayload, {
    code: 'validation_failed',
    correlationId: 'smoke-v1-observability-identity',
    status: 422,
  })

  const accessControlIdentityPayload = await callV1EdgeFunction(
    status,
    'access-control',
    { action: 'get_context', actorId: '00000000-0000-4000-8000-000000000001' },
    { acceptStatuses: [422], correlationId: 'smoke-v1-access-control-identity' },
  )
  assertV1Response(accessControlIdentityPayload, {
    code: 'validation_failed',
    correlationId: 'smoke-v1-access-control-identity',
    status: 422,
  })

  const clarisTestIdentityPayload = await callV1EdgeFunction(
    status,
    'claris-llm-test',
    { action: 'test_connection', userId: 'browser-controlled' },
    { acceptStatuses: [422], correlationId: 'smoke-v1-claris-test-identity' },
  )
  assertV1Response(clarisTestIdentityPayload, {
    code: 'validation_failed',
    correlationId: 'smoke-v1-claris-test-identity',
    status: 422,
  })

  log('Envelope V1 validado para autenticacao, validacao e funcoes de comunicacao.')
}

function runCourseManagementGrantChecks() {
  const result = JSON.parse(queryLocalDatabase(`
    WITH
      browser_roles(role_name) AS (
        VALUES ('anon'::TEXT), ('authenticated'::TEXT)
      ),
      protected_tables(table_name) AS (
        VALUES
          ('ai_grade_suggestion_history'::TEXT),
          ('ai_grade_suggestion_job_items'::TEXT),
          ('ai_grade_suggestion_jobs'::TEXT),
          ('attendance_course_settings'::TEXT),
          ('attendance_records'::TEXT),
          ('claris_suggestion_cooldowns'::TEXT),
          ('claris_suggestions'::TEXT),
          ('course_activity_visibility_overrides'::TEXT),
          ('student_activities'::TEXT),
          ('student_sync_snapshots'::TEXT),
          ('tasks'::TEXT),
          ('task_comments'::TEXT),
          ('task_history'::TEXT),
          ('tags'::TEXT),
          ('task_tags'::TEXT),
          ('calendar_events'::TEXT),
          ('message_templates'::TEXT),
          ('bulk_message_jobs'::TEXT),
          ('bulk_message_recipients'::TEXT),
          ('background_jobs'::TEXT),
          ('background_job_items'::TEXT),
          ('background_job_events'::TEXT),
          ('activity_feed'::TEXT),
          ('user_sync_preferences'::TEXT),
          ('user_course_catalog_eligibility'::TEXT),
          ('user_courses'::TEXT),
          ('user_ignored_courses'::TEXT),
          ('support_tickets'::TEXT)
      ),
      private_tables(table_name) AS (
        VALUES
          ('ai_grade_suggestion_history'::TEXT),
          ('ai_grade_suggestion_job_items'::TEXT),
          ('ai_grade_suggestion_jobs'::TEXT),
          ('claris_suggestion_cooldowns'::TEXT),
          ('claris_suggestions'::TEXT),
          ('student_sync_snapshots'::TEXT),
          ('tasks'::TEXT),
          ('task_comments'::TEXT),
          ('task_history'::TEXT),
          ('tags'::TEXT),
          ('task_tags'::TEXT),
          ('calendar_events'::TEXT),
          ('message_templates'::TEXT),
          ('bulk_message_jobs'::TEXT),
          ('bulk_message_recipients'::TEXT),
          ('background_jobs'::TEXT),
          ('background_job_items'::TEXT),
          ('background_job_events'::TEXT),
          ('activity_feed'::TEXT),
          ('user_sync_preferences'::TEXT),
          ('app_settings'::TEXT),
          ('app_usage_events'::TEXT),
          ('app_error_logs'::TEXT),
          ('claris_conversations'::TEXT),
          ('app_permission_definitions'::TEXT),
          ('app_groups'::TEXT),
          ('app_group_permissions'::TEXT),
          ('user_group_memberships'::TEXT),
          ('admin_user_roles'::TEXT),
          ('app_access_audit_log'::TEXT),
          ('app_service_instances'::TEXT),
          ('app_service_instance_events'::TEXT),
          ('app_service_instance_jobs'::TEXT),
          ('app_service_instance_limits'::TEXT),
          ('app_service_instance_health_logs'::TEXT),
          ('app_service_webhook_events'::TEXT),
          ('app_service_instance_group_permissions'::TEXT)
      ),
      protected_privileges(privilege_name) AS (
        VALUES
          ('INSERT'::TEXT),
          ('UPDATE'::TEXT),
          ('DELETE'::TEXT),
          ('TRUNCATE'::TEXT),
          ('REFERENCES'::TEXT),
          ('TRIGGER'::TEXT)
      ),
      protected_functions(signature) AS (
        VALUES
          ('public.get_user_courses_catalog_with_stats(uuid)'::TEXT),
          ('public.backend_replace_user_course_eligibility(uuid,uuid[])'::TEXT),
          ('public.backend_link_eligible_user_courses(uuid,uuid[])'::TEXT),
          ('public.backend_set_user_course_roles(uuid,uuid[],text)'::TEXT),
          ('public.backend_set_user_courses_ignored(uuid,uuid[],boolean)'::TEXT),
          ('public.backend_set_course_attendance_enabled(uuid,uuid[],boolean)'::TEXT),
          ('public.backend_set_course_activity_visibility(uuid,uuid,text,boolean)'::TEXT),
          ('public.backend_save_attendance_sheet(uuid,uuid,date,jsonb)'::TEXT),
          ('public.backend_get_attendance_date_summaries(uuid,uuid)'::TEXT),
          ('public.backend_list_students_page(uuid,uuid,text,text,text,integer,integer)'::TEXT),
          ('public.list_students_paginated(uuid,text,text,text,integer,integer)'::TEXT),
          ('public.backend_create_grade_suggestion_job_with_items(uuid,uuid,text,text,numeric,jsonb)'::TEXT),
          ('public.backend_cancel_grade_suggestion_job(uuid,uuid,text)'::TEXT),
          ('public.backend_list_tasks_page(uuid,text,text,date,date,boolean,text,integer,integer)'::TEXT),
          ('public.backend_add_task_tag(uuid,uuid,text,text,text,text)'::TEXT),
          ('public.backend_act_on_claris_suggestion(uuid,uuid,text)'::TEXT),
          ('public.backend_seed_message_templates(uuid,jsonb)'::TEXT),
          ('public.backend_update_claris_llm_settings(text,text,text,text,text)'::TEXT),
          ('public.backend_get_authorization_context(uuid)'::TEXT),
          ('public.backend_list_permission_definitions(uuid)'::TEXT),
          ('public.backend_list_access_groups(uuid)'::TEXT),
          ('public.backend_search_access_users(uuid,text,integer,integer)'::TEXT),
          ('public.backend_upsert_access_group(uuid,uuid,text,text,text[])'::TEXT),
          ('public.backend_delete_access_group(uuid,uuid,uuid)'::TEXT),
          ('public.backend_set_user_access(uuid,uuid,boolean,uuid)'::TEXT)
      ),
      browser_blocked_functions(signature) AS (
        SELECT signature FROM protected_functions
        UNION ALL
        SELECT signature
        FROM (VALUES
          ('public.get_current_user_authorization_context()'::TEXT),
          ('public.admin_list_permission_definitions()'::TEXT),
          ('public.admin_list_groups()'::TEXT),
          ('public.admin_search_users(text,integer,integer)'::TEXT),
          ('public.admin_upsert_group(uuid,text,text,text[])'::TEXT),
          ('public.admin_delete_group(uuid,uuid)'::TEXT),
          ('public.admin_set_user_group(uuid,uuid)'::TEXT),
          ('public.admin_set_user_admin(uuid,boolean)'::TEXT)
        ) AS legacy(signature)
      )
    SELECT json_build_object(
      'browserTableGrants', COALESCE((
        SELECT json_agg(grant_row)
        FROM (
          SELECT role_name, table_name, privilege_name
          FROM browser_roles
          CROSS JOIN protected_tables
          CROSS JOIN protected_privileges
          WHERE has_table_privilege(
            role_name,
            format('public.%I', table_name),
            privilege_name
          )
          ORDER BY role_name, table_name, privilege_name
        ) AS grant_row
      ), '[]'::JSON),
      'browserPrivateTableGrants', COALESCE((
        SELECT json_agg(grant_row)
        FROM (
          SELECT role_name, table_name, privilege_name
          FROM browser_roles
          CROSS JOIN private_tables
          CROSS JOIN (
            VALUES
              ('SELECT'::TEXT),
              ('INSERT'::TEXT),
              ('UPDATE'::TEXT),
              ('DELETE'::TEXT)
          ) AS private_privileges(privilege_name)
          WHERE has_table_privilege(
            role_name,
            format('public.%I', table_name),
            privilege_name
          )
          ORDER BY role_name, table_name, privilege_name
        ) AS grant_row
      ), '[]'::JSON),
      'browserFunctionGrants', COALESCE((
        SELECT json_agg(grant_row)
        FROM (
          SELECT role_name, signature
          FROM browser_roles
          CROSS JOIN browser_blocked_functions
          WHERE has_function_privilege(role_name, signature, 'EXECUTE')
          ORDER BY role_name, signature
        ) AS grant_row
      ), '[]'::JSON),
      'missingServiceFunctionGrants', COALESCE((
        SELECT json_agg(signature ORDER BY signature)
        FROM protected_functions
        WHERE NOT has_function_privilege('service_role', signature, 'EXECUTE')
      ), '[]'::JSON),
      'activeSyncIndexPresent', to_regclass('public.idx_background_jobs_active_sync_request') IS NOT NULL
    )::TEXT;
  `))

  if (result.browserTableGrants?.length > 0) {
    fail(`Roles de browser ainda possuem grants privilegiados: ${JSON.stringify(result.browserTableGrants)}`)
  }
  if (result.browserPrivateTableGrants?.length > 0) {
    fail(`Roles de browser ainda acessam tabelas privadas: ${JSON.stringify(result.browserPrivateTableGrants)}`)
  }
  if (result.browserFunctionGrants?.length > 0) {
    fail(`Roles de browser ainda executam RPCs internas: ${JSON.stringify(result.browserFunctionGrants)}`)
  }
  if (result.missingServiceFunctionGrants?.length > 0) {
    fail(`service_role nao executa RPCs internas: ${JSON.stringify(result.missingServiceFunctionGrants)}`)
  }
  if (result.activeSyncIndexPresent !== true) {
    fail('Indice de idempotencia dos jobs de sincronizacao nao foi aplicado.')
  }

  log('Grants internos dos dominios migrados bloqueados para browser e liberados para service_role.')
}

async function runTasksAndAgendaChecks(status, accessToken, authUserId) {
  const hiddenTaskId = '00000000-0000-4000-8000-000000000961'
  const hiddenEventId = '00000000-0000-4000-8000-000000000962'
  const taskTitle = 'Smoke Task Backend Boundary'
  const eventTitle = 'Smoke Calendar Backend Boundary'
  const tagLabel = 'SmokeTagAtomic'

  await deleteRows(status, 'tasks', { id: hiddenTaskId })
  await deleteRows(status, 'calendar_events', { id: hiddenEventId })
  await deleteRows(status, 'tasks', { title: taskTitle })
  await deleteRows(status, 'calendar_events', { title: eventTitle })
  await deleteRows(status, 'tags', { created_by: authUserId, label: tagLabel })

  const spoofCases = [
    {
      body: { action: 'list_tasks', filters: {}, page: 1, pageSize: 100, userId: authUserId },
      correlationId: 'smoke-v1-tasks-spoof',
      functionName: 'tasks',
    },
    {
      body: { action: 'create_task', input: { createdBy: authUserId, title: taskTitle } },
      correlationId: 'smoke-v1-task-create-spoof',
      functionName: 'tasks',
    },
    {
      body: { action: 'list_events', filters: {}, owner: authUserId },
      correlationId: 'smoke-v1-calendar-spoof',
      functionName: 'calendar-events',
    },
  ]

  for (const spoofCase of spoofCases) {
    const result = await callV1EdgeFunction(status, spoofCase.functionName, spoofCase.body, {
      acceptStatuses: [422],
      accessToken,
      correlationId: spoofCase.correlationId,
    })
    assertV1Response(result, {
      code: 'validation_failed',
      correlationId: spoofCase.correlationId,
      status: 422,
    })
  }

  const createdTask = await callV1EdgeFunction(status, 'tasks', {
    action: 'create_task',
    input: {
      dueDate: '2026-07-25',
      priority: 'high',
      status: 'todo',
      title: taskTitle,
    },
  }, {
    acceptStatuses: [200],
    accessToken,
    correlationId: 'smoke-v1-task-create',
  })
  assertV1Response(createdTask, { correlationId: 'smoke-v1-task-create', status: 200 })
  const taskId = createdTask.data?.data?.task?.id
  if (!taskId || createdTask.data?.data?.task?.createdBy !== authUserId) {
    fail(`tasks nao derivou o criador autenticado: ${JSON.stringify(createdTask.data)}`)
  }

  await upsertRows(status, 'tasks', 'id', {
    created_by: null,
    id: hiddenTaskId,
    title: 'Smoke Task Hidden',
  })
  const hiddenTask = await callV1EdgeFunction(status, 'tasks', {
    action: 'get_task_detail',
    taskId: hiddenTaskId,
  }, {
    acceptStatuses: [404],
    accessToken,
    correlationId: 'smoke-v1-task-hidden',
  })
  assertV1Response(hiddenTask, {
    code: 'not_found',
    correlationId: 'smoke-v1-task-hidden',
    status: 404,
  })

  const invalidStatus = await callV1EdgeFunction(status, 'tasks', {
    action: 'update_task',
    input: { status: 'archived' },
    taskId,
  }, {
    acceptStatuses: [422],
    accessToken,
    correlationId: 'smoke-v1-task-invalid-status',
  })
  assertV1Response(invalidStatus, {
    code: 'validation_failed',
    correlationId: 'smoke-v1-task-invalid-status',
    status: 422,
  })

  const updatedTask = await callV1EdgeFunction(status, 'tasks', {
    action: 'update_task',
    input: { status: 'done' },
    taskId,
  }, {
    acceptStatuses: [200],
    accessToken,
    correlationId: 'smoke-v1-task-update',
  })
  assertV1Response(updatedTask, { correlationId: 'smoke-v1-task-update', status: 200 })
  if (updatedTask.data?.data?.task?.status !== 'done') {
    fail(`tasks nao aplicou a transicao de status: ${JSON.stringify(updatedTask.data)}`)
  }

  const createdComment = await callV1EdgeFunction(status, 'tasks', {
    action: 'add_comment',
    comment: 'Comentario do smoke',
    taskId,
  }, {
    acceptStatuses: [200],
    accessToken,
    correlationId: 'smoke-v1-task-comment',
  })
  assertV1Response(createdComment, { correlationId: 'smoke-v1-task-comment', status: 200 })
  const commentId = createdComment.data?.data?.comment?.id
  if (!commentId || createdComment.data?.data?.comment?.authorId !== authUserId) {
    fail(`tasks nao derivou o autor do comentario: ${JSON.stringify(createdComment.data)}`)
  }

  const concurrentTags = await Promise.all(Array.from({ length: 12 }, (_, index) => (
    callV1EdgeFunction(status, 'tasks', {
      action: 'add_tag',
      tag: {
        entityId: 'smoke-student-001',
        entityType: 'aluno',
        label: tagLabel,
        prefix: 'aluno',
      },
      taskId,
    }, {
      acceptStatuses: [200],
      accessToken,
      correlationId: `smoke-v1-task-tag-${index}`,
    })
  )))
  const tagIds = new Set(concurrentTags.map((result, index) => {
    assertV1Response(result, { correlationId: `smoke-v1-task-tag-${index}`, status: 200 })
    return result.data?.data?.tag?.id
  }))
  if (tagIds.size !== 1 || tagIds.has(undefined)) {
    fail(`findOrCreateTag nao foi atomico: ${JSON.stringify([...tagIds])}`)
  }
  const [tagId] = [...tagIds]
  const persistedTags = await selectRows(status, 'tags', { created_by: authUserId, label: tagLabel })
  const persistedLinks = await selectRows(status, 'task_tags', { task_id: taskId })
  if (persistedTags.length !== 1 || persistedLinks.length !== 1 || persistedLinks[0]?.tag_id !== tagId) {
    fail(`Tag/link concorrente retornou cardinalidade inesperada: ${JSON.stringify({ persistedTags, persistedLinks })}`)
  }

  const taskDetail = await callV1EdgeFunction(status, 'tasks', {
    action: 'get_task_detail',
    taskId,
  }, {
    acceptStatuses: [200],
    accessToken,
    correlationId: 'smoke-v1-task-detail',
  })
  assertV1Response(taskDetail, { correlationId: 'smoke-v1-task-detail', status: 200 })
  if (
    taskDetail.data?.data?.task?.id !== taskId
    || taskDetail.data?.data?.comments?.length !== 1
    || taskDetail.data?.data?.tags?.length !== 1
  ) {
    fail(`tasks retornou detalhe inconsistente: ${JSON.stringify(taskDetail.data)}`)
  }

  const taskList = await callV1EdgeFunction(status, 'tasks', {
    action: 'list_tasks',
    filters: { status: 'done', tagSearch: 'smoketag' },
    order: 'createdAtDesc',
    page: 1,
    pageSize: 100,
  }, {
    acceptStatuses: [200],
    accessToken,
    correlationId: 'smoke-v1-task-list',
  })
  assertV1Response(taskList, { correlationId: 'smoke-v1-task-list', status: 200 })
  if (
    !taskList.data?.data?.items?.some((item) => item.id === taskId)
    || taskList.data?.data?.items?.some((item) => item.id === hiddenTaskId)
  ) {
    fail(`tasks retornou filtro ou escopo inesperado: ${JSON.stringify(taskList.data)}`)
  }

  const firstTagRemoval = await callV1EdgeFunction(status, 'tasks', {
    action: 'remove_tag', tagId, taskId,
  }, {
    acceptStatuses: [200], accessToken, correlationId: 'smoke-v1-task-tag-remove-1',
  })
  const repeatedTagRemoval = await callV1EdgeFunction(status, 'tasks', {
    action: 'remove_tag', tagId, taskId,
  }, {
    acceptStatuses: [200], accessToken, correlationId: 'smoke-v1-task-tag-remove-2',
  })
  if (firstTagRemoval.data?.data?.deleted !== true || repeatedTagRemoval.data?.data?.deleted !== false) {
    fail(`Remocao de tag nao foi idempotente: ${JSON.stringify({ firstTagRemoval, repeatedTagRemoval })}`)
  }

  const firstCommentDeletion = await callV1EdgeFunction(status, 'tasks', {
    action: 'delete_comment', commentId, taskId,
  }, {
    acceptStatuses: [200], accessToken, correlationId: 'smoke-v1-task-comment-delete-1',
  })
  const repeatedCommentDeletion = await callV1EdgeFunction(status, 'tasks', {
    action: 'delete_comment', commentId, taskId,
  }, {
    acceptStatuses: [200], accessToken, correlationId: 'smoke-v1-task-comment-delete-2',
  })
  if (firstCommentDeletion.data?.data?.deleted !== true || repeatedCommentDeletion.data?.data?.deleted !== false) {
    fail(`Remocao de comentario nao foi idempotente: ${JSON.stringify({ firstCommentDeletion, repeatedCommentDeletion })}`)
  }

  const createdEvent = await callV1EdgeFunction(status, 'calendar-events', {
    action: 'create_event',
    input: {
      endAt: '2026-07-25T13:00:00.000Z',
      startAt: '2026-07-25T12:00:00.000Z',
      title: eventTitle,
      type: 'alignment',
    },
  }, {
    acceptStatuses: [200],
    accessToken,
    correlationId: 'smoke-v1-calendar-create',
  })
  assertV1Response(createdEvent, { correlationId: 'smoke-v1-calendar-create', status: 200 })
  const eventId = createdEvent.data?.data?.event?.id
  if (!eventId || createdEvent.data?.data?.event?.externalSource !== 'manual') {
    fail(`calendar-events nao derivou a origem manual: ${JSON.stringify(createdEvent.data)}`)
  }

  const invalidInterval = await callV1EdgeFunction(status, 'calendar-events', {
    action: 'update_event',
    eventId,
    input: { endAt: '2026-07-25T11:00:00.000Z' },
  }, {
    acceptStatuses: [422],
    accessToken,
    correlationId: 'smoke-v1-calendar-invalid-interval',
  })
  assertV1Response(invalidInterval, {
    code: 'validation_failed',
    correlationId: 'smoke-v1-calendar-invalid-interval',
    status: 422,
  })

  await upsertRows(status, 'calendar_events', 'id', {
    id: hiddenEventId,
    owner: null,
    start_at: '2026-07-25T12:00:00.000Z',
    title: 'Smoke Calendar Hidden',
  })
  const hiddenEvent = await callV1EdgeFunction(status, 'calendar-events', {
    action: 'delete_event', eventId: hiddenEventId,
  }, {
    acceptStatuses: [404], accessToken, correlationId: 'smoke-v1-calendar-hidden',
  })
  assertV1Response(hiddenEvent, {
    code: 'not_found', correlationId: 'smoke-v1-calendar-hidden', status: 404,
  })

  const updatedEvent = await callV1EdgeFunction(status, 'calendar-events', {
    action: 'update_event', eventId, input: { title: `${eventTitle} Updated` },
  }, {
    acceptStatuses: [200], accessToken, correlationId: 'smoke-v1-calendar-update',
  })
  if (updatedEvent.data?.data?.event?.title !== `${eventTitle} Updated`) {
    fail(`calendar-events nao atualizou o evento: ${JSON.stringify(updatedEvent.data)}`)
  }

  const eventList = await callV1EdgeFunction(status, 'calendar-events', {
    action: 'list_events',
    filters: { from: '2026-07-01T00:00:00.000Z', to: '2026-07-31T23:59:59.999Z' },
    order: 'startAtAsc',
    page: 1,
    pageSize: 100,
  }, {
    acceptStatuses: [200], accessToken, correlationId: 'smoke-v1-calendar-list',
  })
  if (
    !eventList.data?.data?.items?.some((item) => item.id === eventId)
    || eventList.data?.data?.items?.some((item) => item.id === hiddenEventId)
  ) {
    fail(`calendar-events retornou escopo inesperado: ${JSON.stringify(eventList.data)}`)
  }

  await callV1EdgeFunction(status, 'calendar-events', {
    action: 'delete_event', eventId,
  }, {
    acceptStatuses: [200], accessToken, correlationId: 'smoke-v1-calendar-delete',
  })
  await callV1EdgeFunction(status, 'tasks', {
    action: 'delete_task', taskId,
  }, {
    acceptStatuses: [200], accessToken, correlationId: 'smoke-v1-task-delete',
  })

  await deleteRows(status, 'tasks', { id: hiddenTaskId })
  await deleteRows(status, 'calendar_events', { id: hiddenEventId })
  await deleteRows(status, 'tags', { created_by: authUserId, label: tagLabel })
  log('Tarefas, comentarios, tags atomicas e agenda validados pela fronteira backend V1.')
}

async function runAcademicReadChecks(
  status,
  accessToken,
  authUserId,
  courseId,
  studentId,
  hiddenCourseId,
  hiddenStudentId,
) {
  const spoofCases = [
    {
      body: { action: 'list_students', page: 1, pageSize: 30, userId: authUserId },
      functionName: 'students',
      correlationId: 'smoke-v1-students-spoof',
    },
    {
      body: { action: 'list_courses', userId: authUserId },
      functionName: 'academic-reports',
      correlationId: 'smoke-v1-academic-reports-spoof',
    },
    {
      body: {
        action: 'find_latest_relevant',
        activityId: studentId,
        courseId,
        userId: authUserId,
      },
      functionName: 'grade-suggestion-jobs',
      correlationId: 'smoke-v1-grade-suggestion-jobs-spoof',
    },
  ]

  for (const spoofCase of spoofCases) {
    const result = await callV1EdgeFunction(
      status,
      spoofCase.functionName,
      spoofCase.body,
      {
        acceptStatuses: [422],
        accessToken,
        correlationId: spoofCase.correlationId,
      },
    )
    assertV1Response(result, {
      code: 'validation_failed',
      correlationId: spoofCase.correlationId,
      status: 422,
    })
  }

  const studentsPage = await callV1EdgeFunction(
    status,
    'students',
    { action: 'list_students', page: 1, pageSize: 30 },
    {
      acceptStatuses: [200],
      accessToken,
      correlationId: 'smoke-v1-students-list',
    },
  )
  assertV1Response(studentsPage, { correlationId: 'smoke-v1-students-list', status: 200 })
  const studentsData = studentsPage.data?.data
  if (
    studentsData?.metadata?.contractVersion !== 1
    || !studentsData?.items?.some((student) => student.id === studentId)
    || studentsData.items.some((student) => student.id === hiddenStudentId)
  ) {
    fail(`students retornou pagina ou escopo inesperado: ${JSON.stringify(studentsPage.data)}`)
  }

  const profile = await callV1EdgeFunction(
    status,
    'students',
    { action: 'get_profile', studentId },
    {
      acceptStatuses: [200],
      accessToken,
      correlationId: 'smoke-v1-students-profile',
    },
  )
  assertV1Response(profile, { correlationId: 'smoke-v1-students-profile', status: 200 })
  if (
    profile.data?.data?.student?.id !== studentId
    || !Array.isArray(profile.data?.data?.courses)
    || profile.data?.data?.courses?.some((course) => course.id === hiddenCourseId)
  ) {
    fail(`students retornou perfil inesperado: ${JSON.stringify(profile.data)}`)
  }

  const hiddenProfile = await callV1EdgeFunction(
    status,
    'students',
    { action: 'get_profile', studentId: hiddenStudentId },
    {
      acceptStatuses: [404],
      accessToken,
      correlationId: 'smoke-v1-students-profile-hidden',
    },
  )
  assertV1Response(hiddenProfile, {
    code: 'not_found',
    correlationId: 'smoke-v1-students-profile-hidden',
    status: 404,
  })

  const history = await callV1EdgeFunction(
    status,
    'students',
    { action: 'get_history', studentId },
    {
      acceptStatuses: [200],
      accessToken,
      correlationId: 'smoke-v1-students-history',
    },
  )
  assertV1Response(history, { correlationId: 'smoke-v1-students-history', status: 200 })
  if (history.data?.data?.metadata?.contractVersion !== 1 || !Array.isArray(history.data?.data?.items)) {
    fail(`students retornou historico inesperado: ${JSON.stringify(history.data)}`)
  }

  const reportCourses = await callV1EdgeFunction(
    status,
    'academic-reports',
    { action: 'list_courses' },
    {
      acceptStatuses: [200],
      accessToken,
      correlationId: 'smoke-v1-academic-report-courses',
    },
  )
  assertV1Response(reportCourses, {
    correlationId: 'smoke-v1-academic-report-courses',
    status: 200,
  })
  if (
    !reportCourses.data?.data?.items?.some((course) => course.id === courseId)
    || reportCourses.data.data.items.some((course) => course.id === hiddenCourseId)
  ) {
    fail(`academic-reports vazou ou omitiu curso: ${JSON.stringify(reportCourses.data)}`)
  }

  const gradesReport = await callV1EdgeFunction(
    status,
    'academic-reports',
    {
      action: 'get_grades_report',
      courseIds: [courseId],
      includeSuspendedStudents: true,
    },
    {
      acceptStatuses: [200],
      accessToken,
      correlationId: 'smoke-v1-academic-grades-report',
    },
  )
  assertV1Response(gradesReport, {
    correlationId: 'smoke-v1-academic-grades-report',
    status: 200,
  })
  if (
    gradesReport.data?.data?.metadata?.contractVersion !== 1
    || !gradesReport.data?.data?.units?.some((course) => course.id === courseId)
    || !gradesReport.data?.data?.students?.some((student) => student.studentId === studentId)
  ) {
    fail(`academic-reports retornou relatorio de notas inesperado: ${JSON.stringify(gradesReport.data)}`)
  }

  const mixedScope = await callV1EdgeFunction(
    status,
    'academic-reports',
    {
      action: 'get_pending_activities_report',
      courseIds: [courseId, hiddenCourseId],
    },
    {
      acceptStatuses: [403],
      accessToken,
      correlationId: 'smoke-v1-academic-report-mixed-scope',
    },
  )
  assertV1Response(mixedScope, {
    code: 'forbidden',
    correlationId: 'smoke-v1-academic-report-mixed-scope',
    status: 403,
  })

  log('Alunos e relatorios validados com identidade derivada, DTO V1 e isolamento por curso.')
}

async function runCourseManagementChecks(
  status,
  accessToken,
  authUserId,
  courseId,
  studentId,
  hiddenCourseId,
  hiddenStudentId,
) {
  const activityMoodleId = 'smoke-activity-001'
  const attendanceDate = '2026-07-21'

  const spoofCases = [
    {
      body: { action: 'get_catalog', userId: authUserId },
      correlationId: 'smoke-v1-courses-catalog-spoof',
      functionName: 'courses-catalog',
    },
    {
      body: { action: 'get_panel', courseId, userId: authUserId },
      correlationId: 'smoke-v1-course-panel-spoof',
      functionName: 'course-panel',
    },
    {
      body: { action: 'get_overview', courseId, userId: authUserId },
      correlationId: 'smoke-v1-course-attendance-spoof',
      functionName: 'course-attendance',
    },
  ]

  for (const spoofCase of spoofCases) {
    const spoofResult = await callV1EdgeFunction(
      status,
      spoofCase.functionName,
      spoofCase.body,
      {
        acceptStatuses: [422],
        accessToken,
        correlationId: spoofCase.correlationId,
      },
    )
    assertV1Response(spoofResult, {
      code: 'validation_failed',
      correlationId: spoofCase.correlationId,
      status: 422,
    })
  }
  log('Spoof de identidade rejeitado pelos tres contratos de cursos.')

  const catalog = await callV1EdgeFunction(
    status,
    'courses-catalog',
    { action: 'get_catalog' },
    {
      acceptStatuses: [200],
      accessToken,
      correlationId: 'smoke-v1-courses-catalog',
    },
  )
  assertV1Response(catalog, { correlationId: 'smoke-v1-courses-catalog', status: 200 })
  const catalogData = catalog.data?.data
  const catalogCourse = catalogData?.items?.find((item) => item.id === courseId)
  if (
    catalogData?.metadata?.contractVersion !== 1
    || !catalogCourse
    || catalogCourse.isFollowing !== true
    || !catalogCourse.studentIds?.includes(studentId)
  ) {
    fail(`courses-catalog retornou DTO inesperado: ${JSON.stringify(catalog.data)}`)
  }
  if (catalogData.items.some((item) => item.id === hiddenCourseId)) {
    fail('courses-catalog vazou um curso sem associacao do usuario autenticado.')
  }

  const forbiddenAssociation = await callV1EdgeFunction(
    status,
    'courses-catalog',
    { action: 'set_association_role', courseIds: [hiddenCourseId], role: 'tutor' },
    {
      acceptStatuses: [403],
      accessToken,
      correlationId: 'smoke-v1-course-association-forbidden',
    },
  )
  assertV1Response(forbiddenAssociation, {
    code: 'forbidden',
    correlationId: 'smoke-v1-course-association-forbidden',
    status: 403,
  })
  const unauthorizedLinks = await selectRows(status, 'user_courses', {
    course_id: hiddenCourseId,
    user_id: authUserId,
  })
  if (unauthorizedLinks.length > 0) {
    fail('courses-catalog criou associacao fora do escopo do usuario.')
  }

  const ineligibleMoodleLink = await requestJson(
    `${status.FUNCTIONS_URL}/moodle-sync-courses`,
    {
      acceptStatuses: [403],
      body: {
        action: 'link_selected_courses',
        selectedCourseIds: [hiddenCourseId],
      },
      headers: publishableHeaders(status, accessToken),
      method: 'POST',
    },
  )
  if (!/eligibility/i.test(String(ineligibleMoodleLink.data?.error ?? ''))) {
    fail(`moodle-sync-courses nao rejeitou selecao inelegivel: ${JSON.stringify(ineligibleMoodleLink.data)}`)
  }

  await upsertRows(status, 'user_course_catalog_eligibility', 'user_id,course_id', {
    course_id: courseId,
    user_id: authUserId,
  })
  const eligibleMoodleLink = await requestJson(
    `${status.FUNCTIONS_URL}/moodle-sync-courses`,
    {
      acceptStatuses: [200],
      body: {
        action: 'link_selected_courses',
        selectedCourseIds: [courseId],
      },
      headers: publishableHeaders(status, accessToken),
      method: 'POST',
    },
  )
  if (eligibleMoodleLink.data?.success !== true || eligibleMoodleLink.data?.added !== 1) {
    fail(`moodle-sync-courses nao vinculou selecao elegivel: ${JSON.stringify(eligibleMoodleLink.data)}`)
  }
  log('Catalogo e vinculo Moodle bloquearam autoassociacao fora da elegibilidade.')

  await deleteRows(status, 'course_activity_visibility_overrides', {
    course_id: courseId,
    moodle_activity_id: activityMoodleId,
  }, 'course_id')
  await deleteRows(status, 'ai_grade_suggestion_jobs', {
    course_id: courseId,
    moodle_activity_id: activityMoodleId,
    user_id: authUserId,
  })
  await deleteRows(status, 'student_activities', {
    course_id: courseId,
    moodle_activity_id: activityMoodleId,
    student_id: studentId,
  })
  await deleteRows(status, 'attendance_records', {
    course_id: courseId,
    user_id: authUserId,
  })

  const [smokeActivity] = await upsertRows(status, 'student_activities', 'student_id,course_id,moodle_activity_id', {
    activity_name: 'Atividade Smoke Edge',
    activity_type: 'assign',
    course_id: courseId,
    hidden: false,
    moodle_activity_id: activityMoodleId,
    status: 'pending',
    student_id: studentId,
  })
  if (!smokeActivity?.id) {
    fail('Nao foi possivel seedar a atividade para o job de sugestao de nota.')
  }

  const createGradeSuggestionJob = async () => requestJson(
    `${status.REST_URL}/rpc/backend_create_grade_suggestion_job_with_items`,
    {
      acceptStatuses: [200],
      body: {
        p_activity_name: 'Atividade Smoke Edge',
        p_course_id: courseId,
        p_items: [{
          moodle_activity_id: activityMoodleId,
          student_activity_id: smokeActivity.id,
          student_id: studentId,
          student_name: seed.studentFullName,
        }],
        p_max_grade: 10,
        p_moodle_activity_id: activityMoodleId,
        p_user_id: authUserId,
      },
      headers: adminHeaders(status),
      method: 'POST',
    },
  )
  const firstGradeJob = await createGradeSuggestionJob()
  const repeatedGradeJob = await createGradeSuggestionJob()
  if (
    typeof firstGradeJob.data !== 'string'
    || repeatedGradeJob.data !== firstGradeJob.data
  ) {
    fail(`RPC de job de sugestao nao foi idempotente: ${JSON.stringify({ firstGradeJob, repeatedGradeJob })}`)
  }

  const gradeJobs = await selectRows(status, 'ai_grade_suggestion_jobs', {
    course_id: courseId,
    moodle_activity_id: activityMoodleId,
    user_id: authUserId,
  })
  const gradeJobItems = await selectRows(status, 'ai_grade_suggestion_job_items', {
    job_id: firstGradeJob.data,
  })
  if (gradeJobs.length !== 1 || gradeJobItems.length !== 1) {
    fail(`Criacao atomica de job/itens retornou cardinalidade inesperada: ${JSON.stringify({ gradeJobs, gradeJobItems })}`)
  }

  const relevantGradeJob = await callV1EdgeFunction(
    status,
    'grade-suggestion-jobs',
    {
      action: 'find_latest_relevant',
      activityId: smokeActivity.id,
      courseId,
    },
    {
      acceptStatuses: [200],
      accessToken,
      correlationId: 'smoke-v1-grade-suggestion-job',
    },
  )
  assertV1Response(relevantGradeJob, {
    correlationId: 'smoke-v1-grade-suggestion-job',
    status: 200,
  })
  if (
    relevantGradeJob.data?.data?.job?.jobId !== firstGradeJob.data
    || relevantGradeJob.data?.data?.job?.courseId !== courseId
  ) {
    fail(`grade-suggestion-jobs nao retornou o job do ator: ${JSON.stringify(relevantGradeJob.data)}`)
  }

  const forbiddenGradeJob = await callV1EdgeFunction(
    status,
    'grade-suggestion-jobs',
    {
      action: 'find_latest_relevant',
      activityId: smokeActivity.id,
      courseId: hiddenCourseId,
    },
    {
      acceptStatuses: [403],
      accessToken,
      correlationId: 'smoke-v1-grade-suggestion-job-forbidden',
    },
  )
  assertV1Response(forbiddenGradeJob, {
    code: 'forbidden',
    correlationId: 'smoke-v1-grade-suggestion-job-forbidden',
    status: 403,
  })

  const cancelledGradeJob = await requestJson(
    `${status.REST_URL}/rpc/backend_cancel_grade_suggestion_job`,
    {
      acceptStatuses: [200],
      body: {
        p_error_message: 'Cancelamento do smoke',
        p_job_id: firstGradeJob.data,
        p_user_id: authUserId,
      },
      headers: adminHeaders(status),
      method: 'POST',
    },
  )
  const [cancelledJobRow] = await selectRows(status, 'ai_grade_suggestion_jobs', {
    id: firstGradeJob.data,
  })
  const [cancelledItemRow] = await selectRows(status, 'ai_grade_suggestion_job_items', {
    job_id: firstGradeJob.data,
  })
  if (
    cancelledGradeJob.data !== true
    || cancelledJobRow?.status !== 'cancelled'
    || cancelledItemRow?.status !== 'cancelled'
  ) {
    fail(`Cancelamento atomico do job falhou: ${JSON.stringify({ cancelledGradeJob, cancelledJobRow, cancelledItemRow })}`)
  }
  log('Jobs de sugestao validados com escopo, criacao idempotente e cancelamento atomico.')

  const attendanceSetting = await callV1EdgeFunction(
    status,
    'courses-catalog',
    { action: 'set_attendance_enabled', courseIds: [courseId], enabled: true },
    {
      acceptStatuses: [200],
      accessToken,
      correlationId: 'smoke-v1-course-attendance-enable',
    },
  )
  assertV1Response(attendanceSetting, {
    correlationId: 'smoke-v1-course-attendance-enable',
    status: 200,
  })
  if (attendanceSetting.data?.data?.affectedCourseCount !== 1) {
    fail(`courses-catalog nao habilitou frequencia: ${JSON.stringify(attendanceSetting.data)}`)
  }

  const panel = await callV1EdgeFunction(
    status,
    'course-panel',
    { action: 'get_panel', courseId },
    {
      acceptStatuses: [200],
      accessToken,
      correlationId: 'smoke-v1-course-panel',
    },
  )
  assertV1Response(panel, { correlationId: 'smoke-v1-course-panel', status: 200 })
  const panelData = panel.data?.data
  if (
    panelData?.metadata?.contractVersion !== 1
    || panelData?.course?.id !== courseId
    || panelData?.attendanceEnabled !== true
    || !panelData?.students?.some((student) => student.id === studentId)
    || panelData?.students?.some((student) => student.id === hiddenStudentId)
    || !panelData?.activities?.some((activity) => activity.moodleActivityId === activityMoodleId)
  ) {
    fail(`course-panel retornou DTO ou escopo inesperado: ${JSON.stringify(panel.data)}`)
  }

  const forbiddenPanel = await callV1EdgeFunction(
    status,
    'course-panel',
    { action: 'get_panel', courseId: hiddenCourseId },
    {
      acceptStatuses: [403],
      accessToken,
      correlationId: 'smoke-v1-course-panel-forbidden',
    },
  )
  assertV1Response(forbiddenPanel, {
    code: 'forbidden',
    correlationId: 'smoke-v1-course-panel-forbidden',
    status: 403,
  })
  log('Catalogo autenticado e painel restrito ao curso associado validados.')

  const invalidAttendance = await callV1EdgeFunction(
    status,
    'course-attendance',
    {
      action: 'save_sheet',
      courseId,
      date: attendanceDate,
      entries: [
        { notes: 'entrada valida do lote', status: 'presente', studentId },
        { notes: 'aluno de outro curso', status: 'ausente', studentId: hiddenStudentId },
      ],
    },
    {
      acceptStatuses: [422],
      accessToken,
      correlationId: 'smoke-v1-course-attendance-atomic',
    },
  )
  assertV1Response(invalidAttendance, {
    code: 'validation_failed',
    correlationId: 'smoke-v1-course-attendance-atomic',
    status: 422,
  })
  const recordsAfterRejectedBatch = await selectRows(status, 'attendance_records', {
    attendance_date: attendanceDate,
    course_id: courseId,
    user_id: authUserId,
  })
  if (recordsAfterRejectedBatch.length !== 0) {
    fail(`Lote invalido de frequencia foi persistido parcialmente: ${JSON.stringify(recordsAfterRejectedBatch)}`)
  }

  const validAttendance = await callV1EdgeFunction(
    status,
    'course-attendance',
    {
      action: 'save_sheet',
      courseId,
      date: attendanceDate,
      entries: [{ notes: 'registro valido', status: 'presente', studentId }],
    },
    {
      acceptStatuses: [200],
      accessToken,
      correlationId: 'smoke-v1-course-attendance-save',
    },
  )
  assertV1Response(validAttendance, {
    correlationId: 'smoke-v1-course-attendance-save',
    status: 200,
  })
  if (validAttendance.data?.data?.savedCount !== 1) {
    fail(`course-attendance nao salvou o lote valido: ${JSON.stringify(validAttendance.data)}`)
  }

  const historicalAttendanceCount = Number(queryLocalDatabase(`
    WITH inserted_rows AS (
      INSERT INTO public.attendance_records (
        user_id,
        course_id,
        student_id,
        attendance_date,
        status,
        notes
      )
      SELECT
        '${authUserId}'::UUID,
        '${courseId}'::UUID,
        '${studentId}'::UUID,
        DATE '2025-01-01' + day_offset,
        CASE (day_offset % 3)
          WHEN 0 THEN 'presente'
          WHEN 1 THEN 'ausente'
          ELSE 'justificado'
        END,
        'historico smoke'
      FROM generate_series(0, 120) AS series_row(day_offset)
      ON CONFLICT (user_id, course_id, student_id, attendance_date) DO UPDATE
      SET status = EXCLUDED.status, notes = EXCLUDED.notes, updated_at = now()
      RETURNING 1
    )
    SELECT count(*) FROM inserted_rows;
  `))
  if (historicalAttendanceCount !== 121) {
    fail(`Nao foi possivel seedar o historico paginado de frequencia: ${historicalAttendanceCount}`)
  }

  const attendanceOverview = await callV1EdgeFunction(
    status,
    'course-attendance',
    { action: 'get_overview', courseId, limit: 10, offset: 0 },
    {
      acceptStatuses: [200],
      accessToken,
      correlationId: 'smoke-v1-course-attendance-overview',
    },
  )
  assertV1Response(attendanceOverview, {
    correlationId: 'smoke-v1-course-attendance-overview',
    status: 200,
  })
  const savedAttendance = attendanceOverview.data?.data?.records?.find((record) => (
    record.date === attendanceDate && record.student?.id === studentId
  ))
  if (
    attendanceOverview.data?.data?.metadata?.contractVersion !== 1
    || savedAttendance?.status !== 'presente'
  ) {
    fail(`course-attendance retornou historico inesperado: ${JSON.stringify(attendanceOverview.data)}`)
  }
  const dateSummaries = attendanceOverview.data?.data?.dateSummaries
  if (
    attendanceOverview.data?.data?.metadata?.hasMore !== true
    || !Array.isArray(dateSummaries)
    || dateSummaries.length !== 122
    || !dateSummaries.some((summary) => (
      summary.date === attendanceDate
      && summary.presente === 1
      && summary.total === 1
    ))
  ) {
    fail(`course-attendance truncou os totais por data: ${JSON.stringify(attendanceOverview.data)}`)
  }
  log('Frequencia validou atomicidade e totais completos alem da pagina de detalhes.')

  const visibility = await callV1EdgeFunction(
    status,
    'course-panel',
    {
      action: 'set_activity_visibility',
      courseId,
      hidden: true,
      moodleActivityId: activityMoodleId,
    },
    {
      acceptStatuses: [200],
      accessToken,
      correlationId: 'smoke-v1-course-activity-visibility',
    },
  )
  assertV1Response(visibility, {
    correlationId: 'smoke-v1-course-activity-visibility',
    status: 200,
  })
  if (visibility.data?.data?.updatedCount !== 1 || visibility.data?.data?.hidden !== true) {
    fail(`course-panel nao persistiu visibilidade: ${JSON.stringify(visibility.data)}`)
  }

  await upsertRows(status, 'student_activities', 'student_id,course_id,moodle_activity_id', {
    activity_name: 'Atividade Smoke Edge sincronizada',
    activity_type: 'assign',
    course_id: courseId,
    hidden: false,
    moodle_activity_id: activityMoodleId,
    status: 'pending',
    student_id: studentId,
  })
  const [syncedActivity] = await selectRows(status, 'student_activities', {
    course_id: courseId,
    moodle_activity_id: activityMoodleId,
    student_id: studentId,
  })
  const [visibilityOverride] = await selectRows(status, 'course_activity_visibility_overrides', {
    course_id: courseId,
    moodle_activity_id: activityMoodleId,
  })
  if (syncedActivity?.hidden !== true || visibilityOverride?.hidden !== true) {
    fail(`Sync sobrescreveu o override de visibilidade: ${JSON.stringify({ syncedActivity, visibilityOverride })}`)
  }
  log('Override manual de visibilidade sobreviveu a um upsert equivalente ao sync.')

  await deleteRows(status, 'attendance_records', {
    course_id: courseId,
    user_id: authUserId,
  })
  await deleteRows(status, 'course_activity_visibility_overrides', {
    course_id: courseId,
    moodle_activity_id: activityMoodleId,
  }, 'course_id')
  await deleteRows(status, 'ai_grade_suggestion_jobs', {
    course_id: courseId,
    moodle_activity_id: activityMoodleId,
    user_id: authUserId,
  })
  await deleteRows(status, 'student_activities', {
    course_id: courseId,
    moodle_activity_id: activityMoodleId,
    student_id: studentId,
  })
  const disabledAttendance = await callV1EdgeFunction(
    status,
    'courses-catalog',
    { action: 'set_attendance_enabled', courseIds: [courseId], enabled: false },
    {
      acceptStatuses: [200],
      accessToken,
      correlationId: 'smoke-v1-course-attendance-disable',
    },
  )
  assertV1Response(disabledAttendance, {
    correlationId: 'smoke-v1-course-attendance-disable',
    status: 200,
  })

  runCourseManagementGrantChecks()
}

async function runCommunicationsChecks(status, accessToken, authUserId, studentId) {
  const templateTitle = 'Smoke Template Comunicacoes'
  const campaignTitle = 'Smoke Campaign Comunicacoes'
  const jobId = '00000000-0000-4000-8000-000000000902'
  const foreignJobId = '00000000-0000-4000-8000-000000000905'
  const instanceId = '00000000-0000-4000-8000-000000000906'
  const blockedInstanceId = '00000000-0000-4000-8000-000000000907'

  await deleteRows(status, 'message_templates', { title: templateTitle, user_id: authUserId })
  await deleteRows(status, 'scheduled_messages', { title: campaignTitle, user_id: authUserId })
  await deleteRows(status, 'bulk_message_jobs', { id: jobId })
  await deleteRows(status, 'bulk_message_jobs', { id: foreignJobId })
  await deleteRows(status, 'app_service_instances', { id: instanceId })
  await deleteRows(status, 'app_service_instances', { id: blockedInstanceId })

  const templatesList = await callV1EdgeFunction(
    status,
    'message-templates',
    { action: 'list_templates' },
    {
      acceptStatuses: [200],
      accessToken,
      correlationId: 'smoke-v1-message-templates-list',
    },
  )
  assertV1Response(templatesList, {
    correlationId: 'smoke-v1-message-templates-list',
    status: 200,
  })
  if (!Array.isArray(templatesList.data?.data?.items) || templatesList.data.data.items.length < 1) {
    fail(`message-templates nao seedou defaults no backend: ${JSON.stringify(templatesList.data)}`)
  }

  const spoofedTemplateActor = await callV1EdgeFunction(
    status,
    'message-templates',
    { action: 'list_templates', userId: authUserId },
    {
      acceptStatuses: [422],
      accessToken,
      correlationId: 'smoke-v1-message-templates-spoof',
    },
  )
  assertV1Response(spoofedTemplateActor, {
    code: 'validation_failed',
    correlationId: 'smoke-v1-message-templates-spoof',
    status: 422,
  })

  const createdTemplate = await callV1EdgeFunction(
    status,
    'message-templates',
    {
      action: 'create_template',
      input: { category: 'smoke', content: 'Mensagem de smoke', title: templateTitle },
    },
    {
      acceptStatuses: [200],
      accessToken,
      correlationId: 'smoke-v1-message-templates-create',
    },
  )
  assertV1Response(createdTemplate, {
    correlationId: 'smoke-v1-message-templates-create',
    status: 200,
  })
  const templateId = createdTemplate.data?.data?.template?.id
  if (!templateId) fail(`message-templates create nao retornou id: ${JSON.stringify(createdTemplate.data)}`)

  const favoriteTemplate = await callV1EdgeFunction(
    status,
    'message-templates',
    { action: 'set_favorite', isFavorite: true, templateId },
    {
      acceptStatuses: [200],
      accessToken,
      correlationId: 'smoke-v1-message-templates-favorite',
    },
  )
  assertV1Response(favoriteTemplate, {
    correlationId: 'smoke-v1-message-templates-favorite',
    status: 200,
  })
  if (favoriteTemplate.data?.data?.template?.isFavorite !== true) {
    fail(`message-templates nao atualizou favorito: ${JSON.stringify(favoriteTemplate.data)}`)
  }

  const audience = await callV1EdgeFunction(
    status,
    'bulk-message-audience',
    { action: 'get_audience' },
    {
      acceptStatuses: [200],
      accessToken,
      correlationId: 'smoke-v1-bulk-message-audience',
    },
  )
  assertV1Response(audience, {
    correlationId: 'smoke-v1-bulk-message-audience',
    status: 200,
  })
  const audienceStudent = audience.data?.data?.students?.find((student) => student.id === studentId)
  if (audienceStudent?.moodleUserId !== seed.studentMoodleUserId) {
    fail(`bulk-message-audience nao resolveu aluno autorizado: ${JSON.stringify(audience.data)}`)
  }
  if (JSON.stringify(audience.data?.data).includes('moodle_user_id')) {
    fail('bulk-message-audience vazou nomes de persistencia no contrato V1.')
  }

  const inaccessibleRecipient = await callV1EdgeFunction(
    status,
    'bulk-message-send',
    {
      action: 'start_send',
      messageContent: 'Destinatario inacessivel',
      moodleUrl: 'https://example.com',
      origin: 'manual',
      recipients: [{ studentId: '99999999-9999-4999-8999-999999999999' }],
      token: 'token-smoke',
    },
    {
      acceptStatuses: [422],
      accessToken,
      correlationId: 'smoke-v1-bulk-message-inaccessible',
    },
  )
  assertV1Response(inaccessibleRecipient, {
    code: 'validation_failed',
    correlationId: 'smoke-v1-bulk-message-inaccessible',
    status: 422,
  })

  await upsertRows(status, 'bulk_message_jobs', 'id', {
    id: jobId,
    user_id: authUserId,
    message_content: 'Historico smoke comunicacoes',
    total_recipients: 2,
    sent_count: 1,
    failed_count: 1,
    status: 'completed',
    origin: 'manual',
  })
  await upsertRows(status, 'bulk_message_recipients', 'id', [
    {
      id: '00000000-0000-4000-8000-000000000903',
      job_id: jobId,
      student_id: studentId,
      moodle_user_id: seed.studentMoodleUserId,
      student_name: 'Aluno A Smoke',
      status: 'sent',
    },
    {
      id: '00000000-0000-4000-8000-000000000904',
      job_id: jobId,
      student_id: studentId,
      moodle_user_id: seed.studentMoodleUserId,
      student_name: 'Aluno B Smoke',
      status: 'failed',
    },
  ])
  await upsertRows(status, 'bulk_message_jobs', 'id', {
    id: foreignJobId,
    user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    message_content: 'Historico fora do escopo',
    total_recipients: 0,
    status: 'completed',
    origin: 'manual',
  })

  const jobsPage = await callV1EdgeFunction(
    status,
    'campaigns',
    {
      action: 'list_bulk_jobs',
      filters: { search: 'Historico smoke comunicacoes' },
      order: 'createdAtDesc',
      page: 1,
      pageSize: 1,
    },
    {
      acceptStatuses: [200],
      accessToken,
      correlationId: 'smoke-v1-campaigns-jobs',
    },
  )
  assertV1Response(jobsPage, { correlationId: 'smoke-v1-campaigns-jobs', status: 200 })
  if (jobsPage.data?.data?.totalCount !== 1 || jobsPage.data?.data?.items?.[0]?.id !== jobId) {
    fail(`campaigns nao paginou jobs no escopo do ator: ${JSON.stringify(jobsPage.data)}`)
  }

  const recipientsPage = await callV1EdgeFunction(
    status,
    'campaigns',
    { action: 'list_bulk_job_recipients', jobId, order: 'studentNameAsc', page: 2, pageSize: 1 },
    {
      acceptStatuses: [200],
      accessToken,
      correlationId: 'smoke-v1-campaigns-recipients',
    },
  )
  assertV1Response(recipientsPage, {
    correlationId: 'smoke-v1-campaigns-recipients',
    status: 200,
  })
  if (recipientsPage.data?.data?.totalCount !== 2 || recipientsPage.data?.data?.items?.length !== 1) {
    fail(`campaigns nao paginou recipients: ${JSON.stringify(recipientsPage.data)}`)
  }

  const foreignJob = await callV1EdgeFunction(
    status,
    'campaigns',
    { action: 'get_bulk_job_detail', jobId: foreignJobId },
    {
      acceptStatuses: [404],
      accessToken,
      correlationId: 'smoke-v1-campaigns-foreign-job',
    },
  )
  assertV1Response(foreignJob, {
    code: 'not_found',
    correlationId: 'smoke-v1-campaigns-foreign-job',
    status: 404,
  })

  const scheduleInput = {
    channel: 'moodle',
    messageContent: 'Mensagem agendada smoke',
    moodleUrl: 'https://example.com',
    schedule: { type: 'specific_date' },
    scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
    selectedRecipients: [{ personalizedMessage: 'Mensagem personalizada', studentId }],
    templateId,
    title: campaignTitle,
  }
  const createdCampaign = await callV1EdgeFunction(
    status,
    'campaigns',
    { action: 'create_scheduled_message', input: scheduleInput },
    {
      acceptStatuses: [200],
      accessToken,
      correlationId: 'smoke-v1-campaigns-create',
    },
  )
  assertV1Response(createdCampaign, { correlationId: 'smoke-v1-campaigns-create', status: 200 })
  const campaign = createdCampaign.data?.data?.message
  const campaignId = campaign?.id
  const recipientSnapshot = campaign?.executionContext?.recipientSnapshot?.[0]
  if (
    !campaignId
    || campaign?.recipientCount !== 1
    || recipientSnapshot?.moodleUserId !== seed.studentMoodleUserId
    || recipientSnapshot?.studentName !== seed.studentFullName
  ) {
    fail(`campaigns nao derivou snapshot autoritativo: ${JSON.stringify(createdCampaign.data)}`)
  }
  if (JSON.stringify(campaign).includes('recipient_snapshot')) {
    fail('campaigns vazou nomes de persistencia no contrato V1.')
  }

  const updatedCampaign = await callV1EdgeFunction(
    status,
    'campaigns',
    {
      action: 'update_scheduled_message',
      input: { ...scheduleInput, messageContent: 'Mensagem atualizada smoke' },
      messageId: campaignId,
    },
    {
      acceptStatuses: [200],
      accessToken,
      correlationId: 'smoke-v1-campaigns-update',
    },
  )
  assertV1Response(updatedCampaign, { correlationId: 'smoke-v1-campaigns-update', status: 200 })
  if (updatedCampaign.data?.data?.message?.messageContent !== 'Mensagem atualizada smoke') {
    fail(`campaigns nao atualizou mensagem: ${JSON.stringify(updatedCampaign.data)}`)
  }

  const pausedCampaign = await callV1EdgeFunction(
    status,
    'campaigns',
    { action: 'transition_scheduled_message', messageId: campaignId, transition: 'pause' },
    {
      acceptStatuses: [200],
      accessToken,
      correlationId: 'smoke-v1-campaigns-pause',
    },
  )
  assertV1Response(pausedCampaign, { correlationId: 'smoke-v1-campaigns-pause', status: 200 })
  if (pausedCampaign.data?.data?.message?.status !== 'paused') {
    fail(`campaigns nao pausou agendamento: ${JSON.stringify(pausedCampaign.data)}`)
  }

  const invalidPause = await callV1EdgeFunction(
    status,
    'campaigns',
    { action: 'transition_scheduled_message', messageId: campaignId, transition: 'pause' },
    {
      acceptStatuses: [409],
      accessToken,
      correlationId: 'smoke-v1-campaigns-invalid-pause',
    },
  )
  assertV1Response(invalidPause, {
    code: 'conflict',
    correlationId: 'smoke-v1-campaigns-invalid-pause',
    status: 409,
  })

  for (const [transition, correlationId] of [
    ['resume', 'smoke-v1-campaigns-resume'],
    ['cancel', 'smoke-v1-campaigns-cancel'],
  ]) {
    const result = await callV1EdgeFunction(
      status,
      'campaigns',
      { action: 'transition_scheduled_message', messageId: campaignId, transition },
      { acceptStatuses: [200], accessToken, correlationId },
    )
    assertV1Response(result, { correlationId, status: 200 })
  }

  const deletedCampaign = await callV1EdgeFunction(
    status,
    'campaigns',
    { action: 'delete_scheduled_message', messageId: campaignId },
    {
      acceptStatuses: [200],
      accessToken,
      correlationId: 'smoke-v1-campaigns-delete',
    },
  )
  assertV1Response(deletedCampaign, { correlationId: 'smoke-v1-campaigns-delete', status: 200 })

  await upsertRows(status, 'app_service_instances', 'id', [
    {
      id: instanceId,
      name: 'WhatsApp Smoke Ativo',
      service_type: 'whatsapp',
      provider: 'evolution_api',
      scope: 'shared',
      owner_user_id: null,
      evolution_instance_name: 'claris-smoke-active',
      connection_status: 'connected',
      operational_status: 'connected',
      is_active: true,
      is_blocked: false,
      metadata: { phone_number: '5562999990000' },
    },
    {
      id: blockedInstanceId,
      name: 'WhatsApp Smoke Bloqueado',
      service_type: 'whatsapp',
      provider: 'evolution_api',
      scope: 'shared',
      owner_user_id: null,
      evolution_instance_name: 'claris-smoke-blocked',
      connection_status: 'blocked',
      operational_status: 'blocked',
      is_active: true,
      is_blocked: true,
      metadata: {},
    },
  ])
  const instances = await callV1EdgeFunction(
    status,
    'whatsapp-messaging',
    { action: 'list_instances' },
    {
      acceptStatuses: [200],
      accessToken,
      correlationId: 'smoke-v1-whatsapp-instances',
    },
  )
  assertV1Response(instances, { correlationId: 'smoke-v1-whatsapp-instances', status: 200 })
  const activeInstance = instances.data?.data?.instances?.find((instance) => instance.id === instanceId)
  const blockedInstance = instances.data?.data?.instances?.find((instance) => instance.id === blockedInstanceId)
  if (activeInstance?.metadata?.phoneNumber !== '5562999990000' || blockedInstance) {
    fail(`whatsapp-messaging nao filtrou instancias no backend: ${JSON.stringify(instances.data)}`)
  }
  const serializedInstances = JSON.stringify(instances.data?.data)
  if (serializedInstances.includes('ownerUserId') || serializedInstances.includes('connection_status')) {
    fail('whatsapp-messaging vazou ownership ou nomes de persistencia.')
  }

  const spoofedWhatsappActor = await callV1EdgeFunction(
    status,
    'whatsapp-messaging',
    { action: 'list_instances', ownerUserId: authUserId },
    {
      acceptStatuses: [422],
      accessToken,
      correlationId: 'smoke-v1-whatsapp-spoof',
    },
  )
  assertV1Response(spoofedWhatsappActor, {
    code: 'validation_failed',
    correlationId: 'smoke-v1-whatsapp-spoof',
    status: 422,
  })

  const deletedTemplate = await callV1EdgeFunction(
    status,
    'message-templates',
    { action: 'delete_template', templateId },
    {
      acceptStatuses: [200],
      accessToken,
      correlationId: 'smoke-v1-message-templates-delete',
    },
  )
  assertV1Response(deletedTemplate, {
    correlationId: 'smoke-v1-message-templates-delete',
    status: 200,
  })

  await deleteRows(status, 'bulk_message_jobs', { id: jobId })
  await deleteRows(status, 'bulk_message_jobs', { id: foreignJobId })
  await deleteRows(status, 'app_service_instances', { id: instanceId })
  await deleteRows(status, 'app_service_instances', { id: blockedInstanceId })
  runCourseManagementGrantChecks()
  log('Templates, publico, historico, campanhas e WhatsApp validados no backend real.')
}

async function runSyncAndBackgroundJobsChecks(status, accessToken, authUserId, courseId) {
  const jobId = '00000000-0000-4000-8000-000000000971'
  const sourceRecordId = '00000000-0000-4000-8000-000000000972'
  const feedId = '00000000-0000-4000-8000-000000000973'

  await upsertRows(status, 'user_course_catalog_eligibility', 'user_id,course_id', {
    course_id: courseId,
    user_id: authUserId,
  })

  const spoofCases = [
    {
      body: { action: 'list_active_jobs', userId: authUserId },
      correlationId: 'smoke-v1-moodle-sync-spoof',
      functionName: 'moodle-sync-jobs',
    },
    {
      body: { action: 'start_initial_sync', courseIds: [courseId], token: 'browser-token' },
      correlationId: 'smoke-v1-moodle-sync-token',
      functionName: 'moodle-sync-jobs',
    },
    {
      body: { action: 'list_active', user_id: authUserId },
      correlationId: 'smoke-v1-background-jobs-spoof',
      functionName: 'background-jobs',
    },
    {
      body: { action: 'list', limit: 20, userId: authUserId },
      correlationId: 'smoke-v1-activity-feed-spoof',
      functionName: 'activity-feed',
    },
  ]

  for (const spoofCase of spoofCases) {
    const result = await callV1EdgeFunction(status, spoofCase.functionName, spoofCase.body, {
      acceptStatuses: [422],
      accessToken,
      correlationId: spoofCase.correlationId,
    })
    assertV1Response(result, {
      code: 'validation_failed',
      correlationId: spoofCase.correlationId,
      status: 422,
    })
  }

  const savedPreferences = await callV1EdgeFunction(status, 'moodle-sync-jobs', {
    action: 'save_preferences',
    includeEmptyCourses: true,
    includeFinished: false,
    selectedKeys: ['Smoke::Evento'],
  }, {
    acceptStatuses: [200],
    accessToken,
    correlationId: 'smoke-v1-sync-preferences-save',
  })
  assertV1Response(savedPreferences, {
    correlationId: 'smoke-v1-sync-preferences-save',
    status: 200,
  })
  if (
    savedPreferences.data?.data?.includeEmptyCourses !== true
    || savedPreferences.data?.data?.selectedKeys?.[0] !== 'Smoke::Evento'
  ) {
    fail(`moodle-sync-jobs nao persistiu preferencias: ${JSON.stringify(savedPreferences.data)}`)
  }

  const loadedPreferences = await callV1EdgeFunction(status, 'moodle-sync-jobs', {
    action: 'get_preferences',
  }, {
    acceptStatuses: [200],
    accessToken,
    correlationId: 'smoke-v1-sync-preferences-get',
  })
  assertV1Response(loadedPreferences, {
    correlationId: 'smoke-v1-sync-preferences-get',
    status: 200,
  })
  if (loadedPreferences.data?.data?.selectedKeys?.[0] !== 'Smoke::Evento') {
    fail(`moodle-sync-jobs nao retornou preferencias: ${JSON.stringify(loadedPreferences.data)}`)
  }

  const courseCounts = await callV1EdgeFunction(status, 'moodle-sync-jobs', {
    action: 'get_course_student_counts',
    courseIds: [courseId],
  }, {
    acceptStatuses: [200],
    accessToken,
    correlationId: 'smoke-v1-sync-counts',
  })
  assertV1Response(courseCounts, { correlationId: 'smoke-v1-sync-counts', status: 200 })
  if (courseCounts.data?.data?.counts?.[0]?.courseId !== courseId || courseCounts.data.data.counts[0].studentCount !== 1) {
    fail(`moodle-sync-jobs retornou contagem inesperada: ${JSON.stringify(courseCounts.data)}`)
  }

  const risk = await callV1EdgeFunction(status, 'moodle-sync-jobs', {
    action: 'recalculate_risk',
    courseIds: [courseId],
  }, {
    acceptStatuses: [200],
    accessToken,
    correlationId: 'smoke-v1-sync-risk',
  })
  assertV1Response(risk, { correlationId: 'smoke-v1-sync-risk', status: 200 })
  if (risk.data?.data?.contractVersion !== 1 || typeof risk.data?.data?.updatedCount !== 'number') {
    fail(`moodle-sync-jobs retornou recálculo de risco invalido: ${JSON.stringify(risk.data)}`)
  }

  await deleteRows(status, 'user_moodle_reauth_credentials', { user_id: authUserId }, 'user_id')
  const liveJobStart = await callV1EdgeFunction(status, 'moodle-sync-jobs', {
    action: 'start_course_sync',
    courseIds: [courseId],
    entities: ['students'],
  }, {
    acceptStatuses: [200],
    accessToken,
    correlationId: 'smoke-v1-sync-live-start',
  })
  assertV1Response(liveJobStart, { correlationId: 'smoke-v1-sync-live-start', status: 200 })
  const liveJobId = liveJobStart.data?.data?.job?.id
  if (!liveJobId || liveJobStart.data?.data?.job?.totalItems !== 2) {
    fail(`moodle-sync-jobs nao criou a maquina de estados esperada: ${JSON.stringify(liveJobStart.data)}`)
  }

  const waitForLiveJobFailure = async (phase) => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const correlationId = `smoke-v1-sync-live-${phase}-${attempt}`
      const polled = await callV1EdgeFunction(status, 'moodle-sync-jobs', {
        action: 'get_job',
        jobId: liveJobId,
      }, {
        acceptStatuses: [200],
        accessToken,
        correlationId,
      })
      assertV1Response(polled, { correlationId, status: 200 })
      const job = polled.data?.data?.job
      if (job?.status === 'failed') {
        if (!String(job.errorMessage || '').toLowerCase().includes('reautorizacao')) {
          fail(`Worker falhou sem erro controlado de reautorizacao: ${JSON.stringify(polled.data)}`)
        }
        return job
      }
      await sleep(100)
    }
    fail(`Worker nao concluiu a falha controlada na fase ${phase}.`)
  }

  await waitForLiveJobFailure('initial')
  const retriedLiveJob = await callV1EdgeFunction(status, 'moodle-sync-jobs', {
    action: 'retry_job',
    jobId: liveJobId,
  }, {
    acceptStatuses: [200],
    accessToken,
    correlationId: 'smoke-v1-sync-live-retry',
  })
  assertV1Response(retriedLiveJob, { correlationId: 'smoke-v1-sync-live-retry', status: 200 })
  if (retriedLiveJob.data?.data?.job?.status !== 'pending') {
    fail(`moodle-sync-jobs nao reenfileirou o job: ${JSON.stringify(retriedLiveJob.data)}`)
  }
  await waitForLiveJobFailure('retry')
  await deleteRows(status, 'background_jobs', { id: liveJobId })
  await deleteRows(status, 'activity_feed', { event_type: 'sync_error', user_id: authUserId })

  await deleteRows(status, 'background_jobs', { id: jobId })
  await deleteRows(status, 'activity_feed', { id: feedId })
  await upsertRows(status, 'background_jobs', 'id', {
    course_id: courseId,
    id: jobId,
    job_type: 'moodle_sync',
    metadata: {
      course_ids: [courseId],
      entities: ['students'],
      schema_version: 1,
      sync_kind: 'incremental',
    },
    source: 'sync',
    source_record_id: sourceRecordId,
    source_table: 'moodle_sync_request',
    status: 'pending',
    title: 'Smoke Moodle Sync Job',
    total_items: 2,
    user_id: authUserId,
  })
  await upsertRows(status, 'activity_feed', 'id', {
    description: 'Notificacao isolada do smoke',
    event_type: 'sync_finish',
    id: feedId,
    metadata: { severity: 'info' },
    title: 'Smoke Sync Feed',
    user_id: authUserId,
  })

  const syncJobs = await callV1EdgeFunction(status, 'moodle-sync-jobs', {
    action: 'list_active_jobs',
  }, {
    acceptStatuses: [200],
    accessToken,
    correlationId: 'smoke-v1-sync-jobs-list',
  })
  assertV1Response(syncJobs, { correlationId: 'smoke-v1-sync-jobs-list', status: 200 })
  if (!syncJobs.data?.data?.items?.some((job) => job.id === jobId && job.courseIds?.[0] === courseId)) {
    fail(`moodle-sync-jobs nao retornou o job do ator: ${JSON.stringify(syncJobs.data)}`)
  }

  const activeJobs = await callV1EdgeFunction(status, 'background-jobs', {
    action: 'list_active',
  }, {
    acceptStatuses: [200],
    accessToken,
    correlationId: 'smoke-v1-background-jobs-list',
  })
  assertV1Response(activeJobs, { correlationId: 'smoke-v1-background-jobs-list', status: 200 })
  if (!activeJobs.data?.data?.items?.some((job) => job.id === jobId && job.canCancel === true)) {
    fail(`background-jobs nao retornou capacidades do backend: ${JSON.stringify(activeJobs.data)}`)
  }

  const feed = await callV1EdgeFunction(status, 'activity-feed', {
    action: 'list',
    limit: 20,
  }, {
    acceptStatuses: [200],
    accessToken,
    correlationId: 'smoke-v1-activity-feed-list',
  })
  assertV1Response(feed, { correlationId: 'smoke-v1-activity-feed-list', status: 200 })
  if (!feed.data?.data?.items?.some((item) => item.id === feedId && item.eventType === 'sync_finish')) {
    fail(`activity-feed nao retornou a notificacao do ator: ${JSON.stringify(feed.data)}`)
  }

  const forbiddenAdminList = await callV1EdgeFunction(status, 'background-jobs', {
    action: 'admin_list',
    filters: {},
    page: 1,
    pageSize: 10,
  }, {
    acceptStatuses: [403],
    accessToken,
    correlationId: 'smoke-v1-background-jobs-admin-forbidden',
  })
  assertV1Response(forbiddenAdminList, {
    code: 'forbidden',
    correlationId: 'smoke-v1-background-jobs-admin-forbidden',
    status: 403,
  })

  const cancelled = await callV1EdgeFunction(status, 'moodle-sync-jobs', {
    action: 'cancel_job',
    jobId,
  }, {
    acceptStatuses: [200],
    accessToken,
    correlationId: 'smoke-v1-sync-job-cancel',
  })
  assertV1Response(cancelled, { correlationId: 'smoke-v1-sync-job-cancel', status: 200 })
  if (cancelled.data?.data?.job?.status !== 'cancelled') {
    fail(`moodle-sync-jobs nao aplicou cancelamento condicional: ${JSON.stringify(cancelled.data)}`)
  }

  await deleteRows(status, 'background_jobs', { id: jobId })
  await deleteRows(status, 'activity_feed', { id: feedId })
  runCourseManagementGrantChecks()
  log('Sincronizacao, risco, preferencias, jobs e activity feed validados pela fronteira backend V1.')
}

async function runClarisConversationChecks(status, accessToken, authUserId) {
  const smokeTitle = 'Smoke Claris Conversation'
  await deleteRows(status, 'claris_conversations', { title: smokeTitle })

  const created = await callV1EdgeFunction(
    status,
    'claris-conversations',
    {
      action: 'create',
      lastContextRoute: '/alunos',
      messages: [{ role: 'user', content: 'Quem precisa de acompanhamento?' }],
      title: smokeTitle,
    },
    {
      acceptStatuses: [200],
      accessToken,
      correlationId: 'smoke-v1-claris-conversation-create',
    },
  )
  assertV1Response(created, {
    correlationId: 'smoke-v1-claris-conversation-create',
    status: 200,
  })
  const conversation = created.data?.data?.conversation
  if (
    typeof conversation?.id !== 'string'
    || conversation.title !== smokeTitle
    || conversation.lastContextRoute !== '/alunos'
  ) {
    fail(`claris-conversations nao criou o DTO esperado: ${JSON.stringify(created.data)}`)
  }

  const [persisted] = await selectRows(status, 'claris_conversations', { id: conversation.id })
  if (persisted?.user_id !== authUserId) {
    fail('claris-conversations nao derivou o proprietario do token autenticado.')
  }

  const listed = await callV1EdgeFunction(
    status,
    'claris-conversations',
    { action: 'list', limit: 30 },
    {
      acceptStatuses: [200],
      accessToken,
      correlationId: 'smoke-v1-claris-conversation-list',
    },
  )
  assertV1Response(listed, {
    correlationId: 'smoke-v1-claris-conversation-list',
    status: 200,
  })
  if (!listed.data?.data?.items?.some((item) => item.id === conversation.id)) {
    fail(`claris-conversations nao listou a conversa do ator: ${JSON.stringify(listed.data)}`)
  }

  const updated = await callV1EdgeFunction(
    status,
    'claris-conversations',
    { action: 'update', conversationId: conversation.id, title: `${smokeTitle} Updated` },
    {
      acceptStatuses: [200],
      accessToken,
      correlationId: 'smoke-v1-claris-conversation-update',
    },
  )
  assertV1Response(updated, {
    correlationId: 'smoke-v1-claris-conversation-update',
    status: 200,
  })
  if (updated.data?.data?.conversation?.title !== `${smokeTitle} Updated`) {
    fail(`claris-conversations nao atualizou a conversa: ${JSON.stringify(updated.data)}`)
  }

  const deleted = await callV1EdgeFunction(
    status,
    'claris-conversations',
    { action: 'delete', conversationId: conversation.id },
    {
      acceptStatuses: [200],
      accessToken,
      correlationId: 'smoke-v1-claris-conversation-delete',
    },
  )
  assertV1Response(deleted, {
    correlationId: 'smoke-v1-claris-conversation-delete',
    status: 200,
  })
  if (deleted.data?.data?.deleted !== true) {
    fail(`claris-conversations nao confirmou a exclusao: ${JSON.stringify(deleted.data)}`)
  }

  log('Historico da Claris validado com DTO V1, identidade derivada e CRUD actor-scoped.')
}

async function runClarisSuggestionChecks(status, accessToken, authUserId) {
  const taskSuggestionId = '00000000-0000-4000-8000-000000000971'
  const eventSuggestionId = '00000000-0000-4000-8000-000000000972'
  const dismissSuggestionId = '00000000-0000-4000-8000-000000000973'
  const invalidSuggestionId = '00000000-0000-4000-8000-000000000974'
  const suggestionIds = [taskSuggestionId, eventSuggestionId, dismissSuggestionId, invalidSuggestionId]
  const taskTitle = 'Smoke Claris Suggested Task'
  const eventTitle = 'Smoke Claris Suggested Event'

  for (const suggestionId of suggestionIds) {
    await deleteRows(status, 'claris_suggestion_cooldowns', { suggestion_id: suggestionId })
    await deleteRows(status, 'claris_suggestions', { id: suggestionId })
  }
  await deleteRows(status, 'tasks', { title: taskTitle })
  await deleteRows(status, 'calendar_events', { title: eventTitle })

  const common = {
    acted_at: null,
    analysis: 'Smoke de operacao atomica.',
    body: 'Validar que a entidade e o ciclo de vida mudam na mesma transacao.',
    entity_id: 'smoke-entity',
    entity_name: 'Entidade Smoke',
    entity_type: 'custom',
    expected_impact: 'Fronteira backend consistente.',
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    priority: 'high',
    reason: 'Validacao do smoke local.',
    status: 'pending',
    trigger_engine: 'manual',
    user_id: authUserId,
  }
  await upsertRows(status, 'claris_suggestions', 'id', [
    {
      ...common,
      action_payload: {
        description: 'Criada atomicamente por uma sugestao da Claris.',
        due_date: '2026-07-25T12:00:00.000Z',
        priority: 'urgent',
        tags: ['smoke', 'claris'],
        title: taskTitle,
      },
      action_type: 'create_task',
      id: taskSuggestionId,
      title: 'Criar tarefa pelo smoke',
      trigger_context: { trigger_key: 'smoke_atomic_task' },
      type: 'custom',
    },
    {
      ...common,
      action_payload: {
        all_day: false,
        description: 'Criado atomicamente por uma sugestao da Claris.',
        end_at: '2026-07-25T15:00:00.000Z',
        start_at: '2026-07-25T14:00:00.000Z',
        tags: ['smoke', 'agenda'],
        title: eventTitle,
        type: 'meeting',
      },
      action_type: 'create_event',
      id: eventSuggestionId,
      title: 'Criar evento pelo smoke',
      trigger_context: { trigger_key: 'smoke_atomic_event' },
      type: 'alignment_event',
    },
    {
      ...common,
      action_payload: { title: 'Nao deve ser criada' },
      action_type: 'create_task',
      id: dismissSuggestionId,
      title: 'Dispensar sugestao pelo smoke',
      trigger_context: { trigger_key: 'smoke_atomic_dismiss' },
      type: 'custom',
    },
    {
      ...common,
      action_payload: { title: 'Evento sem inicio' },
      action_type: 'create_event',
      id: invalidSuggestionId,
      title: 'Sugestao invalida pelo smoke',
      trigger_context: { trigger_key: 'smoke_invalid_event' },
      type: 'alignment_event',
    },
  ])

  const listed = await callV1EdgeFunction(status, 'claris-suggestions', {
    action: 'list_pending',
    limit: 10,
  }, {
    acceptStatuses: [200],
    accessToken,
    correlationId: 'smoke-v1-claris-suggestions-list',
  })
  assertV1Response(listed, {
    correlationId: 'smoke-v1-claris-suggestions-list',
    status: 200,
  })
  const listedTask = listed.data?.data?.items?.find((item) => item.id === taskSuggestionId)
  if (
    listedTask?.actionType !== 'create_task'
    || listedTask.triggerEngine !== 'manual'
    || Object.hasOwn(listedTask, 'action_payload')
    || Object.hasOwn(listedTask, 'actionPayload')
    || Object.hasOwn(listedTask, 'trigger_context')
    || Object.hasOwn(listedTask, 'triggerContext')
  ) {
    fail(`claris-suggestions expos contrato inesperado: ${JSON.stringify(listedTask)}`)
  }

  const acceptedTask = await callV1EdgeFunction(status, 'claris-suggestions', {
    action: 'accept',
    suggestionId: taskSuggestionId,
  }, {
    acceptStatuses: [200],
    accessToken,
    correlationId: 'smoke-v1-claris-suggestions-accept-task',
  })
  assertV1Response(acceptedTask, {
    correlationId: 'smoke-v1-claris-suggestions-accept-task',
    status: 200,
  })
  const taskEffect = acceptedTask.data?.data
  if (taskEffect?.effect !== 'task_created' || typeof taskEffect.createdEntityId !== 'string') {
    fail(`claris-suggestions nao retornou o efeito da tarefa: ${JSON.stringify(taskEffect)}`)
  }
  const [createdTask] = await selectRows(status, 'tasks', { id: taskEffect.createdEntityId })
  if (
    createdTask?.created_by !== authUserId
    || createdTask.assigned_to !== authUserId
    || createdTask.title !== taskTitle
    || createdTask.priority !== 'urgent'
    || createdTask.suggested_by_ai !== true
    || !createdTask.tags?.includes('claris')
  ) {
    fail(`claris-suggestions nao criou a tarefa actor-scoped esperada: ${JSON.stringify(createdTask)}`)
  }

  const staleAccept = await callV1EdgeFunction(status, 'claris-suggestions', {
    action: 'accept',
    suggestionId: taskSuggestionId,
  }, {
    acceptStatuses: [409],
    accessToken,
    correlationId: 'smoke-v1-claris-suggestions-stale-accept',
  })
  assertV1Response(staleAccept, {
    code: 'conflict',
    correlationId: 'smoke-v1-claris-suggestions-stale-accept',
    status: 409,
  })
  const duplicateTasks = await selectRows(status, 'tasks', { title: taskTitle })
  if (duplicateTasks.length !== 1) {
    fail(`claris-suggestions duplicou tarefa em retry: ${JSON.stringify(duplicateTasks)}`)
  }

  const acceptedEvent = await callV1EdgeFunction(status, 'claris-suggestions', {
    action: 'accept',
    suggestionId: eventSuggestionId,
  }, {
    acceptStatuses: [200],
    accessToken,
    correlationId: 'smoke-v1-claris-suggestions-accept-event',
  })
  assertV1Response(acceptedEvent, {
    correlationId: 'smoke-v1-claris-suggestions-accept-event',
    status: 200,
  })
  const eventEffect = acceptedEvent.data?.data
  if (eventEffect?.effect !== 'event_created' || typeof eventEffect.createdEntityId !== 'string') {
    fail(`claris-suggestions nao retornou o efeito do evento: ${JSON.stringify(eventEffect)}`)
  }
  const [createdEvent] = await selectRows(status, 'calendar_events', {
    id: eventEffect.createdEntityId,
  })
  if (
    createdEvent?.owner !== authUserId
    || createdEvent.title !== eventTitle
    || createdEvent.ia_source !== 'sugestao_confirmada'
  ) {
    fail(`claris-suggestions nao criou o evento actor-scoped esperado: ${JSON.stringify(createdEvent)}`)
  }

  const dismissed = await callV1EdgeFunction(status, 'claris-suggestions', {
    action: 'dismiss',
    suggestionId: dismissSuggestionId,
  }, {
    acceptStatuses: [200],
    accessToken,
    correlationId: 'smoke-v1-claris-suggestions-dismiss',
  })
  assertV1Response(dismissed, {
    correlationId: 'smoke-v1-claris-suggestions-dismiss',
    status: 200,
  })
  if (dismissed.data?.data?.status !== 'dismissed' || dismissed.data?.data?.effect !== 'none') {
    fail(`claris-suggestions nao dispensou atomicamente: ${JSON.stringify(dismissed.data)}`)
  }

  for (const [suggestionId, outcome] of [
    [taskSuggestionId, 'accepted'],
    [eventSuggestionId, 'accepted'],
    [dismissSuggestionId, 'dismissed'],
  ]) {
    const cooldowns = await selectRows(status, 'claris_suggestion_cooldowns', {
      outcome,
      suggestion_id: suggestionId,
    })
    if (cooldowns.length !== 1 || cooldowns[0].user_id !== authUserId) {
      fail(`Cooldown ${outcome} ausente para ${suggestionId}: ${JSON.stringify(cooldowns)}`)
    }
  }

  const invalidAction = await callV1EdgeFunction(status, 'claris-suggestions', {
    action: 'accept',
    suggestionId: invalidSuggestionId,
  }, {
    acceptStatuses: [409],
    accessToken,
    correlationId: 'smoke-v1-claris-suggestions-invalid-action',
  })
  assertV1Response(invalidAction, {
    code: 'conflict',
    correlationId: 'smoke-v1-claris-suggestions-invalid-action',
    status: 409,
  })
  const [invalidSuggestion] = await selectRows(status, 'claris_suggestions', {
    id: invalidSuggestionId,
  })
  if (invalidSuggestion?.status !== 'pending' || invalidSuggestion.acted_at !== null) {
    fail(`Acao invalida alterou parcialmente a sugestao: ${JSON.stringify(invalidSuggestion)}`)
  }

  for (const suggestionId of suggestionIds) {
    await deleteRows(status, 'claris_suggestion_cooldowns', { suggestion_id: suggestionId })
    await deleteRows(status, 'claris_suggestions', { id: suggestionId })
  }
  await deleteRows(status, 'tasks', { title: taskTitle })
  await deleteRows(status, 'calendar_events', { title: eventTitle })

  log('Sugestoes da Claris validadas com DTO V1 e aceite/dispensa atomicos actor-scoped.')
}

async function runServiceIntegrationChecks(status, accessToken, authUserId) {
  const personalInstanceId = '00000000-0000-4000-8000-000000000941'
  const sharedInstanceId = '00000000-0000-4000-8000-000000000942'
  const personalEventId = '00000000-0000-4000-8000-000000000943'

  await deleteRows(status, 'app_service_instances', { id: personalInstanceId })
  await deleteRows(status, 'app_service_instances', { id: sharedInstanceId })
  await deleteRows(status, 'admin_user_roles', { user_id: authUserId })

  try {
    await upsertRows(status, 'app_service_instances', 'id', [
      {
        id: personalInstanceId,
        name: 'WhatsApp Pessoal Smoke',
        description: 'Instancia pessoal isolada',
        service_type: 'whatsapp',
        provider: 'evolution_api',
        scope: 'personal',
        owner_user_id: authUserId,
        evolution_instance_name: 'claris-personal-smoke',
        external_id: 'provider-personal-secret',
        connection_status: 'connected',
        operational_status: 'connected',
        health_status: 'healthy',
        is_active: true,
        is_blocked: false,
        metadata: { phone_number: '5562999991111', secret: 'metadata-secret' },
        admin_notes: 'nota interna pessoal',
        created_by_user_id: authUserId,
        updated_by_user_id: authUserId,
      },
      {
        id: sharedInstanceId,
        name: 'WhatsApp Compartilhado Smoke',
        description: 'Instancia compartilhada isolada',
        service_type: 'whatsapp',
        provider: 'evolution_api',
        scope: 'shared',
        owner_user_id: null,
        evolution_instance_name: 'claris-shared-smoke',
        external_id: 'provider-shared-secret',
        connection_status: 'draft',
        operational_status: 'draft',
        health_status: 'healthy',
        is_active: true,
        is_blocked: false,
        metadata: {},
        admin_notes: 'nota administrativa smoke',
        created_by_user_id: authUserId,
        updated_by_user_id: authUserId,
      },
    ])
    await upsertRows(status, 'app_service_instance_events', 'id', {
      id: personalEventId,
      instance_id: personalInstanceId,
      instance_scope: 'personal',
      event_type: 'status_synced',
      origin: 'system',
      context: { rawProviderPayload: 'event-secret' },
      status: 'success',
      actor_user_id: authUserId,
      correlation_id: 'seed-correlation-secret',
    })

    const overview = await callV1EdgeFunction(status, 'whatsapp-instance-manager', {
      action: 'get_my_overview',
    }, {
      acceptStatuses: [200],
      accessToken,
      correlationId: 'smoke-v1-service-overview',
    })
    assertV1Response(overview, {
      correlationId: 'smoke-v1-service-overview',
      status: 200,
    })
    const overviewDto = overview.data?.data
    const overviewSerialized = JSON.stringify(overviewDto)
    if (
      overviewDto?.contractVersion !== 1
      || overviewDto.instance?.id !== personalInstanceId
      || overviewDto.instance?.phoneNumber !== '5562999991111'
      || overviewDto.events?.[0]?.id !== personalEventId
      || overviewSerialized.includes('owner_user_id')
      || overviewSerialized.includes('provider-personal-secret')
      || overviewSerialized.includes('metadata-secret')
      || overviewSerialized.includes('event-secret')
      || overviewSerialized.includes('seed-correlation-secret')
      || overviewSerialized.includes('nota interna pessoal')
    ) {
      fail(`whatsapp-instance-manager vazou persistencia no overview: ${JSON.stringify(overviewDto)}`)
    }

    const forbiddenSharedList = await callV1EdgeFunction(status, 'whatsapp-instance-manager', {
      action: 'list_shared_instances',
    }, {
      acceptStatuses: [403],
      accessToken,
      correlationId: 'smoke-v1-service-shared-forbidden',
    })
    assertV1Response(forbiddenSharedList, {
      code: 'forbidden',
      correlationId: 'smoke-v1-service-shared-forbidden',
      status: 403,
    })

    const spoofedActor = await callV1EdgeFunction(status, 'whatsapp-instance-manager', {
      action: 'get_my_overview',
      ownerUserId: authUserId,
    }, {
      acceptStatuses: [422],
      accessToken,
      correlationId: 'smoke-v1-service-identity-spoof',
    })
    assertV1Response(spoofedActor, {
      code: 'validation_failed',
      correlationId: 'smoke-v1-service-identity-spoof',
      status: 422,
    })

    for (const table of ['app_service_instances', 'app_service_instance_events']) {
      await requestJson(`${status.REST_URL}/${table}?select=*&limit=1`, {
        acceptStatuses: [401, 403],
        headers: publishableHeaders(status, accessToken),
      })
    }

    await upsertRows(status, 'admin_user_roles', 'user_id', {
      user_id: authUserId,
      role: 'admin',
      permissions: ['admin'],
      granted_by: null,
    })

    const sharedList = await callV1EdgeFunction(status, 'whatsapp-instance-manager', {
      action: 'list_shared_instances',
    }, {
      acceptStatuses: [200],
      accessToken,
      correlationId: 'smoke-v1-service-shared-list',
    })
    assertV1Response(sharedList, {
      correlationId: 'smoke-v1-service-shared-list',
      status: 200,
    })
    const sharedDto = sharedList.data?.data?.items?.find((item) => item.id === sharedInstanceId)
    if (
      sharedDto?.adminNotes !== 'nota administrativa smoke'
      || Object.prototype.hasOwnProperty.call(sharedDto ?? {}, 'external_id')
      || Object.prototype.hasOwnProperty.call(sharedDto ?? {}, 'metadata')
    ) {
      fail(`whatsapp-instance-manager retornou DTO admin invalido: ${JSON.stringify(sharedList.data)}`)
    }

    const updated = await callV1EdgeFunction(status, 'whatsapp-instance-manager', {
      action: 'update_instance',
      instanceId: sharedInstanceId,
      name: 'WhatsApp Compartilhado Atualizado',
      description: null,
      adminNotes: 'nota atualizada',
    }, {
      acceptStatuses: [200],
      accessToken,
      correlationId: 'smoke-v1-service-shared-update',
    })
    assertV1Response(updated, {
      correlationId: 'smoke-v1-service-shared-update',
      status: 200,
    })
    if (
      updated.data?.data?.instance?.name !== 'WhatsApp Compartilhado Atualizado'
      || updated.data?.data?.instance?.description !== null
    ) {
      fail(`whatsapp-instance-manager nao atualizou a instancia: ${JSON.stringify(updated.data)}`)
    }

    const blocked = await callV1EdgeFunction(status, 'whatsapp-instance-manager', {
      action: 'set_instance_blocked',
      instanceId: sharedInstanceId,
      blocked: true,
    }, {
      acceptStatuses: [200],
      accessToken,
      correlationId: 'smoke-v1-service-shared-block',
    })
    assertV1Response(blocked, {
      correlationId: 'smoke-v1-service-shared-block',
      status: 200,
    })
    const [persistedShared] = await selectRows(status, 'app_service_instances', { id: sharedInstanceId })
    const blockEvents = await selectRows(status, 'app_service_instance_events', {
      instance_id: sharedInstanceId,
      event_type: 'preventive_blocked',
    })
    if (
      persistedShared?.is_blocked !== true
      || persistedShared?.updated_by_user_id !== authUserId
      || !blockEvents.some((event) => (
        event.actor_user_id === authUserId
        && event.correlation_id === 'smoke-v1-service-shared-block'
      ))
    ) {
      fail(`whatsapp-instance-manager nao derivou ator/correlacao no comando: ${JSON.stringify({ persistedShared, blockEvents })}`)
    }
  } finally {
    await deleteRows(status, 'admin_user_roles', { user_id: authUserId })
    await deleteRows(status, 'app_service_instances', { id: personalInstanceId })
    await deleteRows(status, 'app_service_instances', { id: sharedInstanceId })
  }

  runCourseManagementGrantChecks()
  log('Instancias e eventos de servico validados com DTO V1, ownership, admin e grants reais.')
}

async function runAccessControlChecks(status, accessToken, authUserId) {
  const targetUserId = '00000000-0000-4000-8000-000000000940'
  const targetMoodleUserId = 'smoke-access-target-001'
  const targetUsername = 'smoke.access.target'
  const groupName = 'Smoke Access Control Group'
  let createdGroupId = null

  await deleteRows(status, 'admin_user_roles', { user_id: authUserId })
  await deleteRows(status, 'users', { id: targetUserId })
  await deleteRows(status, 'app_groups', { name: groupName })

  const [tutorGroup] = await selectRows(status, 'app_groups', { slug: 'tutor' })
  if (!tutorGroup?.id) fail('Grupo tutor ausente para o smoke de access-control.')

  try {
    const context = await callV1EdgeFunction(status, 'access-control', {
      action: 'get_context',
    }, {
      acceptStatuses: [200],
      accessToken,
      correlationId: 'smoke-v1-access-context',
    })
    assertV1Response(context, {
      correlationId: 'smoke-v1-access-context',
      status: 200,
    })
    const contextDto = context.data?.data
    if (
      contextDto?.contractVersion !== 1
      || contextDto.isAdmin !== false
      || contextDto.group?.id !== tutorGroup.id
      || !Array.isArray(contextDto.permissions)
      || !contextDto.permissions.includes('students.view')
      || Object.prototype.hasOwnProperty.call(contextDto, 'userId')
    ) {
      fail(`access-control nao derivou o contexto autenticado: ${JSON.stringify(contextDto)}`)
    }

    const forbiddenGroups = await callV1EdgeFunction(status, 'access-control', {
      action: 'list_groups',
    }, {
      acceptStatuses: [403],
      accessToken,
      correlationId: 'smoke-v1-access-groups-forbidden',
    })
    assertV1Response(forbiddenGroups, {
      code: 'forbidden',
      correlationId: 'smoke-v1-access-groups-forbidden',
      status: 403,
    })

    for (const table of [
      'app_permission_definitions',
      'app_groups',
      'app_group_permissions',
      'user_group_memberships',
      'admin_user_roles',
      'app_access_audit_log',
    ]) {
      await requestJson(`${status.REST_URL}/${table}?select=*&limit=1`, {
        acceptStatuses: [401, 403],
        headers: publishableHeaders(status, accessToken),
      })
    }

    await requestJson(`${status.REST_URL}/rpc/get_current_user_authorization_context`, {
      acceptStatuses: [401, 403],
      body: {},
      headers: publishableHeaders(status, accessToken),
      method: 'POST',
    })

    await upsertRows(status, 'admin_user_roles', 'user_id', {
      user_id: authUserId,
      role: 'admin',
      permissions: ['admin'],
      granted_by: null,
    })

    const definitions = await callV1EdgeFunction(status, 'access-control', {
      action: 'list_permission_definitions',
    }, {
      acceptStatuses: [200],
      accessToken,
      correlationId: 'smoke-v1-access-permissions',
    })
    assertV1Response(definitions, {
      correlationId: 'smoke-v1-access-permissions',
      status: 200,
    })
    if (!definitions.data?.data?.items?.some((item) => (
      item.key === 'students.view' && typeof item.sortOrder === 'number'
    ))) {
      fail(`access-control nao retornou permissoes em camelCase: ${JSON.stringify(definitions.data)}`)
    }

    const groups = await callV1EdgeFunction(status, 'access-control', {
      action: 'list_groups',
    }, {
      acceptStatuses: [200],
      accessToken,
      correlationId: 'smoke-v1-access-groups',
    })
    assertV1Response(groups, {
      correlationId: 'smoke-v1-access-groups',
      status: 200,
    })
    if (!groups.data?.data?.items?.some((group) => (
      group.id === tutorGroup.id && typeof group.userCount === 'number'
    ))) {
      fail(`access-control nao retornou grupos em camelCase: ${JSON.stringify(groups.data)}`)
    }

    await upsertRows(status, 'users', 'id', {
      id: targetUserId,
      email: 'smoke.access.target@example.com',
      full_name: 'Smoke Access Target',
      moodle_user_id: targetMoodleUserId,
      moodle_username: targetUsername,
    })

    const createdGroup = await callV1EdgeFunction(status, 'access-control', {
      action: 'upsert_group',
      name: groupName,
      description: 'Criado pelo smoke.',
      permissionKeys: ['students.view', 'reports.view'],
    }, {
      acceptStatuses: [200],
      accessToken,
      correlationId: 'smoke-v1-access-group-create',
    })
    assertV1Response(createdGroup, {
      correlationId: 'smoke-v1-access-group-create',
      status: 200,
    })
    createdGroupId = createdGroup.data?.data?.groupId
    if (typeof createdGroupId !== 'string' || createdGroup.data?.data?.created !== true) {
      fail(`access-control nao criou o grupo: ${JSON.stringify(createdGroup.data)}`)
    }

    const updatedGroup = await callV1EdgeFunction(status, 'access-control', {
      action: 'upsert_group',
      groupId: createdGroupId,
      name: groupName,
      description: 'Atualizado pelo smoke.',
      permissionKeys: ['students.view'],
    }, {
      acceptStatuses: [200],
      accessToken,
      correlationId: 'smoke-v1-access-group-update',
    })
    assertV1Response(updatedGroup, {
      correlationId: 'smoke-v1-access-group-update',
      status: 200,
    })
    if (updatedGroup.data?.data?.groupId !== createdGroupId || updatedGroup.data?.data?.created !== false) {
      fail(`access-control nao atualizou o grupo: ${JSON.stringify(updatedGroup.data)}`)
    }

    const updatedUser = await callV1EdgeFunction(status, 'access-control', {
      action: 'set_user_access',
      targetUserId,
      isAdmin: false,
      groupId: createdGroupId,
    }, {
      acceptStatuses: [200],
      accessToken,
      correlationId: 'smoke-v1-access-user-update',
    })
    assertV1Response(updatedUser, {
      correlationId: 'smoke-v1-access-user-update',
      status: 200,
    })
    if (
      updatedUser.data?.data?.userId !== targetUserId
      || updatedUser.data?.data?.groupId !== createdGroupId
      || updatedUser.data?.data?.isAdmin !== false
    ) {
      fail(`access-control nao atualizou usuario atomicamente: ${JSON.stringify(updatedUser.data)}`)
    }

    const searchedUsers = await callV1EdgeFunction(status, 'access-control', {
      action: 'search_users',
      query: targetUsername,
      page: 1,
      pageSize: 10,
    }, {
      acceptStatuses: [200],
      accessToken,
      correlationId: 'smoke-v1-access-users-search',
    })
    assertV1Response(searchedUsers, {
      correlationId: 'smoke-v1-access-users-search',
      status: 200,
    })
    const searchedUser = searchedUsers.data?.data?.items?.find((user) => user.userId === targetUserId)
    if (
      searchedUser?.groupId !== createdGroupId
      || searchedUser.moodleUsername !== targetUsername
      || searchedUsers.data?.data?.totalCount !== 1
      || Object.prototype.hasOwnProperty.call(searchedUser ?? {}, 'user_id')
    ) {
      fail(`access-control nao paginou usuario em camelCase: ${JSON.stringify(searchedUsers.data)}`)
    }

    const selfLockout = await callV1EdgeFunction(status, 'access-control', {
      action: 'set_user_access',
      targetUserId: authUserId,
      isAdmin: false,
      groupId: tutorGroup.id,
    }, {
      acceptStatuses: [409],
      accessToken,
      correlationId: 'smoke-v1-access-self-lockout',
    })
    assertV1Response(selfLockout, {
      code: 'conflict',
      correlationId: 'smoke-v1-access-self-lockout',
      status: 409,
    })
    const [adminRoleAfterLockout] = await selectRows(status, 'admin_user_roles', { user_id: authUserId })
    if (adminRoleAfterLockout?.role !== 'admin') {
      fail('access-control removeu o papel do proprio ator apesar do bloqueio de auto-lockout.')
    }

    const deletedGroup = await callV1EdgeFunction(status, 'access-control', {
      action: 'delete_group',
      groupId: createdGroupId,
      reassignToGroupId: tutorGroup.id,
    }, {
      acceptStatuses: [200],
      accessToken,
      correlationId: 'smoke-v1-access-group-delete',
    })
    assertV1Response(deletedGroup, {
      correlationId: 'smoke-v1-access-group-delete',
      status: 200,
    })
    if (
      deletedGroup.data?.data?.groupId !== createdGroupId
      || deletedGroup.data?.data?.reassignedUserCount !== 1
    ) {
      fail(`access-control nao removeu/reassociou o grupo: ${JSON.stringify(deletedGroup.data)}`)
    }

    const [reassignedMembership] = await selectRows(status, 'user_group_memberships', {
      user_id: targetUserId,
    })
    if (reassignedMembership?.group_id !== tutorGroup.id) {
      fail(`access-control nao reassociou o usuario: ${JSON.stringify(reassignedMembership)}`)
    }

    const auditRows = await selectRows(status, 'app_access_audit_log', { actor_id: authUserId })
    const groupAuditActions = new Set(auditRows
      .filter((row) => row.target_group_id === createdGroupId)
      .map((row) => row.action))
    const userAudit = auditRows.find((row) => (
      row.target_user_id === targetUserId
      && row.action === 'user_access_updated'
      && row.details?.groupId === createdGroupId
    ))
    if (
      !groupAuditActions.has('group_created')
      || !groupAuditActions.has('group_updated')
      || !groupAuditActions.has('group_deleted')
      || userAudit?.details?.groupId !== createdGroupId
    ) {
      fail(`access-control nao registrou a auditoria esperada: ${JSON.stringify(auditRows)}`)
    }
  } finally {
    if (createdGroupId) await deleteRows(status, 'app_groups', { id: createdGroupId })
    await deleteRows(status, 'users', { id: targetUserId })
    await deleteRows(status, 'admin_user_roles', { user_id: authUserId })
  }

  log('Autorizacao e acessos validados com ator derivado, mutacoes atomicas, auditoria e anti-lockout.')
}

async function runAppSettingsChecks(status, accessToken, authUserId) {
  const publicSettings = await callV1EdgeFunction(
    status,
    'app-settings',
    { action: 'get_public' },
    {
      acceptStatuses: [200],
      accessToken,
      correlationId: 'smoke-v1-app-settings-public',
    },
  )
  assertV1Response(publicSettings, {
    correlationId: 'smoke-v1-app-settings-public',
    status: 200,
  })
  const publicDto = publicSettings.data?.data
  if (
    publicDto?.contractVersion !== 1
    || typeof publicDto.moodleConnectionUrl !== 'string'
    || typeof publicDto.moodleConnectionService !== 'string'
    || Object.keys(publicDto).some((key) => ![
      'contractVersion',
      'moodleConnectionUrl',
      'moodleConnectionService',
    ].includes(key))
  ) {
    fail(`app-settings retornou DTO publico inseguro: ${JSON.stringify(publicDto)}`)
  }

  const forbiddenAdmin = await callV1EdgeFunction(
    status,
    'app-settings',
    { action: 'get_admin' },
    {
      acceptStatuses: [403],
      accessToken,
      correlationId: 'smoke-v1-app-settings-admin-forbidden',
    },
  )
  assertV1Response(forbiddenAdmin, {
    code: 'forbidden',
    correlationId: 'smoke-v1-app-settings-admin-forbidden',
    status: 403,
  })

  await requestJson(`${status.REST_URL}/app_settings?select=*`, {
    acceptStatuses: [401, 403],
    headers: publishableHeaders(status, accessToken),
  })

  await deleteRows(status, 'admin_user_roles', { user_id: authUserId })
  await upsertRows(status, 'admin_user_roles', 'user_id', {
    user_id: authUserId,
    role: 'admin',
    permissions: ['admin'],
    granted_by: null,
  })

  const [originalSettingsRow] = await selectRows(status, 'app_settings', { singleton_id: 'global' })
  const originalClarisSettings = originalSettingsRow?.claris_llm_settings ?? {}

  try {
    const adminSettings = await callV1EdgeFunction(
      status,
      'app-settings',
      { action: 'get_admin' },
      {
        acceptStatuses: [200],
        accessToken,
        correlationId: 'smoke-v1-app-settings-admin',
      },
    )
    assertV1Response(adminSettings, {
      correlationId: 'smoke-v1-app-settings-admin',
      status: 200,
    })
    const adminDto = adminSettings.data?.data
    const clarisSettings = adminDto?.clarisSettings
    if (
      adminDto?.contractVersion !== 1
      || typeof clarisSettings?.apiKeyConfigured !== 'boolean'
      || Object.prototype.hasOwnProperty.call(clarisSettings ?? {}, 'apiKey')
      || Object.keys(clarisSettings ?? {}).some((key) => ![
        'provider',
        'model',
        'baseUrl',
        'customInstructions',
        'configured',
        'apiKeyConfigured',
        'updatedAt',
      ].includes(key))
    ) {
      fail(`app-settings retornou DTO administrativo inseguro: ${JSON.stringify(adminDto)}`)
    }

    await upsertRows(status, 'app_settings', 'singleton_id', {
      singleton_id: 'global',
      claris_llm_settings: {
        provider: 'openai',
        model: 'gpt-5-mini',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'smoke-server-secret',
        customInstructions: '',
        configured: true,
      },
    })

    const updatedSettings = await callV1EdgeFunction(
      status,
      'app-settings',
      {
        action: 'update_claris',
        settings: {
          provider: 'openai',
          model: 'gpt-5.4-mini',
          baseUrl: 'https://api.openai.com/v1/',
          customInstructions: 'Smoke sem chave no payload.',
        },
      },
      {
        acceptStatuses: [200],
        accessToken,
        correlationId: 'smoke-v1-app-settings-preserve-key',
      },
    )
    assertV1Response(updatedSettings, {
      correlationId: 'smoke-v1-app-settings-preserve-key',
      status: 200,
    })
    const updatedDto = updatedSettings.data?.data
    const [updatedSettingsRow] = await selectRows(status, 'app_settings', { singleton_id: 'global' })
    if (
      updatedDto?.clarisSettings?.apiKeyConfigured !== true
      || Object.prototype.hasOwnProperty.call(updatedDto?.clarisSettings ?? {}, 'apiKey')
      || updatedSettingsRow?.claris_llm_settings?.apiKey !== 'smoke-server-secret'
      || updatedSettingsRow?.claris_llm_settings?.model !== 'gpt-5.4-mini'
    ) {
      fail('app-settings nao preservou atomicamente a chave ou expos o segredo no DTO.')
    }
  } finally {
    await upsertRows(status, 'app_settings', 'singleton_id', {
      singleton_id: 'global',
      claris_llm_settings: originalClarisSettings,
    })
    await deleteRows(status, 'admin_user_roles', { user_id: authUserId })
  }

  log('Configuracoes globais validadas por DTO publico/admin, sem segredo e sem acesso REST do browser.')
}

async function runAdminObservabilityChecks(status, accessToken, authUserId) {
  const usageId = '00000000-0000-4000-8000-000000000932'
  const errorId = '00000000-0000-4000-8000-000000000933'
  const conversationId = '00000000-0000-4000-8000-000000000934'
  const eventType = 'smoke_admin_observability'
  const errorMessage = 'Smoke admin observability error'
  const conversationTitle = 'Smoke Admin Conversation'
  const ticketTitle = 'Smoke Support Backend'
  let createdTicketId = null

  await deleteRows(status, 'admin_user_roles', { user_id: authUserId })
  await deleteRows(status, 'support_tickets', { title: ticketTitle })
  await deleteRows(status, 'app_usage_events', { id: usageId })
  await deleteRows(status, 'app_error_logs', { id: errorId })
  await deleteRows(status, 'claris_conversations', { id: conversationId })

  try {
    const created = await callV1EdgeFunction(status, 'support-tickets', {
      action: 'create_ticket',
      type: 'problema',
      title: ticketTitle,
      description: 'Ticket criado pelo caso de uso autenticado.',
      route: '/smoke/admin',
    }, {
      acceptStatuses: [200],
      accessToken,
      correlationId: 'smoke-v1-support-create',
    })
    assertV1Response(created, {
      correlationId: 'smoke-v1-support-create',
      status: 200,
    })
    const createdTicket = created.data?.data?.ticket
    if (
      createdTicket?.userId !== authUserId
      || createdTicket.status !== 'aberto'
      || createdTicket.priority !== 'normal'
      || createdTicket.context?.correlationId !== 'smoke-v1-support-create'
    ) {
      fail(`support-tickets nao derivou identidade/contexto: ${JSON.stringify(createdTicket)}`)
    }

    createdTicketId = createdTicket.id
    if (typeof createdTicketId !== 'string') fail('support-tickets nao retornou o ticket criado.')

    const forbiddenSupportList = await callV1EdgeFunction(status, 'support-tickets', {
      action: 'list_tickets',
      page: 1,
      pageSize: 30,
    }, {
      acceptStatuses: [403],
      accessToken,
      correlationId: 'smoke-v1-support-list-forbidden',
    })
    assertV1Response(forbiddenSupportList, {
      code: 'forbidden',
      correlationId: 'smoke-v1-support-list-forbidden',
      status: 403,
    })

    const forbiddenDashboard = await callV1EdgeFunction(status, 'admin-observability', {
      action: 'get_dashboard',
    }, {
      acceptStatuses: [403],
      accessToken,
      correlationId: 'smoke-v1-observability-forbidden',
    })
    assertV1Response(forbiddenDashboard, {
      code: 'forbidden',
      correlationId: 'smoke-v1-observability-forbidden',
      status: 403,
    })

    const nonAdminRestTickets = await selectRows(
      status,
      'support_tickets',
      { id: createdTicketId },
      publishableHeaders(status, accessToken),
    )
    if (nonAdminRestTickets.length !== 0) {
      fail('Policy Realtime de support_tickets permitiu SELECT a usuario nao administrador.')
    }

    await requestJson(`${status.REST_URL}/support_tickets`, {
      acceptStatuses: [401, 403],
      body: {
        user_id: authUserId,
        type: 'problema',
        title: 'Browser write',
        description: 'Deve falhar.',
      },
      headers: publishableHeaders(status, accessToken),
      method: 'POST',
    })

    for (const table of ['app_usage_events', 'app_error_logs', 'claris_conversations']) {
      await requestJson(`${status.REST_URL}/${table}?select=id&limit=1`, {
        acceptStatuses: [401, 403],
        headers: publishableHeaders(status, accessToken),
      })
    }

    await upsertRows(status, 'app_usage_events', 'id', {
      id: usageId,
      user_id: authUserId,
      event_type: eventType,
      route: '/smoke/admin',
      metadata: { apiKey: 'usage-secret', visible: 'ok' },
    })
    await upsertRows(status, 'app_error_logs', 'id', {
      id: errorId,
      user_id: authUserId,
      severity: 'critical',
      category: 'integration',
      message: errorMessage,
      payload: { authorization: 'Bearer error-secret', status: 500 },
      context: { password: 'context-secret', visible: 'ok' },
    })
    await upsertRows(status, 'claris_conversations', 'id', {
      id: conversationId,
      user_id: authUserId,
      title: conversationTitle,
      last_context_route: '/smoke/admin',
      messages: Array.from({ length: 105 }, (_, index) => ({
        role: index % 2 === 0 ? 'user' : 'assistant',
        content: `Mensagem smoke ${index}`,
        internal: 'ignored',
      })),
    })

    await upsertRows(status, 'admin_user_roles', 'user_id', {
      user_id: authUserId,
      role: 'admin',
      permissions: ['admin'],
      granted_by: null,
    })

    const listedTickets = await callV1EdgeFunction(status, 'support-tickets', {
      action: 'list_tickets',
      search: ticketTitle,
      page: 1,
      pageSize: 10,
    }, {
      acceptStatuses: [200],
      accessToken,
      correlationId: 'smoke-v1-support-list-admin',
    })
    assertV1Response(listedTickets, {
      correlationId: 'smoke-v1-support-list-admin',
      status: 200,
    })
    if (!listedTickets.data?.data?.items?.some((ticket) => ticket.id === createdTicketId)) {
      fail(`support-tickets nao paginou o ticket para admin: ${JSON.stringify(listedTickets.data)}`)
    }

    const updated = await callV1EdgeFunction(status, 'support-tickets', {
      action: 'update_ticket',
      ticketId: createdTicketId,
      status: 'resolvido',
      adminNotes: 'Resolvido pelo smoke.',
    }, {
      acceptStatuses: [200],
      accessToken,
      correlationId: 'smoke-v1-support-update-admin',
    })
    assertV1Response(updated, {
      correlationId: 'smoke-v1-support-update-admin',
      status: 200,
    })
    const updatedTicket = updated.data?.data?.ticket
    if (updatedTicket?.assignedTo !== authUserId || typeof updatedTicket.resolvedAt !== 'string') {
      fail(`support-tickets nao atribuiu/resolviu no backend: ${JSON.stringify(updatedTicket)}`)
    }

    const dashboard = await callV1EdgeFunction(status, 'admin-observability', {
      action: 'get_dashboard',
    }, {
      acceptStatuses: [200],
      accessToken,
      correlationId: 'smoke-v1-observability-dashboard',
    })
    assertV1Response(dashboard, {
      correlationId: 'smoke-v1-observability-dashboard',
      status: 200,
    })
    const dashboardDto = dashboard.data?.data
    if (
      dashboardDto?.contractVersion !== 1
      || dashboardDto.timeZone !== 'America/Sao_Paulo'
      || !Array.isArray(dashboardDto.usageTrend)
      || dashboardDto.usageTrend.length !== 7
      || typeof dashboardDto.counts?.users !== 'number'
    ) {
      fail(`admin-observability retornou dashboard invalido: ${JSON.stringify(dashboardDto)}`)
    }

    const usage = await callV1EdgeFunction(status, 'admin-observability', {
      action: 'list_usage_events',
      eventType,
      page: 1,
      pageSize: 10,
    }, {
      acceptStatuses: [200],
      accessToken,
      correlationId: 'smoke-v1-observability-usage',
    })
    assertV1Response(usage, {
      correlationId: 'smoke-v1-observability-usage',
      status: 200,
    })
    const usageDto = usage.data?.data?.items?.find((item) => item.id === usageId)
    if (usageDto?.metadata?.apiKey !== '[REDACTED]' || usageDto.metadata.visible !== 'ok') {
      fail(`admin-observability nao redigiu metadados: ${JSON.stringify(usageDto)}`)
    }

    const logs = await callV1EdgeFunction(status, 'admin-observability', {
      action: 'list_error_logs',
      search: errorMessage,
      page: 1,
      pageSize: 10,
    }, {
      acceptStatuses: [200],
      accessToken,
      correlationId: 'smoke-v1-observability-logs',
    })
    assertV1Response(logs, {
      correlationId: 'smoke-v1-observability-logs',
      status: 200,
    })
    const errorDto = logs.data?.data?.items?.find((item) => item.id === errorId)
    if (
      errorDto?.payload?.authorization !== '[REDACTED]'
      || errorDto.context?.password !== '[REDACTED]'
    ) {
      fail(`admin-observability nao redigiu o log: ${JSON.stringify(errorDto)}`)
    }

    const resolved = await callV1EdgeFunction(status, 'admin-observability', {
      action: 'resolve_error_log',
      logId: errorId,
    }, {
      acceptStatuses: [200],
      accessToken,
      correlationId: 'smoke-v1-observability-resolve',
    })
    assertV1Response(resolved, {
      correlationId: 'smoke-v1-observability-resolve',
      status: 200,
    })
    if (
      resolved.data?.data?.log?.resolved !== true
      || resolved.data?.data?.log?.resolvedBy !== authUserId
    ) {
      fail(`admin-observability nao derivou resolvedBy: ${JSON.stringify(resolved.data)}`)
    }

    const conversations = await callV1EdgeFunction(status, 'admin-observability', {
      action: 'list_claris_conversations',
      search: conversationTitle,
      page: 1,
      pageSize: 10,
    }, {
      acceptStatuses: [200],
      accessToken,
      correlationId: 'smoke-v1-observability-conversations',
    })
    assertV1Response(conversations, {
      correlationId: 'smoke-v1-observability-conversations',
      status: 200,
    })
    const conversationDto = conversations.data?.data?.items?.find((item) => item.id === conversationId)
    if (
      conversationDto?.messageCount !== 105
      || conversationDto.messages?.length !== 100
      || conversationDto.messagesTruncated !== true
      || Object.prototype.hasOwnProperty.call(conversationDto.messages[0] ?? {}, 'internal')
    ) {
      fail(`admin-observability nao limitou a conversa: ${JSON.stringify(conversationDto)}`)
    }

  } finally {
    if (createdTicketId) await deleteRows(status, 'support_tickets', { id: createdTicketId })
    await deleteRows(status, 'support_tickets', { title: ticketTitle })
    await deleteRows(status, 'app_usage_events', { id: usageId })
    await deleteRows(status, 'app_error_logs', { id: errorId })
    await deleteRows(status, 'claris_conversations', { id: conversationId })
    await deleteRows(status, 'admin_user_roles', { user_id: authUserId })
  }

  log('Suporte e observabilidade admin validados com identidade, redaction, paginacao e grants reais.')
}

async function runAuthenticatedServiceCheck(status, accessToken, authUserId, courseId, studentId) {
  await runAccessControlChecks(status, accessToken, authUserId)
  await runServiceIntegrationChecks(status, accessToken, authUserId)
  await runAppSettingsChecks(status, accessToken, authUserId)
  await runAdminObservabilityChecks(status, accessToken, authUserId)

  const settings = await callV1EdgeFunction(
    status,
    'moodle-reauth-settings',
    { action: 'get_settings' },
    {
      acceptStatuses: [200],
      accessToken,
      correlationId: 'smoke-v1-settings',
    },
  )
  assertV1Response(settings, { correlationId: 'smoke-v1-settings', status: 200 })
  if (typeof settings.data?.data?.preferenceEnabled !== 'boolean') {
    fail(`moodle-reauth-settings retornou DTO invalido: ${JSON.stringify(settings.data)}`)
  }

  const clarisAvailability = await callV1EdgeFunction(
    status,
    'claris-chat',
    { operation: 'get_availability' },
    {
      acceptStatuses: [200],
      accessToken,
      correlationId: 'smoke-v1-claris-availability',
    },
  )
  assertV1Response(clarisAvailability, {
    correlationId: 'smoke-v1-claris-availability',
    status: 200,
  })
  const availabilityDto = clarisAvailability.data?.data
  if (
    availabilityDto?.contractVersion !== 1
    || !['ready', 'not_configured', 'invalid'].includes(availabilityDto.status)
    || Object.keys(availabilityDto).some((key) => (
      ['apiKey', 'baseUrl', 'model', 'provider', 'customInstructions'].includes(key)
    ))
  ) {
    fail(`claris-chat availability retornou DTO inseguro: ${JSON.stringify(availabilityDto)}`)
  }
  log('Disponibilidade da Claris validada sem expor configuracao ou segredo do provedor.')

  await runClarisConversationChecks(status, accessToken, authUserId)
  await runClarisSuggestionChecks(status, accessToken, authUserId)

  await runSyncAndBackgroundJobsChecks(status, accessToken, authUserId, courseId)

  const telemetryEventType = 'smoke_edge_telemetry'
  const telemetryErrorMessage = 'Smoke Edge telemetry error'
  await deleteRows(status, 'app_usage_events', { event_type: telemetryEventType })
  await deleteRows(status, 'app_error_logs', { message: telemetryErrorMessage })

  const usageResult = await callV1EdgeFunction(
    status,
    'app-telemetry',
    {
      action: 'track_usage',
      eventType: telemetryEventType,
      metadata: { source: 'edge-smoke' },
      route: '/smoke/edge',
    },
    {
      acceptStatuses: [200],
      accessToken,
      correlationId: 'smoke-v1-telemetry-usage',
    },
  )
  assertV1Response(usageResult, { correlationId: 'smoke-v1-telemetry-usage', status: 200 })

  const errorResult = await callV1EdgeFunction(
    status,
    'app-telemetry',
    {
      action: 'log_error',
      category: 'integration',
      context: { source: 'edge-smoke' },
      message: telemetryErrorMessage,
      severity: 'warning',
    },
    {
      acceptStatuses: [200],
      accessToken,
      correlationId: 'smoke-v1-telemetry-error',
    },
  )
  assertV1Response(errorResult, { correlationId: 'smoke-v1-telemetry-error', status: 200 })

  const [usageRow] = await selectRows(status, 'app_usage_events', { event_type: telemetryEventType })
  const [errorRow] = await selectRows(status, 'app_error_logs', { message: telemetryErrorMessage })
  if (usageRow?.user_id !== authUserId || errorRow?.user_id !== authUserId) {
    fail('app-telemetry nao derivou a identidade do usuario autenticado.')
  }

  await deleteRows(status, 'app_usage_events', { event_type: telemetryEventType })
  await deleteRows(status, 'app_error_logs', { message: telemetryErrorMessage })
  log('app-telemetry validado com identidade autenticada e persistencia real.')

  const [hiddenCourse] = await upsertRows(status, 'courses', 'moodle_course_id', {
    moodle_course_id: 'smoke-hidden-course-001',
    name: 'Curso Smoke Oculto',
    short_name: 'SMOKE-HIDDEN',
  })
  const [hiddenStudent] = await upsertRows(status, 'students', 'moodle_user_id', {
    current_risk_level: 'critico',
    full_name: 'Aluno Smoke Edge Oculto',
    moodle_user_id: 'smoke-hidden-student-001',
  })
  if (!hiddenCourse?.id || !hiddenStudent?.id) {
    fail('Nao foi possivel seedar o cenario de isolamento das sugestoes de tag.')
  }
  await upsertRows(status, 'student_courses', 'student_id,course_id', {
    course_id: hiddenCourse.id,
    enrollment_status: 'ativo',
    student_id: hiddenStudent.id,
  })

  await runAcademicReadChecks(
    status,
    accessToken,
    authUserId,
    courseId,
    studentId,
    hiddenCourse.id,
    hiddenStudent.id,
  )

  await runTasksAndAgendaChecks(status, accessToken, authUserId)
  await runCommunicationsChecks(status, accessToken, authUserId, studentId)

  const tagSuggestions = await callV1EdgeFunction(
    status,
    'task-tag-suggestions',
    { action: 'search_suggestions', prefix: 'aluno', query: 'Aluno Smoke Edge' },
    {
      acceptStatuses: [200],
      accessToken,
      correlationId: 'smoke-v1-task-tags',
    },
  )
  assertV1Response(tagSuggestions, { correlationId: 'smoke-v1-task-tags', status: 200 })
  const tagItems = tagSuggestions.data?.data?.items
  if (!Array.isArray(tagItems) || !tagItems.some((item) => item.entityId === studentId)) {
    fail(`task-tag-suggestions nao retornou o aluno acessivel: ${JSON.stringify(tagSuggestions.data)}`)
  }
  if (tagItems.some((item) => item.entityId === hiddenStudent.id)) {
    fail('task-tag-suggestions vazou um aluno de curso sem acesso.')
  }

  const invalidDashboard = await callV1EdgeFunction(
    status,
    'dashboard-summary',
    { action: 'get_summary', userId: authUserId, week: 'current' },
    {
      acceptStatuses: [422],
      accessToken,
      correlationId: 'smoke-v1-dashboard-invalid-scope',
    },
  )
  assertV1Response(invalidDashboard, {
    code: 'validation_failed',
    correlationId: 'smoke-v1-dashboard-invalid-scope',
    status: 422,
  })

  const dashboard = await callV1EdgeFunction(
    status,
    'dashboard-summary',
    { action: 'get_summary', week: 'current' },
    {
      acceptStatuses: [200],
      accessToken,
      correlationId: 'smoke-v1-dashboard',
    },
  )
  assertV1Response(dashboard, { correlationId: 'smoke-v1-dashboard', status: 200 })
  const dashboardData = dashboard.data?.data
  if (
    dashboardData?.metadata?.contractVersion !== 1
    || dashboardData?.metadata?.appliedCourseCount !== 1
    || dashboardData?.indicators?.studentsAtRisk !== 1
  ) {
    fail(`dashboard-summary retornou DTO ou indicadores invalidos: ${JSON.stringify(dashboard.data)}`)
  }
  if (!dashboardData.criticalStudents?.some((student) => student.id === studentId)) {
    fail(`dashboard-summary nao retornou o aluno acessivel em risco: ${JSON.stringify(dashboard.data)}`)
  }
  if (dashboardData.criticalStudents.some((student) => student.id === hiddenStudent.id)) {
    fail('dashboard-summary vazou um aluno de curso sem acesso.')
  }

  await runCourseManagementChecks(
    status,
    accessToken,
    authUserId,
    courseId,
    studentId,
    hiddenCourse.id,
    hiddenStudent.id,
  )

  await deleteRows(status, 'student_courses', {
    course_id: hiddenCourse.id,
    student_id: hiddenStudent.id,
  })
  await deleteRows(status, 'students', { id: hiddenStudent.id })
  await deleteRows(status, 'courses', { id: hiddenCourse.id })
  log('task-tag-suggestions validado com escopo de curso e isolamento entre usuarios.')
  log('dashboard-summary validado com contrato V1, identidade e isolamento entre cursos.')

  await cleanupAutomatedTaskArtifacts(status, authUserId, studentId)

  const firstRun = await callEdgeFunction(
    status,
    'generate-automated-tasks',
    { automation_types: ['auto_at_risk'] },
    accessToken,
  )

  if (firstRun.status !== 200) {
    fail(`generate-automated-tasks deveria retornar 200 no primeiro run, mas retornou ${firstRun.status}`)
  }

  const firstResult = firstRun.data?.results?.find((entry) => entry.type === 'auto_at_risk')
  if (!firstResult || firstResult.tasks_created !== 1) {
    fail(`Esperava criar 1 task auto_at_risk no primeiro run, recebi: ${JSON.stringify(firstRun.data)}`)
  }

  const secondRun = await callEdgeFunction(
    status,
    'generate-automated-tasks',
    { automation_types: ['auto_at_risk'] },
    accessToken,
  )

  if (secondRun.status !== 200) {
    fail(`generate-automated-tasks deveria retornar 200 no segundo run, mas retornou ${secondRun.status}`)
  }

  const secondResult = secondRun.data?.results?.find((entry) => entry.type === 'auto_at_risk')
  if (!secondResult || secondResult.tasks_created !== 0) {
    fail(`Esperava idempotencia com 0 tasks no segundo run, recebi: ${JSON.stringify(secondRun.data)}`)
  }

  await cleanupAutomatedTaskArtifacts(status, authUserId, studentId)

  log('Fluxo autenticado validado com seed local e passagem pela camada de servico.')

  const proactiveRun = await callV1EdgeFunction(
    status,
    'generate-proactive-suggestions',
    {},
    {
      acceptStatuses: [200],
      accessToken,
      correlationId: 'smoke-v1-generate-proactive-suggestions',
    },
  )
  assertV1Response(proactiveRun, {
    correlationId: 'smoke-v1-generate-proactive-suggestions',
    status: 200,
  })
  if (
    proactiveRun.data?.data?.contractVersion !== 1
    || proactiveRun.data?.data?.enginesRun !== 6
    || typeof proactiveRun.data?.data?.suggestionsCreated !== 'number'
    || typeof proactiveRun.data?.data?.details?.platformUsage !== 'number'
  ) {
    fail(`generate-proactive-suggestions nao retornou o DTO V1: ${JSON.stringify(proactiveRun.data)}`)
  }

  log('generate-proactive-suggestions validado com contrato V1 e autenticacao.')

  const scheduledMessageId = '00000000-0000-0000-0000-000000000901'
  await deleteRows(status, 'scheduled_messages', { id: scheduledMessageId })

  await upsertRows(status, 'scheduled_messages', 'id', {
    id: scheduledMessageId,
    user_id: authUserId,
    title: 'Smoke Scheduled Message',
    message_content: 'Mensagem de smoke para agendamento',
    scheduled_at: new Date(Date.now() - 60_000).toISOString(),
    status: 'pending',
    origin: 'manual',
    recipient_count: 1,
    filter_context: {
      channel: 'moodle',
    },
    execution_context: {
      schema_version: 1,
      mode: 'bulk_send_schedule',
      channel: 'moodle',
      automatic_execution_supported: true,
      moodle_url: 'https://example.com',
      recipient_snapshot: [
        {
          student_id: studentId,
          moodle_user_id: seed.studentMoodleUserId,
          student_name: seed.studentFullName,
          personalized_message: 'Mensagem personalizada do smoke',
        },
      ],
    },
  })

  const unauthorizedProcessorRun = await callScheduledMessageProcessor(
    status,
    { scheduled_message_id: scheduledMessageId },
    null,
  )

  if (unauthorizedProcessorRun.status !== 401) {
    fail(
      `process-scheduled-messages deveria bloquear chamada sem secret, mas retornou ${unauthorizedProcessorRun.status}`,
    )
  }

  const scheduledProcessorRun = await callScheduledMessageProcessor(
    status,
    { scheduled_message_id: scheduledMessageId },
    SCHEDULED_MESSAGES_SECRET,
  )

  if (scheduledProcessorRun.status !== 200) {
    fail(
      `process-scheduled-messages deveria retornar 200 com secret valida, mas retornou ${scheduledProcessorRun.status}: ${JSON.stringify(scheduledProcessorRun.data)}`,
    )
  }

  const scheduledResult = Array.isArray(scheduledProcessorRun.data?.results)
    ? scheduledProcessorRun.data.results[0]
    : null

  if (!scheduledResult || scheduledResult.status !== 'failed' || scheduledResult.reason !== 'reauthorization_not_enabled') {
    fail(`Resultado inesperado do process-scheduled-messages: ${JSON.stringify(scheduledProcessorRun.data)}`)
  }

  const [scheduledMessageRow] = await selectRows(status, 'scheduled_messages', { id: scheduledMessageId })
  if (!scheduledMessageRow || scheduledMessageRow.status !== 'failed') {
    fail(`scheduled_messages nao foi atualizado para failed: ${JSON.stringify(scheduledMessageRow)}`)
  }

  const [backgroundJobRow] = await selectRows(status, 'background_jobs', { id: scheduledMessageId })
  if (!backgroundJobRow || backgroundJobRow.status !== 'failed') {
    fail(`background_jobs nao refletiu a falha do agendamento: ${JSON.stringify(backgroundJobRow)}`)
  }

  await deleteRows(status, 'scheduled_messages', { id: scheduledMessageId })
  log('process-scheduled-messages validado com secret e falha controlada por falta de reautorizacao.')
}

async function main() {
  log('Lendo status do stack local do Supabase...')
  const status = await getLocalSupabaseStatusWithRetry()

  log('Aguardando Edge Functions ficarem prontas...')
  await waitForEdgeFunctions(status)

  log('Executando contratos HTTP sem autenticacao...')
  await runUnauthenticatedContractChecks(status)

  log('Seedando usuario local autenticado e dados minimos de dominio...')
  const authUserId = await ensureAuthUser(status)
  const accessToken = await signInSeedUser(status)
  const { courseId, studentId } = await seedGenerateAutomatedTasksScenario(status, authUserId)

  log('Executando smoke autenticado ate a camada de servico...')
  await runAuthenticatedServiceCheck(status, accessToken, authUserId, courseId, studentId)

  log('Smoke test de Edge Functions concluido com sucesso.')
}

main().catch((error) => {
  console.error(`[smoke-edge] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
