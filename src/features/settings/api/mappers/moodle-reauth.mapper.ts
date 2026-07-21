import type {
  MoodleReauthSettingsDto,
  UpdateMoodleReauthSettingsDto,
} from '../contracts/moodle-reauth.contract';
import type {
  MoodleReauthSettings,
  UpdateMoodleReauthSettingsResult,
} from '../../types';

export function mapMoodleReauthSettingsDto(dto: MoodleReauthSettingsDto): MoodleReauthSettings {
  return {
    credentialActive: dto.credentialActive,
    lastError: dto.lastError,
    lastReauthAt: dto.lastReauthAt,
    preferenceEnabled: dto.preferenceEnabled,
  };
}

export function mapUpdateMoodleReauthSettingsDto(
  dto: UpdateMoodleReauthSettingsDto,
): UpdateMoodleReauthSettingsResult {
  return {
    credentialActive: dto.credentialActive,
    message: dto.message || undefined,
    preferenceEnabled: dto.preferenceEnabled,
    requiresLogin: dto.requiresLogin,
  };
}
