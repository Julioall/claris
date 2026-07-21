import { invokeEdgeFunction } from '@/integrations/http/edge-function-client';

import { parsePublicAppSettingsDto } from './mappers/app-settings.mapper';

export async function fetchGlobalSettings() {
  const response = await invokeEdgeFunction<unknown>('app-settings', {
    body: { action: 'get_public' },
  });
  return parsePublicAppSettingsDto(response);
}
