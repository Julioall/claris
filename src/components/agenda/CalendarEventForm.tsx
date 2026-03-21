import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { CalendarEvent, CalendarEventType } from '@/types';

const schema = z.object({
  title: z.string().min(1, 'Título obrigatório').max(200),
  description: z.string().optional(),
  start_at: z.string().min(1, 'Data de início obrigatória'),
  end_at: z.string().optional(),
  type: z.enum(['manual', 'webclass', 'meeting', 'alignment', 'delivery', 'training', 'other']),
});

type FormValues = z.infer<typeof schema>;

const TYPE_OPTIONS: { value: CalendarEventType; label: string }[] = [
  { value: 'manual', label: 'Geral' },
  { value: 'webclass', label: 'WebAula' },
  { value: 'meeting', label: 'Reunião' },
  { value: 'alignment', label: 'Alinhamento' },
  { value: 'delivery', label: 'Entrega' },
  { value: 'training', label: 'Treinamento' },
  { value: 'other', label: 'Outro' },
];

interface CalendarEventFormProps {
  defaultValues?: Partial<CalendarEvent>;
  onSubmit: (values: FormValues) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function CalendarEventForm({ defaultValues, onSubmit, onCancel, isLoading }: CalendarEventFormProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: defaultValues?.title ?? '',
      description: defaultValues?.description ?? '',
      start_at: defaultValues?.start_at
        ? defaultValues.start_at.slice(0, 16)
        : '',
      end_at: defaultValues?.end_at
        ? defaultValues.end_at.slice(0, 16)
        : '',
      type: defaultValues?.type ?? 'manual',
    },
  });

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="ev-title">Título *</Label>
        <Input id="ev-title" {...form.register('title')} placeholder="Título do evento" />
        {form.formState.errors.title && (
          <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ev-desc">Descrição</Label>
        <Textarea id="ev-desc" {...form.register('description')} placeholder="Detalhes do evento..." rows={2} />
      </div>

      <div className="space-y-1.5">
        <Label>Tipo</Label>
        <Select
          value={form.watch('type')}
          onValueChange={v => form.setValue('type', v as CalendarEventType)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPE_OPTIONS.map(o => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="ev-start">Início *</Label>
          <Input id="ev-start" type="datetime-local" {...form.register('start_at')} />
          {form.formState.errors.start_at && (
            <p className="text-xs text-destructive">{form.formState.errors.start_at.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ev-end">Fim</Label>
          <Input id="ev-end" type="datetime-local" {...form.register('end_at')} />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Salvando...' : defaultValues?.id ? 'Salvar alterações' : 'Criar evento'}
        </Button>
      </div>
    </form>
  );
}
