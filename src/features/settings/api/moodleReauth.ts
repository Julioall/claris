import { invokeEdgeFunction } from '@/integrations/http/edge-function-client';

import type {
  MoodleReauthSettingsDto,
  UpdateMoodleReauthSettingsDto,
} from './contracts/moodle-reauth.contract';
import {
  mapMoodleReauthSettingsDto,
  mapUpdateMoodleReauthSettingsDto,
} from './mappers/moodle-reauth.mapper';
import type { MoodleReauthSettings, UpdateMoodleReauthSettingsResult } from '../types';

export async function fetchMoodleReauthSettings(_userId: string): Promise<MoodleReauthSettings> {
  const dto = await invokeEdgeFunction<MoodleReauthSettingsDto>('moodle-reauth-settings', {
    body: { action: 'get_settings' },
  });
  return mapMoodleReauthSettingsDto(dto);
}

export async function updateMoodleReauthSettings(enabled: boolean): Promise<UpdateMoodleReauthSettingsResult> {
  const dto = await invokeEdgeFunction<UpdateMoodleReauthSettingsDto>('moodle-reauth-settings', {
    body: {
      action: 'update_settings',
      enabled,
    },
  });
  return mapUpdateMoodleReauthSettingsDto(dto);
}
