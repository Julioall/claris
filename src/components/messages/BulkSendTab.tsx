import { useState, useEffect, useCallback, useMemo } from 'react';
import { Send, Search, X, Users, FileText, Eye, CheckCircle2, AlertCircle } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DynamicVariableInput, resolveVariables, DYNAMIC_VARIABLES } from './DynamicVariableInput';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { buildCourseCategoryFilterOptions, parseCourseCategoryPath } from '@/lib/course-category';
import {
  buildBulkMessageVariableAvailability,
  getAvailableVariableKeys,
  getUnavailableTemplateVariables,
  resolveStudentCourseContext,
  type DynamicVariableKey,
} from '@/lib/message-template-context';
import { MESSAGE_TEMPLATE_CATEGORIES } from '@/lib/message-template-defaults';
import { ensureDefaultMessageTemplates } from '@/lib/message-template-seeding';

function useMoodleSession() {
  const auth = useAuth() as { moodleSession?: { moodleToken: string; moodleUrl: string } | null };
  return auth.moodleSession || null;
}

interface StudentCourseOption {
  course_id: string;
  course_name: string;
  category?: string;
  last_access?: string | null;
}

interface StudentOption {
  id: string;
  full_name: string;
  email?: string | null;
  moodle_user_id: string;
  current_risk_level?: string | null;
  last_access?: string | null;
  courses: StudentCourseOption[];
}

interface TemplateOption {
  id: string;
  title: string;
  content: string;
  category: string | null;
  is_favorite: boolean | null;
}

interface BulkJob {
  id: string;
  message_content: string;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  status: string;
  created_at: string;
}

interface GradeLookupValue {
  gradeFormatted?: string | null;
  gradePercentage?: number | null;
}

const variableLabels = new Map(DYNAMIC_VARIABLES.map(variable => [variable.key, variable.label]));
const categoryLabels = new Map(MESSAGE_TEMPLATE_CATEGORIES.map(category => [category.value, category.label]));
const riskLevelLabels: Record<string, string> = {
  normal: 'Normal',
  atencao: 'Atencao',
  risco: 'Risco',
  critico: 'Critico',
  inativo: 'Inativo',
};

const dateFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' });

function buildStudentCourseKey(studentId: string, courseId: string) {
  return `${studentId}:${courseId}`;
}

function getVariableLabel(key: DynamicVariableKey) {
  return variableLabels.get(key) || key;
}

function getCategoryLabel(value?: string | null) {
  if (!value) return 'Geral';
  return categoryLabels.get(value) || value;
}

function formatDateLabel(value?: string | null) {
  if (!value) return 'Sem registro';

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return 'Sem registro';

  return dateFormatter.format(parsedDate);
}

function formatRiskLevel(value?: string | null) {
  if (!value) return 'Sem classificacao';
  return riskLevelLabels[value] || value;
}

function formatGradeLabel(grade?: GradeLookupValue) {
  if (grade?.gradeFormatted) return grade.gradeFormatted;
  if (grade?.gradePercentage != null) return `${Number(grade.gradePercentage).toFixed(1)}%`;
  return 'Sem nota';
}

function buildUnavailableVariablesText(unavailableVariables: Array<{ key: DynamicVariableKey; reason?: string }>) {
  const labels = unavailableVariables.map(item => getVariableLabel(item.key)).join(', ');
  const reasons = Array.from(
    new Set(
      unavailableVariables
        .map(item => item.reason)
        .filter((reason): reason is string => Boolean(reason)),
    ),
  );

  return reasons.length > 0 ? `${labels}. ${reasons.join(' ')}` : labels;
}

