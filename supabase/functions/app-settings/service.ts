import { ApiError } from '../_shared/http/mod.ts'
import type { AdminAppSettingsDto, PublicAppSettingsDto } from './contract.ts'
import {
  mapAdminAppSettings,
  mapPublicAppSettings,
} from './mapper.ts'
import type { AppSettingsPayload, ClarisSettingsInput } from './payload.ts'
import type { AppSettingsRepository } from './repository.ts'

export async function getPublicAppSettings(
  repository: AppSettingsRepository,
): Promise<PublicAppSettingsDto> {
  return mapPublicAppSettings(await repository.readPublicSettings())
}

export async function getAdminAppSettings(
  repository: AppSettingsRepository,
): Promise<AdminAppSettingsDto> {
  return mapAdminAppSettings(await repository.readAdminSettings())
}

function normalizeClarisSettings(input: ClarisSettingsInput): ClarisSettingsInput {
  const provider = input.provider.trim().toLowerCase()
  const model = input.model.trim()
  const baseUrl = input.baseUrl.trim().replace(/\/+$/, '')

  return {
    provider,
    model,
    baseUrl,
    customInstructions: input.customInstructions.trim(),
    ...(input.apiKey?.trim() ? { apiKey: input.apiKey.trim() } : {}),
  }
}

export async function updateAppSettings(
  repository: AppSettingsRepository,
  payload: Exclude<AppSettingsPayload, { action: 'get_public' | 'get_admin' }>,
): Promise<AdminAppSettingsDto> {
  if (payload.action === 'update_risk_thresholds') {
    const { atencao, risco, critico } = payload.riskThresholdDays
    if (!(atencao < risco && risco < critico)) {
      throw ApiError.unprocessable('Risk thresholds must satisfy atencao < risco < critico.')
    }
    await repository.updateRiskThresholdDays(payload.riskThresholdDays)
  } else if (payload.action === 'update_claris') {
    await repository.updateClarisSettings(normalizeClarisSettings(payload.settings))
  } else {
    await repository.updateAiGradingSettings(payload.settings as unknown as Record<string, unknown>)
  }

  return mapAdminAppSettings(await repository.readAdminSettings())
}
