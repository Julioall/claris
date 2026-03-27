import {
  expectBodyObject,
  readRequiredMoodleUrl,
  readRequiredString,
} from '../_shared/http/mod.ts'
import { RequestBodyValidationError } from '../_shared/http/body.ts'

const ACTIONS = ['generate_suggestion', 'approve_suggestion'] as const

export interface GenerateGradeSuggestionPayload {
  action: 'generate_suggestion'
  courseId: string
  studentId: string
  moodleActivityId: string
  moodleUrl: string
  token: string
}

export interface ApproveGradeSuggestionPayload {
  action: 'approve_suggestion'
  auditId: string
  moodleUrl: string
  token: string
  approvedGrade: number
  approvedFeedback: string
}

export type MoodleGradeSuggestionPayload =
  | GenerateGradeSuggestionPayload
  | ApproveGradeSuggestionPayload

function readRequiredAction(body: Record<string, unknown>) {
  const action = body.action
  if (typeof action !== 'string' || !ACTIONS.includes(action as (typeof ACTIONS)[number])) {
    throw new RequestBodyValidationError('Invalid action')
  }

  return action as MoodleGradeSuggestionPayload['action']
}

function readRequiredFiniteNumber(body: Record<string, unknown>, fieldName: string): number {
  const value = body[fieldName]
  const parsed = typeof value === 'number' ? value : Number(value)

  if (!Number.isFinite(parsed)) {
    throw new RequestBodyValidationError(`Invalid ${fieldName}`)
  }

  return parsed
}

export function parseMoodleGradeSuggestionPayload(rawBody: unknown): MoodleGradeSuggestionPayload {
  const body = expectBodyObject(rawBody)
  const action = readRequiredAction(body)

  if (action === 'approve_suggestion') {
    return {
      action,
      auditId: readRequiredString(body, 'auditId', 200),
      moodleUrl: readRequiredMoodleUrl(body),
      token: readRequiredString(body, 'token', 4096),
      approvedGrade: readRequiredFiniteNumber(body, 'approvedGrade'),
      approvedFeedback: readRequiredString(body, 'approvedFeedback', 12000),
    }
  }

  return {
    action,
    courseId: readRequiredString(body, 'courseId', 200),
    studentId: readRequiredString(body, 'studentId', 200),
    moodleActivityId: readRequiredString(body, 'moodleActivityId', 200),
    moodleUrl: readRequiredMoodleUrl(body),
    token: readRequiredString(body, 'token', 4096),
  }
}

