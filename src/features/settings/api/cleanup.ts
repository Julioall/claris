// API para limpeza de dados (DataCleanupCard)

import { supabase } from '@/integrations/supabase/client';

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

const CLEANUP_TABLES_BY_SELECTION: Record<string, string[]> = {
  user_sync_preferences: ['user_sync_preferences'],
  user_ignored_courses: ['user_ignored_courses'],
  student_course_grades: ['student_course_grades'],
  user_courses: ['user_courses'],
  student_courses: ['student_courses'],
  courses: ['user_courses', 'student_courses', 'student_course_grades', 'courses'],
  activities: ['student_activities'],
  students: [
    'student_courses',
    'pending_tasks',
    'notes',
    'risk_history',
    'student_activities',
    'student_course_grades',
    'students',
  ],
  notes: ['notes'],
  pending_tasks: ['pending_tasks'],
  activity_feed: ['activity_feed'],
  risk_history: ['risk_history'],
};

export function resolveCleanupTables(selectionId: string) {
  return CLEANUP_TABLES_BY_SELECTION[selectionId] ?? [];
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
  const tables = resolveCleanupTables(selectionId);

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
