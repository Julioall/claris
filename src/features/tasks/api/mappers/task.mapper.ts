import type { Tag, Task, TaskComment } from '../../types';
import type { TaskCommentDto, TaskDto, TaskTagDto } from '../contracts/tasks.contract';

export function mapTaskTag(tag: TaskTagDto): Tag {
  return {
    color: tag.color,
    created_at: tag.createdAt,
    entity_id: tag.entityId,
    entity_type: tag.entityType,
    id: tag.id,
    label: tag.label,
    prefix: tag.prefix,
  };
}
export function mapTask(task: TaskDto): Task {
  return {
    ai_tags: [...task.aiTags],
    assigned_to: task.assignedTo,
    created_at: task.createdAt,
    created_by: task.createdBy,
    description: task.description,
    due_date: task.dueDate,
    entity_id: task.entityId,
    entity_type: task.entityType,
    id: task.id,
    origin_reason: task.originReason,
    priority: task.priority,
    project_id: task.projectId,
    status: task.status,
    suggested_by_ai: task.suggestedByAi,
    tags: task.tags.map(mapTaskTag),
    title: task.title,
    updated_at: task.updatedAt,
  };
}

export function mapTaskComment(comment: TaskCommentDto): TaskComment {
  return {
    author_id: comment.authorId,
    comment: comment.comment,
    created_at: comment.createdAt,
    id: comment.id,
    task_id: comment.taskId,
  };
}
