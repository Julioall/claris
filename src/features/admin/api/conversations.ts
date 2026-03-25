// API para conversas administrativas

import { supabase } from '@/integrations/supabase/client';

export async function fetchAdminConversations() {
  return supabase.from('claris_conversations').select('*');
}
