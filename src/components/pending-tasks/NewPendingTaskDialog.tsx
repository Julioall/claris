import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarIcon, Loader2 } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { RecurrencePattern, TaskPriority, TaskStatus, TaskType } from '@/types';
import { supabase } from '@/integrations/supabase/client';
import { Database } from '@/integrations/supabase/types';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { recurrencePatternOptions } from '@/lib/task-recurrence';

type PendingTaskInsert = Database['public']['Tables']['pending_tasks']['Insert'];
type PendingTaskInsertPayload = PendingTaskInsert & {
  recurrence_id?: string | null;
  is_recurring?: boolean;
};

interface RecurrenceInsertPayload {
  title: string;
  description: string | null;
  pattern: RecurrencePattern;
  start_date: string;
  end_date: string | null;
  course_id: string | null;
  student_id: string | null;
  created_by_user_id: string;
  task_type: TaskType;
  priority: TaskPriority;
  is_active: boolean;
  next_generation_at: string;
}

interface RecurrenceInsertResult {
  data: { id: string } | null;
  error: Error | null;
}

interface RecurrenceInsertClient {
  insert: (payload: RecurrenceInsertPayload) => {
    select: (columns: string) => {
      single?: () => Promise<RecurrenceInsertResult>;
    } | Promise<RecurrenceInsertResult>;
  };
}

const priorityOptions: Array<{ value: TaskPriority; label: string }> = [
  { value: 'baixa', label: 'Baixa' },
  { value: 'media', label: 'Media' },
  { value: 'alta', label: 'Alta' },
  { value: 'urgente', label: 'Urgente' },
];

const statusOptions: Array<{ value: TaskStatus; label: string }> = [
  { value: 'aberta', label: 'A fazer' },
  { value: 'em_andamento', label: 'Em andamento' },
  { value: 'resolvida', label: 'Concluida' },
];

const taskTypeOptions: Array<{ value: TaskType; label: string }> = [
  { value: 'interna', label: 'Interna' },
  { value: 'moodle', label: 'Moodle' },
];

const formSchema = z.object({
  title: z.string()
    .trim()
    .min(3, 'Informe um titulo com pelo menos 3 caracteres.')
    .max(200, 'Use no maximo 200 caracteres no titulo.'),
  description: z.string().max(2000, 'Use no maximo 2000 caracteres.').optional(),
  category_name: z.string().optional(),
  course_id: z.string().optional(),
  student_id: z.string().optional(),
  task_type: z.enum(['interna', 'moodle'] as const),
  status: z.enum(['aberta', 'em_andamento', 'resolvida'] as const),
  priority: z.enum(['baixa', 'media', 'alta', 'urgente'] as const),
  due_date: z.date().optional(),
  is_recurring: z.boolean(),
  recurrence_pattern: z.enum(['diario', 'semanal', 'quinzenal', 'mensal', 'bimestral', 'trimestral'] as const).optional(),
  recurrence_end_date: z.date().optional(),
}).superRefine((data, context) => {
  if (data.is_recurring && !data.due_date) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['due_date'],
      message: 'Defina o prazo da primeira ocorrencia para ativar a rotina.',
    });
  }

  if (data.is_recurring && !data.recurrence_pattern) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['recurrence_pattern'],
      message: 'Escolha a frequencia da rotina.',
    });
  }

  if (data.is_recurring && data.status === 'resolvida') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['status'],
      message: 'Rotinas precisam iniciar como aberta ou em andamento.',
    });
  }

  if (data.due_date && data.recurrence_end_date && data.recurrence_end_date < data.due_date) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['recurrence_end_date'],
      message: 'A data limite da rotina deve ser posterior ao primeiro prazo.',
    });
  }
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

interface NewPendingTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

function formatCalendarDate(date?: Date) {
  if (!date) return null;
  return format(date, 'dd/MM/yyyy', { locale: ptBR });
}

