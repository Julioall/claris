import { describe, expect, it, vi } from "vitest";

import {
  approveGradeSuggestion,
  generateGradeSuggestion,
} from "../../../../supabase/functions/_shared/grade-suggestions/orchestrator.ts";
import type { AiEvaluationExecutionResult } from "../../../../supabase/functions/_shared/grade-suggestions/ai-evaluation.ts";
import type {
  ActivityEvaluationContext,
  ContextSource,
  ExtractedFile,
  NormalizedSubmission,
} from "../../../../supabase/functions/_shared/grade-suggestions/types.ts";

function buildContext(overrides: Partial<ActivityEvaluationContext> = {}): ActivityEvaluationContext {
  return {
    activityId: "cm-77",
    courseId: "course-1",
    assign: {
      id: 55,
      courseModuleId: 77,
      name: "SAP 4",
      sectionId: 9,
    },
    primaryDescription: "Avalie a atividade com base no material da secao.",
    supplementaryMaterials: [],
    relatedResources: [],
    maxGrade: 10,
    ...overrides,
  };
}

function buildExtractedFile(overrides: Partial<ExtractedFile> = {}): ExtractedFile {
  return {
    name: "resposta.txt",
    mimeType: "text/plain",
    extractedText: "Resposta objetiva do aluno",
    extractionQuality: "medium",
    requiresVisualAnalysis: false,
    textLength: 26,
    sourceUrl: null,
    warning: null,
    ...overrides,
  };
}

function buildSubmission(overrides: Partial<NormalizedSubmission> = {}): NormalizedSubmission {
  return {
    submissionId: "sub-1",
    studentId: "student-1",
    typedText: "Resposta objetiva do aluno com os passos executados.",
    extractedFiles: [buildExtractedFile()],
    confidence: "medium",
    warnings: [],
    status: "submitted",
    attemptNumber: 0,
    ...overrides,
  };
}

function buildSources(): ContextSource[] {
  return [
    {
      label: "Texto digitado no Moodle",
      type: "submission_text",
      extractionQuality: "high",
      requiresVisualAnalysis: false,
    },
  ];
}

function buildEvaluation(): AiEvaluationExecutionResult {
  return {
    evaluation: {
      valida: true,
      feedback: "Boa resposta, com pequenos pontos de melhoria.",
      notaRecomendada: 8.5,
      confidence: "high",
    },
    rawResponse: { id: "chatcmpl-1" },
    provider: "openai",
    model: "gpt-5.4-mini",
    promptPayload: { nota_maxima: 10 },
  };
}

