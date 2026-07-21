import { beforeEach, describe, expect, it, vi } from 'vitest';

import { parseTasksPayload } from '../../../../supabase/functions/tasks/payload.ts';
import type {
  TaskRecord,
  TasksRepository,
} from '../../../../supabase/functions/tasks/repository.ts';
import {
  authorizeTasksAction,
  executeTasks,
} from '../../../../supabase/functions/tasks/service.ts';
import { assertValidTaskStatusTransition } from '../../../../supabase/functions/tasks/rules.ts';

const TASK_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const COMMENT_ID = '33333333-3333-4333-8333-333333333333';
const TAG_ID = '44444444-4444-4444-8444-444444444444';

const task: TaskRecord = {
  aiTags: [],
  assignedTo: null,
  createdAt: '2026-07-21T10:00:00.000Z',
  createdBy: USER_ID,
  description: null,
  dueDate: null,
  entityId: null,
  entityType: null,
  id: TASK_ID,
  originReason: null,
  priority: 'medium',
  projectId: null,
  status: 'todo',
  suggestedByAi: false,
  tags: [],
  title: 'Tarefa',
  updatedAt: '2026-07-21T10:00:00.000Z',
};

function createRepository(): TasksRepository {
  return {
    addComment: vi.fn(async (actorId, taskId, comment) => ({
      authorId: actorId,
      comment,
      createdAt: '2026-07-21T11:00:00.000Z',
      id: COMMENT_ID,
      taskId,
    })),
    addTag: vi.fn(async (_actorId, _taskId, input) => ({
      color: null,
      createdAt: '2026-07-21T11:00:00.000Z',
      entityId: input.entityId ?? null,
      entityType: input.entityType ?? 'custom',
      id: TAG_ID,
      label: input.label,
      prefix: input.prefix ?? null,
    })),
    createTask: vi.fn(async (actorId, input) => ({ ...task, createdBy: actorId, title: input.title })),
    deleteComment: vi.fn(async () => true),
    deleteTask: vi.fn(async () => true),
    findAccessibleTask: vi.fn(async () => task),
    findOwnedTask: vi.fn(async () => task),
    listComments: vi.fn(async () => []),
    listTags: vi.fn(async () => []),
    listTasksPage: vi.fn(async () => ({ items: [task], totalCount: 1 })),
    recordHistory: vi.fn(async () => undefined),
    removeTag: vi.fn(async () => true),
    updateTask: vi.fn(async (_actorId, _taskId, input) => ({
      ...task,
      ...('status' in input ? { status: input.status ?? task.status } : {}),
    })),
    userHasPermission: vi.fn(async () => true),
  };
}

describe('tasks V1 contract', () => {
  let repository: TasksRepository;

  beforeEach(() => {
    repository = createRepository();
  });

  it('defines list filters, ordering and pagination in the contract', () => {
    expect(parseTasksPayload({
      action: 'list_tasks',
      filters: { dueFrom: '2026-07-01', priority: 'high', status: 'todo', tagSearch: ' aluno ' },
      order: 'createdAtDesc',
      page: 2,
      pageSize: 25,
    })).toEqual({
      action: 'list_tasks',
      filters: { dueFrom: '2026-07-01', priority: 'high', status: 'todo', tagSearch: 'aluno' },
      order: 'createdAtDesc',
      page: 2,
      pageSize: 25,
    });
  });

  it.each([
    {},
    { action: 'list_tasks', filters: {}, userId: USER_ID },
    { action: 'create_task', input: { title: 'Tarefa', createdBy: USER_ID } },
    { action: 'create_task', input: { title: 'Tarefa', created_by: USER_ID } },
    { action: 'add_comment', taskId: TASK_ID, comment: 'Oi', authorId: USER_ID },
    { action: 'update_task', taskId: TASK_ID, input: { status: 'cancelled' } },
    { action: 'get_task_detail', taskId: 'invalid' },
  ])('rejects malformed or browser-controlled identity: %o', (payload) => {
    expect(() => parseTasksPayload(payload)).toThrowError(expect.objectContaining({ status: 422 }));
  });

  it('requires tasks.view for every use case', async () => {
    const payload = parseTasksPayload({ action: 'get_task_detail', taskId: TASK_ID });
    await expect(authorizeTasksAction(repository, USER_ID, payload)).resolves.toBe(true);
    expect(repository.userHasPermission).toHaveBeenCalledWith(USER_ID, 'tasks.view');
  });

  it('derives creator and comment author from the authenticated actor', async () => {
    await executeTasks(repository, USER_ID, {
      action: 'create_task',
      input: { title: 'Criada no backend' },
    });
    expect(repository.createTask).toHaveBeenCalledWith(USER_ID, { title: 'Criada no backend' });

    const result = await executeTasks(repository, USER_ID, {
      action: 'add_comment',
      comment: 'Comentario',
      taskId: TASK_ID,
    });
    expect(repository.addComment).toHaveBeenCalledWith(USER_ID, TASK_ID, 'Comentario');
    expect(result).toMatchObject({ comment: { authorId: USER_ID, taskId: TASK_ID } });
    expect(JSON.stringify(result)).not.toMatch(/author_id|task_id|created_by/);
  });

  it('validates task access before comments and tag links', async () => {
    vi.mocked(repository.findAccessibleTask).mockResolvedValue(null);

    await expect(executeTasks(repository, USER_ID, {
      action: 'add_tag',
      tag: { label: 'Aluno' },
      taskId: TASK_ID,
    })).rejects.toMatchObject({ code: 'not_found', status: 404 });
    expect(repository.addTag).not.toHaveBeenCalled();

    await expect(executeTasks(repository, USER_ID, {
      action: 'add_comment',
      comment: 'Comentario',
      taskId: TASK_ID,
    })).rejects.toMatchObject({ code: 'not_found', status: 404 });
    expect(repository.addComment).not.toHaveBeenCalled();

    await expect(executeTasks(repository, USER_ID, {
      action: 'delete_comment',
      commentId: COMMENT_ID,
      taskId: TASK_ID,
    })).rejects.toMatchObject({ code: 'not_found', status: 404 });
    expect(repository.deleteComment).not.toHaveBeenCalled();
  });

  it('returns idempotent results for repeated link/comment removals', async () => {
    vi.mocked(repository.deleteComment).mockResolvedValue(false);
    vi.mocked(repository.removeTag).mockResolvedValue(false);

    await expect(executeTasks(repository, USER_ID, {
      action: 'delete_comment',
      commentId: COMMENT_ID,
      taskId: TASK_ID,
    })).resolves.toMatchObject({ deleted: false });
    await expect(executeTasks(repository, USER_ID, {
      action: 'remove_tag',
      tagId: TAG_ID,
      taskId: TASK_ID,
    })).resolves.toMatchObject({ deleted: false });
  });

  it('standardizes invalid functional status transitions', () => {
    expect(() => assertValidTaskStatusTransition('done', 'archived')).toThrowError(
      expect.objectContaining({ code: 'validation_failed', status: 422 }),
    );
  });
});
