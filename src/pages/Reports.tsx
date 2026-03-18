import { useMemo, useState, useEffect } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import type * as XLSXType from 'xlsx-js-style';
import { Spinner } from '@/components/ui/spinner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
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
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { getCourseLifecycleStatus, withEffectiveCourseDates } from '@/lib/course-dates';

interface TutorCourse {
  id: string;
  name: string;
  short_name: string | null;
  category: string | null;
  start_date: string | null;
  end_date: string | null;
}

interface EnrollmentRow {
  student_id: string;
  course_id: string;
  enrollment_status: string | null;
  students: {
    full_name: string;
    last_access: string | null;
  } | null;
}

interface ActivityGradeRow {
  student_id: string;
  course_id: string;
  grade: number | null;
  grade_max: number | null;
  hidden: boolean;
  status: string | null;
  graded_at: string | null;
  submitted_at: string | null;
}

interface ActivityDetailRow {
  student_id: string;
  course_id: string;
  activity_name: string;
  activity_type: string | null;
  status: string | null;
  grade: number | null;
  grade_max: number | null;
  due_date: string | null;
  hidden: boolean;
  completed_at: string | null;
  graded_at: string | null;
  submitted_at: string | null;
}

interface CourseTotalRow {
  student_id: string;
  course_id: string;
  grade_raw: number | null;
  grade_percentage: number | null;
}

const SEM_CATEGORIA = 'Sem categoria';

function daysSinceAccess(lastAccess: string | null | undefined): number | string {
  if (!lastAccess) return '-';
  return Math.floor((Date.now() - new Date(lastAccess).getTime()) / (1000 * 60 * 60 * 24));
}

type ReportActivityStatus = 'graded' | 'submitted' | 'pending' | 'nao_iniciada' | 'sem_atividades';

type ExcelStyle = Record<string, unknown>;
type ExcelWorksheet = XLSXType.WorkSheet & {
  '!cols'?: Array<{ wch: number }>;
  '!ref'?: string;
};
type ExcelCell = XLSXType.CellObject & {
  s?: ExcelStyle;
  z?: string;
};

type UnitLifecycleStatus = ReturnType<typeof getCourseLifecycleStatus>;

const BORDER_STYLE: ExcelStyle = {
  top: { style: 'thin', color: { rgb: 'FFB0B0B0' } },
  bottom: { style: 'thin', color: { rgb: 'FFB0B0B0' } },
  left: { style: 'thin', color: { rgb: 'FFB0B0B0' } },
  right: { style: 'thin', color: { rgb: 'FFB0B0B0' } },
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
  const base = {
    alignment: { vertical: 'center', horizontal: 'center' },
    border: BORDER_STYLE,
  };

  if (grade >= 60) {
    return {
      ...base,
      fill: { patternType: 'solid', fgColor: { rgb: 'FFC6EFCE' } },
      font: { color: { rgb: 'FF006100' } },
    };
  }

  if (grade >= 40) {
    return {
      ...base,
      fill: { patternType: 'solid', fgColor: { rgb: 'FFFFEB9C' } },
      font: { color: { rgb: 'FF9C6500' } },
    };
  }

  return {
    ...base,
    fill: { patternType: 'solid', fgColor: { rgb: 'FFFFC7CE' } },
    font: { color: { rgb: 'FF9C0006' } },
  };
};

const REPORT_ACTIVITY_STATUS_LABELS: Record<ReportActivityStatus, string> = {
  graded: 'Corrigida',
  submitted: 'Aguardando correção',
  pending: 'Pendente',
  nao_iniciada: 'Não iniciada',
  sem_atividades: 'Sem atividades',
};

const UNIT_STATUS_LABELS: Record<UnitLifecycleStatus, string> = {
  finalizada: 'Finalizada',
  em_andamento: 'Em andamento',
  nao_iniciada: 'Nao iniciada',
};

const UNIT_STATUS_BADGE_STYLES: Record<UnitLifecycleStatus, string> = {
  finalizada: 'border-slate-300 bg-slate-100 text-slate-700',
  em_andamento: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  nao_iniciada: 'border-amber-200 bg-amber-50 text-amber-700',
};

