import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeEdgeFunctionMock = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/http/edge-function-client', () => ({
  ApiClientError: class ApiClientError extends Error {
    readonly code: string;

    constructor(error: { code: string; message: string }) {
      super(error.message);
      this.code = error.code;
    }
  },
  invokeEdgeFunction: invokeEdgeFunctionMock,
}));

import { tasksService } from '../tasks.service';

const TASK_ID = '11111111-1111-4111-8111-111111111111';
const metadata = { contractVersion: 1, generatedAt: '2026-07-21T12:00:00.000Z' };
const task = {
  aiTags: ['ia'],
  assignedTo: null,
  createdAt: '2026-07-21T10:00:00.000Z',
  createdBy: '22222222-2222-4222-8222-222222222222',
  description: null,
  dueDate: '2026-07-22',
  entityId: null,
  entityType: null,
  id: TASK_ID,
  originReason: null,
  priority: 'high',
  projectId: null,
  status: 'todo',
  suggestedByAi: false,
  tags: [],
  title: 'Acompanhar aluno',
  updatedAt: '2026-07-21T10:00:00.000Z',
};

describe('tasks API client', () => {
  beforeEach(() => {
    invokeEdgeFunctionMock.mockReset();
  });

  it('lists tasks through the versioned backend contract without actor identity', async () => {
    invokeEdgeFunctionMock.mockResolvedValueOnce({
      items: [task],
      metadata,
      page: 1,
      pageSize: 1_000,
      totalCount: 1,
      totalPages: 1,
    });
    const controller = new AbortController();

    await expect(tasksService.listTasks(controller.signal)).resolves.toEqual([
      expect.objectContaining({ id: TASK_ID, due_date: '2026-07-22', status: 'todo' }),
    ]);
    expect(invokeEdgeFunctionMock).toHaveBeenCalledWith('tasks', {
      auth: 'required',
      body: {
        action: 'list_tasks',
        filters: {},
        order: 'createdAtDesc',
        page: 1,
        pageSize: 1_000,
      },
      signal: controller.signal,
      timeoutMs: 15_000,
    });
    expect(JSON.stringify(invokeEdgeFunctionMock.mock.calls[0][1].body)).not.toMatch(/userId|createdBy|created_by/);
  });

  it('creates tasks without accepting created_by from the browser', async () => {
    invokeEdgeFunctionMock.mockResolvedValueOnce({ metadata, task });

    await tasksService.createTask({
      due_date: '2026-07-22',
      priority: 'high',
      title: 'Acompanhar aluno',
    });

    expect(invokeEdgeFunctionMock.mock.calls[0][1].body).toEqual({
      action: 'create_task',
      input: {
        dueDate: '2026-07-22',
        priority: 'high',
        title: 'Acompanhar aluno',
      },
    });
  });

  it('loads comments and tags from one detail use case', async () => {
    invokeEdgeFunctionMock.mockResolvedValueOnce({
      comments: [{
        authorId: '22222222-2222-4222-8222-222222222222',
        comment: 'Contato realizado',
        createdAt: '2026-07-21T11:00:00.000Z',
        id: '33333333-3333-4333-8333-333333333333',
        taskId: TASK_ID,
      }],
      metadata,
      tags: [{
        color: null,
        createdAt: '2026-07-21T11:00:00.000Z',
        entityId: '123',
        entityType: 'aluno',
        id: '44444444-4444-4444-8444-444444444444',
        label: 'Ana',
        prefix: 'aluno',
      }],
      task,
    });

    await expect(tasksService.getTaskDetail(TASK_ID)).resolves.toMatchObject({
      comments: [{ task_id: TASK_ID, comment: 'Contato realizado' }],
      tags: [{ entity_id: '123', label: 'Ana' }],
    });
  });

  it('derives comment author and tag owner on the backend', async () => {
    invokeEdgeFunctionMock.mockResolvedValueOnce({
      comment: {
        authorId: '22222222-2222-4222-8222-222222222222',
        comment: 'Novo comentario',
        createdAt: '2026-07-21T11:00:00.000Z',
        id: '33333333-3333-4333-8333-333333333333',
        taskId: TASK_ID,
      },
      metadata,
    });
    await tasksService.addComment(TASK_ID, 'Novo comentario');
    expect(invokeEdgeFunctionMock.mock.calls[0][1].body).toEqual({
      action: 'add_comment',
      comment: 'Novo comentario',
      taskId: TASK_ID,
    });

    invokeEdgeFunctionMock.mockResolvedValueOnce({
      metadata,
      tag: {
        color: null,
        createdAt: '2026-07-21T11:00:00.000Z',
        entityId: '123',
        entityType: 'aluno',
        id: '44444444-4444-4444-8444-444444444444',
        label: 'Ana',
        prefix: 'aluno',
      },
    });
    await tasksService.addTag(TASK_ID, { entityId: '123', entityType: 'aluno', label: 'Ana', prefix: 'aluno' });
    expect(JSON.stringify(invokeEdgeFunctionMock.mock.calls[1][1].body)).not.toMatch(/createdBy|created_by|userId/);
  });

  it('sends the task scope when deleting a comment', async () => {
    const commentId = '33333333-3333-4333-8333-333333333333';
    invokeEdgeFunctionMock.mockResolvedValueOnce({ deleted: false, metadata });

    await expect(tasksService.deleteComment(TASK_ID, commentId)).resolves.toBe(false);
    expect(invokeEdgeFunctionMock.mock.calls[0][1].body).toEqual({
      action: 'delete_comment',
      commentId,
      taskId: TASK_ID,
    });
  });

  it('rejects database-shaped task responses', async () => {
    invokeEdgeFunctionMock.mockResolvedValueOnce({
      items: [{ ...task, createdAt: undefined, created_at: task.createdAt }],
      metadata,
      page: 1,
      pageSize: 1_000,
      totalCount: 1,
      totalPages: 1,
    });

    await expect(tasksService.listTasks()).rejects.toMatchObject({ code: 'invalid_response' });
  });
});
