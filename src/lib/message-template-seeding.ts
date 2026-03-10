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
    const { data: userRecord, error: userError } = await supabase
      .from('users')
      .select('message_templates_seeded_at')
      .eq('id', userId)
      .maybeSingle();

    if (userError) throw userError;
    if (userRecord?.message_templates_seeded_at) return;

    const { data: existingTemplates, error: existingError } = await supabase
      .from('message_templates')
      .select('default_key')
      .eq('user_id', userId)
      .not('default_key', 'is', null);

    if (existingError) throw existingError;

    const existingDefaultKeys = new Set(
      (existingTemplates || [])
        .map(template => template.default_key)
        .filter((key): key is string => Boolean(key)),
    );

    const missingDefaults = DEFAULT_MESSAGE_TEMPLATES
      .filter(template => !existingDefaultKeys.has(template.defaultKey))
      .map(template => ({
        user_id: userId,
        title: template.title,
        content: template.content,
        category: template.category,
        is_default: true,
        default_key: template.defaultKey,
      }));

    if (missingDefaults.length > 0) {
      const { error: insertError } = await supabase
        .from('message_templates')
        .insert(missingDefaults);

      if (insertError) throw insertError;
    }

    const { error: updateError } = await supabase
      .from('users')
      .update({ message_templates_seeded_at: new Date().toISOString() })
      .eq('id', userId);

    if (updateError) throw updateError;
  })();

  seedingRequests.set(userId, request);

  try {
    await request;
  } finally {
    seedingRequests.delete(userId);
  }
}
