export type EvolutionMethod = 'GET' | 'POST' | 'DELETE' | 'PUT'

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1'])
const DOCKER_HOST_FALLBACKS = [
  'host.docker.internal',
  '172.17.0.1',
  '172.18.0.1',
  '172.19.0.1',
  '172.20.0.1',
]

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

function getConfiguredBaseUrl(): string {
  return normalizeBaseUrl(Deno.env.get('EVOLUTION_API_URL') ?? '')
}

function getConfiguredApiKey(): string {
  return Deno.env.get('EVOLUTION_API_KEY') ?? ''
}

function getCandidateBaseUrls(): string[] {
  const configuredBaseUrl = getConfiguredBaseUrl()
  if (!configuredBaseUrl) return []

  const candidates = [configuredBaseUrl]

  try {
    const parsed = new URL(configuredBaseUrl)
    if (LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase())) {
      for (const fallbackHost of DOCKER_HOST_FALLBACKS) {
        parsed.hostname = fallbackHost
        candidates.push(normalizeBaseUrl(parsed.toString()))
      }
    }
  } catch {
    // Keep the configured URL only when parsing fails.
  }

  return [...new Set(candidates.filter((candidate) => candidate.length > 0))]
}

function shouldRetryWithFallback(hostname: string, status: number, responseText: string): boolean {
  if (!LOOPBACK_HOSTS.has(hostname)) return false

  return (
    responseText.includes('Function not found') ||
    responseText.includes('Cannot GET /') ||
    status === 502 ||
    status === 503 ||
    status === 504
  )
}

export async function evolutionRequest(
  path: string,
  method: EvolutionMethod,
  body?: unknown,
): Promise<unknown> {
  const apiKey = getConfiguredApiKey()
  const baseUrls = getCandidateBaseUrls()

  if (baseUrls.length === 0 || !apiKey) {
    throw new Error('Evolution API not configured. Set EVOLUTION_API_URL and EVOLUTION_API_KEY.')
  }

  let lastError: Error | null = null

  for (let index = 0; index < baseUrls.length; index += 1) {
    const baseUrl = baseUrls[index]
    const hasFallback = index < baseUrls.length - 1

    let hostname = ''
    try {
      hostname = new URL(baseUrl).hostname.toLowerCase()
    } catch {
      hostname = ''
    }

    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          apikey: apiKey,
        },
        body: body ? JSON.stringify(body) : undefined,
      })

      if (!response.ok) {
        const text = await response.text().catch(() => response.statusText)

        if (hasFallback && shouldRetryWithFallback(hostname, response.status, text)) {
          console.warn('Evolution API loopback URL rejected the request, retrying with Docker host alias.', {
            attemptedBaseUrl: baseUrl,
            path,
            status: response.status,
          })
          continue
        }

        throw new Error(`Evolution API error ${response.status}: ${text}`)
      }

      return response.json().catch(() => null)
    } catch (error) {
      if (hasFallback && LOOPBACK_HOSTS.has(hostname) && error instanceof TypeError) {
        console.warn('Evolution API loopback URL is unreachable, retrying with Docker host alias.', {
          attemptedBaseUrl: baseUrl,
          path,
          message: error.message,
        })
        lastError = error
        continue
      }

      throw error
    }
  }

  throw lastError ?? new Error('Evolution API request failed.')
}
