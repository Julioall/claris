import { createHandler, errorResponse, jsonResponse } from '../_shared/http/mod.ts'
import { createServiceClient } from '../_shared/db/mod.ts'
import { buildClarisSystemPrompt, selectClarisToolsForMessage } from '../_shared/claris/chat-config.ts'
import { runClarisLoop } from '../_shared/claris/loop.ts'
import { parseClarisChatPayload } from './payload.ts'

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
  const storedSettings = await readStoredSettings(user.id)

  const provider = (storedSettings.provider || DEFAULT_PROVIDER).toLowerCase()
  const model = storedSettings.model || ''
  const baseUrl = normalizeBaseUrl(storedSettings.baseUrl || DEFAULT_BASE_URL)
  const apiKey = storedSettings.apiKey || ''

  const isConfigured = Boolean(storedSettings.configured) && Boolean(model) && Boolean(baseUrl) && Boolean(apiKey)

  if (!isConfigured) {
    return errorResponse('Claris IA not configured globally.', 400)
  }

  const userMessage = body.action?.value?.trim() || body.message
  const activeTools = selectClarisToolsForMessage({
    latestUserMessage: userMessage,
    history: body.history,
    actionKind: body.action?.kind,
    actionJobId: body.action?.jobId,
  })

  const messages = [
    { role: 'system' as const, content: buildClarisSystemPrompt(activeTools) },
    ...body.history.map(({ role, content }) => ({ role, content })),
    { role: 'user' as const, content: userMessage },
  ]

  try {
    const { reply, latencyMs, uiActions, richBlocks } = await runClarisLoop(
      { model, baseUrl, apiKey, provider },
      messages,
      user.id,
      {
        latestUserMessage: userMessage,
        moodleUrl: body.moodleUrl,
        moodleToken: body.moodleToken,
        actionKind: body.action?.kind,
        actionJobId: body.action?.jobId,
      },
      120000,
      activeTools,
    )

    if (!reply) {
      return errorResponse('LLM returned an empty response.', 502)
    }

    return jsonResponse({
      success: true,
      provider,
      model,
      latencyMs,
      reply,
      uiActions,
      richBlocks,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return errorResponse('LLM chat request timeout.', 408)
    }

    return errorResponse(
      error instanceof Error ? `LLM chat request failed: ${error.message}` : 'LLM chat request failed.',
      500,
    )
  }
}, { requireAuth: true, parseBody: parseClarisChatPayload }))
