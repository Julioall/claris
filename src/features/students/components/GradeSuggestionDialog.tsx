import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCcw,
  Sparkles,
  Upload,
} from "lucide-react";

import type { MoodleSession } from "@/features/auth/domain/session";
import {
  approveStudentGradeSuggestion,
  generateStudentGradeSuggestion,
} from "@/features/students/api/gradeSuggestions";
import type {
  GradeSuggestionSource,
  StudentGradeSuggestionResult,
} from "@/features/students/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";

interface ActivityReference {
  id: string;
  activity_name: string;
  course_id: string;
  moodle_activity_id?: string | null;
  grade_max: number | null;
}

interface GradeSuggestionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: MoodleSession | null;
  studentId: string;
  activity: ActivityReference | null;
  onApproved?: () => Promise<void> | void;
}

function formatExtractionQuality(value: GradeSuggestionSource["extractionQuality"]) {
  if (value === "high") return "Alta";
  if (value === "medium") return "Media";
  if (value === "low") return "Baixa";
  if (value === "none") return "Sem texto";
  return "Nao informado";
}

function buildGradeInputValue(result: StudentGradeSuggestionResult | null) {
  if (result?.suggestedGrade === null || result?.suggestedGrade === undefined) {
    return "";
  }

  return String(result.suggestedGrade);
}

