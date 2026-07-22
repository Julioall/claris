import { buildClarisSystemPrompt, selectClarisToolsForMessage } from '../_shared/claris/chat-config.ts'
import { runClarisLoop } from '../_shared/claris/loop.ts'
import type { ClarisChatMessagePayload } from './payload.ts'
import type { ClarisLlmSettings } from './repository.ts'

const DEFAULT_PROVIDER = 'openai'
const DEFAULT_BASE_URL = 'https://api.openai.com/v1'

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '')
}

export async function executeClarisChat(
  settings: ClarisLlmSettings,
  payload: ClarisChatMessagePayload,
  actorId: string,
  moodleConnectionId?: string,
) {
  const provider = (settings.provider || DEFAULT_PROVIDER).toLowerCase()
  const model = settings.model
  const baseUrl = normalizeBaseUrl(settings.baseUrl || DEFAULT_BASE_URL)
  const userMessage = payload.action?.value?.trim() || payload.message
  const activeTools = selectClarisToolsForMessage({
    latestUserMessage: userMessage,
    history: payload.history,
    actionKind: payload.action?.kind,
    actionJobId: payload.action?.jobId,
  })
  const messages = [
    {
      role: 'system' as const,
      content: buildClarisSystemPrompt(activeTools, settings.customInstructions),
    },
    ...payload.history.map(({ role, content }) => ({ role, content })),
    { role: 'user' as const, content: userMessage },
  ]

  const result = await runClarisLoop(
    { model, baseUrl, apiKey: settings.apiKey, provider },
    messages,
    actorId,
    {
      latestUserMessage: userMessage,
      moodleConnectionId,
      actionKind: payload.action?.kind,
      actionJobId: payload.action?.jobId,
    },
    120000,
    activeTools,
  )

  return { ...result, provider, model }
}
