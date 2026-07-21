import { createServiceClient } from '../_shared/db/mod.ts'
import type { TaskTagPrefix } from './contract.ts'

export interface TaskTagSuggestionRecord {
  entityId: string
  label: string
}

export interface TaskTagSuggestionsRepository {
  search(input: {
    limit: number
    prefix: TaskTagPrefix
    query: string
    userId: string
  }): Promise<TaskTagSuggestionRecord[]>
}

export function createTaskTagSuggestionsRepository(): TaskTagSuggestionsRepository {
  const supabase = createServiceClient()

  return {
    async search({ limit, prefix, query, userId }) {
      const { data, error } = await supabase.rpc('search_task_tag_suggestions' as never, {
        p_limit: limit,
        p_prefix: prefix,
        p_query: query,
        p_user_id: userId,
      } as never)

      if (error) throw error

      return ((data ?? []) as Array<{ entity_id?: string | null; label?: string | null }>)
        .filter((row): row is { entity_id: string; label: string } => (
          typeof row.entity_id === 'string'
          && row.entity_id.length > 0
          && typeof row.label === 'string'
          && row.label.length > 0
        ))
        .map((row) => ({ entityId: row.entity_id, label: row.label }))
    },
  }
}
