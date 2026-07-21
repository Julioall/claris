import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarCheck2, Plus } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import {
  getCourseAttendanceOverview,
  getCourseAttendanceSheet,
  saveCourseAttendance,
} from '@/features/courses/api/course-attendance';
import type {
  AttendanceStatusDto,
  CourseAttendanceOverviewDto,
} from '@/features/courses/api/contracts/course-attendance.contract';
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
type AttendanceStatus = AttendanceStatusDto;
type AttendanceDateSummary = CourseAttendanceOverviewDto['dateSummaries'][number];
type AttendanceRecord = CourseAttendanceOverviewDto['records'][number];
type StudentOption = CourseAttendanceOverviewDto['students'][number];

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
  canManage: boolean;
  courseId: string;
}

export function CourseAttendanceTab({ canManage, courseId }: CourseAttendanceTabProps) {
  const [dateSummaries, setDateSummaries] = useState<AttendanceDateSummary[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [hasMoreRecords, setHasMoreRecords] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSheetLoading, setIsSheetLoading] = useState(false);
  const [sheetLoadFailed, setSheetLoadFailed] = useState(false);
  const [loadedSheetDate, setLoadedSheetDate] = useState<string | null>(null);

  const [selectedDate, setSelectedDate] = useState(getLocalToday());
  const [statusByStudentId, setStatusByStudentId] = useState<Record<string, AttendanceStatus | undefined>>({});
  const [notesByStudentId, setNotesByStudentId] = useState<Record<string, string>>({});

  const fetchOverview = useCallback(async (signal?: AbortSignal) => {
    const overview = await getCourseAttendanceOverview(courseId, signal);
    if (signal?.aborted) return;
    setDateSummaries(overview.dateSummaries);
    setRecords(overview.records);
    setStudents(overview.students);
    setHasMoreRecords(overview.metadata.hasMore);
  }, [courseId]);

  const loadData = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    try {
      await fetchOverview(signal);
    } catch (err) {
      if (signal?.aborted) return;
      console.error('Error loading attendance tab data:', err);
      toast({
        title: 'Erro ao carregar presenças',
        description: 'Não foi possível carregar os registros de presença deste curso.',
        variant: 'destructive',
      });
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, [fetchOverview]);

  useEffect(() => {
    const controller = new AbortController();
    loadData(controller.signal);
    return () => controller.abort();
  }, [loadData]);

  useEffect(() => {
    if (!isDialogOpen) {
      setIsSheetLoading(false);
      setSheetLoadFailed(false);
      setLoadedSheetDate(null);
      return undefined;
    }

    const controller = new AbortController();
    const requestedDate = selectedDate;

    setIsSheetLoading(true);
    setSheetLoadFailed(false);
    setLoadedSheetDate(null);
    setStatusByStudentId({});
    setNotesByStudentId({});

    getCourseAttendanceSheet(courseId, requestedDate, controller.signal)
      .then((sheet) => {
        if (controller.signal.aborted) return;
        if (sheet.courseId !== courseId || sheet.date !== requestedDate) {
          throw new Error('Attendance sheet does not match the requested date');
        }

        const nextStatus: Record<string, AttendanceStatus | undefined> = {};
        const nextNotes: Record<string, string> = {};

        for (const entry of sheet.entries) {
          if (nextStatus[entry.studentId]) continue;
          nextStatus[entry.studentId] = entry.status;
          nextNotes[entry.studentId] = entry.notes || '';
        }

        setStatusByStudentId(nextStatus);
        setNotesByStudentId(nextNotes);
        setLoadedSheetDate(requestedDate);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error('Error loading date records:', err);
        setSheetLoadFailed(true);
        toast({
          title: 'Erro ao carregar a chamada',
          description: 'Não foi possível carregar os registros desta data.',
          variant: 'destructive',
        });
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsSheetLoading(false);
      });

    return () => controller.abort();
  }, [courseId, isDialogOpen, selectedDate]);

  const groupedByDate = useMemo(() => {
    return [...dateSummaries].sort((left, right) => right.date.localeCompare(left.date));
  }, [dateSummaries]);

  const isSheetReady = !isSheetLoading
    && !sheetLoadFailed
    && loadedSheetDate === selectedDate;

  const saveAttendance = async () => {
    if (!isSheetReady) {
      toast({
        title: 'Aguarde o carregamento da chamada',
        description: 'Os registros da data selecionada ainda não estão prontos para edição.',
      });
      return;
    }

    const attendanceDate = selectedDate;
    const payload = students
      .filter((student) => statusByStudentId[student.id])
      .map((student) => ({
        studentId: student.id,
        status: statusByStudentId[student.id] as AttendanceStatusDto,
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
      await saveCourseAttendance({
        courseId,
        date: attendanceDate,
        entries: payload,
      });

      toast({
        title: 'Presenças salvas',
        description: `${payload.length} registros atualizados para ${attendanceDate}.`,
      });

      await fetchOverview();
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

            {canManage && (
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
                        <label className="text-sm font-medium" htmlFor={`attendance-date-${courseId}`}>
                          Data da chamada
                        </label>
                        <Input
                          disabled={isSaving}
                          id={`attendance-date-${courseId}`}
                          type="date"
                          value={selectedDate}
                          onChange={(e) => setSelectedDate(e.target.value)}
                        />
                      </div>
                    </div>

                    {sheetLoadFailed ? (
                      <div className="py-8 text-center text-sm text-destructive">
                        Não foi possível carregar a chamada desta data.
                      </div>
                    ) : !isSheetReady ? (
                      <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                        <Spinner className="h-4 w-4" />
                        Carregando chamada...
                      </div>
                    ) : students.length === 0 ? (
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
                                    <p className="font-medium">{student.name}</p>
                                    {student.email ? (
                                      <p className="text-xs text-muted-foreground">{student.email}</p>
                                    ) : null}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Select
                                    disabled={isSaving}
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
                                    disabled={isSaving}
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
                    <Button onClick={saveAttendance} disabled={isSaving || !isSheetReady} className="w-full sm:w-auto">
                      {isSaving ? <Spinner className="h-4 w-4 mr-2" onAccent /> : null}
                      Salvar
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
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
                    <p className="text-xs text-muted-foreground">{item.total} registro(s)</p>
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <Badge variant={STATUS_BADGE_VARIANT.presente}>{STATUS_LABELS.presente}: {item.presente}</Badge>
                    <Badge variant={STATUS_BADGE_VARIANT.ausente}>{STATUS_LABELS.ausente}: {item.ausente}</Badge>
                    <Badge variant={STATUS_BADGE_VARIANT.justificado}>{STATUS_LABELS.justificado}: {item.justificado}</Badge>
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
          <CardDescription>
            {hasMoreRecords ? 'Últimos 120 lançamentos realizados' : 'Últimos lançamentos realizados'}
          </CardDescription>
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
                    <TableCell>{format(new Date(`${record.date}T00:00:00`), 'dd/MM/yyyy', { locale: ptBR })}</TableCell>
                    <TableCell>{record.student.name}</TableCell>
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
