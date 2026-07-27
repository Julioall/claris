import { pathToFileURL } from 'node:url'

const RESPONSE_LIMIT_BYTES = 1024 * 1024
const REQUEST_TIMEOUT_MS = 25_000

function usage() {
  console.log(`Uso:
  MOODLE_SYNC_STAGING_URL=https://staging.example \\
  MOODLE_SYNC_STAGING_PUBLISHABLE_KEY=... \\
  MOODLE_SYNC_STAGING_ADMIN_JWT=... \\
  npm run validate:moodle-sync:staging

Opcoes:
  --allow-enabled-rollouts  Permite flags habilitadas ao observar um canario.
  --help                    Exibe esta ajuda.

O script chama somente endpoints Claris de leitura e tentativas sem segredo que
devem receber 401. Ele nunca chama Moodle, nao recebe token Moodle, nao altera
rollout, job, conexao ou usuario e nao imprime credenciais.`)
}

function requiredEnvironment(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} e obrigatoria.`)
  return value
}

function normalizeFunctionsUrl(rawValue) {
  let url
  try {
    url = new URL(rawValue)
  } catch {
    throw new Error('MOODLE_SYNC_STAGING_URL deve ser uma URL HTTPS absoluta.')
  }

  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
    || url.search
    || url.hash
  ) {
    throw new Error('MOODLE_SYNC_STAGING_URL deve ser HTTPS sem credenciais, query ou fragmento.')
  }

  const normalizedPath = url.pathname.replace(/\/+$/, '')
  url.pathname = normalizedPath.endsWith('/functions/v1')
    ? normalizedPath
    : `${normalizedPath}/functions/v1`.replace(/\/+/g, '/')
  return url.toString().replace(/\/$/, '')
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function assertSafeResponse(value, depth = 0) {
  if (depth > 16) throw new Error('Resposta de staging excedeu a profundidade segura.')
  if (Array.isArray(value)) {
    value.forEach((item) => assertSafeResponse(item, depth + 1))
    return
  }
  if (!isRecord(value)) return

  for (const [key, nestedValue] of Object.entries(value)) {
    if (/(?:token|password|credential|email|moodle_?url|(^|_)url$|payload|body)/i.test(key)) {
      throw new Error('Endpoint de staging retornou um campo sensivel inesperado.')
    }
    assertSafeResponse(nestedValue, depth + 1)
  }
}

async function postJson(functionsUrl, functionName, body, headers) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(`${functionsUrl}/${functionName}`, {
      body: JSON.stringify(body),
      headers: {
        'content-type': 'application/json',
        ...headers,
      },
      method: 'POST',
      signal: controller.signal,
    })
    const declaredLength = Number(response.headers.get('content-length'))
    if (Number.isFinite(declaredLength) && declaredLength > RESPONSE_LIMIT_BYTES) {
      throw new Error(`${functionName} excedeu o limite de resposta de staging.`)
    }
    const text = await response.text()
    if (Buffer.byteLength(text, 'utf8') > RESPONSE_LIMIT_BYTES) {
      throw new Error(`${functionName} excedeu o limite de resposta de staging.`)
    }
    let data = null
    if (text.trim()) {
      try {
        data = JSON.parse(text)
      } catch {
        throw new Error(`${functionName} retornou JSON invalido em staging.`)
      }
    }
    return { data, status: response.status }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`${functionName} excedeu o timeout de staging.`)
    }
    if (error instanceof Error && error.message.startsWith(`${functionName} `)) throw error
    // Fetch may include a hostname in its low-level error. The staging report
    // must remain safe to archive, so expose only the logical function name.
    throw new Error(`${functionName} nao respondeu em staging.`)
  } finally {
    clearTimeout(timeout)
  }
}

function unwrapSuccessEnvelope(value, functionName) {
  if (!isRecord(value) || !isRecord(value.data) || typeof value.correlationId !== 'string') {
    throw new Error(`${functionName} retornou envelope V1 invalido em staging.`)
  }
  assertSafeResponse(value.data)
  return value.data
}

function validateRollouts(data, allowEnabledRollouts) {
  if (data.contractVersion !== 1 || !Array.isArray(data.items)) {
    throw new Error('moodle-sync-rollouts retornou contrato invalido em staging.')
  }

  const enabledCount = data.items.filter((item) => isRecord(item) && item.enabled === true).length
  if (!allowEnabledRollouts && enabledCount > 0) {
    throw new Error('Staging possui rollout Moodle habilitado fora de uma janela de canario.')
  }
  return { enabledCount, itemCount: data.items.length }
}

function validateOperationalMetrics(data) {
  if (data.contractVersion !== 1 || !Array.isArray(data.items)) {
    throw new Error('admin-observability retornou metricas Moodle invalidas em staging.')
  }

  for (const item of data.items) {
    if (
      !isRecord(item)
      || typeof item.siteSlug !== 'string'
      || !isRecord(item.transport)
      || !Number.isSafeInteger(item.transport.apiCalls)
      || !Number.isSafeInteger(item.transport.responseBytes)
    ) {
      throw new Error('admin-observability retornou metrica Moodle incompleta em staging.')
    }
  }
  return { siteMetricCount: data.items.length }
}

async function main() {
  const options = new Set(process.argv.slice(2))
  if (options.has('--help')) return usage()
  if ([...options].some((option) => option !== '--allow-enabled-rollouts')) {
    throw new Error('Opcao de staging desconhecida. Use --help.')
  }

  const functionsUrl = normalizeFunctionsUrl(requiredEnvironment('MOODLE_SYNC_STAGING_URL'))
  const publishableKey = requiredEnvironment('MOODLE_SYNC_STAGING_PUBLISHABLE_KEY')
  const adminJwt = requiredEnvironment('MOODLE_SYNC_STAGING_ADMIN_JWT')
  const authenticatedHeaders = {
    apikey: publishableKey,
    authorization: `Bearer ${adminJwt}`,
  }

  const rolloutsResponse = await postJson(
    functionsUrl,
    'moodle-sync-rollouts',
    { action: 'list_rollouts' },
    authenticatedHeaders,
  )
  if (rolloutsResponse.status !== 200) {
    throw new Error(`moodle-sync-rollouts retornou HTTP ${rolloutsResponse.status} em staging.`)
  }
  const rolloutSummary = validateRollouts(
    unwrapSuccessEnvelope(rolloutsResponse.data, 'moodle-sync-rollouts'),
    options.has('--allow-enabled-rollouts'),
  )

  const metricsResponse = await postJson(
    functionsUrl,
    'admin-observability',
    { action: 'get_moodle_sync_metrics', stuckAfterSeconds: 300, windowHours: 24 },
    authenticatedHeaders,
  )
  if (metricsResponse.status !== 200) {
    throw new Error(`admin-observability retornou HTTP ${metricsResponse.status} em staging.`)
  }
  const metricsSummary = validateOperationalMetrics(
    unwrapSuccessEnvelope(metricsResponse.data, 'admin-observability'),
  )

  const unauthenticatedHeaders = { apikey: publishableKey }
  for (const [functionName, body] of [
    ['moodle-sync-dispatcher', { limit: 1 }],
    ['moodle-sync-worker', {}],
  ]) {
    const response = await postJson(functionsUrl, functionName, body, unauthenticatedHeaders)
    if (response.status !== 401) {
      throw new Error(`${functionName} deve rejeitar chamada sem segredo com HTTP 401 em staging.`)
    }
  }

  console.log(JSON.stringify({
    checks: {
      cronEndpointsRejectWithoutSecret: true,
      operationalMetrics: metricsSummary,
      rollouts: rolloutSummary,
    },
    mode: 'read_only',
    validation: 'moodle-sync-staging-preflight',
    writesPerformed: false,
  }, null, 2))
}

export {
  normalizeFunctionsUrl,
  validateOperationalMetrics,
  validateRollouts,
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[validate-moodle-sync-staging] ${error instanceof Error ? error.message : 'Falha desconhecida.'}`)
    process.exitCode = 1
  })
}
