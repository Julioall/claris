export async function testClarisLLM(prompt: string) {
  return supabase.functions.invoke('claris-llm-test', { body: { prompt } });
}
// API para app_settings e configurações administrativas

import { supabase } from '@/integrations/supabase/client';

export async function fetchAppSettings() {
  return supabase.from('app_settings').select('*');
}

// Adicione outras funções conforme necessário para update, insert, etc.
