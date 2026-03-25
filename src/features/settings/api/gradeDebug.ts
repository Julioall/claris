// API para debug de notas (GradeDebugCard)

import { supabase } from '@/integrations/supabase/client';

export async function syncGradesDebug() {
  return supabase.functions.invoke('moodle-sync-grades', { body: {} });
}
