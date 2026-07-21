import { ApiError } from '../_shared/http/mod.ts'
import type { ClarisLlmTestPayload } from './payload.ts'
import type { ClarisLlmTestRepository } from './repository.ts'

export interface ClarisLlmTestResult {
  latencyMs: number
  model: string
  provider: string
  responsePreview: string
}

const DEFAULT_PROVIDER = 'openai'
const DEFAULT_BASE_URL = 'https://api.openai.com/v1'

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}

const asTrimmedString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : ''

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
  if (typeof errorValue === 'string' && errorValue.trim()) return errorValue.trim()
  if (errorValue && typeof errorValue === 'object' && !Array.isArray(errorValue)) {
    const nestedMessage = asTrimmedString((errorValue as Record<string, unknown>).message)
    if (nestedMessage) return nestedMessage
  }
  return asTrimmedString(payload.message) || `LLM provider returned status ${status}`
}

const parseResponsesOutputText = (payload: Record<string, unknown> | null): string => {
  if (!payload) return ''
  const directOutputText = asTrimmedString(payload.output_text)
  if (directOutputText) return directOutputText

  const output = Array.isArray(payload.output) ? payload.output : []
  for (const outputItem of output) {
    const content = Array.isArray(asObject(outputItem).content)
      ? asObject(outputItem).content as unknown[]
      : []
    for (const contentItem of content) {
      const text = asTrimmedString(asObject(contentItem).text)
      if (text) return text
    }
  }
  return ''
}

export async function testClarisLlmConnection(
  repository: ClarisLlmTestRepository,
  input: ClarisLlmTestPayload,
  fetcher: typeof fetch = fetch,
): Promise<ClarisLlmTestResult> {
  const stored = await repository.readStoredSettings()
  const provider = (input.provider?.trim() || stored.provider || DEFAULT_PROVIDER).toLowerCase()
  const model = input.model?.trim() || stored.model
  const baseUrl = (input.baseUrl?.trim() || stored.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '')
  const apiKey = input.apiKey?.trim() || stored.apiKey

  if (!model || !baseUrl || !apiKey) {
    throw ApiError.unprocessable('Missing provider/model/baseUrl/apiKey for Claris LLM connection test.')
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 15000)
  const start = Date.now()

  try {
    const useResponsesApi = prefersResponsesApi(model)
    const requestBody: Record<string, unknown> = useResponsesApi
      ? {
          model,
          max_output_tokens: 32,
          input: [{
            role: 'user',
            content: [{ type: 'input_text', text: 'Reply only with: ok' }],
          }],
        }
      : {
          model,
          max_tokens: 12,
          messages: [{ role: 'user', content: 'Reply only with: ok' }],
        }

    if (!useResponsesApi && supportsTemperature(model)) requestBody.temperature = 0

    const response = await fetcher(`${baseUrl}${useResponsesApi ? '/responses' : '/chat/completions'}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    })
    const latencyMs = Date.now() - start

    let responsePayload: Record<string, unknown> | null = null
    try {
      responsePayload = await response.json() as Record<string, unknown>
    } catch {
      responsePayload = null
    }

    if (!response.ok) {
      throw new ApiError(
        'upstream_rejected',
        `LLM connection test failed: ${extractErrorMessage(responsePayload, response.status)}`,
        400,
      )
    }

    const answer = useResponsesApi
      ? parseResponsesOutputText(responsePayload)
      : (() => {
          const choices = Array.isArray(responsePayload?.choices) ? responsePayload.choices : []
          return asTrimmedString(asObject(asObject(choices[0]).message).content)
        })()

    return {
      provider,
      model,
      latencyMs,
      responsePreview: answer || 'Connected (empty content)',
    }
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('upstream_timeout', 'LLM connection test timeout.', 408)
    }
    throw new ApiError('upstream_error', 'LLM connection test failed.', 502)
  } finally {
    clearTimeout(timeoutId)
  }
}
