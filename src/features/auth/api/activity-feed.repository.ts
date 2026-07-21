import { invokeEdgeFunction } from '@/integrations/http/edge-function-client';

export interface ActivityFeedItem {
  id: string;
  title: string;
  description: string | null;
  event_type: string;
  created_at: string | null;
  metadata: unknown;
}

interface ActivityFeedDto {
  contractVersion: 1;
  items: Array<{
    createdAt: string | null;
    description: string | null;
    eventType: string;
    id: string;
    metadata: unknown;
    title: string;
  }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export async function fetchActivityFeed(limit = 20): Promise<ActivityFeedItem[]> {
  const response = await invokeEdgeFunction<ActivityFeedDto>('activity-feed', {
    body: { action: 'list', limit },
  });
  if (
    !isRecord(response)
    || response.contractVersion !== 1
    || !Array.isArray(response.items)
    || !response.items.every((item) => (
      isRecord(item)
      && typeof item.id === 'string'
      && typeof item.title === 'string'
      && typeof item.eventType === 'string'
      && (item.description === null || typeof item.description === 'string')
      && (item.createdAt === null || typeof item.createdAt === 'string')
    ))
  ) {
    throw new Error('A API de notificacoes retornou uma resposta invalida.');
  }
  return response.items.map((item) => ({
    id: item.id,
    title: item.title,
    description: item.description,
    event_type: item.eventType,
    created_at: item.createdAt,
    metadata: item.metadata,
  }));
}
