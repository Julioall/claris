import {
  RequestBodyValidationError,
  expectBodyObject,
  readRequiredLiteral,
  readRequiredUuid,
} from '../_shared/http/mod.ts'

export type AdminDiagnosticsPayload =
  | { action: 'list_grade_courses' }
  | { action: 'list_grade_students'; courseId: string }
  | { action: 'run_grade_diagnostic'; courseId: string; studentId: string }

const ACTIONS = [
  'list_grade_courses',
  'list_grade_students',
  'run_grade_diagnostic',
] as const

const ACTION_FIELDS: Record<AdminDiagnosticsPayload['action'], ReadonlySet<string>> = {
  list_grade_courses: new Set(['action']),
  list_grade_students: new Set(['action', 'courseId']),
  run_grade_diagnostic: new Set(['action', 'courseId', 'studentId']),
}

export function parseAdminDiagnosticsPayload(rawBody: unknown): AdminDiagnosticsPayload {
  const body = expectBodyObject(rawBody)
  const action = readRequiredLiteral(body, 'action', ACTIONS)
  if (Object.keys(body).some((field) => !ACTION_FIELDS[action].has(field))) {
    throw new RequestBodyValidationError('Invalid request fields', 422)
  }

  if (action === 'list_grade_courses') return { action }
  if (action === 'list_grade_students') {
    return { action, courseId: readRequiredUuid(body, 'courseId') }
  }
  return {
    action,
    courseId: readRequiredUuid(body, 'courseId'),
    studentId: readRequiredUuid(body, 'studentId'),
  }
}
