import { buildGradeSuggestionPrompt } from './prompt.ts'
import { truncateText } from './text.ts'
import type { AiEvaluationRequest, AiEvaluationResponse, SuggestionConfidence } from './types.ts'

export interface AiClientConfig {
  provider: string
  model: string
  baseUrl: string
  apiKey: string
  timeoutMs: number
}

export interface AiEvaluationExecutionResult {
  evaluation: AiEvaluationResponse
  rawResponse: Record<string, unknown>
  provider: string
  model: string
  promptPayload: Record<string, unknown>
}

function extractJsonCandidate(value: string): string {
  const trimmed = value.trim()
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed
  }

  const codeFenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (codeFenceMatch?.[1]) {
    return codeFenceMatch[1].trim()
  }

  const firstBrace = trimmed.indexOf('{')
  const lastBrace = trimmed.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1)
  }

  return trimmed
}

function normalizeConfidence(value: unknown): SuggestionConfidence | undefined {
  return value === 'high' || value === 'medium' || value === 'low'
    ? value
    : undefined
}

function normalizeFeedbackTone(value: string): string {
  return value
    .replace(/\b(?:o aluno|a aluna|o estudante|a estudante)\s+apresenta\b/gi, 'A resposta apresenta')
    .replace(/\b(?:o aluno|a aluna|o estudante|a estudante)\s+apresentou\b/gi, 'A resposta apresenta')
    .replace(/\b(?:o aluno|a aluna|o estudante|a estudante)\s+demonstra\b/gi, 'A resposta demonstra')
    .replace(/\b(?:o aluno|a aluna|o estudante|a estudante)\s+demonstrou\b/gi, 'A resposta demonstra')
    .replace(/\b(?:o aluno|a aluna|o estudante|a estudante|voce)\s+deve\b/gi, 'Recomenda-se')
    .replace(/\b(?:o aluno|a aluna|o estudante|a estudante|voce)\s+precisa\b/gi, 'E importante')
    .replace(/\b(?:seu|sua)\s+trabalho\b/gi, 'o trabalho')
}

function stripGradeMentions(value: string): string {
  return value
    .replace(/\b(?:nota|pontuacao|grade|score|percentual)\s*(?:final|recomendada|sugerida)?\s*[:=-]?\s*\d+(?:[.,]\d+)?(?:\s*\/\s*\d+(?:[.,]\d+)?)?%?/gi, '')
    .replace(/\b\d+(?:[.,]\d+)?\s*\/\s*\d+(?:[.,]\d+)?\b/g, '')
}

function normalizeFeedbackText(value: string): string {
  let normalized = value
    .replace(/\r\n/g, '\n')
    .replace(/^feedback\s*:\s*/i, '')
    .trim()

  normalized = stripGradeMentions(normalized)
  normalized = normalizeFeedbackTone(normalized)

  normalized = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/\s{2,}/g, ' ').trim())
    .filter((line) => /[A-Za-z0-9]/.test(line))
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/([,.;:!?])\s*\1+/g, '$1')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim()

  return truncateText(normalized, 2000)
}

export function parseAiEvaluationResponse(rawContent: string, maxGrade: number): AiEvaluationResponse {
  const candidate = extractJsonCandidate(rawContent)
  let parsed: Record<string, unknown>

  try {
    parsed = JSON.parse(candidate) as Record<string, unknown>
  } catch {
    throw new Error('A IA retornou conteudo fora do formato JSON esperado.')
  }

  if (typeof parsed.feedback !== 'string') {
    throw new Error('A IA retornou um feedback vazio ou invalido.')
  }

  const normalizedFeedback = normalizeFeedbackText(parsed.feedback)
  if (!normalizedFeedback) {
    throw new Error('A IA retornou um feedback vazio ou invalido.')
  }

  const rawGrade = parsed.nota_recomendada ?? parsed.notaRecomendada
  let normalizedGrade: number | null = null

  if (rawGrade === null || rawGrade === undefined || rawGrade === '') {
    normalizedGrade = null
  } else {
    const numericGrade = Number(rawGrade)
    if (!Number.isFinite(numericGrade)) {
      throw new Error('A IA retornou uma nota recomendada invalida.')
    }

    normalizedGrade = Number(Math.max(0, Math.min(maxGrade, numericGrade)).toFixed(2))
  }

  return {
    valida: Boolean(parsed.valida),
    feedback: normalizedFeedback,
    notaRecomendada: normalizedGrade,
    reason: typeof parsed.reason === 'string' ? truncateText(parsed.reason.trim(), 500) : undefined,
    confidence: normalizeConfidence(parsed.confidence),
  }
}

export async function executeAiEvaluation(
  config: AiClientConfig,
  request: AiEvaluationRequest,
): Promise<AiEvaluationExecutionResult> {
  const prompt = buildGradeSuggestionPrompt(request)
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs)

  try {
    const response = await fetch(`${config.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.1,
        max_tokens: 800,
        messages: [
          { role: 'system', content: prompt.systemPrompt },
          { role: 'user', content: prompt.userPrompt },
        ],
      }),
      signal: controller.signal,
    })

    let rawResponse: Record<string, unknown> = {}
    try {
      rawResponse = await response.json() as Record<string, unknown>
    } catch {
      rawResponse = {}
    }

    if (!response.ok) {
      const message =
        (rawResponse.error && typeof rawResponse.error === 'object' && 'message' in rawResponse.error
          ? String((rawResponse.error as { message?: unknown }).message ?? '')
          : '') ||
        (typeof rawResponse.message === 'string' ? rawResponse.message : '') ||
        `LLM returned status ${response.status}`

      throw new Error(message)
    }

    const choices = Array.isArray(rawResponse.choices) ? rawResponse.choices : []
    const firstChoice = choices[0] as { message?: { content?: unknown } } | undefined
    const content = typeof firstChoice?.message?.content === 'string'
      ? firstChoice.message.content
      : ''

    if (!content.trim()) {
      throw new Error('A IA retornou uma resposta vazia.')
    }

    return {
      evaluation: parseAiEvaluationResponse(content, request.maxGrade),
      rawResponse,
      provider: config.provider,
      model: config.model,
      promptPayload: prompt.promptPayload,
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('A avaliacao por IA excedeu o tempo limite configurado.')
    }

    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}
