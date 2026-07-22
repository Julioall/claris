import {
  RequestBodyValidationError,
  expectBodyObject,
  readRequiredLiteral,
  readRequiredUuid,
} from '../_shared/http/mod.ts'

export type AdminDiagnosticsPayload =
  | { action: 'list_grade_courses'; connectionId: string }
  | { action: 'list_grade_students'; connectionId: string; courseId: string }
  | { action: 'run_grade_diagnostic'; connectionId: string; courseId: string; studentId: string }

const ACTIONS = [
  'list_grade_courses',
  'list_grade_students',
  'run_grade_diagnostic',
] as const

const ACTION_FIELDS: Record<AdminDiagnosticsPayload['action'], ReadonlySet<string>> = {
  list_grade_courses: new Set(['action', 'connectionId']),
  list_grade_students: new Set(['action', 'connectionId', 'courseId']),
  run_grade_diagnostic: new Set(['action', 'connectionId', 'courseId', 'studentId']),
}

export function parseAdminDiagnosticsPayload(rawBody: unknown): AdminDiagnosticsPayload {
  const body = expectBodyObject(rawBody)
  const action = readRequiredLiteral(body, 'action', ACTIONS)
  if (Object.keys(body).some((field) => !ACTION_FIELDS[action].has(field))) {
    throw new RequestBodyValidationError('Invalid request fields', 422)
  }

  const connectionId = readRequiredUuid(body, 'connectionId')
  if (action === 'list_grade_courses') return { action, connectionId }
  if (action === 'list_grade_students') {
    return { action, connectionId, courseId: readRequiredUuid(body, 'courseId') }
  }
  return {
    action,
    connectionId,
    courseId: readRequiredUuid(body, 'courseId'),
    studentId: readRequiredUuid(body, 'studentId'),
  }
}