describe("grade suggestion orchestrator", () => {
  it("finaliza com erro controlado quando a chamada de IA falha", async () => {
    const finalizeAudit = vi.fn().mockResolvedValue(undefined);

    const output = await generateGradeSuggestion({
      userId: "user-1",
      studentId: "student-1",
      courseId: "course-1",
      studentActivityId: "activity-1",
      moodleActivityId: "77",
    }, {
      createDraftAudit: vi.fn().mockResolvedValue("audit-1"),
      finalizeAudit,
      buildContext: vi.fn().mockResolvedValue({
        context: buildContext(),
        sourcesUsed: buildSources(),
        contextSummary: {},
        moodleAssignId: 55,
      }),
      normalizeSubmission: vi.fn().mockResolvedValue({
        submission: buildSubmission(),
        sourcesUsed: buildSources(),
        submissionSummary: {},
      }),
      evaluate: vi.fn().mockRejectedValue(new Error("LLM indisponivel")),
    });

    expect(output.result.status).toBe("error");
    expect(output.result.warnings).toContain("LLM indisponivel");
    expect(finalizeAudit).toHaveBeenCalledWith("audit-1", expect.objectContaining({
      status: "error",
      errorMessage: "LLM indisponivel",
    }));
  });

  it("exige revisao manual quando nao existe submissao enviada", async () => {
    const evaluate = vi.fn();
    const finalizeAudit = vi.fn().mockResolvedValue(undefined);

    const output = await generateGradeSuggestion({
      userId: "user-1",
      studentId: "student-1",
      courseId: "course-1",
      studentActivityId: "activity-1",
      moodleActivityId: "77",
    }, {
      createDraftAudit: vi.fn().mockResolvedValue("audit-2"),
      finalizeAudit,
      buildContext: vi.fn().mockResolvedValue({
        context: buildContext(),
        sourcesUsed: buildSources(),
        contextSummary: {},
        moodleAssignId: 55,
      }),
      normalizeSubmission: vi.fn().mockResolvedValue({
        submission: buildSubmission({
          submissionId: null,
          typedText: "",
          extractedFiles: [],
          status: "missing",
          warnings: ["Nenhuma submissao foi localizada no Moodle para este aluno."],
        }),
        sourcesUsed: [],
        submissionSummary: { submission_found: false },
      }),
      evaluate,
    });

    expect(output.result.status).toBe("manual_review_required");
    expect(output.result.suggestedGrade).toBeNull();
    expect(output.result.reason).toBe("missing_submission");
    expect(evaluate).not.toHaveBeenCalled();
    expect(finalizeAudit).toHaveBeenCalledWith("audit-2", expect.objectContaining({
      status: "manual_review_required",
    }));
  });

  it("aprova a sugestao e limita a nota ao maximo permitido antes de enviar ao Moodle", async () => {
    const saveGradeToMoodle = vi.fn().mockResolvedValue({ ok: true });
    const markActivityApproved = vi.fn().mockResolvedValue(undefined);
    const finalizeAudit = vi.fn().mockResolvedValue(undefined);

    const output = await approveGradeSuggestion({
      auditId: "audit-3",
      approvedGrade: 12,
      approvedFeedback: "Feedback final aprovado",
      approvedAt: "2026-03-26T10:00:00.000Z",
    }, {
      loadAudit: vi.fn().mockResolvedValue({
        id: "audit-3",
        status: "success",
        maxGrade: 10,
        moodleAssignId: 55,
        studentId: "student-1",
        courseId: "course-1",
        studentActivityId: "activity-1",
      }),
      saveGradeToMoodle,
      markActivityApproved,
      finalizeAudit,
    });

    expect(output).toMatchObject({
      success: true,
      approvedGrade: 10,
      approvedFeedback: "Feedback final aprovado",
    });
    expect(saveGradeToMoodle).toHaveBeenCalledWith(expect.objectContaining({
      approvedGrade: 10,
      approvedFeedback: "Feedback final aprovado",
    }));
    expect(markActivityApproved).toHaveBeenCalled();
    expect(finalizeAudit).toHaveBeenCalledWith("audit-3", expect.objectContaining({
      status: "approved",
      approvedGrade: 10,
    }));
  });

  it("registra erro de aprovacao quando o Moodle falha no lancamento", async () => {
    const finalizeAudit = vi.fn().mockResolvedValue(undefined);

    const output = await approveGradeSuggestion({
      auditId: "audit-4",
      approvedGrade: 7,
      approvedFeedback: "Feedback final aprovado",
      approvedAt: "2026-03-26T10:00:00.000Z",
    }, {
      loadAudit: vi.fn().mockResolvedValue({
        id: "audit-4",
        status: "invalid",
        maxGrade: 10,
        moodleAssignId: 55,
        studentId: "student-1",
        courseId: "course-1",
        studentActivityId: "activity-1",
      }),
      saveGradeToMoodle: vi.fn().mockRejectedValue(new Error("Moodle indisponivel")),
      markActivityApproved: vi.fn().mockResolvedValue(undefined),
      finalizeAudit,
    });

    expect(output).toMatchObject({
      success: false,
      message: "Moodle indisponivel",
    });
    expect(finalizeAudit).toHaveBeenCalledWith("audit-4", expect.objectContaining({
      status: "approval_error",
      errorMessage: "Moodle indisponivel",
    }));
  });

  it("permite aprovar manualmente uma sugestao marcada para revisao humana", async () => {
    const saveGradeToMoodle = vi.fn().mockResolvedValue({ ok: true });
    const markActivityApproved = vi.fn().mockResolvedValue(undefined);
    const finalizeAudit = vi.fn().mockResolvedValue(undefined);

    const output = await approveGradeSuggestion({
      auditId: "audit-4b",
      approvedGrade: 6,
      approvedFeedback: "Feedback revisado manualmente",
      approvedAt: "2026-03-26T10:00:00.000Z",
    }, {
      loadAudit: vi.fn().mockResolvedValue({
        id: "audit-4b",
        status: "manual_review_required",
        maxGrade: 10,
        moodleAssignId: 55,
        studentId: "student-1",
        courseId: "course-1",
        studentActivityId: "activity-1",
      }),
      saveGradeToMoodle,
      markActivityApproved,
      finalizeAudit,
    });

    expect(output).toMatchObject({
      success: true,
      approvedGrade: 6,
      approvedFeedback: "Feedback revisado manualmente",
    });
    expect(saveGradeToMoodle).toHaveBeenCalled();
    expect(markActivityApproved).toHaveBeenCalled();
    expect(finalizeAudit).toHaveBeenCalledWith("audit-4b", expect.objectContaining({
      status: "approved",
      approvedGrade: 6,
    }));
  });

  it("persiste metadados do prompt e da resposta da IA quando a sugestao e gerada", async () => {
    const finalizeAudit = vi.fn().mockResolvedValue(undefined);

    const output = await generateGradeSuggestion({
      userId: "user-1",
      studentId: "student-1",
      courseId: "course-1",
      studentActivityId: "activity-1",
      moodleActivityId: "77",
    }, {
      createDraftAudit: vi.fn().mockResolvedValue("audit-5"),
      finalizeAudit,
      buildContext: vi.fn().mockResolvedValue({
        context: buildContext(),
        sourcesUsed: buildSources(),
        contextSummary: { assign_name: "SAP 4" },
        moodleAssignId: 55,
      }),
      normalizeSubmission: vi.fn().mockResolvedValue({
        submission: buildSubmission(),
        sourcesUsed: buildSources(),
        submissionSummary: { submission_found: true },
      }),
      evaluate: vi.fn().mockResolvedValue(buildEvaluation()),
    });

    expect(output.result).toMatchObject({
      status: "success",
      suggestedGrade: 8.5,
      suggestedFeedback: "Boa resposta, com pequenos pontos de melhoria.",
      confidence: "medium",
    });
    expect(finalizeAudit).toHaveBeenCalledWith("audit-5", expect.objectContaining({
      status: "success",
      promptPayload: { nota_maxima: 10 },
      aiResponse: { id: "chatcmpl-1" },
      provider: "openai",
      model: "gpt-5.4-mini",
    }));
  });

  it("avalia com IA quando visao esta habilitada e submissao contem imagem com bytes", async () => {
    const evaluate = vi.fn().mockResolvedValue(buildEvaluation());
    const finalizeAudit = vi.fn().mockResolvedValue(undefined);

    const output = await generateGradeSuggestion({
      userId: "user-1",
      studentId: "student-1",
      courseId: "course-1",
      studentActivityId: "activity-1",
      moodleActivityId: "77",
    }, {
      createDraftAudit: vi.fn().mockResolvedValue("audit-vision-1"),
      finalizeAudit,
      buildContext: vi.fn().mockResolvedValue({
        context: buildContext(),
        sourcesUsed: buildSources(),
        contextSummary: {},
        moodleAssignId: 55,
      }),
      normalizeSubmission: vi.fn().mockResolvedValue({
        submission: buildSubmission({
          typedText: "",
          extractedFiles: [
            buildExtractedFile({
              name: "diagrama.png",
              mimeType: "image/png",
              extractedText: "",
              extractionQuality: "none",
              requiresVisualAnalysis: true,
              textLength: 0,
              fileBytes: new Uint8Array([1, 2, 3]),
            }),
          ],
        }),
        sourcesUsed: buildSources(),
        submissionSummary: { submission_found: true },
      }),
      evaluate,
      visionEnabled: true,
    });

    expect(evaluate).toHaveBeenCalled();
    expect(output.result.status).toBe("success");
    expect(output.result.suggestedGrade).toBe(8.5);
  });

  it("retorna sucesso com nota nula quando a atividade e nao avaliativa", async () => {
    const evaluate = vi.fn().mockResolvedValue({
      evaluation: {
        valida: true,
        feedback: "Resposta bem estruturada e com boa argumentacao.",
        notaRecomendada: null,
        confidence: "high",
      },
      rawResponse: { id: "chatcmpl-2" },
      provider: "openai",
      model: "gpt-5.4-mini",
      promptPayload: { nota_maxima: null },
    });

    const output = await generateGradeSuggestion({
      userId: "user-1",
      studentId: "student-1",
      courseId: "course-1",
      studentActivityId: "activity-1",
      moodleActivityId: "77",
    }, {
      createDraftAudit: vi.fn().mockResolvedValue("audit-no-grade"),
      finalizeAudit: vi.fn().mockResolvedValue(undefined),
      buildContext: vi.fn().mockResolvedValue({
        context: buildContext({ maxGrade: null }),
        sourcesUsed: buildSources(),
        contextSummary: {},
        moodleAssignId: 55,
      }),
      normalizeSubmission: vi.fn().mockResolvedValue({
        submission: buildSubmission(),
        sourcesUsed: buildSources(),
        submissionSummary: { submission_found: true },
      }),
      evaluate,
    });

    expect(output.result.status).toBe("success");
    expect(output.result.suggestedGrade).toBeNull();
    expect(evaluate).toHaveBeenCalled();
  });
});
