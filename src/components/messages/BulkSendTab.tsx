import { useState, useEffect, useCallback, useMemo } from 'react';
import { Send, Search, X, Users, Loader2, ChevronRight, FileText, Eye, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
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

interface StudentOption {
  id: string;
  full_name: string;
  email?: string;
  moodle_user_id: string;
  current_risk_level?: string;
  courses: Array<{ course_id: string; course_name: string; category?: string }>;
}

interface TemplateOption {
  id: string;
  title: string;
  content: string;
  category: string;
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

// Parse "Escola / Curso / Turma / UC" category
function parseCategoryPath(category?: string) {
  if (!category) return { school: '', course: '', className: '', uc: '' };
  const parts = category.split(' / ').map(p => p.trim());
  return {
    school: parts[0] || '',
    course: parts[1] || '',
    className: parts[2] || '',
    uc: parts[3] || '',
  };
}

export function BulkSendTab() {
  const { user } = useAuth();
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoadingStudents, setIsLoadingStudents] = useState(true);
  const [messageContent, setMessageContent] = useState('');
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [recentJobs, setRecentJobs] = useState<BulkJob[]>([]);

  // Filters
  const [filterSchool, setFilterSchool] = useState<string>('todos');
  const [filterCourse, setFilterCourse] = useState<string>('todos');
  const [filterClass, setFilterClass] = useState<string>('todos');
  const [filterUC, setFilterUC] = useState<string>('todos');

  // Fetch students with their courses
  const fetchStudents = useCallback(async () => {
    if (!user) return;
    setIsLoadingStudents(true);
    try {
      const { data: userCourses } = await supabase
        .from('user_courses')
        .select('course_id, courses(id, name, category)')
        .eq('user_id', user.id)
        .eq('role', 'tutor');

      if (!userCourses?.length) { setStudents([]); setIsLoadingStudents(false); return; }

      const courseMap = new Map<string, { id: string; name: string; category?: string }>();
      userCourses.forEach(uc => {
        const c = uc.courses as any;
        if (c) courseMap.set(c.id, { id: c.id, name: c.name, category: c.category });
      });

      const courseIds = Array.from(courseMap.keys());

      const { data: studentCourses } = await supabase
        .from('student_courses')
        .select('student_id, course_id, students(id, full_name, email, moodle_user_id, current_risk_level)')
        .in('course_id', courseIds)
        .neq('enrollment_status', 'suspenso');

      if (!studentCourses?.length) { setStudents([]); setIsLoadingStudents(false); return; }

      const studentMap = new Map<string, StudentOption>();
      studentCourses.forEach(sc => {
        const s = sc.students as any;
        if (!s) return;
        if (!studentMap.has(s.id)) {
          studentMap.set(s.id, {
            id: s.id,
            full_name: s.full_name,
            email: s.email,
            moodle_user_id: s.moodle_user_id,
            current_risk_level: s.current_risk_level,
            courses: [],
          });
        }
        const course = courseMap.get(sc.course_id);
        if (course) {
          studentMap.get(s.id)!.courses.push({
            course_id: course.id,
            course_name: course.name,
            category: course.category || undefined,
          });
        }
      });

      setStudents(Array.from(studentMap.values()).sort((a, b) => a.full_name.localeCompare(b.full_name)));
    } catch (err) {
      toast.error('Erro ao carregar alunos');
    } finally {
      setIsLoadingStudents(false);
    }
  }, [user]);

  // Fetch templates
  const fetchTemplates = useCallback(async () => {
    const { data } = await supabase
      .from('message_templates')
      .select('id, title, content, category')
      .order('is_favorite', { ascending: false })
      .order('title');
    setTemplates((data || []) as TemplateOption[]);
  }, []);

  // Fetch recent jobs
  const fetchRecentJobs = useCallback(async () => {
    const { data } = await supabase
      .from('bulk_message_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);
    setRecentJobs((data || []) as BulkJob[]);
  }, []);

  useEffect(() => {
    fetchStudents();
    fetchTemplates();
    fetchRecentJobs();
  }, [fetchStudents, fetchTemplates, fetchRecentJobs]);

  // Subscribe to job updates
  useEffect(() => {
    const channel = supabase
      .channel('bulk-jobs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bulk_message_jobs' }, () => {
        fetchRecentJobs();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchRecentJobs]);

  // Extract unique filter options from students' courses
  const filterOptions = useMemo(() => {
    const schools = new Set<string>();
    const courses = new Set<string>();
    const classes = new Set<string>();
    const ucs = new Set<string>();

    students.forEach(s => {
      s.courses.forEach(c => {
        const parsed = parseCategoryPath(c.category);
        if (parsed.school) schools.add(parsed.school);
        if (parsed.course) courses.add(parsed.course);
        if (parsed.className) classes.add(parsed.className);
        if (parsed.uc || c.course_name) ucs.add(parsed.uc || c.course_name);
      });
    });

    return {
      schools: Array.from(schools).sort(),
      courses: Array.from(courses).sort(),
      classes: Array.from(classes).sort(),
      ucs: Array.from(ucs).sort(),
    };
  }, [students]);

  // Filtered students
  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      // Text search
      if (searchQuery && !s.full_name.toLowerCase().includes(searchQuery.toLowerCase()) &&
          !s.email?.toLowerCase().includes(searchQuery.toLowerCase())) return false;

      // Category filters
      if (filterSchool !== 'todos' || filterCourse !== 'todos' || filterClass !== 'todos' || filterUC !== 'todos') {
        const matchesCourse = s.courses.some(c => {
          const parsed = parseCategoryPath(c.category);
          if (filterSchool !== 'todos' && parsed.school !== filterSchool) return false;
          if (filterCourse !== 'todos' && parsed.course !== filterCourse) return false;
          if (filterClass !== 'todos' && parsed.className !== filterClass) return false;
          if (filterUC !== 'todos' && (parsed.uc || c.course_name) !== filterUC) return false;
          return true;
        });
        if (!matchesCourse) return false;
      }

      return true;
    });
  }, [students, searchQuery, filterSchool, filterCourse, filterClass, filterUC]);

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

  const useTemplate = (t: TemplateOption) => {
    setMessageContent(t.content);
    setTemplateDialogOpen(false);
    toast.success(`Modelo "${t.title}" aplicado`);
  };

  // Preview: resolve for first selected student
  const previewStudent = useMemo(() => {
    const id = Array.from(selectedStudentIds)[0];
    return students.find(s => s.id === id);
  }, [selectedStudentIds, students]);

  const previewMessage = useMemo(() => {
    if (!previewStudent || !messageContent) return '';
    const course = previewStudent.courses[0];
    const parsed = parseCategoryPath(course?.category);
    return resolveVariables(messageContent, {
      nome_aluno: previewStudent.full_name,
      email_aluno: previewStudent.email,
      ultimo_acesso: 'N/A',
      nivel_risco: previewStudent.current_risk_level,
      nota_media: 'N/A',
      atividades_pendentes: 'N/A',
      unidade_curricular: parsed.uc || course?.course_name,
      turma: parsed.className,
      curso: parsed.course,
      escola: parsed.school,
      nome_tutor: user?.full_name,
    });
  }, [previewStudent, messageContent, user]);

  // Send bulk
  const handleSend = async () => {
    if (!user || selectedStudentIds.size === 0 || !messageContent.trim()) return;
    setIsSending(true);
    try {
      // Create job
      const { data: job, error: jobErr } = await supabase
        .from('bulk_message_jobs')
        .insert({
          user_id: user.id,
          message_content: messageContent.trim(),
          total_recipients: selectedStudentIds.size,
          status: 'pending' as any,
        })
        .select('id')
        .single();

      if (jobErr || !job) throw jobErr || new Error('Falha ao criar job');

      // Create recipients
      const selectedStudents = students.filter(s => selectedStudentIds.has(s.id));
      const recipients = selectedStudents.map(s => {
        const course = s.courses[0];
        const parsed = parseCategoryPath(course?.category);
        const personalized = resolveVariables(messageContent, {
          nome_aluno: s.full_name,
          email_aluno: s.email,
          ultimo_acesso: 'N/A',
          nivel_risco: s.current_risk_level,
          nota_media: 'N/A',
          atividades_pendentes: 'N/A',
          unidade_curricular: parsed.uc || course?.course_name,
          turma: parsed.className,
          curso: parsed.course,
          escola: parsed.school,
          nome_tutor: user.full_name,
        });

        return {
          job_id: job.id,
          student_id: s.id,
          moodle_user_id: s.moodle_user_id,
          student_name: s.full_name,
          personalized_message: personalized,
          status: 'pending' as any,
        };
      });

      const { error: recipErr } = await supabase.from('bulk_message_recipients').insert(recipients);
      if (recipErr) throw recipErr;

      // Trigger processing
      await supabase.functions.invoke('bulk-message-send', { body: { job_id: job.id } });

      toast.success(`Envio em massa iniciado para ${selectedStudentIds.size} alunos`);
      setSelectedStudentIds(new Set());
      setMessageContent('');
      fetchRecentJobs();
    } catch (err) {
      console.error(err);
      toast.error('Erro ao iniciar envio em massa');
    } finally {
      setIsSending(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
      pending: { label: 'Na fila', variant: 'outline' },
      processing: { label: 'Enviando...', variant: 'default' },
      completed: { label: 'Concluído', variant: 'secondary' },
      failed: { label: 'Falhou', variant: 'destructive' },
      cancelled: { label: 'Cancelado', variant: 'outline' },
    };
    const m = map[status] || { label: status, variant: 'outline' as const };
    return <Badge variant={m.variant}>{m.label}</Badge>;
  };

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0">
        {/* Left: recipient selection */}
        <Card className="flex flex-col min-h-0">
          <CardHeader className="pb-3 shrink-0">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Destinatários
                {selectedStudentIds.size > 0 && (
                  <Badge variant="default" className="text-[10px]">{selectedStudentIds.size}</Badge>
                )}
              </span>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className="text-xs h-7" onClick={selectAll}>
                  Todos ({filteredStudents.length})
                </Button>
                {selectedStudentIds.size > 0 && (
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
              <Select value={filterSchool} onValueChange={setFilterSchool}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Escola" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas escolas</SelectItem>
                  {filterOptions.schools.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterCourse} onValueChange={setFilterCourse}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Curso" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos cursos</SelectItem>
                  {filterOptions.courses.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterClass} onValueChange={setFilterClass}>
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
            {selectedStudentIds.size > 0 && (
              <div className="flex flex-wrap gap-1 shrink-0 max-h-20 overflow-y-auto">
                {Array.from(selectedStudentIds).slice(0, 20).map(id => {
                  const s = students.find(st => st.id === id);
                  return s ? (
                    <Badge key={id} variant="secondary" className="text-[10px] pr-1 gap-1">
                      {s.full_name}
                      <button onClick={() => toggleStudent(id)} className="ml-0.5 hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ) : null;
                })}
                {selectedStudentIds.size > 20 && (
                  <Badge variant="outline" className="text-[10px]">
                    +{selectedStudentIds.size - 20} mais
                  </Badge>
                )}
              </div>
            )}

            {/* Student list */}
            <ScrollArea className="flex-1 min-h-0">
              {isLoadingStudents ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-0.5">
                  {filteredStudents.map(s => (
                    <button
                      key={s.id}
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

        {/* Right: message composition */}
        <div className="flex flex-col gap-4 min-h-0">
          <Card className="flex-1 flex flex-col min-h-0">
            <CardHeader className="pb-3 shrink-0">
              <CardTitle className="text-sm flex items-center justify-between">
                <span>Mensagem</span>
                <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => { fetchTemplates(); setTemplateDialogOpen(true); }}>
                  <FileText className="h-3.5 w-3.5 mr-1" />
                  Usar modelo
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col pt-0 min-h-0">
              <DynamicVariableInput
                value={messageContent}
                onChange={setMessageContent}
                rows={10}
                className="flex-1"
              />
            </CardContent>
          </Card>

          {/* Action buttons */}
          <div className="flex items-center justify-between gap-3 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPreviewDialogOpen(true)}
              disabled={selectedStudentIds.size === 0 || !messageContent.trim()}
            >
              <Eye className="h-4 w-4 mr-1" />
              Pré-visualizar
            </Button>
            <Button
              onClick={handleSend}
              disabled={isSending || selectedStudentIds.size === 0 || !messageContent.trim()}
            >
              {isSending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
              Enviar para {selectedStudentIds.size} aluno{selectedStudentIds.size !== 1 ? 's' : ''}
            </Button>
          </div>

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

      {/* Template picker dialog */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Escolher Modelo</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-80">
            {templates.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhum modelo criado. Crie um na aba "Modelos".
              </p>
            ) : (
              <div className="space-y-2">
                {templates.map(t => (
                  <button
                    key={t.id}
                    className="w-full text-left p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                    onClick={() => useTemplate(t)}
                  >
                    <p className="font-medium text-sm">{t.title}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{t.content}</p>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Preview dialog */}
      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pré-visualização da Mensagem</DialogTitle>
          </DialogHeader>
          {previewStudent && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary">
                  {previewStudent.full_name.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-medium">{previewStudent.full_name}</p>
                  <p className="text-xs text-muted-foreground">Exemplo de como a mensagem será enviada</p>
                </div>
              </div>
              <div className="rounded-lg bg-muted p-4">
                <p className="text-sm whitespace-pre-wrap">{previewMessage}</p>
              </div>
              <p className="text-[10px] text-muted-foreground">
                * Variáveis como nota média e atividades pendentes serão calculadas no momento do envio.
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
