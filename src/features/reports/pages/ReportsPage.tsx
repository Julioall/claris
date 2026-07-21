import { useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import type * as XLSXType from 'xlsx-js-style';
import { Spinner } from '@/components/ui/spinner';
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
import {
  getAcademicGradesReport,
  getAcademicPendingActivitiesReport,
  listAcademicReportCourses,
  type AcademicReportCourseDto,
  type AcademicReportCourseLifecycleDto,
} from '@/features/reports/api';

const SEM_CATEGORIA = 'Sem categoria';
const REPORT_FILE_COURSE_SLUG_MAX_LENGTH = 48;

function getClassNameFromCourseGroup(courseGroup: string) {
  const trimmedCourseGroup = courseGroup.trim();
  const hierarchyParts = trimmedCourseGroup
    .split('>')
    .map(part => part.trim())
    .filter(Boolean);

  return hierarchyParts[3] || hierarchyParts[hierarchyParts.length - 1] || trimmedCourseGroup;
}

function buildReportFileName(reportType: 'notas' | 'pendencias', courseGroup: string, date = new Date()) {
  const className = getClassNameFromCourseGroup(courseGroup);
  const courseSlug = className
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_ ]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, REPORT_FILE_COURSE_SLUG_MAX_LENGTH)
    .replace(/[_-]+$/g, '');

  const dateStamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;

  return `relatorio_${reportType}_${courseSlug || 'turma'}_${dateStamp}.xlsx`;
}

function daysSinceAccess(lastAccess: string | null | undefined): number | string {
  if (!lastAccess) return '-';
  return Math.floor((Date.now() - new Date(lastAccess).getTime()) / (1000 * 60 * 60 * 24));
}

