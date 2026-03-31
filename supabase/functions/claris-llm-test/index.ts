import { createHandler, errorResponse, jsonResponse } from '../_shared/http/mod.ts'
import { isApplicationAdmin } from '../_shared/auth/mod.ts'
import { createServiceClient } from '../_shared/db/mod.ts'
import { parseClarisLlmTestPayload } from './payload.ts'

type SettingsJson = {
  provider?: string
  model?: string
  baseUrl?: string
  apiKey?: string
  configured?: boolean
}

const DEFAULT_PROVIDER = 'openai'
const DEFAULT_BASE_URL = 'https://api.openai.com/v1'

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}

const asTrimmedString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : ''

const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, '')

const supportsTemperature = (model: string): boolean => {
  const normalizedModel = model.trim().toLowerCase()
  return !normalizedModel.startsWith('gpt-5') && !normalizedModel.startsWith('o')
}

const prefersResponsesApi = (model: string): boolean => {
  const normalizedModel = model.trim().toLowerCase()
  return normalizedModel.startsWith('gpt-5') || normalizedModel.startsWith('o')
}

const extractErrorMessage = (payload: Record<string, unknown> | null, status: number): string => {
  if (!payload) return `LLM provider returned status ${status}`

  const errorValue = payload.error
  if (typeof errorValue === 'string' && errorValue.trim().length > 0) {
    return errorValue.trim()
  }

  if (errorValue && typeof errorValue === 'object' && !Array.isArray(errorValue)) {
    const errorObject = errorValue as Record<string, unknown>
    const nestedMessage = asTrimmedString(errorObject.message)
    if (nestedMessage) return nestedMessage
  }

  const topLevelMessage = asTrimmedString(payload.message)
  if (topLevelMessage) return topLevelMessage

  return `LLM provider returned status ${status}`
}

const parseResponsesOutputText = (payload: Record<string, unknown> | null): string => {
  if (!payload) return ''

  const directOutputText = asTrimmedString(payload.output_text)
  if (directOutputText) return directOutputText

  const output = Array.isArray(payload.output) ? payload.output : []
  for (const outputItem of output) {
    if (!outputItem || typeof outputItem !== 'object' || Array.isArray(outputItem)) continue
    const content = Array.isArray((outputItem as Record<string, unknown>).content)
      ? (outputItem as Record<string, unknown>).content as unknown[]
      : []

    for (const contentItem of content) {
      if (!contentItem || typeof contentItem !== 'object' || Array.isArray(contentItem)) continue
      const text = asTrimmedString((contentItem as Record<string, unknown>).text)
      if (text) return text
    }
  }

  return ''
}

async function readStoredSettings(userId: string): Promise<SettingsJson> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('app_settings')
    .select('claris_llm_settings')
    .eq('singleton_id', 'global')
    .maybeSingle()

  if (error || !data) return {}

  const rawSettings = asObject(data.claris_llm_settings)

  return {
    provider: asTrimmedString(rawSettings.provider),
    model: asTrimmedString(rawSettings.model),
    baseUrl: asTrimmedString(rawSettings.baseUrl),
    apiKey: asTrimmedString(rawSettings.apiKey),
    configured: Boolean(rawSettings.configured),
  }
}

Deno.serve(createHandler(async ({ body, user }) => {
  const supabase = createServiceClient()
  const isAdmin = await isApplicationAdmin(supabase, user.id)

  if (!isAdmin) {
    return errorResponse('Admin access required for Claris LLM tests.', 403)
  }

  const storedSettings = await readStoredSettings(user.id)

  const provider = (body.provider?.trim() || storedSettings.provider || DEFAULT_PROVIDER).toLowerCase()
  const model = body.model?.trim() || storedSettings.model || ''
  const baseUrl = normalizeBaseUrl(body.baseUrl?.trim() || storedSettings.baseUrl || DEFAULT_BASE_URL)
  const apiKey = body.apiKey?.trim() || storedSettings.apiKey || ''

  if (!model || !baseUrl || !apiKey) {
    return errorResponse('Missing provider/model/baseUrl/apiKey for Claris LLM connection test.', 400)
  }

  const timeoutMs = 15000
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  const start = Date.now()

  try {
    const useResponsesApi = prefersResponsesApi(model)
    const requestBody: Record<string, unknown> = useResponsesApi
      ? {
          model,
          max_output_tokens: 32,
          input: [
            {
              role: 'user',
              content: [
                {
                  type: 'input_text',
                  text: 'Reply only with: ok',
                },
              ],
            },
          ],
        }
      : {
          model,
          max_tokens: 12,
          messages: [
            {
              role: 'user',
              content: 'Reply only with: ok',
            },
          ],
        }

    if (!useResponsesApi && supportsTemperature(model)) {
      requestBody.temperature = 0
    }

    const endpoint = useResponsesApi ? '/responses' : '/chat/completions'
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    })

    const latencyMs = Date.now() - start

    let payload: Record<string, unknown> | null = null
    try {
      payload = await response.json() as Record<string, unknown>
    } catch {
      payload = null
    }

    if (!response.ok) {
      const errorMessage = extractErrorMessage(payload, response.status)
      return errorResponse(`LLM connection test failed: ${errorMessage}`, 400)
    }

    const answer = useResponsesApi
      ? parseResponsesOutputText(payload)
      : (() => {
          const choices = Array.isArray(payload?.choices) ? payload?.choices : []
          const firstChoice = choices.length > 0 ? asObject(choices[0]) : {}
          const message = asObject(firstChoice.message)
          return asTrimmedString(message.content)
        })()

    return jsonResponse({
      success: true,
      provider,
      model,
      latencyMs,
      responsePreview: answer || 'Connected (empty content)',
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return errorResponse('LLM connection test timeout.', 408)
    }

    return errorResponse(
      error instanceof Error ? `LLM connection test failed: ${error.message}` : 'LLM connection test failed.',
      500,
    )
  } finally {
    clearTimeout(timeoutId)
  }
}, { requireAuth: true, parseBody: parseClarisLlmTestPayload }))
