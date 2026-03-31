import { truncateText } from './text.ts'
import type { AiEvaluationRequest } from './types.ts'

const MATERIAL_TEXT_LIMIT = 2500
const SUBMISSION_TEXT_LIMIT = 3500
export const DEFAULT_GRADE_SUGGESTION_CUSTOM_INSTRUCTIONS = [
  'Escreva o feedback como se fosse um professor real, com linguagem natural, acolhedora e proxima.',
  'Comece mencionando o nome do aluno diretamente.',
  'Estruture o feedback em tres partes dentro de um unico paragrafo corrido:',
  '  1. Abertura humanizada: comentario positivo genuino sobre a entrega, valorizando esforco, organizacao, participacao ou compreensao demonstrada.',
  '  2. Pontos positivos e melhorias de forma construtiva: destaque os acertos e apresente pontos de melhoria sem tom punitivo, explicando o que faltou e como melhorar. Evite frases vagas como "faltou aprofundamento" sem indicar onde ou como.',
  '  3. Encerramento motivador: incentive a evolucao do aluno e demonstre confianca no progresso dele.',
  'Nao use linguagem robotica como: "Observa-se", "Identifica-se", "A resposta apresenta".',
  'Nao use listas, topicos ou multiplos paragrafos. Escreva tudo em um unico paragrafo corrido.',
  'Transmita que o professor realmente leu a atividade.',
].join('\n')

export interface PromptTemplateResult {
  systemPrompt: string
  userPrompt: string
  promptPayload: Record<string, unknown>
}

function extractFirstName(value: string | undefined): string {
  const normalized = value?.trim() || ''
  if (!normalized) {
    return 'o aluno'
  }

  return normalized.split(/\s+/)[0] || 'o aluno'
}

export function buildGradeSuggestionPrompt(
  request: AiEvaluationRequest,
  options: { customInstructions?: string; hasVisionImages?: boolean } = {},
): PromptTemplateResult {
  const studentName = extractFirstName(request.studentName)

  // Quando vision não está ativo, arquivos puramente visuais (sem texto extraído) não devem ser
  // incluídos no payload da IA: eles têm texto vazio e o flag requer_analise_visual=true faz a IA
  // aplicar a regra de "depende de análise visual" mesmo quando há conteúdo textual suficiente.
  const filesForPrompt = options.hasVisionImages
    ? request.studentSubmission.extractedFiles
    : request.studentSubmission.extractedFiles.filter(
        (file) => !file.requiresVisualAnalysis || file.extractedText.trim().length > 0,
      )

  const visualDependencyForPrompt = filesForPrompt.some((file) => file.requiresVisualAnalysis)

  const promptPayload = {
    nota_maxima: request.maxGrade,
    aluno: studentName,
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
      arquivos: filesForPrompt.map((file) => ({
        nome: file.name,
        mime_type: file.mimeType,
        texto_extraido: truncateText(file.extractedText, SUBMISSION_TEXT_LIMIT),
        qualidade: file.extractionQuality,
        requer_analise_visual: file.requiresVisualAnalysis,
      })),
      confianca: request.studentSubmission.confidence,
      requer_revisao_manual: request.studentSubmission.requiresManualReview,
      dependencia_visual: visualDependencyForPrompt,
      avisos: request.studentSubmission.warnings,
    },
  }

  const customInstructions = options.customInstructions === undefined
    ? DEFAULT_GRADE_SUGGESTION_CUSTOM_INSTRUCTIONS
    : options.customInstructions.trim()

  const systemPrompt = [
    'Voce e um professor avaliando a entrega de um aluno em uma atividade do curso.',
    'Avalie a resposta com base no contexto completo da atividade e gere um feedback personalizado.',
    'Considere que o enunciado pode estar distribuido entre a descricao principal e materiais complementares da mesma secao do curso.',
    ...(customInstructions
      ? [
          'Instrucoes de estilo (aplique-as na geracao do feedback, sem alterar o formato de saida JSON):',
          customInstructions,
        ]
      : []),
    'Regras obrigatorias de resposta:',
    '1. Se a resposta nao atender ao que foi solicitado, retorne {"valida": false, "feedback": "...", "nota_recomendada": 0}.',
    '2. Se a resposta depender de analise visual e nao houver texto suficiente, retorne {"valida": false, "feedback": "A atividade nao pode ser avaliada automaticamente pois depende de analise visual.", "nota_recomendada": null}.',
    '3. Se a resposta for valida, gere o feedback seguindo as instrucoes de estilo acima.',
    '4. Nao altere o formato de saida por causa das instrucoes de estilo. O retorno deve continuar seguindo exatamente o JSON esperado.',
    '5. Nao inclua nota, pontuacao, percentual, fracao numerica ou qualquer valor de nota dentro do campo "feedback". A nota deve aparecer somente em "nota_recomendada".',
    '6. Retorne somente JSON valido.',
    '7. Nao assine o feedback com nome de professor, tutor, monitor ou qualquer despedida final identificando autoria.',
    ...(options.hasVisionImages
      ? ['8. Imagens da submissao do aluno foram anexadas a esta mensagem. Analise o conteudo visual diretamente para subsidiar a avaliacao.']
      : []),
  ].join('\n')

  return {
    systemPrompt,
    userPrompt: JSON.stringify(promptPayload, null, 2),
    promptPayload,
  }
}
