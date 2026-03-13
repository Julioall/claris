import { execFileSync } from 'node:child_process'

const API_BASE_URL = 'https://api.github.com'
const API_VERSION = '2026-03-10'
const DEFAULT_REQUIRED_CHECK = 'Smoke test local Edge Functions'
const VALID_MODES = new Set(['status', 'apply'])

function log(message) {
  console.log(`[branch-protection] ${message}`)
}

function fail(message) {
  throw new Error(message)
}

function readGit(args) {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return null
  }
}

function parseGitHubRemote(remoteUrl) {
  if (!remoteUrl) return null

  const httpsMatch = remoteUrl.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/i)
  if (httpsMatch) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] }
  }

  const sshMatch = remoteUrl.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i)
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2] }
  }

  return null
}

function detectDefaultBranch() {
  const symbolicRef = readGit(['symbolic-ref', 'refs/remotes/origin/HEAD'])
  if (!symbolicRef) return null

  const segments = symbolicRef.split('/')
  return segments[segments.length - 1] || null
}

function getConfig() {
  const remoteUrl = readGit(['config', '--get', 'remote.origin.url'])
  const parsedRemote = parseGitHubRemote(remoteUrl)

  const owner = process.env.GITHUB_OWNER || parsedRemote?.owner
  const repo = process.env.GITHUB_REPO || parsedRemote?.repo
  const branch = process.env.GITHUB_BRANCH || detectDefaultBranch() || 'main'
  const requiredCheck = process.env.GITHUB_REQUIRED_CHECK || DEFAULT_REQUIRED_CHECK
  const token = process.env.GITHUB_TOKEN

  if (!owner || !repo) {
    fail('Nao foi possivel detectar owner/repo do GitHub a partir do remote origin. Defina GITHUB_OWNER e GITHUB_REPO.')
  }

  if (!token) {
    fail('Defina GITHUB_TOKEN com permissao Administration: write para auditar ou aplicar a protecao de branch.')
  }

  return {
    branch,
    owner,
    repo,
    requiredCheck,
    token,
  }
}

function formatApiError(response, payload) {
  if (payload && typeof payload === 'object' && 'message' in payload && typeof payload.message === 'string') {
    return `HTTP ${response.status}: ${payload.message}`
  }

  if (typeof payload === 'string' && payload.length > 0) {
    return `HTTP ${response.status}: ${payload}`
  }

  return `HTTP ${response.status}`
}

async function githubRequest(config, path, { body, method = 'GET' } = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': API_VERSION,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  const text = await response.text()
  let payload = null

  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = text
    }
  }

  return { payload, response }
}

async function getBranchProtection(config) {
  const path = `/repos/${config.owner}/${config.repo}/branches/${encodeURIComponent(config.branch)}/protection`
  const result = await githubRequest(config, path)

  if (result.response.status === 404) {
    return null
  }

  if (!result.response.ok) {
    fail(`Falha ao ler branch protection: ${formatApiError(result.response, result.payload)}`)
  }

  return result.payload
}

function collectRequiredContexts(requiredStatusChecks) {
  const contexts = new Set(requiredStatusChecks?.contexts ?? [])

  for (const check of requiredStatusChecks?.checks ?? []) {
    if (check?.context) {
      contexts.add(check.context)
    }
  }

  return [...contexts].sort((left, right) => left.localeCompare(right))
}

function normalizeChecks(requiredStatusChecks) {
  if (!Array.isArray(requiredStatusChecks?.checks) || requiredStatusChecks.checks.length === 0) {
    return null
  }

  return requiredStatusChecks.checks.map((check) => {
    if (check?.app_id === null || check?.app_id === undefined) {
      return { context: check.context }
    }

    return {
      app_id: check.app_id,
      context: check.context,
    }
  })
}

async function updateRequiredStatusChecks(config, protection) {
  const requiredStatusChecks = protection.required_status_checks
  const strict = requiredStatusChecks?.strict ?? true
  const path = `/repos/${config.owner}/${config.repo}/branches/${encodeURIComponent(config.branch)}/protection/required_status_checks`
  const existingChecks = normalizeChecks(requiredStatusChecks)

  let body

  if (existingChecks) {
    const alreadyRequired = existingChecks.some((check) => check.context === config.requiredCheck)
    body = {
      checks: alreadyRequired ? existingChecks : [...existingChecks, { context: config.requiredCheck }],
      strict,
    }
  } else {
    const contexts = collectRequiredContexts(requiredStatusChecks)
    if (!contexts.includes(config.requiredCheck)) {
      contexts.push(config.requiredCheck)
      contexts.sort((left, right) => left.localeCompare(right))
    }

    body = {
      contexts,
      strict,
    }
  }

  const result = await githubRequest(config, path, {
    body,
    method: 'PATCH',
  })

  if (!result.response.ok) {
    fail(`Falha ao atualizar required status checks: ${formatApiError(result.response, result.payload)}`)
  }

  return result.payload
}

function printSummary(config, protection) {
  const contexts = collectRequiredContexts(protection?.required_status_checks)
  const hasRequiredCheck = contexts.includes(config.requiredCheck)

  log(`Repositorio alvo: ${config.owner}/${config.repo}`)
  log(`Branch alvo: ${config.branch}`)
  log(`Check exigido: ${config.requiredCheck}`)
  log(`Checks obrigatorios atuais: ${contexts.length > 0 ? contexts.join(', ') : '(nenhum)'}`)

  return { contexts, hasRequiredCheck }
}

async function run() {
  const mode = process.argv[2] || 'status'

  if (!VALID_MODES.has(mode)) {
    fail(`Modo invalido: ${mode}. Use "status" ou "apply".`)
  }

  const config = getConfig()
  const protection = await getBranchProtection(config)

  if (!protection) {
    fail(
      `A branch ${config.branch} ainda nao possui branch protection acessivel via API. Habilite a protecao no GitHub antes de exigir o smoke test.`
    )
  }

  const summary = printSummary(config, protection)

  if (mode === 'status') {
    if (!summary.hasRequiredCheck) {
      fail(`O check ${config.requiredCheck} ainda nao esta configurado como obrigatorio.`)
    }

    log('O check exigido ja esta configurado como obrigatorio.')
    return
  }

  if (summary.hasRequiredCheck) {
    log('O check exigido ja esta configurado como obrigatorio; nenhuma alteracao foi necessaria.')
    return
  }

  const updatedProtection = await updateRequiredStatusChecks(config, protection)
  const updatedSummary = printSummary(config, { required_status_checks: updatedProtection })

  if (!updatedSummary.hasRequiredCheck) {
    fail(`A API respondeu sem incluir o check ${config.requiredCheck} apos a atualizacao.`)
  }

  log('Required status check atualizado com sucesso.')
}

run().catch((error) => {
  console.error(`[branch-protection] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})