export function GradeSuggestionDialog({
  open,
  onOpenChange,
  session,
  studentId,
  activity,
  onApproved,
}: GradeSuggestionDialogProps) {
  const { toast } = useToast();
  const [auditId, setAuditId] = useState<string | null>(null);
  const [result, setResult] = useState<StudentGradeSuggestionResult | null>(null);
  const [editedGrade, setEditedGrade] = useState("");
  const [editedFeedback, setEditedFeedback] = useState("");
  const [requestError, setRequestError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isApproving, setIsApproving] = useState(false);

  const maxGrade = activity?.grade_max ?? null;
  const requiresHumanReview = result?.status === "manual_review_required";
  const approvalBlocked = result?.status === "error";

  const parsedGrade = useMemo(() => {
    const normalized = editedGrade.replace(",", ".").trim();
    if (!normalized) return null;

    const value = Number(normalized);
    return Number.isFinite(value) ? value : Number.NaN;
  }, [editedGrade]);

  const canApprove =
    Boolean(auditId) &&
    Boolean(result) &&
    !approvalBlocked &&
    !isGenerating &&
    !isApproving &&
    parsedGrade !== null &&
    Number.isFinite(parsedGrade) &&
    editedFeedback.trim().length > 0;

  const resetState = () => {
    setAuditId(null);
    setResult(null);
    setEditedGrade("");
    setEditedFeedback("");
    setRequestError(null);
    setIsGenerating(false);
    setIsApproving(false);
  };

  const handleGenerateSuggestion = async () => {
    if (!activity?.moodle_activity_id || !session) {
      setRequestError("A sessao Moodle nao esta disponivel para gerar a sugestao.");
      return;
    }

    setIsGenerating(true);
    setRequestError(null);

    try {
      const { data, error } = await generateStudentGradeSuggestion({
        session,
        courseId: activity.course_id,
        studentId,
        moodleActivityId: activity.moodle_activity_id,
      });

      if (error) {
        throw new Error(error.message || "Nao foi possivel gerar a sugestao com IA.");
      }

      if (!data?.result) {
        throw new Error(data?.message || "A sugestao nao retornou um resultado utilizavel.");
      }

      setAuditId(data.auditId ?? null);
      setResult(data.result);
      setEditedGrade(buildGradeInputValue(data.result));
      setEditedFeedback(data.result.suggestedFeedback ?? "");

      if (!data.success) {
        setRequestError(data.message || data.result.warnings[0] || "A sugestao foi retornada com restricoes.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nao foi possivel gerar a sugestao com IA.";
      setAuditId(null);
      setResult(null);
      setEditedGrade("");
      setEditedFeedback("");
      setRequestError(message);
      toast({
        variant: "destructive",
        title: "Falha ao gerar sugestao",
        description: message,
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApprove = async () => {
    if (!activity || !session || !auditId || parsedGrade === null || !Number.isFinite(parsedGrade)) {
      return;
    }

    setIsApproving(true);

    try {
      const { data, error } = await approveStudentGradeSuggestion({
        session,
        auditId,
        approvedGrade: parsedGrade,
        approvedFeedback: editedFeedback.trim(),
      });

      if (error) {
        throw new Error(error.message || "Nao foi possivel lancar a nota no Moodle.");
      }

      if (!data?.success) {
        throw new Error(data?.message || "O Moodle recusou a aprovacao desta sugestao.");
      }

      toast({
        title: "Nota lancada no Moodle",
        description: `${activity.activity_name} foi atualizada com a nota aprovada.`,
      });

      await onApproved?.();
      onOpenChange(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao aprovar a sugestao.";
      setRequestError(message);
      toast({
        variant: "destructive",
        title: "Falha ao lancar nota",
        description: message,
      });
    } finally {
      setIsApproving(false);
    }
  };

  useEffect(() => {
    if (!open) {
      resetState();
      return;
    }

    resetState();
    void handleGenerateSuggestion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activity?.id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Corrigir
          </DialogTitle>
          <DialogDescription>
            {activity
              ? `Revise a sugestao de nota e feedback antes de publicar no Moodle para ${activity.activity_name}.`
              : "Revise a sugestao de nota e feedback antes de publicar no Moodle."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/20 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Nota sugerida</p>
            <p className="mt-1 text-sm font-medium">
              {result?.suggestedGrade !== null && result?.suggestedGrade !== undefined
                ? `${result.suggestedGrade}${maxGrade !== null ? ` / ${maxGrade}` : ""}`
                : "Nao disponivel"}
            </p>
          </div>

          {(requestError || result?.warnings.length) ? (
            <Alert variant={result?.status === "error" ? "destructive" : "default"}>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Avisos da analise</AlertTitle>
              <AlertDescription className="space-y-2">
                {requestError && <p>{requestError}</p>}
                {result?.warnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </AlertDescription>
            </Alert>
          ) : null}

          {isGenerating ? (
            <div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed">
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Analisando contexto da atividade, submissao e arquivos do Moodle...
              </div>
            </div>
          ) : result ? (
            <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="grade-suggestion-grade">
                    Nota para aprovacao
                  </label>
                  <Input
                    id="grade-suggestion-grade"
                    inputMode="decimal"
                    placeholder={maxGrade !== null ? `0 ate ${maxGrade}` : "Nota"}
                    value={editedGrade}
                    onChange={(event) => setEditedGrade(event.target.value)}
                    disabled={approvalBlocked || isApproving}
                  />
                  {maxGrade !== null ? (
                    <p className="text-xs text-muted-foreground">A nota sera limitada automaticamente a {maxGrade}.</p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="grade-suggestion-feedback">
                    Feedback para aprovacao
                  </label>
                  <Textarea
                    id="grade-suggestion-feedback"
                    rows={10}
                    placeholder="Feedback construtivo para o aluno"
                    value={editedFeedback}
                    onChange={(event) => setEditedFeedback(event.target.value)}
                    disabled={approvalBlocked || isApproving}
                  />
                </div>

                {requiresHumanReview ? (
                  <Alert>
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertTitle>Revisao humana obrigatoria</AlertTitle>
                    <AlertDescription>
                      Esta sugestao exige revisao humana. Edite a nota e o feedback conforme necessario antes de lancar no Moodle.
                    </AlertDescription>
                  </Alert>
                ) : null}
              </div>

              <div className="space-y-4">
                <div className="rounded-lg border p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Upload className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm font-medium">Origem do contexto analisado</p>
                  </div>
                  {result.sourcesUsed.length > 0 ? (
                    <div className="space-y-2">
                      {result.sourcesUsed.map((source) => (
                        <div key={`${source.type}-${source.label}`} className="rounded-md bg-muted/30 p-3 text-sm">
                          <p className="font-medium">{source.label}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {source.type} · Qualidade {formatExtractionQuality(source.extractionQuality)}
                            {source.requiresVisualAnalysis ? " · Revisao visual" : ""}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Nenhuma fonte estruturada foi registrada.</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
              Nenhuma sugestao disponivel.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleGenerateSuggestion()}
            disabled={isGenerating || isApproving || !activity || !session}
          >
            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            Corrigir novamente
          </Button>
          <Button type="button" onClick={() => void handleApprove()} disabled={!canApprove}>
            {isApproving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Aprovar e lancar nota
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
