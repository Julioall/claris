import { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Sparkles,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useMoodleSession } from '@/features/auth/context/MoodleSessionContext';
import {
  approveStudentGradeSuggestion,
  generateActivityGradeSuggestions,
} from '@/features/students/api/gradeSuggestions';
import type {
  Student,
  StudentGradeSuggestionResult,
} from '@/features/students/types';
import { useToast } from '@/hooks/use-toast';
import { getStudentActivityWorkflowStatus } from '@/lib/student-activity-status';
import type { StudentActivity } from '../types';

interface SuggestionRowState {
  auditId: string | null;
  result: StudentGradeSuggestionResult;
  editedGrade: string;
  editedFeedback: string;
  requestError: string | null;
  isApproving: boolean;
}

interface AssignmentSuggestionPanelProps {
  activity: StudentActivity;
  submissions: StudentActivity[];
  studentsById: Map<string, Student>;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onApproved?: () => Promise<void> | void;
}

const SUGGESTION_STATUS_CLASS_NAMES: Record<StudentGradeSuggestionResult['status'], string> = {
  success: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  invalid: 'border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-400',
  manual_review_required: 'border-orange-500/30 bg-orange-500/15 text-orange-700 dark:text-orange-400',
  error: 'border-destructive/30 bg-destructive/10 text-destructive',
};

function getSubmissionStatus(submission: StudentActivity) {
  const workflowStatus = getStudentActivityWorkflowStatus(submission);

  if (workflowStatus === 'corrected') return 'corrigido';
  if (workflowStatus === 'pending_correction') return 'pendente-correcao';
  return 'pendente-envio';
}

function buildGradeInputValue(result: StudentGradeSuggestionResult) {
  if (result.suggestedGrade === null || result.suggestedGrade === undefined) {
    return '';
  }

  return String(result.suggestedGrade);
}

