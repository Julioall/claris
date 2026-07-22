import {
  expectBodyObject,
  readRequiredString,
  readRequiredUuid,
} from '../_shared/http/mod.ts'
import { RequestBodyValidationError } from '../_shared/http/body.ts'

const ACTIONS = [
  'generate_suggestion',
  'generate_activity_suggestions',
  'get_activity_suggestion_job',
  'resume_activity_suggestion_job',
  'cancel_activity_suggestion_job',
  'approve_suggestion',
] as const

const ACTION_FIELDS: Record<(typeof ACTIONS)[number], ReadonlySet<string>> = {
  generate_suggestion: new Set(['action', 'connectionId', 'courseId', 'studentId', 'moodleActivityId']),
  generate_activity_suggestions: new Set(['action', 'connectionId', 'courseId', 'moodleActivityId']),
  get_activity_suggestion_job: new Set(['action', 'jobId']),
  resume_activity_suggestion_job: new Set(['action', 'connectionId', 'jobId']),
  cancel_activity_suggestion_job: new Set(['action', 'jobId']),
  approve_suggestion: new Set(['action', 'connectionId', 'auditId', 'approvedGrade', 'approvedFeedback']),
}

export interface GenerateGradeSuggestionPayload {
  action: 'generate_suggestion'
  connectionId: string
  courseId: string
  studentId: string
  moodleActivityId: string
}

export interface ApproveGradeSuggestionPayload {
  action: 'approve_suggestion'
  auditId: string
  connectionId: string
  approvedGrade: number
  approvedFeedback: string
}

export interface GenerateActivityGradeSuggestionsPayload {
  action: 'generate_activity_suggestions'
  connectionId: string
  courseId: string
  moodleActivityId: string
}

export interface GetActivityGradeSuggestionJobPayload {
  action: 'get_activity_suggestion_job'
  jobId: string
}

export interface ResumeActivityGradeSuggestionJobPayload {
  action: 'resume_activity_suggestion_job'
  connectionId: string
  jobId: string
}

export interface CancelActivityGradeSuggestionJobPayload {
  action: 'cancel_activity_suggestion_job'
  jobId: string
}

export type MoodleGradeSuggestionPayload =
  | GenerateGradeSuggestionPayload
  | GenerateActivityGradeSuggestionsPayload
  | GetActivityGradeSuggestionJobPayload
  | ResumeActivityGradeSuggestionJobPayload
  | CancelActivityGradeSuggestionJobPayload
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
  if (Object.keys(body).some((field) => !ACTION_FIELDS[action].has(field))) {
    throw new RequestBodyValidationError('Invalid request fields', 422)
  }

  if (action === 'approve_suggestion') {
    return {
      action,
      auditId: readRequiredString(body, 'auditId', 200),
      connectionId: readRequiredUuid(body, 'connectionId'),
      approvedGrade: readRequiredFiniteNumber(body, 'approvedGrade'),
      approvedFeedback: readRequiredString(body, 'approvedFeedback', 12000),
    }
  }

  if (action === 'get_activity_suggestion_job') {
    return {
      action,
      jobId: readRequiredString(body, 'jobId', 200),
    }
  }

  if (action === 'cancel_activity_suggestion_job') {
    return {
      action,
      jobId: readRequiredString(body, 'jobId', 200),
    }
  }

  if (action === 'resume_activity_suggestion_job') {
    return {
      action,
      connectionId: readRequiredUuid(body, 'connectionId'),
      jobId: readRequiredString(body, 'jobId', 200),
    }
  }

  if (action === 'generate_activity_suggestions') {
    return {
      action,
      connectionId: readRequiredUuid(body, 'connectionId'),
      courseId: readRequiredString(body, 'courseId', 200),
      moodleActivityId: readRequiredString(body, 'moodleActivityId', 200),
    }
  }

  return {
    action,
    connectionId: readRequiredUuid(body, 'connectionId'),
    courseId: readRequiredString(body, 'courseId', 200),
    studentId: readRequiredString(body, 'studentId', 200),
    moodleActivityId: readRequiredString(body, 'moodleActivityId', 200),
  }
}
