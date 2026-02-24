import { useMemo, useState, useEffect } from 'react';
import { FileSpreadsheet, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';

interface TutorCourse {
  id: string;
  name: string;
  short_name: string | null;
  category: string | null;
}

interface EnrollmentRow {
  student_id: string;
  course_id: string;
  students: {
    full_name: string;
  } | null;
}

interface ActivityGradeRow {
  student_id: string;
  course_id: string;
  grade: number | null;
  grade_max: number | null;
  hidden: boolean;
}

const SEM_CATEGORIA = 'Sem categoria';

export default function Reports() {
  const { user } = useAuth();
  const [isLoadingCourses, setIsLoadingCourses] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [tutorCourses, setTutorCourses] = useState<TutorCourse[]>([]);
  const [selectedReportType, setSelectedReportType] = useState('notas');
  const [selectedCourseGroup, setSelectedCourseGroup] = useState<string>('');
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);

  useEffect(() => {
    const fetchTutorCourses = async () => {
      if (!user) {
        setTutorCourses([]);
        setIsLoadingCourses(false);
        return;
      }

      setIsLoadingCourses(true);
      try {
        const { data, error } = await supabase
          .from('user_courses')
          .select(`
            course_id,
            courses!inner (
              id,
              name,
              short_name,
              category
            )
          `)
          .eq('user_id', user.id)
          .eq('role', 'tutor');

        if (error) throw error;

        const normalizedCourses = (data || [])
          .map(item => item.courses)
          .filter((course): course is NonNullable<typeof course> => Boolean(course))
          .map(course => ({
            id: course.id,
            name: course.name,
            short_name: course.short_name,
            category: course.category,
          }));

        const uniqueById = new Map<string, TutorCourse>();
        normalizedCourses.forEach(course => {
          uniqueById.set(course.id, course);
        });

        const sortedCourses = Array.from(uniqueById.values()).sort((a, b) =>
          (a.name || '').localeCompare(b.name || '', 'pt-BR'),
        );

        setTutorCourses(sortedCourses);
      } catch (err) {
        console.error('Erro ao carregar cursos para relatório:', err);
        toast.error('Erro ao carregar cursos para relatórios');
      } finally {
        setIsLoadingCourses(false);
      }
    };

    fetchTutorCourses();
  }, [user]);

  const availableCourseGroups = useMemo(() => {
    const categories = new Set(
      tutorCourses.map(course => (course.category?.trim() ? course.category : SEM_CATEGORIA)),
    );

    return Array.from(categories).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [tutorCourses]);

  const availableUnits = useMemo(() => {
    if (!selectedCourseGroup) return [];

    return tutorCourses.filter(course => {
      const category = course.category?.trim() ? course.category : SEM_CATEGORIA;
      return category === selectedCourseGroup;
    });
  }, [selectedCourseGroup, tutorCourses]);

  useEffect(() => {
    setSelectedUnitIds([]);
  }, [selectedCourseGroup]);

  const allUnitsSelected = availableUnits.length > 0 && selectedUnitIds.length === availableUnits.length;

  const toggleUnit = (unitId: string, checked: boolean) => {
    setSelectedUnitIds(current => {
      if (checked) {
        if (current.includes(unitId)) return current;
        return [...current, unitId];
      }

      return current.filter(id => id !== unitId);
    });
  };

  const selectAllUnits = () => {
    setSelectedUnitIds(availableUnits.map(unit => unit.id));
  };

  const clearUnitsSelection = () => {
    setSelectedUnitIds([]);
  };

  const generateGradesReport = async () => {
    if (selectedUnitIds.length === 0) {
      toast.error('Selecione ao menos uma unidade curricular');
      return;
    }

    setIsGenerating(true);
    try {
      const [enrollmentsResponse, activitiesResponse] = await Promise.all([
        supabase
          .from('student_courses')
          .select(`
            student_id,
            course_id,
            students!inner(full_name)
          `)
          .in('course_id', selectedUnitIds),
        supabase
          .from('student_activities')
          .select(`
            student_id,
            course_id,
            grade,
            grade_max,
            hidden
          `)
          .in('course_id', selectedUnitIds),
      ]);

      if (enrollmentsResponse.error) throw enrollmentsResponse.error;
      if (activitiesResponse.error) throw activitiesResponse.error;

      const enrollments = (enrollmentsResponse.data || []) as EnrollmentRow[];
      const activities = (activitiesResponse.data || []) as ActivityGradeRow[];

      const totalsByStudentAndCourse = new Map<string, string>();

      const groupedByKey = activities.reduce<Record<string, ActivityGradeRow[]>>((acc, row) => {
        const key = `${row.student_id}::${row.course_id}`;
        if (!acc[key]) {
          acc[key] = [];
        }
        acc[key].push(row);
        return acc;
      }, {});

      Object.entries(groupedByKey).forEach(([key, rows]) => {
        const visibleWithGrade = rows.filter(
          row => !row.hidden && row.grade !== null && row.grade_max !== null && row.grade_max > 0,
        );

        if (visibleWithGrade.length === 0) {
          totalsByStudentAndCourse.set(key, 'Sem nota');
          return;
        }

        const totalRaw = visibleWithGrade.reduce((sum, row) => sum + (row.grade || 0), 0);
        const totalMax = visibleWithGrade.reduce((sum, row) => sum + (row.grade_max || 0), 0);

        if (totalMax <= 0) {
          totalsByStudentAndCourse.set(key, 'Sem nota');
          return;
        }

        const normalized = (totalRaw / totalMax) * 100;
        totalsByStudentAndCourse.set(key, normalized.toFixed(1));
      });

      const selectedUnitsById = new Map(availableUnits.map(unit => [unit.id, unit]));

      const rows = enrollments
        .map(enrollment => {
          const key = `${enrollment.student_id}::${enrollment.course_id}`;
          return {
            Aluno: enrollment.students?.full_name || 'Aluno sem nome',
            'Unidade Curricular': selectedUnitsById.get(enrollment.course_id)?.name || 'Unidade não encontrada',
            'Nota Total': totalsByStudentAndCourse.get(key) || 'Sem nota',
          };
        })
        .sort((a, b) => {
          const byAluno = a.Aluno.localeCompare(b.Aluno, 'pt-BR');
          if (byAluno !== 0) return byAluno;
          return a['Unidade Curricular'].localeCompare(b['Unidade Curricular'], 'pt-BR');
        });

      if (rows.length === 0) {
        toast.error('Nenhum dado encontrado para as unidades selecionadas');
        return;
      }

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Relatorio de Notas');

      const safeCourseName = selectedCourseGroup
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9-_ ]/g, '')
        .trim()
        .replace(/\s+/g, '_');

      const date = new Date();
      const dateStamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
      const fileName = `relatorio_notas_${safeCourseName || 'curso'}_${dateStamp}.xlsx`;

      XLSX.writeFile(workbook, fileName);
      toast.success('Relatório gerado com sucesso');
    } catch (err) {
      console.error('Erro ao gerar relatório de notas:', err);
      toast.error('Não foi possível gerar o relatório');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Relatórios</h1>
        <p className="text-muted-foreground">
          Gere relatórios acadêmicos por curso e unidade curricular
        </p>
      </div>

      <Card>
        <CardContent className="p-6 space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <p className="text-sm font-medium">Tipo de relatório</p>
              <Select value={selectedReportType} onValueChange={setSelectedReportType}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="notas">Relatório de notas</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Curso</p>
              <Select value={selectedCourseGroup} onValueChange={setSelectedCourseGroup}>
                <SelectTrigger>
                  <SelectValue placeholder={isLoadingCourses ? 'Carregando cursos...' : 'Selecione o curso'} />
                </SelectTrigger>
                <SelectContent>
                  {availableCourseGroups.map(group => (
                    <SelectItem key={group} value={group}>
                      {group}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Unidades curriculares</p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={selectAllUnits}
                  disabled={availableUnits.length === 0 || allUnitsSelected}
                >
                  Selecionar todas
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={clearUnitsSelection}
                  disabled={selectedUnitIds.length === 0}
                >
                  Limpar
                </Button>
              </div>
            </div>

            <div className="rounded-md border p-3 max-h-72 overflow-y-auto space-y-2">
              {selectedCourseGroup && availableUnits.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhuma unidade curricular encontrada.</p>
              )}

              {!selectedCourseGroup && (
                <p className="text-sm text-muted-foreground">Selecione um curso para listar as unidades curriculares.</p>
              )}

              {availableUnits.map(unit => {
                const checked = selectedUnitIds.includes(unit.id);
                return (
                  <label
                    key={unit.id}
                    className="flex items-start gap-3 rounded-md border p-2 cursor-pointer hover:bg-muted/40"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(value) => toggleUnit(unit.id, value === true)}
                      className="mt-0.5"
                    />
                    <span className="text-sm">
                      {unit.name}
                      {unit.short_name ? ` (${unit.short_name})` : ''}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-end">
            <Button
              type="button"
              onClick={generateGradesReport}
              disabled={isGenerating || isLoadingCourses || selectedReportType !== 'notas' || selectedUnitIds.length === 0}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Gerando...
                </>
              ) : (
                <>
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Gerar Excel
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}