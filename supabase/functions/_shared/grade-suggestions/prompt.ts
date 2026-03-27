import { truncateText } from './text.ts'
import type { AiEvaluationRequest } from './types.ts'

const MATERIAL_TEXT_LIMIT = 2500
const SUBMISSION_TEXT_LIMIT = 3500
const FEEDBACK_LINE_LIMIT = 10

export interface PromptTemplateResult {
  systemPrompt: string
  userPrompt: string
  promptPayload: Record<string, unknown>
}

export function buildGradeSuggestionPrompt(request: AiEvaluationRequest): PromptTemplateResult {
  const promptPayload = {
    nota_maxima: request.maxGrade,
    atividade: {
      nome: request.activityContext.assign.name,
      descricao_principal: truncateText(request.activityContext.primaryDescription, MATERIAL_TEXT_LIMIT),
      materiais_complementares: request.activityContext.supplementaryMaterials.map((material) => ({
        nome: material.name,
        tipo: material.type,
        texto: truncateText(material.extractedText, MATERIAL_TEXT_LIMIT),
        qualidade: material.extractionQuality,
        requer_analise_visual: material.requiresVisualAnalysis,
      })),
    },
    resposta_aluno: {
      texto_digitado: truncateText(request.studentSubmission.typedText, SUBMISSION_TEXT_LIMIT),
      arquivos: request.studentSubmission.extractedFiles.map((file) => ({
        nome: file.name,
        mime_type: file.mimeType,
        texto_extraido: truncateText(file.extractedText, SUBMISSION_TEXT_LIMIT),
        qualidade: file.extractionQuality,
        requer_analise_visual: file.requiresVisualAnalysis,
      })),
      confianca: request.studentSubmission.confidence,
      requer_revisao_manual: request.studentSubmission.requiresManualReview,
      dependencia_visual: request.studentSubmission.visualDependency,
      avisos: request.studentSubmission.warnings,
    },
  }

  const systemPrompt = [
    'Voce e um avaliador educacional especializado em atividades tecnicas do curso de informatica, com analise objetiva, coerente e construtiva.',
    'Avalie a resposta com base no contexto completo da atividade.',
    'Considere que o enunciado pode estar distribuido entre a descricao principal e materiais complementares da mesma secao do curso.',
    'Regras:',
    '1. Se a resposta nao atender ao que foi solicitado, retorne {"valida": false, "feedback": "...", "nota_recomendada": 0}.',
    '2. Se a resposta depender de analise visual e nao houver texto suficiente, retorne {"valida": false, "feedback": "A resposta nao pode ser avaliada automaticamente pois depende de analise visual.", "nota_recomendada": null}.',
    `3. Se a resposta for valida, gere feedback em no maximo ${FEEDBACK_LINE_LIMIT} linhas, com pontos fortes e melhorias, sem ultrapassar a nota maxima.`,
    '4. O texto do feedback deve ser impessoal e tecnico.',
    '5. Nao se dirija diretamente ao aluno e nao use expressoes como "o aluno deve", "voce deve", "seu trabalho" ou equivalentes.',
    '6. Nao inclua nota, pontuacao, percentual, fracao numerica ou qualquer valor de nota dentro do campo "feedback". A nota deve aparecer somente em "nota_recomendada".',
    '7. Prefira formulacoes como "A resposta apresenta", "observa-se", "recomenda-se" e "e importante".',
    '8. Retorne somente JSON valido.',
  ].join('\n')

  return {
    systemPrompt,
    userPrompt: JSON.stringify(promptPayload, null, 2),
    promptPayload,
  }
}
