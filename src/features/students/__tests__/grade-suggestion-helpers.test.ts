import { describe, expect, it } from "vitest";

import { selectRelatedResources } from "../../../../supabase/functions/_shared/grade-suggestions/heuristics.ts";
import { buildGradeSuggestionPrompt } from "../../../../supabase/functions/_shared/grade-suggestions/prompt.ts";
import { parseAiEvaluationResponse } from "../../../../supabase/functions/_shared/grade-suggestions/ai-evaluation.ts";
import { deriveSubmissionReviewState } from "../../../../supabase/functions/_shared/grade-suggestions/submission-normalizer.ts";
import type {
  ActivityEvaluationContext,
  ExtractedFile,
  NormalizedSubmission,
} from "../../../../supabase/functions/_shared/grade-suggestions/types.ts";

function buildExtractedFile(overrides: Partial<ExtractedFile> = {}): ExtractedFile {
  return {
    name: "resposta.txt",
    mimeType: "text/plain",
    extractedText: "texto",
    extractionQuality: "low",
    requiresVisualAnalysis: false,
    textLength: 5,
    sourceUrl: null,
    warning: null,
    ...overrides,
  };
}

function buildSubmission(overrides: Partial<NormalizedSubmission> = {}): NormalizedSubmission {
  return {
    submissionId: "sub-1",
    studentId: "student-1",
    typedText: "Resposta do aluno sobre monitoramento e inventario de maquinas.",
    extractedFiles: [],
    confidence: "medium",
    warnings: [],
    status: "submitted",
    attemptNumber: 0,
    ...overrides,
  };
}

function buildContext(overrides: Partial<ActivityEvaluationContext> = {}): ActivityEvaluationContext {
  return {
    activityId: "cm-10",
    courseId: "course-1",
    assign: {
      id: 77,
      courseModuleId: 10,
      name: "SAP 4 - Parte 1",
      sectionId: 3,
    },
    primaryDescription: "Explique como monitorar computadores e registrar evidencias.",
    supplementaryMaterials: [
      {
        id: "material-1",
        type: "file",
        name: "SAP 4 - Enunciado.pdf",
        extractedText: "Use o material da secao para responder com objetividade.",
        extractionQuality: "medium",
        requiresVisualAnalysis: false,
        sourceUrl: null,
      },
    ],
    relatedResources: [],
    maxGrade: 10,
    ...overrides,
  };
}

