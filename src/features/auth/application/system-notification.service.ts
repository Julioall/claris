import { supabase } from '@/integrations/supabase/client';

export interface SystemNotificationPayload {
  title: string;
  description?: string;
  eventType?: string;
  severity?: 'info' | 'warning' | 'critical';
  metadata?: Record<string, unknown>;
}

export async function createSystemNotification(
  userId: string,
  payload: SystemNotificationPayload,
): Promise<void> {
  if (!userId) return;

  try {
    const { title, description, eventType = 'sync_finish', severity = 'info', metadata = {} } = payload;

    await supabase.from('activity_feed').insert({
      user_id: userId,
      event_type: eventType,
      title,
      description: description || null,
      metadata: {
        severity,
        ...metadata,
      },
    });
  } catch (error) {
    console.warn('Falha ao registrar notificacao do sistema:', error);
  }
}
