// API para limpeza de dados (DataCleanupCard)

import { supabase } from '@/integrations/supabase/client';

export async function cleanupData() {
  // Recomenda-se migrar para Edge Function, mas mantendo aqui para compatibilidade
  return supabase.functions.invoke('data-cleanup', { body: {} });
}
