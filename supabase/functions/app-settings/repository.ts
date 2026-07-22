import { isApplicationAdmin } from '../_shared/auth/mod.ts'
import {
  createServiceClient,
  type AppSupabaseClient,
  type Json,
} from '../_shared/db/mod.ts'

const APP_SETTINGS_ID = 'global'

export type PublicAppSettingsState = Record<string, never>

export interface AppSettingsState {
  aiGradingSettings: unknown
  clarisSettings: unknown
  riskThresholdDays: unknown
}

export interface AppSettingsRepository {
  isApplicationAdmin(actorId: string): Promise<boolean>
  readAdminSettings(): Promise<AppSettingsState | null>
  readPublicSettings(): Promise<PublicAppSettingsState | null>
  updateAiGradingSettings(settings: Record<string, unknown>): Promise<void>
  updateClarisSettings(settings: {
    apiKey?: string
    baseUrl: string
    customInstructions: string
    model: string
    provider: string
  }): Promise<void>
  updateRiskThresholdDays(settings: Record<string, number>): Promise<void>
}

export function createAppSettingsRepository(
  supabase: AppSupabaseClient = createServiceClient(),
): AppSettingsRepository {
  return {
    isApplicationAdmin(actorId) {
      return isApplicationAdmin(supabase, actorId)
    },

    async readPublicSettings() {
      return {}
    },

    async readAdminSettings() {
      const { data, error } = await supabase
        .from('app_settings')
        .select('risk_threshold_days, claris_llm_settings, ai_grading_settings')
        .eq('singleton_id', APP_SETTINGS_ID)
        .maybeSingle()

      if (error) throw error
      if (!data) return null

      return {
        riskThresholdDays: data.risk_threshold_days,
        clarisSettings: data.claris_llm_settings,
        aiGradingSettings: data.ai_grading_settings,
      }
    },

    async updateRiskThresholdDays(settings) {
      const { error } = await supabase.from('app_settings').upsert({
        singleton_id: APP_SETTINGS_ID,
        risk_threshold_days: settings as Json,
      }, { onConflict: 'singleton_id' })
      if (error) throw error
    },

    async updateClarisSettings(settings) {
      const { error } = await supabase.rpc('backend_update_claris_llm_settings' as never, {
        p_provider: settings.provider,
        p_model: settings.model,
        p_base_url: settings.baseUrl,
        p_custom_instructions: settings.customInstructions,
        p_api_key: settings.apiKey ?? null,
      } as never)
      if (error) throw error
    },

    async updateAiGradingSettings(settings) {
      const { error } = await supabase.from('app_settings').upsert({
        singleton_id: APP_SETTINGS_ID,
        ai_grading_settings: settings as Json,
      }, { onConflict: 'singleton_id' })
      if (error) throw error
    },
  }
}
