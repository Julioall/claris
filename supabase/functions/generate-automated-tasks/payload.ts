import { expectBodyObject, readOptionalStringArray } from '../_shared/http/mod.ts'

export interface GenerateAutomatedTasksPayload {
  automationTypes?: string[]
}

export function parseGenerateAutomatedTasksPayload(rawBody: unknown): GenerateAutomatedTasksPayload {
  const body = expectBodyObject(rawBody)

  return {
    automationTypes: readOptionalStringArray(body, 'automation_types'),
  }
}