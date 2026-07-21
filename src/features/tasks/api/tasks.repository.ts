import {
  tasksService,
  type AddTaskTagInput,
  type CreateTaskInput,
  type UpdateTaskInput,
} from './tasks.service';

export type { AddTaskTagInput, CreateTaskInput, UpdateTaskInput };

export const tasksRepository = {
  listTasks: (signal?: AbortSignal) => tasksService.listTasks(signal),
  getTaskDetail: (taskId: string, signal?: AbortSignal) => tasksService.getTaskDetail(taskId, signal),
  createTask: (input: CreateTaskInput) => tasksService.createTask(input),
  updateTask: (id: string, input: UpdateTaskInput) => tasksService.updateTask(id, input),
  deleteTask: (id: string) => tasksService.deleteTask(id),
  addComment: (taskId: string, comment: string) => tasksService.addComment(taskId, comment),
  deleteComment: (taskId: string, commentId: string) => tasksService.deleteComment(taskId, commentId),
  addTag: (taskId: string, tag: AddTaskTagInput) => tasksService.addTag(taskId, tag),
  removeTag: (taskId: string, tagId: string) => tasksService.removeTag(taskId, tagId),
};
