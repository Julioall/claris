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

export async function listSharedServiceInstances() {
  return supabase
    .from('app_service_instances')
    .select('id, name, description, service_type, scope, connection_status, operational_status, health_status, is_active, is_blocked, evolution_instance_name, last_activity_at, last_sync_at, created_at')
    .eq('scope', 'shared')
    .order('created_at', { ascending: false });
}

export async function callAdminInstanceManager(action: string, params: Record<string, unknown> = {}) {
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
