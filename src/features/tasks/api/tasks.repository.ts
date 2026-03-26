import { tasksService, type CreateTaskInput, type UpdateTaskInput } from './tasks.service';

export type { CreateTaskInput, UpdateTaskInput };

export const tasksRepository = {
  listTasks: () => tasksService.listTasks(),
  createTask: (input: CreateTaskInput) => tasksService.createTask(input),
  updateTask: (id: string, input: UpdateTaskInput) => tasksService.updateTask(id, input),
  deleteTask: (id: string) => tasksService.deleteTask(id),
  listComments: (taskId: string) => tasksService.listComments(taskId),
  addComment: (taskId: string, comment: string, authorId: string) =>
    tasksService.addComment(taskId, comment, authorId),
  getTaskTags: (taskId: string) => tasksService.getTaskTags(taskId),
  addTagToTask: (taskId: string, tagId: string) => tasksService.addTagToTask(taskId, tagId),
  removeTagFromTask: (taskId: string, tagId: string) => tasksService.removeTagFromTask(taskId, tagId),
  findOrCreateTag: (
    label: string,
    prefix?: string,
    entityId?: string,
    entityType?: string,
    createdBy?: string,
  ) => tasksService.findOrCreateTag(label, prefix, entityId, entityType, createdBy),
};
