import { ApiError } from '../_shared/http/mod.ts'
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  type TaskPriorityDto,
  type TaskStatusDto,
} from './contract.ts'

const ALLOWED_STATUS_TRANSITIONS: Record<TaskStatusDto, readonly TaskStatusDto[]> = {
  todo: ['in_progress', 'done'],
  in_progress: ['todo', 'done'],
  done: ['todo', 'in_progress'],
}

export function normalizeTaskStatus(value: string): TaskStatusDto {
  return TASK_STATUSES.includes(value as TaskStatusDto) ? value as TaskStatusDto : 'todo'
}

export function normalizeTaskPriority(value: string): TaskPriorityDto {
  return TASK_PRIORITIES.includes(value as TaskPriorityDto) ? value as TaskPriorityDto : 'medium'
}

export function assertValidTaskStatusTransition(current: string, next: string): void {
  const currentStatus = normalizeTaskStatus(current)
  if (currentStatus === next) return
  if (!TASK_STATUSES.includes(next as TaskStatusDto)
    || !ALLOWED_STATUS_TRANSITIONS[currentStatus].includes(next as TaskStatusDto)) {
    throw ApiError.unprocessable('Invalid task status transition', {
      from: currentStatus,
      to: next,
    })
  }
}
