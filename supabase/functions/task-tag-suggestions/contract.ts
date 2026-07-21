export const TASK_TAG_PREFIXES = [
  'aluno',
  'uc',
  'turma',
  'curso',
  'escola',
] as const

export type TaskTagPrefix = typeof TASK_TAG_PREFIXES[number]

export interface TaskTagSuggestionDto {
  entityId: string
  entityType: TaskTagPrefix
  label: string
  prefix: TaskTagPrefix
}

export interface TaskTagSuggestionsDto {
  items: TaskTagSuggestionDto[]
}
