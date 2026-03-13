import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Pencil, Trash2, Loader2, BookTemplate } from 'lucide-react';
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
  FormDescription,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { PriorityBadge } from '@/components/ui/PriorityBadge';
import { TaskPriority } from '@/types';

const formSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(2000).optional(),
  task_type: z.enum(['interna', 'moodle']),
  priority: z.enum(['baixa', 'media', 'alta', 'urgente']),
  auto_message_template: z.string().max(2000).optional(),
  auto_close_on_action: z.boolean().default(false),
});

type FormData = z.infer<typeof formSchema>;

interface Template {
  id: string;
  title: string;
  description: string | null;
  task_type: string;
  priority: string;
  auto_message_template: string | null;
  auto_close_on_action: boolean;
  is_active: boolean;
}

interface TaskTemplatesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TaskTemplatesDialog({ open, onOpenChange }: TaskTemplatesDialogProps) {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: '',
      description: '',
      task_type: 'interna',
      priority: 'media',
      auto_message_template: '',
      auto_close_on_action: false,
    },
  });

  const fetchTemplates = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('task_templates')
        .select('*')
        .eq('user_id', user.id)
        .order('title');
      if (error) throw error;
      setTemplates(data || []);
    } catch (err) {
      console.error('Error fetching templates:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (open) fetchTemplates();
  }, [open, user]);

  const onSubmit = async (data: FormData) => {
    if (!user) return;
    setIsSubmitting(true);
    try {
      if (editingId) {
        const { error } = await supabase
          .from('task_templates')
          .update({
            title: data.title,
            description: data.description || null,
            task_type: data.task_type as string,
            priority: data.priority as string,
            auto_message_template: data.auto_message_template || null,
            auto_close_on_action: data.auto_close_on_action,
          })
          .eq('id', editingId);
        if (error) throw error;
        toast.success('Modelo atualizado!');
      } else {
        const { error } = await supabase
          .from('task_templates')
          .insert({
            user_id: user.id,
            title: data.title,
            description: data.description || null,
            task_type: data.task_type as string,
            priority: data.priority as string,
            auto_message_template: data.auto_message_template || null,
            auto_close_on_action: data.auto_close_on_action,
          });
        if (error) throw error;
        toast.success('Modelo criado!');
      }
      form.reset();
      setShowForm(false);
      setEditingId(null);
      fetchTemplates();
    } catch (err) {
      console.error('Error saving template:', err);
      toast.error('Erro ao salvar modelo');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (template: Template) => {
    setEditingId(template.id);
    form.reset({
      title: template.title,
      description: template.description || '',
      task_type: template.task_type as string,
      priority: template.priority as string,
      auto_message_template: template.auto_message_template || '',
      auto_close_on_action: template.auto_close_on_action,
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from('task_templates').delete().eq('id', id);
      if (error) throw error;
      toast.success('Modelo excluído!');
      fetchTemplates();
    } catch (err) {
      console.error('Error deleting template:', err);
      toast.error('Erro ao excluir modelo');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookTemplate className="h-5 w-5" />
            Modelos de Pendência
          </DialogTitle>
          <DialogDescription>
            Crie modelos reutilizáveis para gerar pendências rapidamente. Modelos com mensagem automática podem enviar mensagens via Moodle.
          </DialogDescription>
        </DialogHeader>

        {!showForm ? (
          <div className="space-y-3">
            <Button size="sm" onClick={() => { setEditingId(null); form.reset(); setShowForm(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Modelo
            </Button>

            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : templates.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhum modelo criado ainda.
              </p>
            ) : (
              templates.map(t => (
                <Card key={t.id} className="card-interactive">
                  <CardContent className="p-3 flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{t.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <PriorityBadge priority={t.priority as TaskPriority} size="sm" />
                        <Badge variant="outline" className="text-xs">{t.task_type}</Badge>
                        {t.auto_close_on_action && (
                          <Badge variant="secondary" className="text-xs">Auto-fechar</Badge>
                        )}
                        {t.auto_message_template && (
                          <Badge variant="secondary" className="text-xs">Msg automática</Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="sm" variant="ghost" onClick={() => handleEdit(t)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="text-destructive"
                        onClick={() => handleDelete(t.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Título *</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: Mensagem de Boas-vindas" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descrição</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Instruções padrão para esta pendência..." rows={2} {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="task_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="interna">Interna</SelectItem>
                          <SelectItem value="moodle">Moodle</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Prioridade</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="baixa">Baixa</SelectItem>
                          <SelectItem value="media">Média</SelectItem>
                          <SelectItem value="alta">Alta</SelectItem>
                          <SelectItem value="urgente">Urgente</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="auto_message_template"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mensagem Automática (Moodle)</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Texto da mensagem que será enviada automaticamente ao aluno via chat do Moodle..."
                        rows={3}
                        {...field} 
                      />
                    </FormControl>
                    <FormDescription className="text-xs">
                      Se preenchido, ao gerar pendências em lote com este modelo a mensagem será enviada automaticamente via Moodle.
                    </FormDescription>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="auto_close_on_action"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <FormLabel>Fechar automaticamente ao registrar ação</FormLabel>
                      <FormDescription className="text-xs">
                        A pendência será resolvida quando qualquer ação for registrada
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => { setShowForm(false); setEditingId(null); }}>
                  Voltar
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editingId ? 'Atualizar' : 'Criar'} Modelo
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
