import { useMemo, useState, useEffect } from 'react';
import { FileSpreadsheet, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx-js-style';
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
  is_recovery: boolean;
}

const SEM_CATEGORIA = 'Sem categoria';

type ExcelStyle = Record<string, unknown>;

const BORDER_STYLE: ExcelStyle = {
  top: { style: 'thin', color: { rgb: 'FFD9D9D9' } },
  bottom: { style: 'thin', color: { rgb: 'FFD9D9D9' } },
  left: { style: 'thin', color: { rgb: 'FFD9D9D9' } },
  right: { style: 'thin', color: { rgb: 'FFD9D9D9' } },
};

const HEADER_CELL_STYLE: ExcelStyle = {
  font: { bold: true, color: { rgb: 'FF1F2937' } },
  fill: { patternType: 'solid', fgColor: { rgb: 'FFE5E7EB' } },
  alignment: { vertical: 'center', horizontal: 'center', wrapText: true },
  border: BORDER_STYLE,
};

const BODY_CELL_STYLE: ExcelStyle = {
  fill: { patternType: 'solid', fgColor: { rgb: 'FFF9FAFB' } },
  alignment: { vertical: 'center', horizontal: 'center' },
  border: BORDER_STYLE,
};

const STUDENT_CELL_STYLE: ExcelStyle = {
  ...BODY_CELL_STYLE,
  alignment: { vertical: 'center', horizontal: 'left' },
};

const simplifyUnitName = (unitName: string) => {
  const trimmedName = unitName.trim();

  const trailingCodePattern = trimmedName.match(/^(.*?)\s*\(\s*\d+\s*-\s*.*\)\s*$/);
  if (trailingCodePattern?.[1]?.trim()) {
    return trailingCodePattern[1].trim();
  }

  const leadingCodePattern = trimmedName.match(/^\d+\s*-\s*(.+)$/);
  if (leadingCodePattern?.[1]?.trim()) {
    return leadingCodePattern[1].trim();
  }

  return trimmedName;
};

const getGradeCellStyle = (grade: number) => {
  if (grade >= 60) {
    return {
      fill: {
        patternType: 'solid',
        fgColor: { rgb: 'FFC6EFCE' },
      },
    };
  }

  if (grade >= 40 && grade < 60) {
    return {
      fill: {
        patternType: 'solid',
        fgColor: { rgb: 'FFFFEB9C' },
      },
    };
  }

  if (grade < 40) {
    return {
      fill: {
        patternType: 'solid',
        fgColor: { rgb: 'FFFFC7CE' },
      },
    };
  }

  return null;
};

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
            hidden,
            is_recovery
          `)
          .in('course_id', selectedUnitIds)
          .neq('activity_type', 'scorm'),
      ]);

      if (enrollmentsResponse.error) throw enrollmentsResponse.error;
      if (activitiesResponse.error) throw activitiesResponse.error;

      const enrollments = (enrollmentsResponse.data || []) as EnrollmentRow[];
      const activities = (activitiesResponse.data || []) as ActivityGradeRow[];

      const totalsByStudentAndCourse = new Map<string, number | null>();

      const groupedByKey = activities.reduce<Record<string, ActivityGradeRow[]>>((acc, row) => {
        const key = `${row.student_id}::${row.course_id}`;
        if (!acc[key]) {
          acc[key] = [];
        }
        acc[key].push(row);
        return acc;
      }, {});

      Object.entries(groupedByKey).forEach(([key, rows]) => {
        const visibleActivities = rows.filter(row => !row.hidden);

        if (visibleActivities.length === 0) {
          totalsByStudentAndCourse.set(key, null);
          return;
        }

        // Verifica se o aluno fez recuperação (tem nota em atividade de recuperação)
        const hasRecoveryWithGrade = visibleActivities.some(
          row => row.is_recovery && row.grade !== null && row.grade > 0
        );
        
        // Soma todas as atividades (incluindo recuperação)
        const totalRaw = visibleActivities.reduce((sum, row) => sum + (row.grade || 0), 0);
        
        // Se o aluno fez recuperação (tem nota), divide por 2
        const finalGrade = hasRecoveryWithGrade ? totalRaw / 2 : totalRaw;

        totalsByStudentAndCourse.set(key, Math.round(finalGrade * 10) / 10);
      });

      const selectedUnits = availableUnits.filter(unit => selectedUnitIds.includes(unit.id));
      const usedHeaders = new Set<string>();
      const selectedUnitsWithHeader = selectedUnits.map(unit => {
        const simplifiedName = simplifyUnitName(unit.name);
        let headerName = simplifiedName;
        let counter = 2;

        while (usedHeaders.has(headerName)) {
          headerName = `${simplifiedName} (${counter})`;
          counter += 1;
        }

        usedHeaders.add(headerName);

        return {
          ...unit,
          headerName,
        };
      });

      const studentsById = new Map<string, string>();
      enrollments.forEach(enrollment => {
        if (!studentsById.has(enrollment.student_id)) {
          studentsById.set(enrollment.student_id, enrollment.students?.full_name || 'Aluno sem nome');
        }
      });

      const rows = Array.from(studentsById.entries())
        .map(([studentId, studentName]) => {
          const row: Record<string, string | number> = {
            Aluno: studentName,
          };

          selectedUnitsWithHeader.forEach(unit => {
            const key = `${studentId}::${unit.id}`;
            const grade = totalsByStudentAndCourse.get(key);
            row[unit.headerName] = grade === null || grade === undefined ? 'Sem nota' : grade;
          });

          return row;
        })
        .sort((a, b) => String(a.Aluno).localeCompare(String(b.Aluno), 'pt-BR'));

      if (rows.length === 0) {
        toast.error('Nenhum dado encontrado para as unidades selecionadas');
        return;
      }

      const worksheet = XLSX.utils.json_to_sheet(rows) as XLSX.WorkSheet & {
        '!cols'?: Array<{ wch: number }>;
      };

      worksheet['!cols'] = [
        { wch: 32 },
        ...selectedUnitsWithHeader.map(unit => ({ wch: Math.max(18, Math.min(42, unit.headerName.length + 4)) })),
      ];

      const worksheetRange = worksheet['!ref'] ? XLSX.utils.decode_range(worksheet['!ref']) : null;

      if (worksheetRange) {
        for (let rowIndex = worksheetRange.s.r; rowIndex <= worksheetRange.e.r; rowIndex += 1) {
          for (let colIndex = worksheetRange.s.c; colIndex <= worksheetRange.e.c; colIndex += 1) {
            const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
            const cell = worksheet[cellAddress] as (XLSX.CellObject & { s?: ExcelStyle }) | undefined;

            if (!cell) continue;

            if (rowIndex === 0) {
              cell.s = {
                ...(cell.s || {}),
                ...HEADER_CELL_STYLE,
              };
              continue;
            }

            const isStudentColumn = colIndex === 0;
            const baseBodyStyle = isStudentColumn ? STUDENT_CELL_STYLE : BODY_CELL_STYLE;

            cell.s = {
              ...(cell.s || {}),
              ...baseBodyStyle,
            };

            if (!isStudentColumn && typeof cell.v === 'number') {
              const gradeStyle = getGradeCellStyle(cell.v);
              if (gradeStyle) {
                cell.s = {
                  ...(cell.s || {}),
                  ...gradeStyle,
                };
              }
              cell.z = '0.0';
            }
          }
        }
      }

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