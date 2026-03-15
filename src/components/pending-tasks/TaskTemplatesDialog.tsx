import { useCallback, useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Pencil, Trash2, BookTemplate } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
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
});

type FormData = z.infer<typeof formSchema>;

interface Template {
  id: string;
  title: string;
  description: string | null;
  task_type: string;
  priority: string;
  auto_message_template: string | null;
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
    },
  });

  const fetchTemplates = useCallback(async () => {
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
  }, [user]);

  useEffect(() => {
    if (open) fetchTemplates();
  }, [open, fetchTemplates]);

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
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from('task_templates').delete().eq('id', id);
      if (error) throw error;
      toast.success('Modelo excluido!');
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
            Modelos de Pendencia
          </DialogTitle>
          <DialogDescription>
            Crie modelos reutilizaveis para gerar pendencias rapidamente. Modelos com mensagem automatica podem enviar mensagens via Moodle.
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
                <Spinner className="h-6 w-6" />
              </div>
            ) : templates.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhum modelo criado ainda.
              </p>
            ) : (
              templates.map((template) => (
                <Card key={template.id} className="card-interactive">
                  <CardContent className="p-3 flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{template.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <PriorityBadge priority={template.priority as TaskPriority} size="sm" />
                        <Badge variant="outline" className="text-xs">{template.task_type}</Badge>
                        {template.auto_message_template && (
                          <Badge variant="secondary" className="text-xs">Msg automatica</Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="sm" variant="ghost" onClick={() => handleEdit(template)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => handleDelete(template.id)}
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
                    <FormLabel>Titulo *</FormLabel>
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
                    <FormLabel>Descricao</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Instrucoes padrao para esta pendencia..." rows={2} {...field} />
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
                          <SelectItem value="media">Media</SelectItem>
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
                    <FormLabel>Mensagem Automatica (Moodle)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Texto da mensagem que sera enviada automaticamente ao aluno via chat do Moodle..."
                        rows={3}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription className="text-xs">
                      Se preenchido, ao gerar pendencias em lote com este modelo a mensagem sera enviada automaticamente via Moodle.
                    </FormDescription>
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => { setShowForm(false); setEditingId(null); }}>
                  Voltar
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Spinner className="mr-2 h-4 w-4" onAccent />}
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
