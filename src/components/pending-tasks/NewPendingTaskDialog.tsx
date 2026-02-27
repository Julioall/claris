import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarIcon, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
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
  FormDescription,
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { TaskPriority, TaskType } from '@/types';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { RichTextEditor } from '@/components/ui/rich-text-editor';

const priorityOptions: { value: TaskPriority; label: string }[] = [
  { value: 'baixa', label: 'Baixa' },
  { value: 'media', label: 'Média' },
  { value: 'alta', label: 'Alta' },
  { value: 'urgente', label: 'Urgente' },
];

const taskTypeOptions: { value: TaskType; label: string }[] = [
  { value: 'interna', label: 'Interna' },
  { value: 'moodle', label: 'Moodle' },
];

const formSchema = z.object({
  title: z.string()
    .min(3, 'O título deve ter pelo menos 3 caracteres')
    .max(200, 'O título deve ter no máximo 200 caracteres'),
  description: z.string().optional(),
  category_name: z.string().optional(),
  course_id: z.string().optional(),
  student_id: z.string().optional(),
  task_type: z.enum(['interna', 'moodle'] as const),
  priority: z.enum(['baixa', 'media', 'alta', 'urgente'] as const),
  due_date: z.date().optional(),
  template_id: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface Student {
  id: string;
  full_name: string;
}

interface Course {
  id: string;
  short_name: string;
  category?: string | null;
}

interface Template {
  id: string;
  title: string;
  description?: string | null;
  task_type: string;
  priority: string;
}

interface NewPendingTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function NewPendingTaskDialog({ 
  open, 
  onOpenChange, 
  onSuccess 
}: NewPendingTaskDialogProps) {
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [isLoadingCourses, setIsLoadingCourses] = useState(false);
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: '',
      description: '',
      task_type: 'interna',
      priority: 'media',
    },
  });

  const selectedCourseId = form.watch('course_id');
  const selectedCategory = form.watch('category_name');
  const selectedTemplateId = form.watch('template_id');

  // Fetch user's active courses
  const fetchCourses = async () => {
    if (!user) return;
    setIsLoadingCourses(true);
    try {
      const { data, error } = await supabase
        .from('user_courses')
        .select(`
          course_id,
          courses!inner (
            id,
            short_name,
            category,
            end_date
          )
        `)
        .eq('user_id', user.id);

      if (error) throw error;

      const now = new Date();
      const activeCourses = data
        ?.map(uc => uc.courses)
        .filter((c): c is { id: string; short_name: string | null; category: string | null; end_date: string | null } => {
          if (!c) return false;
          return !c.end_date || new Date(c.end_date) > now;
        })
        .map(c => ({ id: c.id, short_name: c.short_name || '', category: c.category })) || [];

      setCourses(activeCourses);

      // Extract unique categories (schools)
      const uniqueCategories = [...new Set(
        activeCourses.map(c => c.category).filter((c): c is string => !!c)
      )].sort();
      setCategories(uniqueCategories);
    } catch (err) {
      console.error('Error fetching courses:', err);
    } finally {
      setIsLoadingCourses(false);
    }
  };

  // Fetch templates
  const fetchTemplates = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('task_templates')
        .select('id, title, description, task_type, priority')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('title');

      if (error) throw error;
      setTemplates(data || []);
    } catch (err) {
      console.error('Error fetching templates:', err);
    }
  };

  // Fetch students for selected course
  const fetchStudents = async (courseId: string) => {
    if (!courseId) { setStudents([]); return; }
    setIsLoadingStudents(true);
    try {
      const { data, error } = await supabase
        .from('student_courses')
        .select(`
          student_id,
          students!inner (
            id,
            full_name
          )
        `)
        .eq('course_id', courseId);

      if (error) throw error;

      const courseStudents = data
        ?.map(sc => sc.students)
        .filter((s): s is { id: string; full_name: string } => !!s)
        .map(s => ({ id: s.id, full_name: s.full_name })) || [];

      setStudents(courseStudents);
    } catch (err) {
      console.error('Error fetching students:', err);
    } finally {
      setIsLoadingStudents(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchCourses();
      fetchTemplates();
    }
  }, [open, user]);

  useEffect(() => {
    if (selectedCourseId) {
      fetchStudents(selectedCourseId);
      form.setValue('student_id', undefined);
    } else {
      setStudents([]);
    }
  }, [selectedCourseId]);

  // Apply template when selected
  useEffect(() => {
    if (selectedTemplateId) {
      const template = templates.find(t => t.id === selectedTemplateId);
      if (template) {
        form.setValue('title', template.title);
        if (template.description) form.setValue('description', template.description);
        form.setValue('task_type', template.task_type as TaskType);
        form.setValue('priority', template.priority as TaskPriority);
      }
    }
  }, [selectedTemplateId]);

  // Filter courses by selected category
  const filteredCourses = selectedCategory
    ? courses.filter(c => c.category === selectedCategory)
    : courses;

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true);
    try {
      if (!user) {
        toast.error('Você precisa estar logado para criar uma pendência');
        return;
      }

      const { error } = await supabase.from('pending_tasks').insert({
        title: data.title.trim(),
        description: data.description?.trim() || null,
        student_id: data.student_id || null,
        course_id: data.course_id || null,
        category_name: data.category_name || null,
        template_id: data.template_id || null,
        task_type: data.task_type,
        priority: data.priority,
        due_date: data.due_date?.toISOString() || null,
        created_by_user_id: user.id,
        status: 'aberta',
      } as any);

      if (error) throw error;

      toast.success('Pendência criada com sucesso!');
      form.reset();
      setShowAdvanced(false);
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error('Error creating task:', error);
      toast.error('Erro ao criar pendência. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      form.reset();
      setShowAdvanced(false);
      setCourses([]);
      setStudents([]);
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Pendência</DialogTitle>
          <DialogDescription>
            Crie uma pendência para acompanhamento. Campos adicionais aparecem conforme você preenche.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Template selector */}
            {templates.length > 0 && (
              <FormField
                control={form.control}
                name="template_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Modelo (opcional)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Usar um modelo pré-definido..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {templates.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription className="text-xs">
                      Selecione um modelo para preencher os campos automaticamente
                    </FormDescription>
                  </FormItem>
                )}
              />
            )}

            {/* Title - always visible */}
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Título *</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: Enviar mensagem de boas-vindas aos alunos" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Priority + Type - compact row */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prioridade</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {priorityOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="due_date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Prazo</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? (
                              format(field.value, "dd/MM/yyyy", { locale: ptBR })
                            ) : (
                              <span>Sem prazo</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          locale={ptBR}
                          initialFocus
                          className={cn("p-3 pointer-events-auto")}
                        />
                      </PopoverContent>
                    </Popover>
                  </FormItem>
                )}
              />
            </div>

            {/* Progressive: Scope section */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-between text-muted-foreground"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              <span>Escopo e detalhes</span>
              {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>

            {showAdvanced && (
              <div className="space-y-4 animate-fade-in">
                {/* Category (School) */}
                {categories.length > 0 && (
                  <FormField
                    control={form.control}
                    name="category_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Escola / Categoria</FormLabel>
                        <Select 
                          onValueChange={(v) => {
                            field.onChange(v === '__none__' ? undefined : v);
                            form.setValue('course_id', undefined);
                            form.setValue('student_id', undefined);
                          }}
                          value={field.value || '__none__'}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Todas as escolas" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="__none__">Todas as escolas</SelectItem>
                            {categories.map((cat) => (
                              <SelectItem key={cat} value={cat}>
                                {cat}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />
                )}

                {/* Course */}
                <FormField
                  control={form.control}
                  name="course_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Curso / Turma</FormLabel>
                      <Select 
                        onValueChange={(v) => {
                          field.onChange(v === '__none__' ? undefined : v);
                          form.setValue('student_id', undefined);
                        }}
                        value={field.value || '__none__'}
                        disabled={isLoadingCourses}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={isLoadingCourses ? "Carregando..." : "Todos os cursos"} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="__none__">Todos os cursos</SelectItem>
                          {filteredCourses.map((course) => (
                            <SelectItem key={course.id} value={course.id}>
                              {course.short_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />

                {/* Student - only shows if course is selected */}
                {selectedCourseId && selectedCourseId !== '__none__' && (
                  <FormField
                    control={form.control}
                    name="student_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Aluno</FormLabel>
                        <Select 
                          onValueChange={(v) => field.onChange(v === '__none__' ? undefined : v)}
                          value={field.value || '__none__'}
                          disabled={isLoadingStudents}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={
                                isLoadingStudents 
                                  ? "Carregando..." 
                                  : "Turma inteira"
                              } />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="__none__">Turma inteira</SelectItem>
                            {students.map((student) => (
                              <SelectItem key={student.id} value={student.id}>
                                {student.full_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription className="text-xs">
                          Deixe vazio para atribuir à turma inteira
                        </FormDescription>
                      </FormItem>
                    )}
                  />
                )}

                {/* Task type */}
                <FormField
                  control={form.control}
                  name="task_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {taskTypeOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
              </div>
            )}

            {/* Description with Rich Text Editor */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição</FormLabel>
                  <FormControl>
                    <RichTextEditor
                      content={field.value || ''}
                      onChange={field.onChange}
                      placeholder="Descreva a pendência, adicione links de reunião, instruções..."
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleClose(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Criar Pendência
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
