import { userHasPermission } from '../_shared/auth/mod.ts'
import type { AppSupabaseClient } from '../_shared/db/mod.ts'

export interface ClarisLlmSettings {
  apiKey: string
  baseUrl: string
  configured: boolean
  customInstructions: string
  model: string
  provider: string
}

export interface ClarisChatRepository {
  readSettings(): Promise<ClarisLlmSettings>
  userCanUseClaris(actorId: string): Promise<boolean>
}

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}

const asTrimmedString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : ''

let settingsCache: { value: ClarisLlmSettings; expiresAt: number } | null = null
const SETTINGS_CACHE_TTL_MS = 30 * 1000

function shouldCacheSettings(settings: ClarisLlmSettings): boolean {
  return Boolean(settings.configured && settings.model && settings.baseUrl && settings.apiKey)
}

export function createClarisChatRepository(
  supabase: AppSupabaseClient,
): ClarisChatRepository {
  return {
    async readSettings() {
      const now = Date.now()
      if (settingsCache && now < settingsCache.expiresAt) return settingsCache.value

      const { data, error } = await supabase
        .from('app_settings')
        .select('claris_llm_settings')
        .eq('singleton_id', 'global')
        .maybeSingle()

      if (error) throw error
      const rawSettings = asObject(data?.claris_llm_settings)
      const settings: ClarisLlmSettings = {
        provider: asTrimmedString(rawSettings.provider),
        model: asTrimmedString(rawSettings.model),
        baseUrl: asTrimmedString(rawSettings.baseUrl),
        apiKey: asTrimmedString(rawSettings.apiKey),
        customInstructions: asTrimmedString(rawSettings.customInstructions),
        configured: rawSettings.configured === true,
      }

      settingsCache = shouldCacheSettings(settings)
        ? { value: settings, expiresAt: now + SETTINGS_CACHE_TTL_MS }
        : null
      return settings
    },
    userCanUseClaris(actorId) {
      return userHasPermission(supabase, actorId, 'claris.view')
    },
  }
}
