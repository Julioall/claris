import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { useAuth } from '@/contexts/AuthContext';

import { tasksRepository, type CreateTaskInput, type UpdateTaskInput } from '../api/tasks.repository';
import type { Task } from '../types';

const tasksKeys = {
  all: (userId?: string) => ['tasks', userId ?? 'anonymous'] as const,
  comments: (taskId: string | null) => ['task_comments', taskId ?? 'missing'] as const,
  tags: (taskId: string | null) => ['task_tags', taskId ?? 'missing'] as const,
};

function applyTaskPatch(task: Task, input: UpdateTaskInput): Task {
  return {
    ...task,
    title: input.title ?? task.title,
    description: input.description ?? task.description,
    status: input.status ?? task.status,
    priority: input.priority ?? task.priority,
    assigned_to: input.assigned_to ?? task.assigned_to,
    due_date: input.due_date ?? task.due_date,
    project_id: input.project_id ?? task.project_id,
    created_by: input.created_by ?? task.created_by,
    updated_at: new Date().toISOString(),
  };
}

export function useTasks() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const tasksQueryKey = tasksKeys.all(user?.id);

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: tasksQueryKey,
    queryFn: () => tasksRepository.listTasks(),
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: (input: CreateTaskInput) =>
      tasksRepository.createTask({ ...input, created_by: user?.id }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: tasksQueryKey });
      toast.success('Tarefa criada com sucesso');
    },
    onError: () => toast.error('Erro ao criar tarefa'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTaskInput }) =>
      tasksRepository.updateTask(id, input),
    onMutate: async ({ id, input }) => {
      await queryClient.cancelQueries({ queryKey: tasksQueryKey });

      const previousTasks = queryClient.getQueryData<Task[]>(tasksQueryKey) ?? [];

      queryClient.setQueryData<Task[]>(tasksQueryKey, (current = []) =>
        current.map((task) => (task.id === id ? applyTaskPatch(task, input) : task)),
      );

      return { previousTasks };
    },
    onSuccess: (updatedTask) => {
      queryClient.setQueryData<Task[]>(tasksQueryKey, (current = []) =>
        current.map((task) => (task.id === updatedTask.id ? { ...task, ...updatedTask } : task)),
      );
      toast.success('Tarefa atualizada');
    },
    onError: (_error, _variables, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(tasksQueryKey, context.previousTasks);
      }
      toast.error('Erro ao atualizar tarefa');
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: tasksQueryKey });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => tasksRepository.deleteTask(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: tasksQueryKey });
      toast.success('Tarefa removida');
    },
    onError: () => toast.error('Erro ao remover tarefa'),
  });

  return {
    tasks,
    isLoading,
    createTask: createMutation.mutate,
    updateTask: updateMutation.mutate,
    deleteTask: deleteMutation.mutate,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
  };
}

export function useTaskDetail(taskId: string | null) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: comments = [], isLoading: commentsLoading } = useQuery({
    queryKey: tasksKeys.comments(taskId),
    queryFn: () => tasksRepository.listComments(taskId!),
    enabled: !!taskId,
  });

  const { data: tags = [] } = useQuery({
    queryKey: tasksKeys.tags(taskId),
    queryFn: () => tasksRepository.getTaskTags(taskId!),
    enabled: !!taskId,
  });

  const addCommentMutation = useMutation({
    mutationFn: (comment: string) => tasksRepository.addComment(taskId!, comment, user!.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: tasksKeys.comments(taskId) });
    },
    onError: () => toast.error('Erro ao adicionar comentário'),
  });

  const addTagMutation = useMutation({
    mutationFn: async (params: { label: string; prefix?: string; entityId?: string; entityType?: string }) => {
      const tag = await tasksRepository.findOrCreateTag(
        params.label,
        params.prefix,
        params.entityId,
        params.entityType,
        user?.id,
      );
      await tasksRepository.addTagToTask(taskId!, tag.id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: tasksKeys.tags(taskId) });
    },
    onError: () => toast.error('Erro ao adicionar tag'),
  });

  const removeTagMutation = useMutation({
    mutationFn: (tagId: string) => tasksRepository.removeTagFromTask(taskId!, tagId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: tasksKeys.tags(taskId) });
    },
    onError: () => toast.error('Erro ao remover tag'),
  });

  return {
    comments,
    tags,
    commentsLoading,
    addComment: addCommentMutation.mutate,
    addTag: addTagMutation.mutate,
    removeTag: removeTagMutation.mutate,
    isAddingComment: addCommentMutation.isPending,
  };
}