export function NewPendingTaskDialog({
  open,
  onOpenChange,
  onSuccess,
}: NewPendingTaskDialogProps) {
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoadingCourses, setIsLoadingCourses] = useState(false);
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: '',
      description: '',
      task_type: 'interna',
      status: 'aberta',
      priority: 'media',
      is_recurring: false,
      recurrence_pattern: 'semanal',
    },
  });

  const selectedCourseId = form.watch('course_id');
  const selectedCategory = form.watch('category_name');
  const isRecurring = form.watch('is_recurring');

  const filteredCourses = useMemo(() => {
    if (!selectedCategory) return courses;
    return courses.filter((course) => course.category === selectedCategory);
  }, [courses, selectedCategory]);

  const categories = useMemo(() => {
    return [...new Set(
      courses.map((course) => course.category).filter((value): value is string => Boolean(value)),
    )].sort();
  }, [courses]);

  useEffect(() => {
    if (!open || !user) return;

    const loadCourses = async () => {
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
        const activeCourses = (data ?? [])
          .map((item) => item.courses)
          .filter((course): course is { id: string; short_name: string | null; category: string | null; end_date: string | null } => {
            if (!course) return false;
            return !course.end_date || new Date(course.end_date) > now;
          })
          .map((course) => ({
            id: course.id,
            short_name: course.short_name || '',
            category: course.category,
          }));

        setCourses(activeCourses);
      } catch (error) {
        console.error('Error fetching courses:', error);
      } finally {
        setIsLoadingCourses(false);
      }
    };

    void loadCourses();
  }, [open, user]);

  useEffect(() => {
    if (!selectedCourseId) {
      setStudents([]);
      return;
    }

    const loadStudents = async () => {
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
          .eq('course_id', selectedCourseId);

        if (error) throw error;

        const courseStudents = (data ?? [])
          .map((item) => item.students)
          .filter((student): student is { id: string; full_name: string } => Boolean(student))
          .map((student) => ({
            id: student.id,
            full_name: student.full_name,
          }));

        setStudents(courseStudents);
      } catch (error) {
        console.error('Error fetching students:', error);
      } finally {
        setIsLoadingStudents(false);
      }
    };

    form.setValue('student_id', undefined);
    void loadStudents();
  }, [form, selectedCourseId]);

  useEffect(() => {
    if (!isRecurring && form.getValues('status') === 'resolvida') {
      return;
    }

    if (isRecurring && form.getValues('status') === 'resolvida') {
      form.setValue('status', 'aberta');
    }
  }, [form, isRecurring]);

  const resetDialog = () => {
    form.reset({
      title: '',
      description: '',
      category_name: undefined,
      course_id: undefined,
      student_id: undefined,
      task_type: 'interna',
      status: 'aberta',
      priority: 'media',
      due_date: undefined,
      is_recurring: false,
      recurrence_pattern: 'semanal',
      recurrence_end_date: undefined,
    });
    setStudents([]);
  };

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetDialog();
    }

    onOpenChange(nextOpen);
  };

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true);

    try {
      if (!user) {
        toast.error('Voce precisa estar logado para criar uma tarefa.');
        return;
      }

      let recurrenceId: string | null = null;
      const trimmedDescription = data.description?.trim() || null;

      if (data.is_recurring) {
        const recurrencePayload: RecurrenceInsertPayload = {
          title: data.title,
          description: trimmedDescription,
          pattern: data.recurrence_pattern as RecurrencePattern,
          start_date: data.due_date!.toISOString(),
          end_date: data.recurrence_end_date?.toISOString() || null,
          course_id: data.course_id || null,
          student_id: data.student_id || null,
          created_by_user_id: user.id,
          task_type: data.task_type,
          priority: data.priority,
          is_active: true,
          next_generation_at: data.due_date!.toISOString(),
        };

        const recurrenceTable = (supabase.from as unknown as (table: 'task_recurrence_configs') => RecurrenceInsertClient)('task_recurrence_configs');
        const recurrenceQuery = recurrenceTable
          .insert(recurrencePayload)
          .select('id');

        const recurrenceResult = recurrenceQuery.single
          ? await recurrenceQuery.single()
          : await recurrenceQuery;

        if (recurrenceResult.error) throw recurrenceResult.error;
        recurrenceId = recurrenceResult.data?.id ?? null;
      }

      const { error } = await supabase
        .from('pending_tasks')
        .insert({
          title: data.title,
          description: trimmedDescription,
          student_id: data.student_id || null,
          course_id: data.course_id || null,
          category_name: data.category_name || null,
          task_type: data.task_type,
          status: data.status,
          priority: data.priority,
          due_date: data.due_date?.toISOString() || null,
          created_by_user_id: user.id,
          automation_type: data.is_recurring ? 'recurring' : 'manual',
          recurrence_id: recurrenceId,
          is_recurring: data.is_recurring,
          template_id: null,
        } satisfies PendingTaskInsertPayload);

      if (error) throw error;

      toast.success(
        data.is_recurring
          ? 'Rotina criada. A proxima tarefa sera aberta quando esta for concluida.'
          : 'Tarefa criada com sucesso.',
      );

      handleClose(false);
      onSuccess?.();
    } catch (error) {
      console.error('Error creating task:', error);
      toast.error('Nao foi possivel criar a tarefa.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>Nova tarefa</DialogTitle>
          <DialogDescription>
            Crie uma tarefa manual para a sua todo list. Contexto e rotina sao opcionais.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Titulo</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: Fazer follow-up com a turma de Matematica" {...field} />
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
                    <Textarea
                      rows={4}
                      placeholder="Adicione contexto, proximos passos ou links importantes."
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Use texto simples. O objetivo aqui e registrar rapido e manter a lista leve.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 md:grid-cols-3">
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status inicial</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {statusOptions
                          .filter((option) => !isRecurring || option.value !== 'resolvida')
                          .map((option) => (
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
                    <FormMessage />
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
                              'w-full justify-between text-left font-normal',
                              !field.value && 'text-muted-foreground',
                            )}
                          >
                            <span>{formatCalendarDate(field.value) || 'Sem prazo'}</span>
                            <CalendarIcon className="h-4 w-4 opacity-50" />
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
                          className={cn('p-3 pointer-events-auto')}
                        />
                        <div className="border-t p-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="w-full"
                            onClick={() => field.onChange(undefined)}
                          >
                            Remover prazo
                          </Button>
                        </div>
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Contexto opcional</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {categories.length > 0 && (
                  <FormField
                    control={form.control}
                    name="category_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Escola ou categoria</FormLabel>
                        <Select
                          onValueChange={(value) => {
                            field.onChange(value === '__none__' ? undefined : value);
                            form.setValue('course_id', undefined);
                            form.setValue('student_id', undefined);
                          }}
                          value={field.value || '__none__'}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Todas as categorias" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="__none__">Todas as categorias</SelectItem>
                            {categories.map((category) => (
                              <SelectItem key={category} value={category}>
                                {category}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />
                )}

                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="course_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Curso</FormLabel>
                        <Select
                          onValueChange={(value) => {
                            field.onChange(value === '__none__' ? undefined : value);
                            form.setValue('student_id', undefined);
                          }}
                          value={field.value || '__none__'}
                          disabled={isLoadingCourses}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={isLoadingCourses ? 'Carregando cursos...' : 'Sem curso'} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="__none__">Sem curso especifico</SelectItem>
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

                {selectedCourseId && (
                  <FormField
                    control={form.control}
                    name="student_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Aluno</FormLabel>
                        <Select
                          onValueChange={(value) => field.onChange(value === '__none__' ? undefined : value)}
                          value={field.value || '__none__'}
                          disabled={isLoadingStudents}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={isLoadingStudents ? 'Carregando alunos...' : 'Sem aluno especifico'} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="__none__">Sem aluno especifico</SelectItem>
                            {students.map((student) => (
                              <SelectItem key={student.id} value={student.id}>
                                {student.full_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Se nao selecionar um aluno, a tarefa fica ligada apenas ao contexto geral.
                        </FormDescription>
                      </FormItem>
                    )}
                  />
                )}
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-base">Rotina</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Em vez de depender de um gerador automatico, a proxima tarefa sera criada ao concluir a atual.
                    </p>
                  </div>
                  <FormField
                    control={form.control}
                    name="is_recurring"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-3 space-y-0">
                        <FormLabel>Ativar</FormLabel>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              </CardHeader>

              {isRecurring && (
                <CardContent className="space-y-4 pt-0">
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="recurrence_pattern"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Frequencia</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {recurrencePatternOptions.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            {recurrencePatternOptions.find((option) => option.value === field.value)?.helper}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="recurrence_end_date"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>Encerrar rotina em</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant="outline"
                                  className={cn(
                                    'w-full justify-between text-left font-normal',
                                    !field.value && 'text-muted-foreground',
                                  )}
                                >
                                  <span>{formatCalendarDate(field.value) || 'Sem data limite'}</span>
                                  <CalendarIcon className="h-4 w-4 opacity-50" />
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
                                className={cn('p-3 pointer-events-auto')}
                              />
                              <div className="border-t p-2">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="w-full"
                                  onClick={() => field.onChange(undefined)}
                                >
                                  Sem data limite
                                </Button>
                              </div>
                            </PopoverContent>
                          </Popover>
                          <FormDescription>
                            Opcional. Se vazio, a rotina continua ate voce desativar.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              )}
            </Card>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleClose(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Criar tarefa
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
