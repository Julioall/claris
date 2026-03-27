// API para limpeza de dados (DataCleanupCard)

import { supabase } from '@/integrations/supabase/client';
import { resolveCleanupTables as resolveCleanupTablesBySelection } from '@/features/settings/lib/cleanup-options';

export interface CleanupDataInput {
  mode?: 'full_cleanup' | 'selected_cleanup';
  tables?: string[];
}

export interface CleanupDataError {
  table: string;
  error?: string;
  success?: boolean;
}

export interface CleanupDataResponse {
  success: boolean;
  cleaned: string[];
  errors: CleanupDataError[];
}

export function resolveCleanupTables(selectionIdOrIds: string | string[]) {
  return resolveCleanupTablesBySelection(selectionIdOrIds);
}

export async function cleanupData(input: CleanupDataInput = {}) {
  return supabase.functions.invoke<CleanupDataResponse>('data-cleanup', {
    body: {
      mode: input.mode ?? 'full_cleanup',
      tables: input.tables ?? [],
    },
  });
}

export async function cleanupSelection(selectionId: string): Promise<{ success: boolean; error?: string }> {
  return cleanupSelections([selectionId]);
}

export async function cleanupSelections(selectionIds: string[]): Promise<{ success: boolean; error?: string }> {
  const tables = resolveCleanupTables(selectionIds);

  if (tables.length === 0) {
    return { success: false, error: 'Tabela desconhecida' };
  }

  try {
    const { data, error } = await cleanupData({
      mode: 'selected_cleanup',
      tables,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    const firstError = data?.errors.find((item) => item.error);
    if (firstError) {
      return { success: false, error: firstError.error ?? 'Erro desconhecido' };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erro desconhecido',
    };
  }
}
