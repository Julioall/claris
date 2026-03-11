import { supabase } from '@/integrations/supabase/client';
import { DEFAULT_MESSAGE_TEMPLATES } from '@/lib/message-template-defaults';

const seedingRequests = new Map<string, Promise<void>>();

export async function ensureDefaultMessageTemplates(userId: string) {
  const existingRequest = seedingRequests.get(userId);
  if (existingRequest) {
    await existingRequest;
    return;
  }

  const request = (async () => {
    // Check if user already has any templates
    const { data: existingTemplates, error: existingError } = await supabase
      .from('message_templates')
      .select('title')
      .eq('user_id', userId)
      .limit(1);

    if (existingError) throw existingError;
    if (existingTemplates && existingTemplates.length > 0) return;

    // Seed all default templates
    const defaults = DEFAULT_MESSAGE_TEMPLATES.map(template => ({
      user_id: userId,
      title: template.title,
      content: template.content,
      category: template.category,
    }));

    if (defaults.length > 0) {
      const { error: insertError } = await supabase
        .from('message_templates')
        .insert(defaults);

      if (insertError) throw insertError;
    }
  })();

  seedingRequests.set(userId, request);

  try {
    await request;
  } finally {
    seedingRequests.delete(userId);
  }
}