const getNormalizedActivityStatus = (activity: ActivityGradeRow): Exclude<ReportActivityStatus, 'nao_iniciada' | 'sem_atividades'> => {
  const rawStatus = activity.status?.toLowerCase();

  if (rawStatus === 'submitted') {
    return 'submitted';
  }

  if (rawStatus === 'graded' || rawStatus === 'completed') {
    return 'graded';
  }

  if (activity.submitted_at && !activity.graded_at) {
    return 'submitted';
  }

  if (activity.grade !== null || activity.graded_at) {
    return 'graded';
  }

  return 'pending';
};

const getReportActivityStatusLabel = (status: ReportActivityStatus) => REPORT_ACTIVITY_STATUS_LABELS[status];

export default function Reports() {
  const { user } = useAuth();
  const [isLoadingCourses, setIsLoadingCourses] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [tutorCourses, setTutorCourses] = useState<TutorCourse[]>([]);
  const [selectedReportType, setSelectedReportType] = useState('notas');
  const [selectedCourseGroup, setSelectedCourseGroup] = useState<string>('');
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);
  const [includeSuspendedStudents, setIncludeSuspendedStudents] = useState(true);

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
              category,
              start_date,
              end_date
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
            start_date: course.start_date,
            end_date: course.end_date,
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

    return tutorCourses
      .filter(course => {
        const category = course.category?.trim() ? course.category : SEM_CATEGORIA;
        return category === selectedCourseGroup;
      })
      .sort((a, b) => {
        const dateA = a.start_date ? new Date(a.start_date).getTime() : Infinity;
        const dateB = b.start_date ? new Date(b.start_date).getTime() : Infinity;
        return dateA - dateB;
      });
  }, [selectedCourseGroup, tutorCourses]);

  const availableUnitsWithStatus = useMemo(() => {
    return withEffectiveCourseDates(availableUnits).map(unit => ({
      ...unit,
      lifecycleStatus: getCourseLifecycleStatus(unit),
    }));
  }, [availableUnits]);

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
    setSelectedUnitIds(availableUnitsWithStatus.map(unit => unit.id));
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
      const XLSX = await import('xlsx-js-style');

      // Fetch enrollments (paginated)
      const allEnrollments: EnrollmentRow[] = [];
      let enrollmentPage = 0;
      const PAGE_SIZE = 1000;
      while (true) {
        const { data, error } = await supabase
          .from('student_courses')
          .select(`
            student_id,
            course_id,
            enrollment_status,
            students!inner(full_name, last_access)
          `)
          .in('course_id', selectedUnitIds)
          .range(enrollmentPage * PAGE_SIZE, (enrollmentPage + 1) * PAGE_SIZE - 1);
        if (error) throw error;
        allEnrollments.push(...((data || []) as EnrollmentRow[]));
        if (!data || data.length < PAGE_SIZE) break;
        enrollmentPage++;
      }

      // Fetch activities (paginated)
      const allActivities: ActivityGradeRow[] = [];
      let activityPage = 0;
      while (true) {
        const { data, error } = await supabase
          .from('student_activities')
          .select(`
            student_id,
            course_id,
            grade,
            grade_max,
            hidden,
            status,
            graded_at,
            submitted_at
          `)
          .in('course_id', selectedUnitIds)
          .neq('activity_type', 'scorm')
          .range(activityPage * PAGE_SIZE, (activityPage + 1) * PAGE_SIZE - 1);
        if (error) throw error;
        allActivities.push(...((data || []) as ActivityGradeRow[]));
        if (!data || data.length < PAGE_SIZE) break;
        activityPage++;
      }

      // Fetch course totals from the gradebook sync (paginated)
      const allCourseTotals: CourseTotalRow[] = [];
      let courseTotalPage = 0;
      while (true) {
        const { data, error } = await supabase
          .from('student_course_grades')
          .select(`
            student_id,
            course_id,
            grade_raw,
            grade_percentage
          `)
          .in('course_id', selectedUnitIds)
          .range(courseTotalPage * PAGE_SIZE, (courseTotalPage + 1) * PAGE_SIZE - 1);
        if (error) throw error;
        allCourseTotals.push(...((data || []) as CourseTotalRow[]));
        if (!data || data.length < PAGE_SIZE) break;
        courseTotalPage++;
      }

      const enrollments = allEnrollments;
      const activities = allActivities;
      const courseTotals = allCourseTotals;

      const summaryByStudentAndCourse = new Map<string, {
        grade: number | null;
        gradePercentage: number | null;
        status: Exclude<ReportActivityStatus, 'nao_iniciada'>;
      }>();

      const gradebookTotalsByKey = new Map(
        courseTotals.map(total => [
          `${total.student_id}::${total.course_id}`,
          {
            grade: total.grade_raw,
            gradePercentage: total.grade_percentage,
          },
        ]),
      );

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
        const gradebookTotal = gradebookTotalsByKey.get(key);

        if (visibleActivities.length === 0) {
          summaryByStudentAndCourse.set(key, {
            grade: gradebookTotal?.grade ?? null,
            gradePercentage: gradebookTotal?.gradePercentage ?? null,
            status: gradebookTotal?.grade != null ? 'graded' : 'sem_atividades',
          });
          return;
        }

        const normalizedStatuses = visibleActivities.map(getNormalizedActivityStatus);

        let reportStatus: Exclude<ReportActivityStatus, 'nao_iniciada'> = 'graded';
        if (normalizedStatuses.some(status => status === 'submitted')) {
          reportStatus = 'submitted';
        } else if (normalizedStatuses.some(status => status === 'pending')) {
          reportStatus = 'pending';
        }

        summaryByStudentAndCourse.set(key, {
          grade: gradebookTotal?.grade ?? null,
          gradePercentage: gradebookTotal?.gradePercentage ?? null,
          status: reportStatus,
        });
      });

      const now = new Date();
      const selectedUnits = withEffectiveCourseDates(
        availableUnits
          .filter(unit => selectedUnitIds.includes(unit.id))
          .sort((a, b) => {
            const dateA = a.start_date ? new Date(a.start_date).getTime() : Infinity;
            const dateB = b.start_date ? new Date(b.start_date).getTime() : Infinity;
            return dateA - dateB;
          }),
      );

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
          status: getCourseLifecycleStatus(unit, now),
        };
      });

      const studentsById = new Map<string, string>();
      const suspendedStudentIds = new Set<string>();
      const lastAccessByStudentId = new Map<string, number | string>();
      enrollments.forEach(enrollment => {
        if (!studentsById.has(enrollment.student_id)) {
          studentsById.set(enrollment.student_id, enrollment.students?.full_name || 'Aluno sem nome');
          const lastAccess = enrollment.students?.last_access;
          lastAccessByStudentId.set(enrollment.student_id, daysSinceAccess(lastAccess));
        }
        if (enrollment.enrollment_status === 'suspenso') {
          suspendedStudentIds.add(enrollment.student_id);
        }
      });

      const rows = Array.from(studentsById.entries())
        .map(([studentId, studentName]) => {
          const isSuspended = suspendedStudentIds.has(studentId);
          const row: Record<string, string | number> = {
            Aluno: isSuspended ? `${studentName} (Suspenso)` : studentName,
            'Último Acesso (dias)': lastAccessByStudentId.get(studentId) ?? '-',
          };
          const gradePercentagesByUnitHeader = new Map<string, number | null>();

          selectedUnitsWithHeader.forEach(unit => {
            if (unit.status === 'nao_iniciada') {
              row[unit.headerName] = '-';
              gradePercentagesByUnitHeader.set(unit.headerName, null);
              return;
            }

            const key = `${studentId}::${unit.id}`;
            const gradebookTotal = gradebookTotalsByKey.get(key);
            const summary = summaryByStudentAndCourse.get(key) || {
              grade: gradebookTotal?.grade ?? null,
              gradePercentage: gradebookTotal?.gradePercentage ?? null,
              status: gradebookTotal?.grade != null
                ? 'graded'
                : 'sem_atividades',
            };

            row[unit.headerName] = summary?.grade === null || summary?.grade === undefined ? '' : summary.grade;
            gradePercentagesByUnitHeader.set(unit.headerName, summary?.gradePercentage ?? null);
          });

          return { row, isSuspended, gradePercentagesByUnitHeader };
        })
        .sort((a, b) => {
          if (a.isSuspended !== b.isSuspended) return a.isSuspended ? 1 : -1;
          return String(a.row.Aluno).localeCompare(String(b.row.Aluno), 'pt-BR');
        });

      const reportRows = includeSuspendedStudents
        ? rows
        : rows.filter(entry => !entry.isSuspended);

      if (reportRows.length === 0) {
        toast.error('Nenhum dado encontrado para as unidades selecionadas');
        return;
      }

      const suspendedRowIndices = new Set<number>();
      reportRows.forEach((entry, index) => {
        if (entry.isSuspended) suspendedRowIndices.add(index + 1);
      });

      const worksheet = XLSX.utils.json_to_sheet(reportRows.map(r => r.row)) as ExcelWorksheet;

      worksheet['!cols'] = [
        { wch: 32 },
        { wch: 20 },
        ...selectedUnitsWithHeader.map(unit => (
          { wch: Math.max(18, Math.min(42, unit.headerName.length + 4)) }
        )),
      ];

      const worksheetRange = worksheet['!ref'] ? XLSX.utils.decode_range(worksheet['!ref']) : null;

      if (worksheetRange) {
        for (let rowIndex = worksheetRange.s.r; rowIndex <= worksheetRange.e.r; rowIndex += 1) {
          for (let colIndex = worksheetRange.s.c; colIndex <= worksheetRange.e.c; colIndex += 1) {
            const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
            const cell = worksheet[cellAddress] as ExcelCell | undefined;

            if (!cell) continue;

            if (rowIndex === 0) {
              cell.s = {
                ...(cell.s || {}),
                ...HEADER_CELL_STYLE,
              };
              continue;
            }

            const isStudentColumn = colIndex === 0;
            const isLastAccessColumn = colIndex === 1;
            const isSuspendedRow = suspendedRowIndices.has(rowIndex);
            const baseBodyStyle = isStudentColumn ? STUDENT_CELL_STYLE : BODY_CELL_STYLE;

            const suspendedStyle: ExcelStyle = isSuspendedRow ? {
              fill: { patternType: 'solid', fgColor: { rgb: 'FFE0E0E0' } },
              font: { color: { rgb: 'FF999999' } },
            } : {};

            cell.s = {
              ...(cell.s || {}),
              ...baseBodyStyle,
              ...suspendedStyle,
            };

            const isGradeColumn = !isStudentColumn && !isLastAccessColumn;

            if (isGradeColumn && typeof cell.v === 'number') {
              if (!isSuspendedRow) {
                // Each unit occupies 1 column; columns 0 and 1 are "Aluno" and "Último Acesso (dias)".
                const selectedUnitIndex = colIndex - 2;
                const selectedUnit = selectedUnitsWithHeader[selectedUnitIndex];
                const gradePercentage = selectedUnit
                  ? reportRows[rowIndex - 1]?.gradePercentagesByUnitHeader.get(selectedUnit.headerName) ?? null
                  : null;
                const gradeStyle = gradePercentage !== null ? getGradeCellStyle(gradePercentage) : null;
                if (gradeStyle) {
                  cell.s = {
                    ...(cell.s || {}),
                    ...gradeStyle,
                  };
                }
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

  const generatePendingReport = async () => {
    if (selectedUnitIds.length === 0) {
      toast.error('Selecione ao menos uma unidade curricular');
      return;
    }

    setIsGenerating(true);
    try {
      const XLSX = await import('xlsx-js-style');
      const PAGE_SIZE = 1000;

      // Fetch enrollments
      const allEnrollments: EnrollmentRow[] = [];
      let page = 0;
      while (true) {
        const { data, error } = await supabase
          .from('student_courses')
          .select('student_id, course_id, enrollment_status, students!inner(full_name, last_access)')
          .in('course_id', selectedUnitIds)
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
        if (error) throw error;
        allEnrollments.push(...((data || []) as EnrollmentRow[]));
        if (!data || data.length < PAGE_SIZE) break;
        page++;
      }

      // Fetch activities with details
      const allActivities: ActivityDetailRow[] = [];
      page = 0;
      while (true) {
        const { data, error } = await supabase
          .from('student_activities')
          .select('student_id, course_id, activity_name, activity_type, status, grade, grade_max, due_date, hidden, completed_at, graded_at, submitted_at')
          .in('course_id', selectedUnitIds)
          .neq('activity_type', 'scorm')
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
        if (error) throw error;
        allActivities.push(...((data || []) as ActivityDetailRow[]));
        if (!data || data.length < PAGE_SIZE) break;
        page++;
      }

      // Build units with inferred end dates
      const selectedUnitsRaw = availableUnits.filter(u => selectedUnitIds.includes(u.id));
      const unitsWithEndDates = withEffectiveCourseDates(selectedUnitsRaw);
      const unitEndDateMap = new Map(unitsWithEndDates.map(u => [u.id, u.effective_end_date]));
      const unitNameMap = new Map(unitsWithEndDates.map(u => [u.id, simplifyUnitName(u.name)]));
      const unitStartMap = new Map(unitsWithEndDates.map(u => [u.id, u.start_date]));

      const now = new Date();

      // Filter: only visible, non-quiz activities that are pending within the unit period
      const pendingActivities = allActivities.filter(a => {
        if (a.hidden) return false;
        if (a.activity_type === 'quiz') return false;

        // Exclude fully completed/graded; submitted-but-ungraded activities are included as 'Pendente de Correção'
        const isCompleted = a.status === 'completed' || a.status === 'complete_pass' || a.completed_at || a.graded_at;
        if (isCompleted) return false;

        // Check if the activity's unit period has started
        const unitStart = unitStartMap.get(a.course_id);
        if (unitStart && new Date(unitStart) > now) return false;

        // Check if the activity's unit period has ended (past due)
        const unitEnd = unitEndDateMap.get(a.course_id);
        if (unitEnd && new Date(unitEnd) < now) {
          // Unit already ended - activity is overdue
          return true;
        }

        // Unit still in progress - check due_date if available
        if (a.due_date && new Date(a.due_date) < now) return true;

        // Unit in progress, no due date or not past due yet - still pending
        return true;
      });

      // Build student map
      const studentsById = new Map<string, string>();
      const suspendedIds = new Set<string>();
      const lastAccessByStudentId = new Map<string, number | string>();
      allEnrollments.forEach(e => {
        if (!studentsById.has(e.student_id)) {
          studentsById.set(e.student_id, e.students?.full_name || 'Aluno sem nome');
          const lastAccess = e.students?.last_access;
          lastAccessByStudentId.set(e.student_id, daysSinceAccess(lastAccess));
        }
        if (e.enrollment_status === 'suspenso') suspendedIds.add(e.student_id);
      });

      // Group pending by student
      const pendingByStudent = new Map<string, ActivityDetailRow[]>();
      pendingActivities.forEach(a => {
        if (suspendedIds.has(a.student_id)) return;
        const list = pendingByStudent.get(a.student_id) || [];
        list.push(a);
        pendingByStudent.set(a.student_id, list);
      });

      if (pendingByStudent.size === 0) {
        toast.info('Nenhuma atividade pendente encontrada para as unidades selecionadas');
        setIsGenerating(false);
        return;
      }

      // Build rows
      const rows: Record<string, string | number>[] = [];
      const sortedStudents = Array.from(pendingByStudent.entries())
        .sort((a, b) => b[1].length - a[1].length); // Most pending first

      for (const [studentId, activities] of sortedStudents) {
        const studentName = studentsById.get(studentId) || 'Desconhecido';
        const lastAccessDays = lastAccessByStudentId.get(studentId) ?? '-';
        for (const act of activities) {
          const unitName = unitNameMap.get(act.course_id) || 'N/A';

          rows.push({
            'Aluno': studentName,
            'Último Acesso (dias)': lastAccessDays,
            'Unidade Curricular': unitName,
            'Atividade': act.activity_name,
            'Tipo': act.activity_type || '-',
            'Status': act.submitted_at ? 'Pendente de Correção' : 'Pendente de Envio',
          });
        }
      }

      // Summary sheet: count per student
      const summaryRows = sortedStudents.map(([studentId, activities]) => ({
        'Aluno': studentsById.get(studentId) || 'Desconhecido',
        'Último Acesso (dias)': lastAccessByStudentId.get(studentId) ?? '-',
        'Atividades Pendentes': activities.length,
        'Pendente de Envio': activities.filter(a => !a.submitted_at).length,
        'Pendente de Correção': activities.filter(a => !!a.submitted_at).length,
      }));

      const workbook = XLSX.utils.book_new();

      // Summary sheet
      const summaryWs = XLSX.utils.json_to_sheet(summaryRows) as ExcelWorksheet;
      summaryWs['!cols'] = [{ wch: 32 }, { wch: 20 }, { wch: 22 }, { wch: 18 }, { wch: 22 }];
      applyBasicStyles(XLSX, summaryWs);
      XLSX.utils.book_append_sheet(workbook, summaryWs, 'Resumo');

      // Detail sheet
      const detailWs = XLSX.utils.json_to_sheet(rows) as ExcelWorksheet;
      detailWs['!cols'] = [{ wch: 32 }, { wch: 20 }, { wch: 28 }, { wch: 36 }, { wch: 10 }, { wch: 22 }];
      applyPendingStyles(XLSX, detailWs);
      XLSX.utils.book_append_sheet(workbook, detailWs, 'Detalhamento');

      const safeCourseName = selectedCourseGroup
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9-_ ]/g, '')
        .trim()
        .replace(/\s+/g, '_');

      const date = new Date();
      const dateStamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
      const fileName = `relatorio_pendencias_${safeCourseName || 'curso'}_${dateStamp}.xlsx`;

      XLSX.writeFile(workbook, fileName);
      toast.success('Relatório de pendências gerado com sucesso');
    } catch (err) {
      console.error('Erro ao gerar relatório de pendências:', err);
      toast.error('Não foi possível gerar o relatório');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerate = () => {
    if (selectedReportType === 'notas') {
      generateGradesReport();
    } else if (selectedReportType === 'pendencias') {
      generatePendingReport();
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
                  <SelectItem value="pendencias">Relatório de atividades pendentes</SelectItem>
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

              {availableUnitsWithStatus.map(unit => {
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
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm">
                          {unit.name}
                          {unit.short_name ? ` (${unit.short_name})` : ''}
                        </span>
                        <Badge
                          variant="outline"
                          className={UNIT_STATUS_BADGE_STYLES[unit.lifecycleStatus]}
                        >
                          {UNIT_STATUS_LABELS[unit.lifecycleStatus]}
                        </Badge>
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex items-start justify-between gap-4 rounded-md border p-4">
            <div className="space-y-1">
              <Label htmlFor="include-suspended-students">Incluir alunos suspensos</Label>
              <p className="text-sm text-muted-foreground">
                Quando desativado, alunos com status suspenso não entram no Excel.
              </p>
            </div>
            <Switch
              id="include-suspended-students"
              checked={includeSuspendedStudents}
              onCheckedChange={setIncludeSuspendedStudents}
              aria-label="Incluir alunos suspensos"
            />
          </div>

          <div className="flex items-center justify-end">
            <Button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating || isLoadingCourses || selectedUnitIds.length === 0}
            >
              {isGenerating ? (
                <>
                  <Spinner className="h-4 w-4 mr-2" onAccent />
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

function applyBasicStyles(XLSX: typeof XLSXType, ws: ExcelWorksheet) {
  const range = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : null;
  if (!range) return;

  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr] as ExcelCell | undefined;
      if (!cell) continue;

      if (r === 0) {
        cell.s = { ...(cell.s || {}), ...HEADER_CELL_STYLE };
      } else {
        cell.s = { ...(cell.s || {}), ...(c === 0 ? STUDENT_CELL_STYLE : BODY_CELL_STYLE) };
      }
    }
  }
}

function applyPendingStyles(XLSX: typeof XLSXType, ws: ExcelWorksheet) {
  const range = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : null;
  if (!range) return;

  const STATUS_COL = 5; // 'Status' column index (Aluno, Último Acesso (dias), UC, Atividade, Tipo, Status)

  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr] as ExcelCell | undefined;
      if (!cell) continue;

      if (r === 0) {
        cell.s = { ...(cell.s || {}), ...HEADER_CELL_STYLE };
      } else {
        const base = c === 0 ? STUDENT_CELL_STYLE : BODY_CELL_STYLE;
        cell.s = { ...(cell.s || {}), ...base };

        if (c === STATUS_COL && cell.v === 'Pendente de Correção') {
          cell.s = {
            ...(cell.s || {}),
            fill: { patternType: 'solid', fgColor: { rgb: 'FFFCE5B6' } },
            font: { bold: true, color: { rgb: 'FF7D5A00' } },
          };
        }
      }
    }
  }
}