function parseEditedGrade(value: string) {
  const normalized = value.replace(',', '.').trim();
  if (!normalized) return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function AssignmentSuggestionPanel({
  activity,
  submissions,
  studentsById,
  isExpanded,
  onToggleExpand,
  onApproved,
}: AssignmentSuggestionPanelProps) {
  const moodleSession = useMoodleSession();
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, SuggestionRowState>>({});
  const pendingCorrectionSubmissions = useMemo(
    () => submissions.filter((submission) => getStudentActivityWorkflowStatus(submission) === 'pending_correction'),
    [submissions],
  );

  const hasSuggestions = useMemo(
    () => Object.keys(rows).length > 0,
    [rows],
  );

  const handleGenerateSuggestions = async () => {
    if (!moodleSession || !activity.moodle_activity_id) {
      setBatchError('A sessao Moodle nao esta disponivel para gerar as sugestoes.');
      return;
    }

    if (pendingCorrectionSubmissions.length === 0) {
      setBatchError('Nenhuma entrega pendente de correcao foi encontrada para esta atividade.');
      return;
    }

    if (!isExpanded) {
      onToggleExpand();
    }

    setIsGenerating(true);
    setBatchError(null);

    try {
      const { data, error } = await generateActivityGradeSuggestions({
        session: moodleSession,
        courseId: activity.course_id,
        moodleActivityId: activity.moodle_activity_id,
      });

      if (error) {
        throw new Error(error.message || 'Nao foi possivel gerar as sugestoes com IA.');
      }

      if (!data?.success) {
        throw new Error(data?.message || 'Nenhuma entrega pendente de correcao foi encontrada para esta atividade.');
      }

      if (!data.results?.length) {
        throw new Error(data.message || 'A atividade nao retornou sugestoes utilizaveis.');
      }

      const nextRows = data.results.reduce<Record<string, SuggestionRowState>>((accumulator, entry) => {
        accumulator[entry.studentActivityId] = {
          auditId: entry.auditId ?? null,
          result: entry.result,
          editedGrade: buildGradeInputValue(entry.result),
          editedFeedback: entry.result.suggestedFeedback ?? '',
          requestError: entry.result.status === 'error' ? entry.result.warnings[0] ?? null : null,
          isApproving: false,
        };
        return accumulator;
      }, {});

      setRows(nextRows);

      toast({
        title: 'Sugestoes atualizadas',
        description: data.message || `${data.generatedCount} sugestoes geradas para a atividade.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nao foi possivel gerar as sugestoes com IA.';
      setRows({});
      setBatchError(message);
      toast({
        variant: 'destructive',
        title: 'Falha ao sugerir',
        description: message,
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const updateRow = (studentActivityId: string, updater: (current: SuggestionRowState | undefined) => SuggestionRowState) => {
    setRows((current) => ({
      ...current,
      [studentActivityId]: updater(current[studentActivityId]),
    }));
  };

  const handleApprove = async (submission: StudentActivity) => {
    const row = rows[submission.id];
    if (!row?.auditId || !moodleSession) {
      return;
    }

    const parsedGrade = parseEditedGrade(row.editedGrade);
    const approvalBlocked = row.result.status === 'error';
    const canApprove = (
      !approvalBlocked &&
      parsedGrade !== null &&
      Number.isFinite(parsedGrade) &&
      row.editedFeedback.trim().length > 0
    );

    if (!canApprove) {
      return;
    }

    updateRow(submission.id, (current) => ({
      ...(current ?? row),
      isApproving: true,
      requestError: null,
    }));

    try {
      const { data, error } = await approveStudentGradeSuggestion({
        session: moodleSession,
        auditId: row.auditId,
        approvedGrade: parsedGrade,
        approvedFeedback: row.editedFeedback.trim(),
      });

      if (error) {
        throw new Error(error.message || 'Nao foi possivel lancar a nota no Moodle.');
      }

      if (!data?.success) {
        throw new Error(data?.message || 'O Moodle recusou a aprovacao desta sugestao.');
      }

      updateRow(submission.id, (current) => ({
        ...(current ?? row),
        isApproving: false,
        requestError: null,
      }));

      toast({
        title: 'Nota lancada',
        description: `${studentsById.get(submission.student_id)?.full_name || 'Aluno'} atualizado no Moodle.`,
      });

      await onApproved?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao aprovar a sugestao.';

      updateRow(submission.id, (current) => ({
        ...(current ?? row),
        isApproving: false,
        requestError: message,
      }));

      toast({
        variant: 'destructive',
        title: 'Falha ao lancar nota',
        description: message,
      });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-2">
        {pendingCorrectionSubmissions.length > 0 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void handleGenerateSuggestions()}
            disabled={!moodleSession || !activity.moodle_activity_id || isGenerating}
          >
            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Corrigir
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onToggleExpand}
          aria-label={isExpanded ? 'Recolher entregas' : 'Expandir entregas'}
        >
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </div>

      {isExpanded && (
        <div className="overflow-hidden rounded-md border border-border/70 bg-background/80">
          {batchError ? (
            <div className="border-b px-4 py-2 text-sm text-destructive">
              {batchError}
            </div>
          ) : null}

          {isGenerating && !hasSuggestions ? (
            <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Gerando sugestoes para as entregas desta atividade...
            </div>
          ) : submissions.length === 0 ? (
            <div className="px-4 py-3 text-sm text-muted-foreground">
              Nenhum aluno encontrado para esta atividade.
            </div>
          ) : (
            <div className="divide-y">
              {submissions.map((submission) => {
                const submissionStatus = getSubmissionStatus(submission);
                const student = studentsById.get(submission.student_id);
                const studentName = student?.full_name || 'Aluno nao identificado';
                const row = rows[submission.id];
                const parsedGrade = row ? parseEditedGrade(row.editedGrade) : null;
                const approvalBlocked = row?.result.status === 'error';
                const canApprove = Boolean(
                  row?.auditId &&
                  !approvalBlocked &&
                  !row?.isApproving &&
                  parsedGrade !== null &&
                  Number.isFinite(parsedGrade) &&
                  row.editedFeedback.trim().length > 0,
                );

                return (
                  <div
                    key={submission.id}
                    className="px-4 py-3"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 space-y-1">
                        <p className="truncate text-sm font-medium">{studentName}</p>

                        {row && row.result.status !== 'success' ? (
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <Badge
                              variant="outline"
                              className={SUGGESTION_STATUS_CLASS_NAMES[row.result.status]}
                            >
                              {row.result.status === 'invalid'
                                ? 'Resposta invalida'
                                : row.result.status === 'manual_review_required'
                                  ? 'Revisao manual'
                                  : 'Erro'}
                            </Badge>
                          </div>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground sm:justify-end">
                        {submissionStatus === 'corrigido' && submission.grade !== null && (
                          <span>
                            Nota: {submission.grade.toFixed(1)}
                            {submission.grade_max !== null ? ` / ${submission.grade_max}` : ''}
                          </span>
                        )}

                        {submissionStatus === 'corrigido' ? (
                          <Badge className="border-blue-500/30 bg-blue-500/15 text-blue-700 dark:text-blue-400">
                            Corrigido
                          </Badge>
                        ) : submissionStatus === 'pendente-correcao' ? (
                          <Badge className="border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-400">
                            Pendente de Correcao
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Pendente de Envio</Badge>
                        )}
                      </div>
                    </div>

                    {row ? (
                      <div className="mt-3 space-y-2 border-l border-border/60 pl-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Input
                            aria-label={`Nota sugerida para ${studentName}`}
                            inputMode="decimal"
                            placeholder="Nota"
                            className="h-8 w-24 bg-background"
                            value={row.editedGrade}
                            onChange={(event) => updateRow(submission.id, (current) => ({
                              ...(current ?? row),
                              editedGrade: event.target.value,
                            }))}
                            disabled={row.isApproving || approvalBlocked}
                          />
                          <Button
                            type="button"
                            size="sm"
                            className="h-8"
                            onClick={() => void handleApprove(submission)}
                            disabled={!canApprove}
                          >
                            {row.isApproving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            Lancar nota
                          </Button>
                        </div>

                        <Textarea
                          aria-label={`Feedback sugerido para ${studentName}`}
                          rows={3}
                          className="min-h-[88px] resize-y border-dashed bg-transparent"
                          value={row.editedFeedback}
                          onChange={(event) => updateRow(submission.id, (current) => ({
                            ...(current ?? row),
                            editedFeedback: event.target.value,
                          }))}
                          disabled={row.isApproving || approvalBlocked}
                        />

                        {(row.requestError || row.result.warnings.length > 0) && (
                          <div className="space-y-1 text-xs text-muted-foreground">
                            {row.requestError ? <p className="text-destructive">{row.requestError}</p> : null}
                            {row.result.warnings.map((warning) => (
                              <p key={warning}>{warning}</p>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
