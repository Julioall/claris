import { supabase } from '@/integrations/supabase/client';
import { FunctionsHttpError } from '@supabase/supabase-js';
import type { AiGradingSettings } from '@/lib/ai-grading-settings';
import {
  fetchGlobalAppSettings,
  GLOBAL_APP_SETTINGS_ID,
  type GlobalRiskThresholdDays,
} from '@/lib/global-app-settings';
import type { ClarisLlmSettings } from '@/lib/claris-settings';

type ClarisConnectionInput = Pick<ClarisLlmSettings, 'provider' | 'model' | 'baseUrl'> & {
  apiKey?: string;
};

const parseFunctionErrorMessage = async (error: unknown): Promise<string | null> => {
  if (!(error instanceof FunctionsHttpError)) {
    return null;
  }

  try {
    const payload = await error.context.json() as { error?: unknown; message?: unknown };
    if (typeof payload.error === 'string' && payload.error.trim().length > 0) {
      return payload.error.trim();
    }
    if (typeof payload.message === 'string' && payload.message.trim().length > 0) {
      return payload.message.trim();
    }
  } catch {
    return null;
  }

  return null;
};

export async function fetchAdminSettings() {
  return fetchGlobalAppSettings(supabase);
}

export async function saveRiskThresholdSettings(riskThresholdDays: GlobalRiskThresholdDays) {
  return supabase.from('app_settings').upsert(
    {
      singleton_id: GLOBAL_APP_SETTINGS_ID,
      risk_threshold_days: riskThresholdDays,
    },
    { onConflict: 'singleton_id' },
  );
}

export async function saveMoodleConnectionSettings(url: string, service: string) {
  return supabase.from('app_settings').upsert(
    {
      singleton_id: GLOBAL_APP_SETTINGS_ID,
      moodle_connection_url: url,
      moodle_connection_service: service,
    },
    { onConflict: 'singleton_id' },
  );
}

export async function saveClarisConnectionSettings(settings: Record<string, unknown>) {
  return supabase.from('app_settings').upsert(
    {
      singleton_id: GLOBAL_APP_SETTINGS_ID,
      claris_llm_settings: settings,
    },
    { onConflict: 'singleton_id' },
  );
}

export async function saveAiGradingSettings(settings: AiGradingSettings) {
  return supabase.from('app_settings').upsert(
    {
      singleton_id: GLOBAL_APP_SETTINGS_ID,
      ai_grading_settings: settings,
    },
    { onConflict: 'singleton_id' },
  );
}

export interface MoodleCategoryApi {
  id: number;
  name: string;
  parent: number;
}

export interface CatalogSyncResult {
  courses: number;
  participantUsers: number;
  userCourseLinks: number;
  groupAssignments: number;
}

export interface CatalogSyncJob {
  jobId: string;
  status: 'processing' | 'completed' | 'failed';
  result?: CatalogSyncResult;
  errorMessage?: string | null;
}

export async function listMoodleCategories(
  moodleUrl: string,
  token: string,
): Promise<{ categories: MoodleCategoryApi[] }> {
  const { data, error } = await supabase.functions.invoke('moodle-sync-courses', {
    body: { action: 'list_moodle_categories', moodleUrl, token },
  });

  if (error) {
    const message = await parseFunctionErrorMessage(error);
    throw new Error(message ?? (error as { message?: string }).message ?? 'Erro ao carregar categorias');
  }

  return data as { categories: MoodleCategoryApi[] };
}

export async function fetchSyncCategoryIds(): Promise<number[]> {
  const { data } = await supabase
    .from('app_settings')
    .select('sync_category_ids')
    .eq('singleton_id', GLOBAL_APP_SETTINGS_ID)
    .maybeSingle();

  const raw = (data as { sync_category_ids?: unknown } | null)?.sync_category_ids;
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is number => typeof v === 'number');
}

export async function saveSyncCategoryIds(ids: number[]): Promise<void> {
  const { error } = await supabase
    .from('app_settings')
    .upsert({ singleton_id: GLOBAL_APP_SETTINGS_ID, sync_category_ids: ids }, { onConflict: 'singleton_id' });
  if (error) throw error;
}

export async function syncProjectCatalog(
  moodleUrl: string,
  token: string,
  categoryIds?: number[],
): Promise<{ jobId: string; status: string }> {
  const { data, error } = await supabase.functions.invoke('moodle-sync-courses', {
    body: {
      action: 'sync_project_catalog',
      moodleUrl,
      token,
      categoryIds,
    },
  });

  if (error) {
    const message = await parseFunctionErrorMessage(error);
    throw new Error(message ?? (error as { message?: string }).message ?? 'Erro ao iniciar sincronizacao do catalogo');
  }

  return data as { jobId: string; status: string };
}

export async function fetchCatalogSyncJob(jobId: string): Promise<CatalogSyncJob> {
  const { data, error } = await supabase
    .from('background_jobs' as never)
    .select('id, status, error_message, metadata')
    .eq('id', jobId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Job nao encontrado');

  const row = data as {
    id: string;
    status: string;
    error_message: string | null;
    metadata: Record<string, unknown> | null;
  };

  const status = (row.status === 'completed' || row.status === 'failed' ? row.status : 'processing') as CatalogSyncJob['status'];
  const result: CatalogSyncResult | undefined =
    status === 'completed' && row.metadata
      ? {
          courses: Number(row.metadata.courses ?? 0),
          participantUsers: Number(row.metadata.participantUsers ?? 0),
          userCourseLinks: Number(row.metadata.userCourseLinks ?? 0),
          groupAssignments: Number(row.metadata.groupAssignments ?? 0),
        }
      : undefined;

  return {
    jobId: row.id,
    status,
    result,
    errorMessage: row.error_message,
  };
}

export async function testClarisLLM(input: ClarisConnectionInput) {
  const result = await supabase.functions.invoke('claris-llm-test', {
    body: {
      provider: input.provider,
      model: input.model,
      baseUrl: input.baseUrl,
      apiKey: input.apiKey,
    },
  });

  if (result.error) {
    const message = await parseFunctionErrorMessage(result.error);
    if (message) {
      return {
        ...result,
        error: new Error(message),
      };
    }
  }

  return result;
}
