import {
  createServiceClient,
  type AppSupabaseClient,
  type Json,
} from '../_shared/db/mod.ts'

export interface ActivityFeedRecord {
  createdAt: string | null
  description: string | null
  eventType: string
  id: string
  metadata: Json
  title: string
}

export interface ActivityFeedRepository {
  listForActor(actorId: string, limit: number): Promise<ActivityFeedRecord[]>
}

export function createActivityFeedRepository(
  supabase: AppSupabaseClient = createServiceClient(),
): ActivityFeedRepository {
  return {
    async listForActor(actorId, limit) {
      const { data, error } = await supabase
        .from('activity_feed')
        .select('id, title, description, event_type, created_at, metadata')
        .eq('user_id', actorId)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error

      return (data ?? []).map((row) => ({
        createdAt: row.created_at,
        description: row.description,
        eventType: row.event_type,
        id: row.id,
        metadata: row.metadata as Json,
        title: row.title,
      }))
    },
  }
}
