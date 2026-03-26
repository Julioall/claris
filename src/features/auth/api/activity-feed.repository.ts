import { supabase } from '@/integrations/supabase/client';

export async function fetchActivityFeed(userId: string, limit = 20) {
  return supabase
    .from('activity_feed')
    .select('id, title, description, event_type, created_at, metadata')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
}
