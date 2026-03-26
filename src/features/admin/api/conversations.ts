import { supabase } from '@/integrations/supabase/client';

export async function listAdminConversations(limit = 200) {
  return supabase
    .from('claris_conversations')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(limit);
}
