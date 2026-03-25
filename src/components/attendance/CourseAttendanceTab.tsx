import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CalendarCheck2, Plus } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { useAuth } from '@/contexts/AuthContext';
import { fetchAttendanceRecords, fetchStudentCourses } from '@/features/courses/api';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const STATUS_NONE = '__none';
type AttendanceStatus = 'presente' | 'ausente' | 'justificado';

interface AttendanceRecord {
  id: string;
  attendance_date: string;
  status: AttendanceStatus;
  notes: string | null;
  student: {
    id: string;
    full_name: string;
  } | null;
}

interface StudentOption {
  id: string;
  full_name: string;
  email: string | null;
}

const STATUS_LABELS: Record<AttendanceStatus, string> = {
  presente: 'Presente',
  ausente: 'Ausente',
  justificado: 'Justificado',
};

const STATUS_BADGE_VARIANT: Record<AttendanceStatus, 'default' | 'secondary' | 'outline'> = {
  presente: 'default',
  ausente: 'secondary',
  justificado: 'outline',
};

const getLocalToday = () => {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
};

interface CourseAttendanceTabProps {
  courseId: string;
}

export function CourseAttendanceTab({ courseId }: CourseAttendanceTabProps) {
  const { user } = useAuth();

  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const [selectedDate, setSelectedDate] = useState(getLocalToday());
  const [statusByStudentId, setStatusByStudentId] = useState<Record<string, AttendanceStatus | undefined>>({});
  const [notesByStudentId, setNotesByStudentId] = useState<Record<string, string>>({});

  const fetchRecords = useCallback(async () => {
    if (!user) return;

    const { data, error } = await fetchAttendanceRecords(user.id, courseId);

    if (error) throw error;

    const mapped: AttendanceRecord[] = (data || []).map((row: Record<string, unknown>) => ({
      id: row.id as string,
      attendance_date: row.attendance_date as string,
      status: row.status as AttendanceStatus,
      notes: row.notes as string | undefined,
      student: row.students
        ? {
            id: (row.students as { id: string }).id,
            full_name: (row.students as { full_name: string }).full_name,
          }
        : null,
    }));

    setRecords(mapped);
  }, [courseId, user]);

  const fetchStudents = useCallback(async () => {
    const { data, error } = await fetchStudentCourses(courseId);

    if (error) throw error;

    const uniqueStudents = new Map<string, StudentOption>();

    for (const row of data || []) {
      if (!row.students) continue;
      const student = row.students as { id: string; full_name: string; email: string | null };
      if (!uniqueStudents.has(student.id)) {
        uniqueStudents.set(student.id, {
          id: student.id,
          full_name: student.full_name,
          email: student.email,
        });
      }
    }

    setStudents(Array.from(uniqueStudents.values()).sort((a, b) => a.full_name.localeCompare(b.full_name)));
  }, [courseId]);

  const loadDateRecords = useCallback(async () => {
    if (!user) return;

    const { data, error } = await (supabase as SupabaseClient)
      .from('attendance_records')
      .select('student_id, status, notes, updated_at')
      .eq('user_id', user.id)
      .eq('course_id', courseId)
      .eq('attendance_date', selectedDate)
      .order('updated_at', { ascending: false });

    if (error) throw error;

    const nextStatus: Record<string, AttendanceStatus | undefined> = {};
    const nextNotes: Record<string, string> = {};

    for (const row of data || []) {
      if (nextStatus[row.student_id]) continue;

      if (row.status === 'presente' || row.status === 'ausente' || row.status === 'justificado') {
        nextStatus[row.student_id] = row.status;
        nextNotes[row.student_id] = row.notes || '';
      }
    }

    setStatusByStudentId(nextStatus);
    setNotesByStudentId(nextNotes);
  }, [courseId, selectedDate, user]);

  const loadData = useCallback(async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      await Promise.all([fetchRecords(), fetchStudents()]);
    } catch (err) {
      console.error('Error loading attendance tab data:', err);
      toast({
        title: 'Erro ao carregar presenças',
        description: 'Não foi possível carregar os registros de presença deste curso.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [fetchRecords, fetchStudents, user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!isDialogOpen) return;
    loadDateRecords().catch((err) => {
      console.error('Error loading date records:', err);
    });
  }, [isDialogOpen, loadDateRecords]);

  const groupedByDate = useMemo(() => {
    const map = new Map<string, { presente: number; ausente: number; justificado: number; total: number }>();

    for (const record of records) {
      if (!map.has(record.attendance_date)) {
        map.set(record.attendance_date, { presente: 0, ausente: 0, justificado: 0, total: 0 });
      }

      const item = map.get(record.attendance_date)!;
      item.total += 1;
      item[record.status] += 1;
    }

    return Array.from(map.entries())
      .map(([date, stats]) => ({ date, stats }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [records]);

  const saveAttendance = async () => {
    if (!user) return;

    const payload = students
      .filter((student) => statusByStudentId[student.id])
      .map((student) => ({
        user_id: user.id,
        course_id: courseId,
        student_id: student.id,
        attendance_date: selectedDate,
        status: statusByStudentId[student.id] as AttendanceStatus,
        notes: notesByStudentId[student.id] || null,
      }));

    if (payload.length === 0) {
      toast({
        title: 'Nenhum registro para salvar',
        description: 'Selecione o status de pelo menos um aluno.',
      });
      return;
    }

    setIsSaving(true);

    try {
      const { error } = await (supabase as SupabaseClient)
        .from('attendance_records')
        .upsert(payload, { onConflict: 'user_id,course_id,student_id,attendance_date' });

      if (error) throw error;

      toast({
        title: 'Presenças salvas',
        description: `${payload.length} registros atualizados para ${selectedDate}.`,
      });

      await fetchRecords();
      setIsDialogOpen(false);
    } catch (err) {
      console.error('Error saving attendance:', err);
      toast({
        title: 'Erro ao salvar presenças',
        description: 'Não foi possível salvar os registros da chamada.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-base">Registros de presença</CardTitle>
              <CardDescription>Histórico das chamadas desta disciplina</CardDescription>
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Nova presença
                </Button>
              </DialogTrigger>

              <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                <DialogHeader>
                  <DialogTitle>Lançar presença</DialogTitle>
                  <DialogDescription>Registre a presença dos alunos para uma data.</DialogDescription>
                </DialogHeader>

                <div className="space-y-4 overflow-y-auto pr-1">
                  <div className="grid gap-3 md:grid-cols-[220px_auto]">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Data da chamada</p>
                      <Input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                      />
                    </div>
                  </div>

                  {students.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      Nenhum aluno encontrado para este curso.
                    </div>
                  ) : (
                    <div className="border rounded-md">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Aluno</TableHead>
                            <TableHead className="w-[220px]">Status</TableHead>
                            <TableHead>Observação</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {students.map((student) => (
                            <TableRow key={student.id}>
                              <TableCell>
                                <div>
                                  <p className="font-medium">{student.full_name}</p>
                                  {student.email ? (
                                    <p className="text-xs text-muted-foreground">{student.email}</p>
                                  ) : null}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Select
                                  value={statusByStudentId[student.id] || STATUS_NONE}
                                  onValueChange={(value) => {
                                    setStatusByStudentId((prev) => ({
                                      ...prev,
                                      [student.id]: value === STATUS_NONE ? undefined : (value as AttendanceStatus),
                                    }));
                                  }}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Não informado" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value={STATUS_NONE}>Não informado</SelectItem>
                                    <SelectItem value="presente">Presente</SelectItem>
                                    <SelectItem value="ausente">Ausente</SelectItem>
                                    <SelectItem value="justificado">Justificado</SelectItem>
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell>
                                <Input
                                  placeholder="Observação (opcional)"
                                  value={notesByStudentId[student.id] || ''}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    setNotesByStudentId((prev) => ({
                                      ...prev,
                                      [student.id]: value,
                                    }));
                                  }}
                                />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="w-full sm:w-auto">
                    Cancelar
                  </Button>
                  <Button onClick={saveAttendance} disabled={isSaving} className="w-full sm:w-auto">
                    {isSaving ? <Spinner className="h-4 w-4 mr-2" onAccent /> : null}
                    Salvar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>

        <CardContent>
          {groupedByDate.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <CalendarCheck2 className="h-10 w-10 mx-auto text-muted-foreground/60" />
              <p className="font-medium">Nenhum registro de presença ainda.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {groupedByDate.map((item) => (
                <div key={item.date} className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <p className="font-medium">{format(new Date(`${item.date}T00:00:00`), 'dd/MM/yyyy', { locale: ptBR })}</p>
                    <p className="text-xs text-muted-foreground">{item.stats.total} registro(s)</p>
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <Badge variant={STATUS_BADGE_VARIANT.presente}>{STATUS_LABELS.presente}: {item.stats.presente}</Badge>
                    <Badge variant={STATUS_BADGE_VARIANT.ausente}>{STATUS_LABELS.ausente}: {item.stats.ausente}</Badge>
                    <Badge variant={STATUS_BADGE_VARIANT.justificado}>{STATUS_LABELS.justificado}: {item.stats.justificado}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Detalhes dos registros</CardTitle>
          <CardDescription>Últimos lançamentos realizados</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {records.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Sem detalhes para exibir.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Aluno</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Observação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.slice(0, 120).map((record) => (
                  <TableRow key={record.id}>
                    <TableCell>{format(new Date(`${record.attendance_date}T00:00:00`), 'dd/MM/yyyy', { locale: ptBR })}</TableCell>
                    <TableCell>{record.student?.full_name || '-'}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGE_VARIANT[record.status]}>{STATUS_LABELS[record.status]}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[360px] truncate">{record.notes || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
