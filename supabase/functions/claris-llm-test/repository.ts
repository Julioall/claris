import { isApplicationAdmin } from '../_shared/auth/mod.ts'
import { createServiceClient, type AppSupabaseClient } from '../_shared/db/mod.ts'

export interface StoredClarisLlmSettings {
  apiKey: string
  baseUrl: string
  model: string
  provider: string
}

export interface ClarisLlmTestRepository {
  isApplicationAdmin(actorId: string): Promise<boolean>
  readStoredSettings(): Promise<StoredClarisLlmSettings>
}

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}

const asTrimmedString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : ''

export function createClarisLlmTestRepository(
  supabase: AppSupabaseClient = createServiceClient(),
): ClarisLlmTestRepository {
  return {
    isApplicationAdmin(actorId) {
      return isApplicationAdmin(supabase, actorId)
    },

    async readStoredSettings() {
      const { data, error } = await supabase
        .from('app_settings')
        .select('claris_llm_settings')
        .eq('singleton_id', 'global')
        .maybeSingle()

      if (error) throw error
      const settings = asObject(data?.claris_llm_settings)
      return {
        provider: asTrimmedString(settings.provider),
        model: asTrimmedString(settings.model),
        baseUrl: asTrimmedString(settings.baseUrl),
        apiKey: asTrimmedString(settings.apiKey),
      }
    },
  }
}
