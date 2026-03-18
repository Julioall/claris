import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tasksService, type CreateTaskInput, type UpdateTaskInput } from '@/services/tasks.service';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

const TASKS_KEY = ['tasks'];

export function useTasks() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: TASKS_KEY,
    queryFn: () => tasksService.listTasks(),
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: (input: CreateTaskInput) =>
      tasksService.createTask({ ...input, created_by: user?.id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TASKS_KEY });
      toast.success('Tarefa criada com sucesso');
    },
    onError: () => toast.error('Erro ao criar tarefa'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTaskInput }) =>
      tasksService.updateTask(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TASKS_KEY });
      toast.success('Tarefa atualizada');
    },
    onError: () => toast.error('Erro ao atualizar tarefa'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => tasksService.deleteTask(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TASKS_KEY });
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
  const qc = useQueryClient();
  const { user } = useAuth();

  const { data: comments = [], isLoading: commentsLoading } = useQuery({
    queryKey: ['task_comments', taskId],
    queryFn: () => tasksService.listComments(taskId!),
    enabled: !!taskId,
  });

  const { data: tags = [] } = useQuery({
    queryKey: ['task_tags', taskId],
    queryFn: () => tasksService.getTaskTags(taskId!),
    enabled: !!taskId,
  });

  const addCommentMutation = useMutation({
    mutationFn: (comment: string) =>
      tasksService.addComment(taskId!, comment, user!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task_comments', taskId] });
    },
    onError: () => toast.error('Erro ao adicionar comentário'),
  });

  const addTagMutation = useMutation({
    mutationFn: async ({ label, prefix, entityId, entityType }: { label: string; prefix?: string; entityId?: string; entityType?: string }) => {
      const tag = await tasksService.findOrCreateTag(label, prefix, entityId, entityType, user?.id);
      await tasksService.addTagToTask(taskId!, tag.id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['task_tags', taskId] }),
    onError: () => toast.error('Erro ao adicionar tag'),
  });

  const removeTagMutation = useMutation({
    mutationFn: (tagId: string) => tasksService.removeTagFromTask(taskId!, tagId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['task_tags', taskId] }),
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