type ExcelStyle = Record<string, unknown>;
type ExcelWorksheet = XLSXType.WorkSheet & {
  '!cols'?: Array<{ wch: number }>;
  '!ref'?: string;
};
type ExcelCell = XLSXType.CellObject & {
  s?: ExcelStyle;
  z?: string;
};

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

  if (grade > 59) {
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

const getLastAccessCellStyle = (daysWithoutAccess: number) => {
  const base = {
    alignment: { vertical: 'center', horizontal: 'center' },
    border: BORDER_STYLE,
  };

  if (daysWithoutAccess < 3) {
    return {
      ...base,
      fill: { patternType: 'solid', fgColor: { rgb: 'FFC6EFCE' } },
      font: { color: { rgb: 'FF006100' } },
    };
  }

  if (daysWithoutAccess <= 7) {
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

const UNIT_STATUS_LABELS: Record<AcademicReportCourseLifecycleDto, string> = {
  finalizada: 'Finalizada',
  em_andamento: 'Em andamento',
  nao_iniciada: 'Nao iniciada',
};

const UNIT_STATUS_BADGE_STYLES: Record<AcademicReportCourseLifecycleDto, string> = {
  finalizada: 'border-slate-300 bg-slate-100 text-slate-700',
  em_andamento: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  nao_iniciada: 'border-amber-200 bg-amber-50 text-amber-700',
};

export default function ReportsPage() {
  const [isLoadingCourses, setIsLoadingCourses] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [tutorCourses, setTutorCourses] = useState<AcademicReportCourseDto[]>([]);
  const [selectedReportType, setSelectedReportType] = useState('notas');
  const [selectedCourseGroup, setSelectedCourseGroup] = useState<string>('');
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);
  const [includeSuspendedStudents, setIncludeSuspendedStudents] = useState(true);

  useEffect(() => {
    const loadTutorCourses = async () => {
      setIsLoadingCourses(true);
      try {
        const courses = await listAcademicReportCourses();
        setTutorCourses(courses);
      } catch (err) {
        console.error('Erro ao carregar cursos para relatório:', err);
        toast.error('Erro ao carregar cursos para relatórios');
      } finally {
        setIsLoadingCourses(false);
      }
    };

    loadTutorCourses();
  }, []);

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
        const dateA = a.startsAt ? new Date(a.startsAt).getTime() : Infinity;
        const dateB = b.startsAt ? new Date(b.startsAt).getTime() : Infinity;
        return dateA - dateB || a.name.localeCompare(b.name, 'pt-BR') || a.id.localeCompare(b.id);
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
      const XLSX = await import('xlsx-js-style');
      const report = await getAcademicGradesReport(
        selectedUnitIds,
        includeSuspendedStudents,
      );

      const usedHeaders = new Set<string>();
      const selectedUnitsWithHeader = report.units.map(unit => {
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

      const reportRows = report.students.map(student => {
        const gradeByCourse = new Map(student.grades.map(grade => [grade.courseId, grade]));
        const row: Record<string, string | number> = {
          Aluno: student.isSuspended ? `${student.name} (Suspenso)` : student.name,
          'Último Acesso (dias)': daysSinceAccess(student.lastAccessAt),
        };
        const gradePercentagesByUnitHeader = new Map<string, number | null>();

        selectedUnitsWithHeader.forEach(unit => {
          if (unit.lifecycleStatus === 'nao_iniciada') {
            row[unit.headerName] = '-';
            gradePercentagesByUnitHeader.set(unit.headerName, null);
            return;
          }

          const grade = gradeByCourse.get(unit.id);
          row[unit.headerName] = grade?.gradeRaw ?? '';
          gradePercentagesByUnitHeader.set(unit.headerName, grade?.gradePercentage ?? null);
        });

        return { row, isSuspended: student.isSuspended, gradePercentagesByUnitHeader };
      });

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

            if (isLastAccessColumn && typeof cell.v === 'number' && !isSuspendedRow) {
              cell.s = {
                ...(cell.s || {}),
                ...getLastAccessCellStyle(cell.v),
              };
            }

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

      const fileName = buildReportFileName('notas', selectedCourseGroup);

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
      const report = await getAcademicPendingActivitiesReport(selectedUnitIds);

      if (report.details.length === 0) {
        toast.info('Nenhuma atividade pendente encontrada para as unidades selecionadas');
        return;
      }

      const studentsById = new Map(report.students.map(student => [student.studentId, student]));
      const rows = report.details.map(detail => {
        const student = studentsById.get(detail.studentId);
        return {
          'Aluno': student?.name ?? 'Desconhecido',
          'Último Acesso (dias)': daysSinceAccess(student?.lastAccessAt),
          'Unidade Curricular': simplifyUnitName(detail.unitName),
          'Atividade': detail.activityName,
          'Tipo': detail.activityType || '-',
          'Status': detail.workflowStatus === 'pendingCorrection'
            ? 'Pendente de Correção'
            : 'Pendente de Envio',
        };
      });

      const summaryRows = report.students.map(student => ({
        'Aluno': student.name,
        'Último Acesso (dias)': daysSinceAccess(student.lastAccessAt),
        'Atividades Pendentes': student.totalCount,
        'Pendente de Envio': student.pendingSubmissionCount,
        'Pendente de Correção': student.pendingCorrectionCount,
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

      const fileName = buildReportFileName('pendencias', selectedCourseGroup);

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

              {availableUnits.map(unit => {
                const checked = selectedUnitIds.includes(unit.id);
                const unitName = simplifyUnitName(unit.name);
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
                        <span className="text-sm" title={unit.name}>
                          {unitName}
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
  const LAST_ACCESS_COL = 1;

  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr] as ExcelCell | undefined;
      if (!cell) continue;

      if (r === 0) {
        cell.s = { ...(cell.s || {}), ...HEADER_CELL_STYLE };
      } else {
        cell.s = { ...(cell.s || {}), ...(c === 0 ? STUDENT_CELL_STYLE : BODY_CELL_STYLE) };

        if (c === LAST_ACCESS_COL && typeof cell.v === 'number') {
          cell.s = { ...(cell.s || {}), ...getLastAccessCellStyle(cell.v) };
        }
      }
    }
  }
}

function applyPendingStyles(XLSX: typeof XLSXType, ws: ExcelWorksheet) {
  const range = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : null;
  if (!range) return;

  const LAST_ACCESS_COL = 1;
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

        if (c === LAST_ACCESS_COL && typeof cell.v === 'number') {
          cell.s = { ...(cell.s || {}), ...getLastAccessCellStyle(cell.v) };
        }

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
