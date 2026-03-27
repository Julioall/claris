import { execFileSync } from 'node:child_process'

const RUNNER_CONTAINER = process.env.SUPABASE_RUNNER_CONTAINER || 'claris-supabase'
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

async function deleteRows(status, table, filters) {
  const query = new URLSearchParams({ select: 'id' })

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
    acceptStatuses: [200, 400, 401],
    body,
    headers: publishableHeaders(status, accessToken),
    method: 'POST',
  })

  return { data, status: response.status }
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
      body: { moodleUrl: 'https://example.com', token: 'token-demo' },
      expectedStatus: 400,
      name: 'bulk-message-send missing-job',
      path: 'bulk-message-send',
    },
    {
      body: { job_id: '00000000-0000-0000-0000-000000000000', moodleUrl: 'https://example.com', token: 'token-demo' },
      expectedStatus: 401,
      name: 'bulk-message-send valid-no-auth',
      path: 'bulk-message-send',
    },
    {
      body: {
        message_content: 'Mensagem smoke',
        moodleUrl: 'https://example.com',
        origin: 'manual',
        recipients: [{
          moodle_user_id: 'smoke-student-001',
          personalized_message: 'Mensagem smoke',
          student_id: 'student-smoke',
          student_name: 'Aluno Smoke',
        }],
        token: 'token-demo',
      },
      expectedStatus: 401,
      name: 'bulk-message-send create-no-auth',
      path: 'bulk-message-send',
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
      expectedStatus: 400,
      name: 'moodle-sync-courses invalid-action',
      path: 'moodle-sync-courses',
    },
    {
      body: { action: 'link_selected_courses', selectedCourseIds: ['course-a', 'course-b'] },
      expectedStatus: 401,
      name: 'moodle-sync-courses valid-no-auth',
      path: 'moodle-sync-courses',
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
}

async function runAuthenticatedServiceCheck(status, accessToken, authUserId, studentId) {
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
  const { studentId } = await seedGenerateAutomatedTasksScenario(status, authUserId)

  log('Executando smoke autenticado ate a camada de servico...')
  await runAuthenticatedServiceCheck(status, accessToken, authUserId, studentId)

  log('Smoke test de Edge Functions concluido com sucesso.')
}

main().catch((error) => {
  console.error(`[smoke-edge] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
