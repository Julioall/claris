import { createHash, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'

const RUNNER_CONTAINER = process.env.SUPABASE_RUNNER_CONTAINER || 'claris-supabase'
const EMAIL = process.env.EDGE_SMOKE_EMAIL || 'smoke.edge.local@example.com'
const PASSWORD = process.env.EDGE_SMOKE_PASSWORD || 'SmokeEdge#2026'
const WARMUPS = readPositiveInteger('DASHBOARD_BENCHMARK_WARMUPS', 5)
const MEASUREMENTS = readPositiveInteger('DASHBOARD_BENCHMARK_MEASUREMENTS', 30)

function readPositiveInteger(name, fallback) {
  const value = process.env[name]
  if (value === undefined) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1000) {
    throw new Error(`${name} deve ser um inteiro entre 1 e 1000.`)
  }
  return parsed
}

function localStatus() {
  const output = execFileSync(
    'docker',
    ['exec', RUNNER_CONTAINER, 'supabase', 'status', '--output', 'json'],
    { encoding: 'utf8' },
  )
  const start = output.indexOf('{')
  const end = output.lastIndexOf('}')
  if (start < 0 || end < start) throw new Error('Status local do Supabase nao retornou JSON.')
  return JSON.parse(output.slice(start, end + 1))
}

async function signIn(status) {
  const response = await fetch(`${status.API_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: status.PUBLISHABLE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  const payload = await response.json()
  if (!response.ok || typeof payload.access_token !== 'string') {
    throw new Error(`Login local falhou com HTTP ${response.status}. Rode primeiro npm run smoke:edge.`)
  }
  return payload.access_token
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'generatedAt')
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, stableValue(nested)]),
  )
}

function responseSignature(data) {
  return createHash('sha256').update(JSON.stringify(stableValue(data))).digest('hex')
}

async function requestSummary(status, accessToken) {
  const startedAt = performance.now()
  const response = await fetch(`${status.FUNCTIONS_URL}/dashboard-summary`, {
    method: 'POST',
    headers: {
      apikey: status.PUBLISHABLE_KEY,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'x-claris-api-version': '1',
      'x-correlation-id': randomUUID(),
    },
    body: JSON.stringify({
      action: 'get_summary',
      ...(process.env.DASHBOARD_BENCHMARK_COURSE_ID
        ? { courseId: process.env.DASHBOARD_BENCHMARK_COURSE_ID }
        : {}),
      week: 'current',
    }),
  })
  const text = await response.text()
  const wallMs = performance.now() - startedAt
  let payload
  try {
    payload = JSON.parse(text)
  } catch {
    throw new Error(`dashboard-summary retornou corpo nao JSON com HTTP ${response.status}.`)
  }
  if (!response.ok || !payload?.data || payload.data?.metadata?.contractVersion !== 1) {
    throw new Error(`dashboard-summary retornou resposta invalida com HTTP ${response.status}.`)
  }
  return {
    bytes: new TextEncoder().encode(text).byteLength,
    data: payload.data,
    requests: 1,
    wallMs,
  }
}

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]
}

function distribution(samples, field) {
  const values = samples.map((sample) => sample[field])
  return {
    median: Number(percentile(values, 0.5).toFixed(2)),
    p95: Number(percentile(values, 0.95).toFixed(2)),
  }
}

async function main() {
  const status = localStatus()
  const accessToken = await signIn(status)

  for (let index = 0; index < WARMUPS; index += 1) {
    await requestSummary(status, accessToken)
  }

  const samples = []
  const signatures = new Set()
  let lastData
  for (let index = 0; index < MEASUREMENTS; index += 1) {
    const sample = await requestSummary(status, accessToken)
    samples.push(sample)
    signatures.add(responseSignature(sample.data))
    lastData = sample.data
  }

  if (signatures.size !== 1) {
    throw new Error('O resultado funcional mudou durante as medicoes; estabilize a fixture e tente novamente.')
  }

  console.log(JSON.stringify({
    bodyBytes: distribution(samples, 'bytes'),
    browserRequests: distribution(samples, 'requests'),
    contractVersion: lastData.metadata.contractVersion,
    fixture: {
      appliedCourseCount: lastData.metadata.appliedCourseCount,
      criticalStudents: lastData.criticalStudents.length,
      reviewActivities: lastData.activitiesToReview.length,
    },
    latencyMs: distribution(samples, 'wallMs'),
    measuredAt: new Date().toISOString(),
    measurements: MEASUREMENTS,
    resultSignature: [...signatures][0],
    warmups: WARMUPS,
  }, null, 2))
}

main().catch((error) => {
  console.error(`[benchmark-dashboard-summary] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