export function BulkSendTab() {
  const { user } = useAuth();
  const moodleSession = useMoodleSession();
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [gradeLookup, setGradeLookup] = useState<Record<string, GradeLookupValue>>({});
  const [pendingLookup, setPendingLookup] = useState<Record<string, number>>({});
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoadingStudents, setIsLoadingStudents] = useState(true);
  const [messageContent, setMessageContent] = useState('');
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [recentJobs, setRecentJobs] = useState<BulkJob[]>([]);

  const [filterSchool, setFilterSchool] = useState<string>('todos');
  const [filterCourse, setFilterCourse] = useState<string>('todos');
  const [filterClass, setFilterClass] = useState<string>('todos');
  const [filterUC, setFilterUC] = useState<string>('todos');

  const currentFilters = useMemo(() => ({
    school: filterSchool,
    course: filterCourse,
    className: filterClass,
    uc: filterUC,
  }), [filterSchool, filterCourse, filterClass, filterUC]);

  const fetchStudents = useCallback(async () => {
    if (!user) return;

    setIsLoadingStudents(true);

    try {
      const { data: userCourses, error: userCoursesError } = await supabase
        .from('user_courses')
        .select('course_id, courses(id, name, category)')
        .eq('user_id', user.id)
        .eq('role', 'tutor');

      if (userCoursesError) throw userCoursesError;

      if (!userCourses?.length) {
        setStudents([]);
        setGradeLookup({});
        setPendingLookup({});
        return;
      }

      const courseMap = new Map<string, { id: string; name: string; category?: string }>();
      userCourses.forEach(userCourse => {
        const course = userCourse.courses as { id: string; name: string; category?: string } | null;
        if (course) {
          courseMap.set(course.id, { id: course.id, name: course.name, category: course.category });
        }
      });

      const courseIds = Array.from(courseMap.keys());

      const { data: studentCourses, error: studentCoursesError } = await supabase
        .from('student_courses')
        .select('student_id, course_id, last_access, students(id, full_name, email, moodle_user_id, current_risk_level, last_access)')
        .in('course_id', courseIds)
        .neq('enrollment_status', 'suspenso');

      if (studentCoursesError) throw studentCoursesError;

      if (!studentCourses?.length) {
        setStudents([]);
        setGradeLookup({});
        setPendingLookup({});
        return;
      }

      const studentMap = new Map<string, StudentOption>();
      studentCourses.forEach(studentCourse => {
        const student = studentCourse.students as {
          id: string;
          full_name: string;
          email?: string | null;
          moodle_user_id: string;
          current_risk_level?: string | null;
          last_access?: string | null;
        } | null;

        if (!student) return;

        if (!studentMap.has(student.id)) {
          studentMap.set(student.id, {
            id: student.id,
            full_name: student.full_name,
            email: student.email,
            moodle_user_id: student.moodle_user_id,
            current_risk_level: student.current_risk_level,
            last_access: student.last_access,
            courses: [],
          });
        }

        const course = courseMap.get(studentCourse.course_id);
        if (course) {
          studentMap.get(student.id)?.courses.push({
            course_id: course.id,
            course_name: course.name,
            category: course.category || undefined,
            last_access: studentCourse.last_access,
          });
        }
      });

      const studentIds = Array.from(new Set(studentCourses.map(studentCourse => studentCourse.student_id)));

      const [{ data: grades, error: gradesError }, { data: pendingActivities, error: pendingActivitiesError }] = await Promise.all([
        supabase
          .from('student_course_grades')
          .select('student_id, course_id, grade_formatted, grade_percentage')
          .in('course_id', courseIds)
          .in('student_id', studentIds),
        supabase
          .from('student_activities')
          .select('student_id, course_id')
          .in('course_id', courseIds)
          .in('student_id', studentIds)
          .is('completed_at', null)
          .eq('hidden', false),
      ]);

      if (gradesError) throw gradesError;
      if (pendingActivitiesError) throw pendingActivitiesError;

      const nextGradeLookup: Record<string, GradeLookupValue> = {};
      (grades || []).forEach(grade => {
        nextGradeLookup[buildStudentCourseKey(grade.student_id, grade.course_id)] = {
          gradeFormatted: grade.grade_formatted,
          gradePercentage: grade.grade_percentage,
        };
      });

      const nextPendingLookup: Record<string, number> = {};
      (pendingActivities || []).forEach(activity => {
        const key = buildStudentCourseKey(activity.student_id, activity.course_id);
        nextPendingLookup[key] = (nextPendingLookup[key] || 0) + 1;
      });

      setStudents(Array.from(studentMap.values()).sort((a, b) => a.full_name.localeCompare(b.full_name, 'pt-BR')));
      setGradeLookup(nextGradeLookup);
      setPendingLookup(nextPendingLookup);
    } catch (error) {
      console.error(error);
      setStudents([]);
      setGradeLookup({});
      setPendingLookup({});
      toast.error('Erro ao carregar alunos');
    } finally {
      setIsLoadingStudents(false);
    }
  }, [user]);

  const fetchTemplates = useCallback(async () => {
    if (!user) return;

    try {
      await ensureDefaultMessageTemplates(user.id);

      const { data, error } = await supabase
        .from('message_templates')
        .select('id, title, content, category, is_favorite')
        .eq('user_id', user.id)
        .order('is_favorite', { ascending: false })
        .order('title');

      if (error) throw error;

      setTemplates((data || []) as TemplateOption[]);
    } catch (error) {
      console.error(error);
      toast.error('Erro ao carregar modelos');
    }
  }, [user]);

  const fetchRecentJobs = useCallback(async (options?: { silent?: boolean }) => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('bulk_message_jobs')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;

      setRecentJobs((data || []) as BulkJob[]);
    } catch (error) {
      console.error(error);
      if (!options?.silent) {
        toast.error('Erro ao carregar envios recentes');
      }
    }
  }, [user]);

  useEffect(() => {
    fetchStudents();
    fetchTemplates();
    fetchRecentJobs();
  }, [fetchStudents, fetchTemplates, fetchRecentJobs]);

  const categorySources = useMemo(
    () => students.flatMap(student => student.courses.map(course => ({
      category: course.category,
      courseName: course.course_name,
    }))),
    [students],
  );

  const filterOptions = useMemo(() => {
    return buildCourseCategoryFilterOptions(categorySources, {
      school: filterSchool,
      course: filterCourse,
      className: filterClass,
    });
  }, [categorySources, filterSchool, filterCourse, filterClass]);

  useEffect(() => {
    if (filterSchool !== 'todos' && !filterOptions.schools.includes(filterSchool)) {
      setFilterSchool('todos');
      setFilterCourse('todos');
      setFilterClass('todos');
      setFilterUC('todos');
      return;
    }

    if (filterCourse !== 'todos' && !filterOptions.courses.includes(filterCourse)) {
      setFilterCourse('todos');
      setFilterClass('todos');
      setFilterUC('todos');
      return;
    }

    if (filterClass !== 'todos' && !filterOptions.classes.includes(filterClass)) {
      setFilterClass('todos');
      setFilterUC('todos');
      return;
    }

    if (filterUC !== 'todos' && !filterOptions.ucs.includes(filterUC)) {
      setFilterUC('todos');
    }
  }, [filterSchool, filterCourse, filterClass, filterUC, filterOptions]);

  const filteredStudents = useMemo(() => {
    return students.filter(student => {
      if (
        searchQuery &&
        !student.full_name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !student.email?.toLowerCase().includes(searchQuery.toLowerCase())
      ) {
        return false;
      }

      if (filterSchool !== 'todos' || filterCourse !== 'todos' || filterClass !== 'todos' || filterUC !== 'todos') {
        const matchesCourse = student.courses.some(course => {
          const parsed = parseCourseCategoryPath(course.category);
          if (filterSchool !== 'todos' && parsed.school !== filterSchool) return false;
          if (filterCourse !== 'todos' && parsed.course !== filterCourse) return false;
          if (filterClass !== 'todos' && parsed.className !== filterClass) return false;
          if (filterUC !== 'todos' && (parsed.uc || course.course_name) !== filterUC) return false;
          return true;
        });
        if (!matchesCourse) return false;
      }

      return true;
    });
  }, [students, searchQuery, filterSchool, filterCourse, filterClass, filterUC]);

  const selectedStudents = useMemo(
    () => students.filter(student => selectedStudentIds.has(student.id)),
    [selectedStudentIds, students],
  );

  const contextStudents = useMemo(
    () => (selectedStudents.length > 0 ? selectedStudents : filteredStudents),
    [filteredStudents, selectedStudents],
  );

  const variableAvailability = useMemo(
    () => buildBulkMessageVariableAvailability(contextStudents, currentFilters),
    [contextStudents, currentFilters],
  );

  const availableVariableKeys = useMemo(
    () => getAvailableVariableKeys(variableAvailability),
    [variableAvailability],
  );

  const messageUnavailableVariables = useMemo(
    () => getUnavailableTemplateVariables(messageContent, variableAvailability),
    [messageContent, variableAvailability],
  );

  const templateUnavailableVariables = useMemo(() => {
    return new Map(
      templates.map(template => [
        template.id,
        getUnavailableTemplateVariables(template.content, variableAvailability),
      ]),
    );
  }, [templates, variableAvailability]);

  const canPreviewOrSend = selectedStudents.length > 0 && messageContent.trim().length > 0 && messageUnavailableVariables.length === 0;
  const hasActiveJobs = useMemo(
    () => recentJobs.some(job => job.status === 'pending' || job.status === 'processing'),
    [recentJobs],
  );

  useEffect(() => {
    if (!user || !hasActiveJobs) return;

    const intervalId = window.setInterval(() => {
      fetchRecentJobs({ silent: true });
    }, 4000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [fetchRecentJobs, hasActiveJobs, user]);

  const toggleStudent = (id: string) => {
    setSelectedStudentIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedStudentIds(new Set(filteredStudents.map(s => s.id)));
  };

  const clearAll = () => setSelectedStudentIds(new Set());

  const handleSchoolChange = (value: string) => {
    setFilterSchool(value);
    setFilterCourse('todos');
    setFilterClass('todos');
    setFilterUC('todos');
  };

  const handleCourseChange = (value: string) => {
    setFilterCourse(value);
    setFilterClass('todos');
    setFilterUC('todos');
  };

  const handleClassChange = (value: string) => {
    setFilterClass(value);
    setFilterUC('todos');
  };

  const validateMessageContext = useCallback((content: string, sourceLabel: string) => {
    const unavailableVariables = getUnavailableTemplateVariables(content, variableAvailability);

    if (unavailableVariables.length === 0) return true;

    toast.error(`${sourceLabel} usa variaveis indisponiveis neste contexto: ${buildUnavailableVariablesText(unavailableVariables)}`);
    return false;
  }, [variableAvailability]);

  const buildStudentVariableData = useCallback((student: StudentOption) => {
    const resolvedContext = resolveStudentCourseContext(student, currentFilters);
    const selectedCourse = resolvedContext.selectedCourse;
    const courseLookupKey = selectedCourse
      ? buildStudentCourseKey(student.id, selectedCourse.course_id)
      : null;

    return {
      nome_aluno: student.full_name,
      email_aluno: student.email || 'Sem email',
      ultimo_acesso: formatDateLabel(selectedCourse?.last_access || student.last_access),
      nivel_risco: formatRiskLevel(student.current_risk_level),
      nota_media: formatGradeLabel(courseLookupKey ? gradeLookup[courseLookupKey] : undefined),
      atividades_pendentes: String(courseLookupKey ? (pendingLookup[courseLookupKey] || 0) : 0),
      unidade_curricular: resolvedContext.unidadeCurricular || 'N/A',
      turma: resolvedContext.className || 'N/A',
      curso: resolvedContext.course || 'N/A',
      escola: resolvedContext.school || 'N/A',
      nome_tutor: user?.full_name || 'Tutor',
    };
  }, [currentFilters, gradeLookup, pendingLookup, user]);

  const applyTemplate = (template: TemplateOption) => {
    const unavailableVariables = templateUnavailableVariables.get(template.id) || [];

    if (unavailableVariables.length > 0) {
      toast.error(`O modelo "${template.title}" nao pode ser usado neste contexto: ${buildUnavailableVariablesText(unavailableVariables)}`);
      return;
    }

    setMessageContent(template.content);
    setTemplateDialogOpen(false);
    toast.success(`Modelo "${template.title}" aplicado`);
  };

  const previewStudent = useMemo(() => {
    return selectedStudents[0];
  }, [selectedStudents]);

  const previewMessage = useMemo(() => {
    if (!previewStudent || !messageContent) return '';
    return resolveVariables(messageContent, buildStudentVariableData(previewStudent));
  }, [buildStudentVariableData, messageContent, previewStudent]);

  const handlePreview = () => {
    if (!validateMessageContext(messageContent, 'A mensagem')) return;
    setPreviewDialogOpen(true);
  };

  const handleSend = useCallback(async () => {
    if (!user || !moodleSession || selectedStudents.length === 0 || !messageContent.trim()) return;
    if (!validateMessageContext(messageContent, 'A mensagem')) return;

    setIsSending(true);

    try {
      const { data: job, error: jobErr } = await supabase
        .from('bulk_message_jobs')
        .insert({
          user_id: user.id,
          message_content: messageContent.trim(),
          total_recipients: selectedStudents.length,
          status: 'pending',
        })
        .select('id')
        .single();

      if (jobErr || !job) throw jobErr || new Error('Falha ao criar job');

      const recipients = selectedStudents.map(student => ({
          job_id: job.id,
          student_id: student.id,
          moodle_user_id: student.moodle_user_id,
          student_name: student.full_name,
          personalized_message: resolveVariables(messageContent, buildStudentVariableData(student)),
          status: 'pending' as const,
        }));

      const { error: recipErr } = await supabase.from('bulk_message_recipients').insert(recipients);
      if (recipErr) throw recipErr;

      const { error: invokeErr } = await supabase.functions.invoke('bulk-message-send', {
        body: { job_id: job.id, moodleUrl: moodleSession.moodleUrl, token: moodleSession.moodleToken },
      });
      if (invokeErr) throw invokeErr;

      toast.success(`Envio em massa iniciado para ${selectedStudents.length} alunos`);
      setSelectedStudentIds(new Set());
      setMessageContent('');
      fetchRecentJobs();
    } catch (err) {
      console.error(err);
      toast.error('Erro ao iniciar envio em massa');
    } finally {
      setIsSending(false);
    }
  }, [buildStudentVariableData, fetchRecentJobs, messageContent, moodleSession, selectedStudents, user, validateMessageContext]);

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
      pending: { label: 'Na fila', variant: 'outline' },
      processing: { label: 'Enviando...', variant: 'default' },
      completed: { label: 'Concluido', variant: 'secondary' },
      failed: { label: 'Falhou', variant: 'destructive' },
      cancelled: { label: 'Cancelado', variant: 'outline' },
    };
    const m = map[status] || { label: status, variant: 'outline' as const };
    return <Badge variant={m.variant}>{m.label}</Badge>;
  };

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0">
        <Card className="flex flex-col min-h-0">
          <CardHeader className="pb-3 shrink-0">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Destinatarios
                {selectedStudents.length > 0 && (
                  <Badge variant="default" className="text-[10px]">{selectedStudents.length}</Badge>
                )}
              </span>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className="text-xs h-7" onClick={selectAll}>
                  Todos ({filteredStudents.length})
                </Button>
                {selectedStudents.length > 0 && (
                  <Button variant="ghost" size="sm" className="text-xs h-7" onClick={clearAll}>
                    Limpar
                  </Button>
                )}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col gap-3 min-h-0 pt-0">
            {/* Filters */}
            <div className="grid grid-cols-2 gap-2 shrink-0">
              <Select value={filterSchool} onValueChange={handleSchoolChange}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Escola" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas escolas</SelectItem>
                  {filterOptions.schools.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterCourse} onValueChange={handleCourseChange}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Curso" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos cursos</SelectItem>
                  {filterOptions.courses.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterClass} onValueChange={handleClassChange}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Turma" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas turmas</SelectItem>
                  {filterOptions.classes.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterUC} onValueChange={setFilterUC}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="UC" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas UCs</SelectItem>
                  {filterOptions.ucs.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Search */}
            <div className="relative shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Buscar aluno..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9 h-8 text-xs"
              />
            </div>

            {/* Selected tags */}
            {selectedStudents.length > 0 && (
              <div className="flex flex-wrap gap-1 shrink-0 max-h-20 overflow-y-auto">
                {selectedStudents.slice(0, 20).map(student => (
                  <Badge key={student.id} variant="secondary" className="text-[10px] pr-1 gap-1">
                    {student.full_name}
                    <button type="button" onClick={() => toggleStudent(student.id)} className="ml-0.5 hover:text-destructive">
                        <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                {selectedStudents.length > 20 && (
                  <Badge variant="outline" className="text-[10px]">
                    +{selectedStudents.length - 20} mais
                  </Badge>
                )}
              </div>
            )}

            {/* Student list */}
            <ScrollArea className="flex-1 min-h-0">
              {isLoadingStudents ? (
                <div className="flex items-center justify-center py-8">
                  <Spinner className="h-5 w-5" />
                </div>
              ) : (
                <div className="space-y-0.5">
                  {filteredStudents.map(s => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggleStudent(s.id)}
                      className={cn(
                        'w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-3 transition-colors hover:bg-muted/50',
                        selectedStudentIds.has(s.id) && 'bg-primary/10'
                      )}
                    >
                      <div className={cn(
                        'h-4 w-4 rounded border flex items-center justify-center shrink-0',
                        selectedStudentIds.has(s.id) ? 'bg-primary border-primary' : 'border-input'
                      )}>
                        {selectedStudentIds.has(s.id) && <CheckCircle2 className="h-3 w-3 text-primary-foreground" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm truncate">{s.full_name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {s.courses.map(c => c.course_name).join(', ')}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4 min-h-0">
          <Card className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <CardHeader className="pb-3 shrink-0">
              <CardTitle className="text-sm flex items-center justify-between">
                <span>Mensagem</span>
                <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => { fetchTemplates(); setTemplateDialogOpen(true); }}>
                  <FileText className="h-3.5 w-3.5 mr-1" />
                  Usar modelo
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col gap-3 pt-0 min-h-0 overflow-hidden">
              <DynamicVariableInput
                value={messageContent}
                onChange={setMessageContent}
                rows={10}
                className="min-h-[18rem] resize-none"
                availableVariableKeys={availableVariableKeys}
                showInlinePreview={false}
              />

              {messageUnavailableVariables.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <p className="font-medium">Este conteudo precisa de um contexto mais especifico para ser enviado.</p>
                  <div className="mt-2 space-y-1">
                    {messageUnavailableVariables.map(item => (
                      <p key={item.key}>
                        <span className="font-medium">{getVariableLabel(item.key)}:</span> {item.reason}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Action buttons */}
          <div className="flex items-center justify-between gap-3 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePreview}
              disabled={!canPreviewOrSend}
            >
              <Eye className="h-4 w-4 mr-1" />
              Pre-visualizar
            </Button>
            <Button
              onClick={handleSend}
              disabled={isSending || !canPreviewOrSend}
            >
              {isSending ? <Spinner className="h-4 w-4 mr-1" onAccent /> : <Send className="h-4 w-4 mr-1" />}
              Enviar para {selectedStudents.length} aluno{selectedStudents.length !== 1 ? 's' : ''}
            </Button>
          </div>

          {selectedStudents.length > 0 && filterUC === 'todos' && (
            <p className="text-[11px] text-muted-foreground">
              Selecione uma UC especifica para liberar variaveis como Unidade Curricular, Nota Media e Atividades Pendentes.
            </p>
          )}

          {/* Recent jobs */}
          {recentJobs.length > 0 && (
            <Card className="shrink-0">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-muted-foreground">Envios recentes</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                {recentJobs.map(job => (
                  <div key={job.id} className="flex items-center justify-between text-xs border rounded-md px-3 py-2">
                    <div className="flex items-center gap-2">
                      {getStatusBadge(job.status)}
                      <span className="text-muted-foreground">
                        {job.sent_count}/{job.total_recipients} enviados
                      </span>
                    </div>
                    {job.status === 'processing' && (
                      <Progress
                        value={(job.sent_count / job.total_recipients) * 100}
                        className="w-20 h-1.5"
                      />
                    )}
                    {job.failed_count > 0 && (
                      <span className="text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {job.failed_count} falhas
                      </span>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Escolher Modelo</DialogTitle>
            <DialogDescription>
              Selecione um modelo compativel com os filtros atuais de destinatarios.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-80">
            {templates.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhum modelo criado. Crie um na aba "Modelos".
              </p>
            ) : (
              <div className="space-y-2">
                {templates.map(template => {
                  const unavailableVariables = templateUnavailableVariables.get(template.id) || [];
                  const disabled = unavailableVariables.length > 0;

                  return (
                    <button
                      key={template.id}
                      type="button"
                      disabled={disabled}
                      className={cn(
                        'w-full text-left p-3 rounded-lg border transition-colors',
                        disabled
                          ? 'cursor-not-allowed border-dashed opacity-70'
                          : 'hover:bg-muted/50',
                      )}
                      onClick={() => applyTemplate(template)}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-sm">{template.title}</p>
                        <Badge variant="outline" className="text-[10px]">
                          {getCategoryLabel(template.category)}
                        </Badge>
                        {template.is_favorite && (
                          <Badge variant="secondary" className="text-[10px]">
                            ★
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{template.content}</p>
                      {disabled && (
                        <p className="mt-2 text-[11px] text-amber-700">
                          {buildUnavailableVariablesText(unavailableVariables)}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pre-visualizacao da Mensagem</DialogTitle>
            <DialogDescription>
              Confira como a mensagem personalizada sera enviada para o primeiro destinatario selecionado.
            </DialogDescription>
          </DialogHeader>
          {previewStudent && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary">
                  {previewStudent.full_name.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-medium">{previewStudent.full_name}</p>
                  <p className="text-xs text-muted-foreground">Exemplo de como a mensagem sera enviada</p>
                </div>
              </div>
              <div className="rounded-lg bg-muted p-4">
                <p className="text-sm whitespace-pre-wrap">{previewMessage}</p>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Variaveis dependentes de UC ficam disponiveis somente quando uma Unidade Curricular especifica esta selecionada.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewDialogOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
