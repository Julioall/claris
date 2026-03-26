import { supabase } from '@/integrations/supabase/client';

async function extractFunctionErrorMessage(error: unknown): Promise<string | null> {
  if (!error || typeof error !== 'object') return null;

  const context = (error as { context?: Response }).context;
  if (!context) return null;

  try {
    const payload = await context.clone().json();
    return typeof payload?.error === 'string' ? payload.error : null;
  } catch {
    return null;
  }
}

export async function fetchActiveWhatsAppInstances() {
  return supabase
    .from('app_service_instances')
    .select('id, name, scope, connection_status, is_active, is_blocked, last_activity_at, created_at, metadata')
    .eq('service_type', 'whatsapp')
    .eq('is_active', true)
    .eq('is_blocked', false);
}

export async function callWhatsAppMessaging(action: string, params: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke('whatsapp-messaging', {
    body: { action, ...params },
  });

  if (error) {
    const detailedMessage = await extractFunctionErrorMessage(error);
    throw new Error(detailedMessage || error.message);
  }

  if (data?.error) {
    throw new Error(String(data.error));
  }

  return (data ?? {}) as Record<string, unknown>;
}
