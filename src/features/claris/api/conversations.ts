import { supabase } from '@/integrations/supabase/client';
import type { Database, Json } from '@/integrations/supabase/types';

export type ClarisConversationRow = Database['public']['Tables']['claris_conversations']['Row'];
export type ClarisConversationUpdate = Database['public']['Tables']['claris_conversations']['Update'];

export async function fetchClarisConversations(userId: string): Promise<ClarisConversationRow[]> {
  const { data, error } = await supabase
    .from('claris_conversations')
    .select('id, title, messages, updated_at, last_context_route')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(30);

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function createClarisConversation(
  userId: string,
  title: string,
  messages: Json,
  lastContextRoute: string,
): Promise<ClarisConversationRow> {
  const { data, error } = await supabase
    .from('claris_conversations')
    .insert({
      user_id: userId,
      title,
      messages,
      last_context_route: lastContextRoute,
    })
    .select('id, title, messages, updated_at, last_context_route')
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateClarisConversation(id: string, userId: string, fields: ClarisConversationUpdate) {
  const { error } = await supabase
    .from('claris_conversations')
    .update(fields)
    .eq('id', id)
    .eq('user_id', userId);

  if (error) {
    throw error;
  }
}

export async function deleteClarisConversation(id: string, userId: string) {
  const { error } = await supabase
    .from('claris_conversations')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) {
    throw error;
  }
}
