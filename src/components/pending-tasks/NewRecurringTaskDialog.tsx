import React, { useState, useEffect } from 'react';
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
import { cn } from '@/lib/utils';
import { TaskPriority, TaskType, RecurrencePattern } from '@/types';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

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

const recurrencePatternOptions: { value: RecurrencePattern; label: string }[] = [
  { value: 'diario', label: 'Diário' },
  { value: 'semanal', label: 'Semanal' },
  { value: 'quinzenal', label: 'Quinzenal' },
  { value: 'mensal', label: 'Mensal' },
  { value: 'bimestral', label: 'Bimestral' },
  { value: 'trimestral', label: 'Trimestral' },
];

const formSchema = z.object({
  title: z.string()
    .min(3, 'O título deve ter pelo menos 3 caracteres')
    .max(200, 'O título deve ter no máximo 200 caracteres'),
  description: z.string()
    .max(1000, 'A descrição deve ter no máximo 1000 caracteres')
    .optional(),
  pattern: z.enum(['diario', 'semanal', 'quinzenal', 'mensal', 'bimestral', 'trimestral'] as const),
  start_date: z.date({
    required_error: 'Selecione uma data de início',
  }),
  end_date: z.date().optional(),
  course_id: z.string({
    required_error: 'Selecione um curso',
  }),
  student_id: z.string().optional(),
  task_type: z.enum(['interna', 'moodle'] as const),
  priority: z.enum(['baixa', 'media', 'alta', 'urgente'] as const),
});

type FormData = z.infer<typeof formSchema>;

interface Course {
  id: string;
  short_name: string;
}

interface Student {
  id: string;
  full_name: string;
}

interface NewRecurringTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function NewRecurringTaskDialog({ 
  open, 
  onOpenChange, 
  onSuccess 
}: NewRecurringTaskDialogProps) {
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
      priority: 'media',
      pattern: 'semanal',
    },
  });

  const selectedCourseId = form.watch('course_id');

  // Fetch user's active courses
  const fetchCourses = useCallback(async () => {
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
            end_date
          )
        `)
        .eq('user_id', user.id);

      if (error) throw error;

      const now = new Date();
      const activeCourses = data
        ?.map(uc => uc.courses)
        .filter((c): c is { id: string; short_name: string | null; end_date: string | null } => {
          if (!c) return false;
          const isActive = !c.end_date || new Date(c.end_date) > now;
          return isActive;
        })
        .map(c => ({ id: c.id, short_name: c.short_name || '' })) || [];

      setCourses(activeCourses);
    } catch (err) {
      console.error('Error fetching courses:', err);
    } finally {
      setIsLoadingCourses(false);
    }
  }, [user]);

  // Fetch students for selected course
  const fetchStudents = useCallback(async (courseId: string) => {
    if (!courseId) {
      setStudents([]);
      return;
    }

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
  }, []);

  // Load courses when dialog opens
  useEffect(() => {
    if (open) {
      fetchCourses();
    }
  }, [open, fetchCourses]);

  // Load students when course changes
  useEffect(() => {
    if (selectedCourseId) {
      fetchStudents(selectedCourseId);
      form.setValue('student_id', undefined);
    } else {
      setStudents([]);
    }
  }, [selectedCourseId, fetchStudents, form]);

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true);
    try {
      if (!user) {
        toast.error('Você precisa estar logado para criar uma recorrência');
        return;
      }

      // Calculate next generation date based on pattern
      const { data: nextDate, error: rpcError } = await supabase.rpc(
        'calculate_next_recurrence_date',
        {
          current_date: data.start_date.toISOString(),
          pattern: data.pattern
        }
      );

      if (rpcError) {
        console.error('RPC error:', rpcError);
      }

      const { error } = await supabase.from('task_recurrence_configs').insert({
        title: data.title.trim(),
        description: data.description?.trim() || null,
        pattern: data.pattern,
        start_date: data.start_date.toISOString(),
        end_date: data.end_date?.toISOString() || null,
        course_id: data.course_id,
        student_id: data.student_id || null,
        task_type: data.task_type,
        priority: data.priority,
        created_by_user_id: user.id,
        is_active: true,
        next_generation_at: nextDate || data.start_date.toISOString()
      });

      if (error) throw error;

      toast.success('Recorrência criada com sucesso!');
      form.reset();
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error('Error creating recurrence:', error);
      toast.error('Erro ao criar recorrência. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      form.reset();
      setCourses([]);
      setStudents([]);
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Pendência Recorrente</DialogTitle>
          <DialogDescription>
            Configure uma pendência que será gerada automaticamente de forma recorrente.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Título *</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: Verificar engajamento semanal" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="pattern"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Padrão de Recorrência *</FormLabel>
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
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="start_date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Data de Início *</FormLabel>
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
                              <span>Selecione</span>
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
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="end_date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Data de Término</FormLabel>
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
                              <span>Opcional</span>
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
                        />
                      </PopoverContent>
                    </Popover>
                    <FormDescription className="text-xs">
                      Deixe vazio para recorrência indefinida
                    </FormDescription>
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="course_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Curso *</FormLabel>
                  <Select 
                    onValueChange={field.onChange} 
                    value={field.value}
                    disabled={isLoadingCourses}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={isLoadingCourses ? "Carregando..." : "Selecione o curso"} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {courses.map((course) => (
                        <SelectItem key={course.id} value={course.id}>
                          {course.short_name}
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
              name="student_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Aluno (Opcional)</FormLabel>
                  <Select 
                    onValueChange={field.onChange} 
                    value={field.value}
                    disabled={!selectedCourseId || isLoadingStudents}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={
                          !selectedCourseId 
                            ? "Selecione um curso primeiro" 
                            : isLoadingStudents 
                              ? "Carregando..." 
                              : "Turma inteira (não selecione aluno)"
                        } />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {students.map((student) => (
                        <SelectItem key={student.id} value={student.id}>
                          {student.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription className="text-xs">
                    Deixe vazio para criar pendências para toda a turma
                  </FormDescription>
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
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Detalhes sobre a pendência recorrente..."
                      className="resize-none"
                      rows={3}
                      {...field} 
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
                Criar Recorrência
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