describe("grade suggestion helpers", () => {
  it("associa recursos relevantes da mesma secao com score e motivos explicitos", () => {
    const results = selectRelatedResources([
      {
        assignName: "SAP 4 - Parte 1",
        assignTimestamp: Date.UTC(2026, 2, 10),
        candidateId: "resource-1",
        candidateType: "file",
        candidateName: "SAP 4 - Parte 1 - Enunciado.pdf",
        candidateTimestamp: Date.UTC(2026, 2, 11),
        sameSection: true,
      },
      {
        assignName: "SAP 4 - Parte 1",
        assignTimestamp: Date.UTC(2026, 2, 10),
        candidateId: "resource-2",
        candidateType: "page",
        candidateName: "Leitura complementar",
        candidateTimestamp: Date.UTC(2025, 10, 1),
        sameSection: false,
      },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      resourceId: "resource-1",
      type: "file",
      name: "SAP 4 - Parte 1 - Enunciado.pdf",
    });
    expect(results[0].score).toBeGreaterThanOrEqual(0.45);
    expect(results[0].reason).toEqual(expect.arrayContaining(["same_section", "similar_name", "keyword_match"]));
  });

  it("calcula confianca baixa para submissao com arquivo visual sem texto", () => {
    const reviewState = deriveSubmissionReviewState({
      typedText: "",
      extractedFiles: [
        buildExtractedFile({
          name: "mapa-conceitual.png",
          mimeType: "image/png",
          extractedText: "",
          extractionQuality: "none",
          requiresVisualAnalysis: true,
          textLength: 0,
        }),
      ],
    });

    expect(reviewState.confidence).toBe("low");
  });

  it("calcula confianca baixa quando arquivo contem bytes sem texto", () => {
    const reviewState = deriveSubmissionReviewState({
      typedText: "",
      extractedFiles: [
        buildExtractedFile({
          name: "mapa-conceitual.png",
          mimeType: "image/png",
          extractedText: "",
          extractionQuality: "none",
          requiresVisualAnalysis: true,
          textLength: 0,
          fileBytes: new Uint8Array([1, 2, 3]),
        }),
      ],
    });

    expect(reviewState.confidence).toBe("low");
  });

  it("calcula confianca baixa quando arquivos nao produzem texto suficiente", () => {
    const reviewState = deriveSubmissionReviewState({
      typedText: "",
      extractedFiles: [
        buildExtractedFile({
          name: "scan.pdf",
          mimeType: "application/pdf",
          extractedText: "trecho curto",
          extractionQuality: "low",
          requiresVisualAnalysis: false,
          textLength: 12,
        }),
      ],
    });

    expect(reviewState.confidence).toBe("low");
  });

  it("monta o payload da IA com nota maxima, contexto e submissao normalizada", () => {
    const prompt = buildGradeSuggestionPrompt({
      maxGrade: 10,
      activityContext: buildContext(),
      studentSubmission: buildSubmission({
        extractedFiles: [
          buildExtractedFile({
            name: "relatorio.docx",
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            extractedText: "Relatorio do aluno com os passos executados.",
            extractionQuality: "medium",
            textLength: 43,
          }),
        ],
      }),
    });

    expect(prompt.promptPayload).toMatchObject({
      nota_maxima: 10,
      atividade: {
        nome: "SAP 4 - Parte 1",
      },
      resposta_aluno: {
        confianca: "medium",
      },
    });
    expect(prompt.userPrompt).toContain('"materiais_complementares"');
    expect(prompt.userPrompt).toContain('"arquivos"');
    expect(prompt.systemPrompt).toContain('nota_recomendada');
    expect(prompt.systemPrompt).toContain('Escreva o feedback como se fosse um professor real');
  });

  it("inclui apenas o primeiro nome do aluno no payload quando fornecido", () => {
    const prompt = buildGradeSuggestionPrompt({
      maxGrade: 10,
      activityContext: buildContext(),
      studentSubmission: buildSubmission(),
      studentName: "Ana Souza",
    });

    expect(prompt.promptPayload).toMatchObject({
      aluno: "Ana",
    });
    expect(prompt.userPrompt).toContain('"aluno": "Ana"');
    expect(prompt.userPrompt).not.toContain('"professor"');
  });

  it("usa fallback 'o aluno' quando studentName nao e fornecido", () => {
    const prompt = buildGradeSuggestionPrompt({
      maxGrade: 10,
      activityContext: buildContext(),
      studentSubmission: buildSubmission(),
    });

    expect(prompt.promptPayload).toMatchObject({ aluno: "o aluno" });
    expect((prompt.promptPayload as Record<string, unknown>).professor).toBeUndefined();
  });

  it("inclui instrucoes personalizadas sem expor o contrato fixo de resposta", () => {
    const prompt = buildGradeSuggestionPrompt({
      maxGrade: 10,
      activityContext: buildContext(),
      studentSubmission: buildSubmission(),
    }, {
      customInstructions: "Use linguagem mais acolhedora e destaque melhorias ao final.",
    });

    expect(prompt.systemPrompt).toContain('Instrucoes de estilo');
    expect(prompt.systemPrompt).toContain('Use linguagem mais acolhedora');
    expect(prompt.systemPrompt).toContain('JSON esperado');
  });

  it("inclui instrucao sobre imagens no system prompt quando hasVisionImages e verdadeiro", () => {
    const prompt = buildGradeSuggestionPrompt({
      maxGrade: 10,
      activityContext: buildContext(),
      studentSubmission: buildSubmission(),
    }, { hasVisionImages: true });

    expect(prompt.systemPrompt).toContain('Imagens da submissao do aluno foram anexadas');
  });

  it("nao inclui instrucao sobre imagens no system prompt por padrao", () => {
    const prompt = buildGradeSuggestionPrompt({
      maxGrade: 10,
      activityContext: buildContext(),
      studentSubmission: buildSubmission(),
    });

    expect(prompt.systemPrompt).not.toContain('Imagens da submissao');
  });

  it("indica no prompt quando a atividade e nao avaliativa", () => {
    const prompt = buildGradeSuggestionPrompt({
      maxGrade: null,
      activityContext: buildContext({ maxGrade: null }),
      studentSubmission: buildSubmission(),
    });

    expect(prompt.promptPayload).toMatchObject({ nota_maxima: null });
    expect(prompt.systemPrompt).toContain('atividade e nao avaliativa');
  });

  it("faz parsing robusto da resposta JSON retornada pela IA", () => {
    const parsed = parseAiEvaluationResponse(
      '```json\n{"valida":true,"feedback":"Boa resposta, mas faltou detalhar o inventario.","nota_recomendada":12.3,"confidence":"high"}\n```',
      10,
    );

    expect(parsed).toMatchObject({
      valida: true,
      feedback: "Boa resposta, mas faltou detalhar o inventario.",
      notaRecomendada: 10,
      confidence: "high",
    });
  });

  it("remove nota do feedback sem sobrescrever o estilo retornado pela IA", () => {
    const parsed = parseAiEvaluationResponse(
      '{"valida":true,"feedback":"Feedback: O aluno apresenta conteudo relevante e coerente. Nota recomendada: 4,5/5.","nota_recomendada":4.5}',
      5,
    );

    expect(parsed.feedback).toBe("O aluno apresenta conteudo relevante e coerente.");
    expect(parsed.feedback.toLowerCase()).not.toContain("nota");
    expect(parsed.feedback).not.toContain("4,5/5");
  });

  it("ignora nota retornada pela IA quando a atividade nao possui nota maxima", () => {
    const parsed = parseAiEvaluationResponse(
      '{"valida":true,"feedback":"Bom trabalho!","nota_recomendada":9.1}',
      null,
    );

    expect(parsed.notaRecomendada).toBeNull();
  });
});
