import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { normalizeTaskPriority, normalizeTaskStatus, TASK_PRIORITY_OPTIONS, TASK_STATUS_OPTIONS } from '@/lib/tasks';
import { TASK_PRIORITY_VALUES, TASK_STATUS_VALUES, type Task } from '@/types';

const schema = z.object({
  title: z.string().min(1, 'Título obrigatório').max(200),
  description: z.string().optional(),
  status: z.enum(TASK_STATUS_VALUES),
  priority: z.enum(TASK_PRIORITY_VALUES),
  due_date: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface TaskFormProps {
  defaultValues?: Partial<Task>;
  onSubmit: (values: FormValues) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function TaskForm({ defaultValues, onSubmit, onCancel, isLoading }: TaskFormProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: defaultValues?.title ?? '',
      description: defaultValues?.description ?? '',
      status: normalizeTaskStatus(defaultValues?.status),
      priority: normalizeTaskPriority(defaultValues?.priority),
      due_date: defaultValues?.due_date ?? '',
    },
  });

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="title">Título *</Label>
        <Input id="title" {...form.register('title')} placeholder="Título da tarefa" />
        {form.formState.errors.title && (
          <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Descrição</Label>
        <Textarea id="description" {...form.register('description')} placeholder="Descreva a tarefa..." rows={3} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select
            value={form.watch('status')}
            onValueChange={(value) => form.setValue('status', value as FormValues['status'])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TASK_STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Prioridade</Label>
          <Select
            value={form.watch('priority')}
            onValueChange={(value) => form.setValue('priority', value as FormValues['priority'])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TASK_PRIORITY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="due_date">Prazo</Label>
        <Input id="due_date" type="date" {...form.register('due_date')} />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Salvando...' : defaultValues?.id ? 'Salvar alterações' : 'Criar tarefa'}
        </Button>
      </div>
    </form>
  );
}
