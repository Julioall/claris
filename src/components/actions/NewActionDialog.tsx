import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarIcon, Loader2, Search, Check, ChevronsUpDown } from 'lucide-react';
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
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { ActionType } from '@/types';
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

const formSchema = z.object({
  action_type: z.enum(['contato', 'orientacao', 'cobranca', 'suporte_tecnico', 'reuniao', 'outro'], {
    required_error: 'Selecione o tipo de ação',
  }),
  description: z.string()
    .min(5, 'A descrição deve ter pelo menos 5 caracteres')
    .max(500, 'A descrição deve ter no máximo 500 caracteres'),
  student_id: z.string().optional(),
  course_id: z.string({
    required_error: 'Selecione um curso',
  }),
  scheduled_date: z.date().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface Student {
  id: string;
  full_name: string;
}

interface Course {
  id: string;
  name: string;
}

interface NewActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  students: Student[];
  courses: Course[];
  onSuccess?: () => void;
}

export function NewActionDialog({ 
  open, 
  onOpenChange, 
  onSuccess 
}: Omit<NewActionDialogProps, 'students' | 'courses'>) {
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoadingCourses, setIsLoadingCourses] = useState(false);
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);
  const [courseOpen, setCourseOpen] = useState(false);
  const [studentOpen, setStudentOpen] = useState(false);
  const [courseSearch, setCourseSearch] = useState('');
  const [studentSearch, setStudentSearch] = useState('');

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      description: '',
    },
  });

  const selectedCourseId = form.watch('course_id');

  // Fetch user's active courses
  const fetchCourses = async (search: string) => {
    if (!user) return;
    
    setIsLoadingCourses(true);
    try {
      let query = supabase
        .from('user_courses')
        .select(`
          course_id,
          courses!inner (
            id,
            name,
            end_date
          )
        `)
        .eq('user_id', user.id);

      const { data, error } = await query;
      
      if (error) throw error;

      // Filter active courses (end_date is null or in the future) and by search
      const now = new Date();
      const activeCourses = data
        ?.map(uc => uc.courses)
        .filter((c): c is { id: string; name: string; end_date: string | null } => {
          if (!c) return false;
          const isActive = !c.end_date || new Date(c.end_date) > now;
          const matchesSearch = !search || c.name.toLowerCase().includes(search.toLowerCase());
          return isActive && matchesSearch;
        })
        .map(c => ({ id: c.id, name: c.name })) || [];

      setCourses(activeCourses);
    } catch (err) {
      console.error('Error fetching courses:', err);
    } finally {
      setIsLoadingCourses(false);
    }
  };

  // Fetch students for selected course
  const fetchStudents = async (courseId: string, search: string) => {
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
        .filter((s): s is { id: string; full_name: string } => {
          if (!s) return false;
          const matchesSearch = !search || s.full_name.toLowerCase().includes(search.toLowerCase());
          return matchesSearch;
        })
        .map(s => ({ id: s.id, full_name: s.full_name })) || [];

      setStudents(courseStudents);
    } catch (err) {
      console.error('Error fetching students:', err);
    } finally {
      setIsLoadingStudents(false);
    }
  };

  // Load courses when dialog opens or search changes
  useEffect(() => {
    if (open) {
      fetchCourses(courseSearch);
    }
  }, [open, courseSearch, user]);

  // Load students when course changes or search changes
  useEffect(() => {
    if (selectedCourseId) {
      fetchStudents(selectedCourseId, studentSearch);
    } else {
      setStudents([]);
    }
  }, [selectedCourseId, studentSearch]);

  // Reset student when course changes
  useEffect(() => {
    form.setValue('student_id', undefined);
    setStudentSearch('');
  }, [selectedCourseId]);

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true);
    try {
      if (!user) {
        toast.error('Você precisa estar logado para criar uma ação');
        return;
      }

      // If no student selected, create actions for all students in the course
      if (!data.student_id) {
        const { data: courseStudents, error: studentsError } = await supabase
          .from('student_courses')
          .select('student_id')
          .eq('course_id', data.course_id);

        if (studentsError) throw studentsError;

        if (!courseStudents || courseStudents.length === 0) {
          toast.error('Nenhum aluno encontrado neste curso');
          return;
        }

        // Create action for each student
        const actions = courseStudents.map(sc => ({
          action_type: data.action_type,
          description: data.description.trim(),
          student_id: sc.student_id,
          course_id: data.course_id,
          user_id: user.id,
          scheduled_date: data.scheduled_date?.toISOString() || null,
          status: 'planejada' as const,
        }));

        const { error } = await supabase.from('actions').insert(actions);
        if (error) throw error;

        toast.success(`${actions.length} ações criadas com sucesso!`);
      } else {
        // Create single action for selected student
        const { error } = await supabase.from('actions').insert({
          action_type: data.action_type,
          description: data.description.trim(),
          student_id: data.student_id,
          course_id: data.course_id,
          user_id: user.id,
          scheduled_date: data.scheduled_date?.toISOString() || null,
          status: 'planejada',
        });

        if (error) throw error;
        toast.success('Ação criada com sucesso!');
      }

      form.reset();
      setCourseSearch('');
      setStudentSearch('');
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error('Error creating action:', error);
      toast.error('Erro ao criar ação. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      form.reset();
      setCourseSearch('');
      setStudentSearch('');
      setCourses([]);
      setStudents([]);
    }
    onOpenChange(open);
  };

  const selectedCourse = courses.find(c => c.id === selectedCourseId);
  const selectedStudentId = form.watch('student_id');
  const selectedStudent = students.find(s => s.id === selectedStudentId);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Nova Ação</DialogTitle>
          <DialogDescription>
            Registre uma nova ação para acompanhamento de aluno.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="action_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de ação *</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o tipo" />
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
              name="course_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Curso *</FormLabel>
                  <Popover open={courseOpen} onOpenChange={setCourseOpen}>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={courseOpen}
                          className={cn(
                            "w-full justify-between",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          {selectedCourse?.name || "Buscar curso..."}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-[400px] p-0" align="start">
                      <Command shouldFilter={false}>
                        <CommandInput 
                          placeholder="Buscar curso..." 
                          value={courseSearch}
                          onValueChange={setCourseSearch}
                        />
                        <CommandList>
                          {isLoadingCourses ? (
                            <div className="flex items-center justify-center py-6">
                              <Loader2 className="h-4 w-4 animate-spin" />
                            </div>
                          ) : courses.length === 0 ? (
                            <CommandEmpty>Nenhum curso encontrado.</CommandEmpty>
                          ) : (
                            <CommandGroup>
                              {courses.map((course) => (
                                <CommandItem
                                  key={course.id}
                                  value={course.id}
                                  onSelect={() => {
                                    field.onChange(course.id);
                                    setCourseOpen(false);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      field.value === course.id ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  {course.name}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          )}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <FormDescription>
                    Selecione um dos seus cursos ativos
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="student_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Aluno (opcional)</FormLabel>
                  <Popover open={studentOpen} onOpenChange={setStudentOpen}>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={studentOpen}
                          disabled={!selectedCourseId}
                          className={cn(
                            "w-full justify-between",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          {selectedStudent?.full_name || (selectedCourseId ? "Buscar aluno..." : "Selecione um curso primeiro")}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-[400px] p-0" align="start">
                      <Command shouldFilter={false}>
                        <CommandInput 
                          placeholder="Buscar aluno..." 
                          value={studentSearch}
                          onValueChange={setStudentSearch}
                        />
                        <CommandList>
                          {isLoadingStudents ? (
                            <div className="flex items-center justify-center py-6">
                              <Loader2 className="h-4 w-4 animate-spin" />
                            </div>
                          ) : students.length === 0 ? (
                            <CommandEmpty>Nenhum aluno encontrado.</CommandEmpty>
                          ) : (
                            <CommandGroup>
                              {students.map((student) => (
                                <CommandItem
                                  key={student.id}
                                  value={student.id}
                                  onSelect={() => {
                                    field.onChange(student.id);
                                    setStudentOpen(false);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      field.value === student.id ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  {student.full_name}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          )}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <FormDescription>
                    {selectedCourseId 
                      ? `${students.length} aluno(s) no curso. Deixe vazio para aplicar a todos.`
                      : "Selecione um curso primeiro"
                    }
                  </FormDescription>
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
                      placeholder="Descreva a ação a ser realizada..."
                      className="resize-none"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    {field.value?.length || 0}/500 caracteres
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="scheduled_date"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Data agendada (opcional)</FormLabel>
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
                            format(field.value, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
                          ) : (
                            <span>Selecione uma data</span>
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
                        disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                        initialFocus
                        locale={ptBR}
                      />
                    </PopoverContent>
                  </Popover>
                  <FormDescription>
                    Agende para uma data futura
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleClose(false)}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Criar ação
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
