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

async function buildFunctionHeaders() {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  };

  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  return headers;
}

function parseFunctionResponse(responseText: string) {
  if (!responseText.trim()) return {};

  try {
    return JSON.parse(responseText) as Record<string, unknown>;
  } catch {
    throw new Error('Resposta invalida da edge function');
  }
}

export async function callWhatsAppMessagingWithProgress(
  action: string,
  params: Record<string, unknown> = {},
  onProgress?: (progress: number) => void,
) {
  const headers = await buildFunctionHeaders();
  const endpoint = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-messaging`;
  const payload = JSON.stringify({ action, ...params });

  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', endpoint, true);

    Object.entries(headers).forEach(([key, value]) => {
      request.setRequestHeader(key, value);
    });

    request.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const progress = 35 + Math.round((event.loaded / event.total) * 55);
      onProgress?.(Math.min(progress, 95));
    };

    request.onerror = () => {
      reject(new Error('Falha de rede ao enviar arquivo'));
    };

    request.onload = () => {
      const responseBody = parseFunctionResponse(request.responseText);

      if (request.status < 200 || request.status >= 300) {
        const message = typeof responseBody.error === 'string'
          ? responseBody.error
          : `Erro ao chamar whatsapp-messaging (${request.status})`;
        reject(new Error(message));
        return;
      }

      if (typeof responseBody.error === 'string') {
        reject(new Error(responseBody.error));
        return;
      }

      onProgress?.(100);
      resolve(responseBody);
    };

    request.send(payload);
  });
}
