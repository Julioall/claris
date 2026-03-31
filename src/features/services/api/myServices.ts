import { supabase } from '@/integrations/supabase/client';
import { SUPABASE_URL } from '@/integrations/supabase/url';

async function getAccessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error('Nao autenticado');
  }

  return session.access_token;
}

export async function fetchPersonalWhatsAppInstance(userId: string) {
  return supabase
    .from('app_service_instances')
    .select('*')
    .eq('owner_user_id', userId)
    .eq('service_type', 'whatsapp')
    .eq('scope', 'personal')
    .maybeSingle();
}

export async function fetchPersonalInstanceEvents(instanceId: string, limit = 20) {
  return supabase
    .from('app_service_instance_events')
    .select('id, event_type, origin, status, context, error_summary, created_at')
    .eq('instance_id', instanceId)
    .order('created_at', { ascending: false })
    .limit(limit);
}

export async function callPersonalInstanceManager(action: string, params: Record<string, unknown> = {}) {
  const accessToken = await getAccessToken();
  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/whatsapp-instance-manager`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ action, ...params }),
    },
  );

  const payload = await response.json() as Record<string, unknown>;

  if (!response.ok) {
    throw new Error((payload.error as string) ?? 'Erro desconhecido');
  }

  return payload;
}
