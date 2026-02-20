import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ActionType, ActionEffectiveness } from '@/types';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

const actionTypeOptions: { value: ActionType; label: string }[] = [
  { value: 'contato', label: 'Contato' },
  { value: 'orientacao', label: 'Orientação' },
  { value: 'cobranca', label: 'Cobrança' },
  { value: 'suporte_tecnico', label: 'Suporte Técnico' },
  { value: 'reuniao', label: 'Reunião' },
  { value: 'outro', label: 'Outro' },
];

const effectivenessOptions: { value: ActionEffectiveness; label: string }[] = [
  { value: 'pendente', label: 'Pendente' },
  { value: 'eficaz', label: 'Eficaz' },
  { value: 'nao_eficaz', label: 'Não Eficaz' },
  { value: 'parcialmente_eficaz', label: 'Parcialmente Eficaz' },
];

const formSchema = z.object({
  action_type: z.enum(['contato', 'orientacao', 'cobranca', 'suporte_tecnico', 'reuniao', 'outro'] as const),
  description: z.string()
    .min(10, 'A descrição deve ter pelo menos 10 caracteres')
    .max(1000, 'A descrição deve ter no máximo 1000 caracteres'),
  effectiveness: z.enum(['pendente', 'eficaz', 'nao_eficaz', 'parcialmente_eficaz'] as const),
  notes: z.string()
    .max(500, 'As observações devem ter no máximo 500 caracteres')
    .optional(),
});

type FormData = z.infer<typeof formSchema>;

interface AddTaskActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pendingTaskId: string;
  onSuccess?: () => void;
}

export function AddTaskActionDialog({ 
  open, 
  onOpenChange, 
  pendingTaskId,
  onSuccess 
}: AddTaskActionDialogProps) {
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      action_type: 'contato',
      description: '',
      effectiveness: 'pendente',
      notes: '',
    },
  });

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true);
    try {
      if (!user) {
        toast.error('Você precisa estar logado para adicionar uma ação');
        return;
      }

      const now = new Date().toISOString();

      const { error } = await (supabase.from as any)('task_actions').insert({
        pending_task_id: pendingTaskId,
        action_type: data.action_type,
        description: data.description.trim(),
        effectiveness: data.effectiveness,
        notes: data.notes?.trim() || null,
        executed_by_user_id: user.id,
        executed_at: data.effectiveness !== 'pendente' ? now : null,
      });

      if (error) throw error;

      toast.success('Ação adicionada com sucesso!');
      form.reset();
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error('Error creating action:', error);
      toast.error('Erro ao adicionar ação. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      form.reset();
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Adicionar Ação</DialogTitle>
          <DialogDescription>
            Registre uma ação executada para esta pendência e avalie sua eficácia.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="action_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de Ação *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {actionTypeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição *</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Descreva a ação realizada..."
                      className="resize-none"
                      rows={3}
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="effectiveness"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Eficácia *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {effectivenessOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                  <p className="text-xs text-muted-foreground mt-1">
                    {field.value === 'eficaz' && '✓ Marcará a pendência como resolvida automaticamente'}
                    {field.value === 'nao_eficaz' && '⚠ Manterá a pendência aberta para novas ações'}
                    {field.value === 'parcialmente_eficaz' && '⚠ Manterá a pendência em andamento'}
                  </p>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observações</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Observações adicionais sobre a ação..."
                      className="resize-none"
                      rows={2}
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleClose(false)} className="w-full sm:w-auto">
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Adicionar Ação
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
