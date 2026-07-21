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

async function callEdgeFunction(status, functionName, body, accessToken) {
  const { data, response } = await requestJson(`${status.FUNCTIONS_URL}/${functionName}`, {
    acceptStatuses: [200, 400, 401, 403, 404, 409, 422],
    body,
    headers: publishableHeaders(status, accessToken),
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
      expectedStatus: 400,
      name: 'moodle-messaging invalid-action',
      path: 'moodle-messaging',
    },
    {
      body: { action: 'get_messages', limit_num: 10, moodleUrl: 'https://example.com', moodle_user_id: 1, token: 'token-demo' },
      expectedStatus: 401,
      name: 'moodle-messaging valid-no-auth',
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
    const result = await callEdgeFunction(status, testCase.path, testCase.body)
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
          ('user_ignored_courses'::TEXT)
      ),
      private_tables(table_name) AS (
        VALUES
          ('ai_grade_suggestion_history'::TEXT),
          ('ai_grade_suggestion_job_items'::TEXT),
          ('ai_grade_suggestion_jobs'::TEXT),
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
          ('user_sync_preferences'::TEXT)
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
          ('public.backend_seed_message_templates(uuid,jsonb)'::TEXT)
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
          CROSS JOIN protected_functions
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

async function runAuthenticatedServiceCheck(status, accessToken, authUserId, courseId, studentId) {
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

  await runClarisConversationChecks(status, accessToken, authUserId)

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

  // Smoke check for generate-proactive-suggestions (authenticated)
  const proactiveRun = await callEdgeFunction(
    status,
    'generate-proactive-suggestions',
    {},
    accessToken,
  )

  if (proactiveRun.status !== 200) {
    fail(`generate-proactive-suggestions deveria retornar 200 com auth, mas retornou ${proactiveRun.status}: ${JSON.stringify(proactiveRun.data)}`)
  }

  if (typeof proactiveRun.data?.engines_run !== 'number') {
    fail(`generate-proactive-suggestions nao retornou engines_run: ${JSON.stringify(proactiveRun.data)}`)
  }

  log('generate-proactive-suggestions validado com autenticacao.')

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
