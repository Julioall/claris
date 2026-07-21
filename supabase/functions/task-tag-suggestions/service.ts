import type { TaskTagSuggestionsDto } from './contract.ts'
import type { TaskTagSuggestionsPayload } from './payload.ts'
import type { TaskTagSuggestionsRepository } from './repository.ts'

const MAX_SUGGESTIONS = 10

export async function searchTaskTagSuggestions(
  repository: TaskTagSuggestionsRepository,
  authenticatedUserId: string,
  payload: TaskTagSuggestionsPayload,
): Promise<TaskTagSuggestionsDto> {
  const records = await repository.search({
    limit: MAX_SUGGESTIONS,
    prefix: payload.prefix,
    query: payload.query,
    userId: authenticatedUserId,
  })

  return {
    items: records.slice(0, MAX_SUGGESTIONS).map((record) => ({
      entityId: record.entityId,
      entityType: payload.prefix,
      label: record.label,
      prefix: payload.prefix,
    })),
  }
}
