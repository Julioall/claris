import React, { useState, useEffect } from 'react';
import { useRef } from 'react';
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
import { Input } from '@/components/ui/input';
import { ActionType } from '@/types';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

 export interface ActionToEdit {
   id: string;
   action_type: ActionType;
   description: string;
   student_id: string;
   course_id: string | null;
   scheduled_date: string | null;
   student?: { full_name: string };
   course?: { short_name: string | null };
 }
 
const actionTypeOptions: { value: ActionType; label: string }[] = [
 ];
 
 interface ActionTypeOption {
   value: string;
   label: string;
 }
 
 const DEFAULT_ACTION_TYPES: ActionTypeOption[] = [
   { value: 'contato', label: 'Contato' },
   { value: 'orientacao', label: 'Orientação' },
   { value: 'cobranca', label: 'Cobrança' },
   { value: 'suporte_tecnico', label: 'Suporte Técnico' },
   { value: 'reuniao', label: 'Reunião' },
   { value: 'outro', label: 'Outro' },
];

const formSchema = z.object({
   action_type: z.string().min(1, 'Selecione o tipo de ação'),
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
  short_name: string;
}

interface NewActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
   actionToEdit?: ActionToEdit | null;
  onSuccess?: () => void;
}

export function NewActionDialog({ 
  open, 
  onOpenChange, 
   actionToEdit,
  onSuccess 
 }: NewActionDialogProps) {
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoadingCourses, setIsLoadingCourses] = useState(false);
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);
  const [courseSearch, setCourseSearch] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [showCourseSuggestions, setShowCourseSuggestions] = useState(false);
  const [showStudentSuggestions, setShowStudentSuggestions] = useState(false);
   const [actionTypes, setActionTypes] = useState<ActionTypeOption[]>(DEFAULT_ACTION_TYPES);
   const [isLoadingTypes, setIsLoadingTypes] = useState(false);
  const courseInputRef = useRef<HTMLInputElement>(null);
  const studentInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      description: '',
    },
  });

  const selectedCourseId = form.watch('course_id');
   const isEditMode = !!actionToEdit;
 
   // Fetch action types from database
   const fetchActionTypes = async () => {
     if (!user) return;
     
     setIsLoadingTypes(true);
     try {
       const { data, error } = await supabase
         .from('action_types')
         .select('name, label')
         .eq('user_id', user.id)
         .order('created_at', { ascending: true });
 
       if (error) throw error;
 
       if (data && data.length > 0) {
         setActionTypes(data.map(t => ({ value: t.name, label: t.label })));
       }
     } catch (err) {
       console.error('Error fetching action types:', err);
       // Keep default types on error
     } finally {
       setIsLoadingTypes(false);
     }
   };
 
   // Load action types when dialog opens
   useEffect(() => {
     if (open) {
       fetchActionTypes();
     }
   }, [open, user]);
 
   // Pre-fill form when editing
   useEffect(() => {
     if (open && actionToEdit) {
       form.reset({
         action_type: actionToEdit.action_type,
         description: actionToEdit.description,
         student_id: actionToEdit.student_id,
         course_id: actionToEdit.course_id || undefined,
         scheduled_date: actionToEdit.scheduled_date ? new Date(actionToEdit.scheduled_date) : undefined,
       });
       // Set search values for display
       if (actionToEdit.course?.short_name) {
         setCourseSearch('');
       }
       if (actionToEdit.student?.full_name) {
         setStudentSearch('');
       }
     }
   }, [open, actionToEdit]);

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
            short_name,
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
        .filter((c): c is { id: string; short_name: string | null; end_date: string | null } => {
          if (!c) return false;
          const isActive = !c.end_date || new Date(c.end_date) > now;
          const matchesSearch = !search || (c.short_name?.toLowerCase().includes(search.toLowerCase()) ?? false);
          return isActive && matchesSearch;
        })
        .map(c => ({ id: c.id, short_name: c.short_name || '' })) || [];

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

       if (isEditMode && actionToEdit) {
         // Update existing action
         const { error } = await supabase
           .from('actions')
           .update({
             action_type: data.action_type as ActionType,
             description: data.description.trim(),
             course_id: data.course_id,
             scheduled_date: data.scheduled_date?.toISOString() || null,
           })
           .eq('id', actionToEdit.id);
 
         if (error) throw error;
         toast.success('Ação atualizada com sucesso!');
       } else {
         // Create new action(s)
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
 
           const actions = courseStudents.map(sc => ({
             action_type: data.action_type as ActionType,
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
           const { error } = await supabase.from('actions').insert({
             action_type: data.action_type as ActionType,
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
           <DialogTitle>{isEditMode ? 'Editar Ação' : 'Nova Ação'}</DialogTitle>
          <DialogDescription>
             {isEditMode 
               ? 'Atualize os dados da ação de acompanhamento.'
               : 'Registre uma nova ação para acompanhamento de aluno.'
             }
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
                   <Select 
                     onValueChange={field.onChange} 
                     value={field.value}
                     disabled={isLoadingTypes}
                   >
                    <FormControl>
                      <SelectTrigger>
                         <SelectValue placeholder={isLoadingTypes ? "Carregando..." : "Selecione o tipo"} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                       {actionTypes.map((option) => (
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
                  <div className="relative">
                    <FormControl>
                      <Input
                        ref={courseInputRef}
                        placeholder="Digite para buscar curso..."
                        value={selectedCourse ? selectedCourse.short_name : courseSearch}
                        onChange={(e) => {
                          setCourseSearch(e.target.value);
                          if (field.value) {
                            field.onChange(undefined);
                          }
                          setShowCourseSuggestions(true);
                        }}
                        onFocus={() => setShowCourseSuggestions(true)}
                        onBlur={() => {
                          // Delay to allow click on suggestion
                          setTimeout(() => setShowCourseSuggestions(false), 200);
                        }}
                      />
                    </FormControl>
                    {showCourseSuggestions && (courseSearch || !field.value) && (
                      <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-md">
                        {isLoadingCourses ? (
                          <div className="flex items-center justify-center py-3">
                            <Loader2 className="h-4 w-4 animate-spin" />
                          </div>
                        ) : courses.length === 0 ? (
                          <div className="py-3 px-3 text-sm text-muted-foreground text-center">
                            Nenhum curso encontrado.
                          </div>
                        ) : (
                          <ul className="py-1 max-h-[200px] overflow-auto">
                            {courses.slice(0, 5).map((course) => (
                              <li
                                key={course.id}
                                className={cn(
                                  "px-3 py-2 text-sm cursor-pointer hover:bg-accent transition-colors",
                                  field.value === course.id && "bg-accent"
                                )}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  field.onChange(course.id);
                                  setCourseSearch('');
                                  setShowCourseSuggestions(false);
                                }}
                              >
                                {course.short_name}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                  <FormDescription>
                    Selecione um dos seus cursos ativos
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

             {/* Student field - readonly in edit mode */}
            <FormField
              control={form.control}
              name="student_id"
              render={({ field }) => (
                <FormItem>
                   <FormLabel>Aluno {isEditMode ? '' : '(opcional)'}</FormLabel>
                  <div className="relative">
                    <FormControl>
                      <Input
                        ref={studentInputRef}
                         placeholder={
                           isEditMode 
                             ? '' 
                             : selectedCourseId 
                               ? "Digite para buscar aluno..." 
                               : "Selecione um curso primeiro"
                         }
                         disabled={!selectedCourseId || isEditMode}
                        value={selectedStudent ? selectedStudent.full_name : studentSearch}
                        onChange={(e) => {
                           if (isEditMode) return;
                          setStudentSearch(e.target.value);
                          if (field.value) {
                            field.onChange(undefined);
                          }
                          setShowStudentSuggestions(true);
                        }}
                         onFocus={() => !isEditMode && setShowStudentSuggestions(true)}
                        onBlur={() => {
                          setTimeout(() => setShowStudentSuggestions(false), 200);
                        }}
                      />
                    </FormControl>
                     {!isEditMode && showStudentSuggestions && selectedCourseId && (studentSearch || !field.value) && (
                      <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-md">
                        {isLoadingStudents ? (
                          <div className="flex items-center justify-center py-3">
                            <Loader2 className="h-4 w-4 animate-spin" />
                          </div>
                        ) : students.length === 0 ? (
                          <div className="py-3 px-3 text-sm text-muted-foreground text-center">
                            Nenhum aluno encontrado.
                          </div>
                        ) : (
                          <ul className="py-1 max-h-[200px] overflow-auto">
                            {students.slice(0, 5).map((student) => (
                              <li
                                key={student.id}
                                className={cn(
                                  "px-3 py-2 text-sm cursor-pointer hover:bg-accent transition-colors",
                                  field.value === student.id && "bg-accent"
                                )}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  field.onChange(student.id);
                                  setStudentSearch('');
                                  setShowStudentSuggestions(false);
                                }}
                              >
                                {student.full_name}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                  <FormDescription>
                     {isEditMode
                       ? 'O aluno não pode ser alterado'
                       : selectedCourseId 
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
                 {isEditMode ? 'Atualizar ação' : 'Criar ação'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
