import { invokeEdgeFunction } from '@/integrations/http/edge-function-client';

export const TASK_TAG_PREFIXES = [
  'aluno',
  'uc',
  'turma',
  'curso',
  'escola',
] as const;

export type TaskTagPrefix = typeof TASK_TAG_PREFIXES[number];

export interface TaskTagSuggestion {
  entityId: string;
  entityType: TaskTagPrefix;
  label: string;
  prefix: TaskTagPrefix;
}

interface TaskTagSuggestionsDto {
  items: TaskTagSuggestion[];
}

export async function searchTaskTagSuggestions(
  prefix: TaskTagPrefix,
  query: string,
  signal?: AbortSignal,
): Promise<TaskTagSuggestion[]> {
  const response = await invokeEdgeFunction<TaskTagSuggestionsDto>('task-tag-suggestions', {
    auth: 'required',
    body: {
      action: 'search_suggestions',
      prefix,
      query,
    },
    signal,
    timeoutMs: 8_000,
  });

  return response.items;
}
