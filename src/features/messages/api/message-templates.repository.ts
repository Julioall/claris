import { supabase } from '@/integrations/supabase/client';
import type { TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { ensureDefaultMessageTemplates } from '@/lib/message-template-seeding';

import type { MessageTemplate, MessageTemplateOption } from '../types';

interface SaveMessageTemplateInput {
  title: string;
  content: string;
  category: string;
}

export async function listMessageTemplateOptionsForUser(userId: string): Promise<MessageTemplateOption[]> {
  await ensureDefaultMessageTemplates(userId);

  const { data, error } = await supabase
    .from('message_templates')
    .select('id, title, content, category, is_favorite')
    .eq('user_id', userId)
    .order('is_favorite', { ascending: false })
    .order('title');

  if (error) throw error;

  return (data || []) as MessageTemplateOption[];
}

export async function listMessageTemplatesForUser(userId: string): Promise<MessageTemplate[]> {
  await ensureDefaultMessageTemplates(userId);

  const { data, error } = await supabase
    .from('message_templates')
    .select('*')
    .eq('user_id', userId)
    .order('is_favorite', { ascending: false })
    .order('updated_at', { ascending: false });

  if (error) throw error;

  return (data || []) as MessageTemplate[];
}

export async function createMessageTemplate(userId: string, input: SaveMessageTemplateInput) {
  const payload: TablesInsert<'message_templates'> = {
    user_id: userId,
    title: input.title.trim(),
    content: input.content.trim(),
    category: input.category,
  };

  const { error } = await supabase.from('message_templates').insert(payload);

  if (error) throw error;
}

export async function updateMessageTemplate(
  userId: string,
  templateId: string,
  input: SaveMessageTemplateInput,
) {
  const payload: TablesUpdate<'message_templates'> = {
    title: input.title.trim(),
    content: input.content.trim(),
    category: input.category,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('message_templates')
    .update(payload)
    .eq('id', templateId)
    .eq('user_id', userId);

  if (error) throw error;
}

export async function deleteMessageTemplate(userId: string, templateId: string) {
  const { error } = await supabase
    .from('message_templates')
    .delete()
    .eq('id', templateId)
    .eq('user_id', userId);

  if (error) throw error;
}

export async function setMessageTemplateFavorite(
  userId: string,
  templateId: string,
  isFavorite: boolean,
) {
  const { error } = await supabase
    .from('message_templates')
    .update({ is_favorite: isFavorite })
    .eq('id', templateId)
    .eq('user_id', userId);

  if (error) throw error;
}
