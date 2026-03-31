import { buildGradeSuggestionPrompt } from './prompt.ts'
import { truncateText } from './text.ts'
import type { AiEvaluationRequest, AiEvaluationResponse, SuggestionConfidence } from './types.ts'

export interface AiClientConfig {
  provider: string
  model: string
  baseUrl: string
  apiKey: string
  timeoutMs: number
  customInstructions?: string
  feedbackSignature?: string
  visionEnabled?: boolean
}

export interface AiEvaluationExecutionResult {
  evaluation: AiEvaluationResponse
  rawResponse: Record<string, unknown>
  provider: string
  model: string
  promptPayload: Record<string, unknown>
}

interface UploadedFileReference {
  id: string
}

interface InlineImageInput {
  type: 'input_image'
  image_url: string
}

const CONTEXT_STUFFING_SUPPORTED_EXTENSIONS = new Set([
  'art', 'bat', 'brf', 'c', 'cls', 'css', 'csv', 'diff', 'doc', 'docx', 'dot', 'eml', 'es', 'h', 'hs', 'htm',
  'html', 'hwp', 'hwpx', 'ics', 'ifb', 'java', 'js', 'json', 'keynote', 'ksh', 'ltx', 'mail', 'markdown', 'md',
  'mht', 'mhtml', 'mjs', 'nws', 'odt', 'pages', 'patch', 'pdf', 'pl', 'pm', 'pot', 'ppa', 'pps', 'ppt', 'pptx',
  'pwz', 'py', 'rst', 'rtf', 'scala', 'sh', 'shtml', 'srt', 'sty', 'svg', 'svgz', 'tex', 'text', 'txt', 'vcf',
  'vtt', 'wiz', 'xla', 'xlb', 'xlc', 'xlm', 'xls', 'xlsx', 'xlt', 'xlw', 'xml', 'yaml', 'yml',
])

const MAX_INLINE_IMAGE_BYTES = 4 * 1024 * 1024

function getLowercaseExtension(fileName: string): string {
  const trimmed = fileName.trim().toLowerCase()
  const dotIndex = trimmed.lastIndexOf('.')

  if (dotIndex < 0 || dotIndex === trimmed.length - 1) {
    return ''
  }

  return trimmed.slice(dotIndex + 1)
}

function canUploadAsInputFile(fileName: string): boolean {
  const extension = getLowercaseExtension(fileName)
  return extension ? CONTEXT_STUFFING_SUPPORTED_EXTENSIONS.has(extension) : false
}

function isImageMimeType(mimeType: string): boolean {
  return mimeType.toLowerCase().startsWith('image/')
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary)
}

function toInlineImageInput(file: { mimeType: string; bytes: Uint8Array }): InlineImageInput {
  const normalizedMime = file.mimeType.trim() || 'application/octet-stream'
  const base64 = bytesToBase64(file.bytes)

  return {
    type: 'input_image',
    image_url: `data:${normalizedMime};base64,${base64}`,
  }
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

function stripGradeMentions(value: string): string {
  return value
    .replace(/\b(?:nota|pontuacao|grade|score|percentual)\s*(?:final|recomendada|sugerida)?\s*[:=-]?\s*\d+(?:[.,]\d+)?(?:\s*\/\s*\d+(?:[.,]\d+)?)?%?/gi, '')
    .replace(/\b\d+(?:[.,]\d+)?\s*\/\s*\d+(?:[.,]\d+)?\b/g, '')
}

function stripClosingSignature(value: string): string {
  let normalized = value.trim()

  const trailingPatterns = [
    /\n+\s*(?:atenciosamente|abracos?|abs\.?|obrigado(?:a)?|cordialmente)\b[\s\S]*$/i,
    /(?:\s|^)(?:-|:)??\s*(?:tutor|professor|monitor)\s+[A-ZÀ-Ý][A-Za-zÀ-ÿ'-]*(?:\s+[A-ZÀ-Ý][A-Za-zÀ-ÿ'-]*)*\s*$/i,
    /\n+\s*(?:tutor|professor|monitor)\s+[A-ZÀ-Ý][A-Za-zÀ-ÿ'-]*(?:\s+[A-ZÀ-Ý][A-Za-zÀ-ÿ'-]*)*\s*$/i,
  ]

  for (const pattern of trailingPatterns) {
    normalized = normalized.replace(pattern, '').trim()
  }

  return normalized
}

function normalizeFeedbackText(value: string): string {
  let normalized = value
    .replace(/\r\n/g, '\n')
    .replace(/^feedback\s*:\s*/i, '')
    .trim()

  normalized = stripGradeMentions(normalized)
  normalized = stripClosingSignature(normalized)

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

function extractFirstName(value: string | undefined): string | null {
  const normalized = value?.trim() || ''
  if (!normalized) {
    return null
  }

  return normalized.split(/\s+/)[0] || null
}

function lowercaseLeadingLetter(value: string): string {
  return value.replace(/^([A-ZÀ-Ý])/, (match) => match.toLowerCase())
}

function ensureFeedbackStartsWithStudentName(feedback: string, studentName?: string): string {
  const firstName = extractFirstName(studentName)
  if (!firstName) {
    return feedback
  }

  const escapedName = firstName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const alreadyStartsWithName = new RegExp(`^${escapedName}(?:\\b|\\s*[,!:.-])`, 'i').test(feedback)
  if (alreadyStartsWithName) {
    return feedback
  }

  return `${firstName}, ${lowercaseLeadingLetter(feedback)}`
}

function normalizeSignature(signature: string | undefined): string {
  return (signature ?? '')
    .replace(/\r\n/g, '\n')
    .trim()
}

function appendFeedbackSignature(feedback: string, signature?: string): string {
  const normalizedSignature = normalizeSignature(signature)
  if (!normalizedSignature) {
    return feedback
  }

  const escapedSignature = normalizedSignature.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const hasSignatureAtEnd = new RegExp(`(?:\\n{1,2}|\\s*)${escapedSignature}$`, 'i').test(feedback)
  if (hasSignatureAtEnd) {
    return feedback
  }

  return `${feedback}\n\n${normalizedSignature}`
}

export function parseAiEvaluationResponse(
  rawContent: string,
  maxGrade: number | null,
  studentName?: string,
  feedbackSignature?: string,
): AiEvaluationResponse {
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

  if (maxGrade === null) {
    normalizedGrade = null
  } else if (rawGrade === null || rawGrade === undefined || rawGrade === '') {
    normalizedGrade = null
  } else {
    const numericGrade = Number(rawGrade)
    if (!Number.isFinite(numericGrade)) {
      throw new Error('A IA retornou uma nota recomendada invalida.')
    }

    normalizedGrade = Number(Math.max(0, Math.min(maxGrade, numericGrade)).toFixed(2))
  }

  const feedbackWithName = parsed.valida
    ? ensureFeedbackStartsWithStudentName(normalizedFeedback, studentName)
    : normalizedFeedback

  return {
    valida: Boolean(parsed.valida),
    feedback: appendFeedbackSignature(feedbackWithName, feedbackSignature),
    notaRecomendada: normalizedGrade,
    reason: typeof parsed.reason === 'string' ? truncateText(parsed.reason.trim(), 500) : undefined,
    confidence: normalizeConfidence(parsed.confidence),
  }
}

function extractResponsesApiText(rawResponse: Record<string, unknown>): string {
  if (typeof rawResponse.output_text === 'string' && rawResponse.output_text.trim()) {
    return rawResponse.output_text
  }

  const outputs = Array.isArray(rawResponse.output) ? rawResponse.output : []

  for (const output of outputs) {
    if (!output || typeof output !== 'object') continue

    const content = Array.isArray((output as { content?: unknown[] }).content)
      ? (output as { content: Array<Record<string, unknown>> }).content
      : []

    for (const item of content) {
      if (item.type === 'output_text' && typeof item.text === 'string' && item.text.trim()) {
        return item.text
      }
    }
  }

  return ''
}

async function uploadFileForResponse(params: {
  baseUrl: string
  apiKey: string
  fileName: string
  mimeType: string
  bytes: Uint8Array
  signal: AbortSignal
}): Promise<UploadedFileReference> {
  const form = new FormData()
  const arrayBuffer = params.bytes.buffer.slice(
    params.bytes.byteOffset,
    params.bytes.byteOffset + params.bytes.byteLength,
  ) as ArrayBuffer
  const blob = new Blob([arrayBuffer], { type: params.mimeType })

  form.append('purpose', 'user_data')
  form.append('file', blob, params.fileName)

  const response = await fetch(`${params.baseUrl.replace(/\/+$/, '')}/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: form,
    signal: params.signal,
  })

  let rawResponse: Record<string, unknown> = {}
  try {
    rawResponse = await response.json() as Record<string, unknown>
  } catch {
    rawResponse = {}
  }

  if (!response.ok || typeof rawResponse.id !== 'string' || !rawResponse.id.trim()) {
    const message =
      (rawResponse.error && typeof rawResponse.error === 'object' && 'message' in rawResponse.error
        ? String((rawResponse.error as { message?: unknown }).message ?? '')
        : '') ||
      (typeof rawResponse.message === 'string' ? rawResponse.message : '') ||
      `File upload returned status ${response.status}`

    throw new Error(message)
  }

  return { id: rawResponse.id }
}

async function deleteUploadedFile(params: {
  baseUrl: string
  apiKey: string
  fileId: string
}): Promise<void> {
  await fetch(`${params.baseUrl.replace(/\/+$/, '')}/files/${encodeURIComponent(params.fileId)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
    },
  }).catch(() => undefined)
}

export async function executeAiEvaluation(
  config: AiClientConfig,
  request: AiEvaluationRequest,
): Promise<AiEvaluationExecutionResult> {
  const attachedFiles = request.studentSubmission.extractedFiles.filter((file) => file.fileBytes)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs)
  const uploadedFiles: UploadedFileReference[] = []
  const inlineImages: InlineImageInput[] = []
  const conversionNotes: string[] = []

  try {
    if (attachedFiles.length > 0) {
      for (const file of attachedFiles) {
        const bytes = file.fileBytes
        if (!bytes) continue

        if (canUploadAsInputFile(file.name)) {
          const uploaded = await uploadFileForResponse({
            baseUrl: config.baseUrl,
            apiKey: config.apiKey,
            fileName: file.name,
            mimeType: file.mimeType,
            bytes,
            signal: controller.signal,
          })
          uploadedFiles.push(uploaded)
          continue
        }

        if (!config.visionEnabled || !isImageMimeType(file.mimeType)) {
          conversionNotes.push(
            `Arquivo "${file.name}" (${file.mimeType}) convertido para contexto textual resumido porque o formato nao e suportado em anexo binario pela API.`,
          )
          continue
        }

        if (bytes.byteLength > MAX_INLINE_IMAGE_BYTES) {
          console.warn(
            `[grade-suggestions] Ignorando imagem acima do limite inline (${MAX_INLINE_IMAGE_BYTES} bytes): ${file.name}`,
          )
          conversionNotes.push(
            `Imagem "${file.name}" nao foi anexada por exceder o limite de ${MAX_INLINE_IMAGE_BYTES} bytes para analise visual inline.`,
          )
          continue
        }

        inlineImages.push(toInlineImageInput({
          mimeType: file.mimeType,
          bytes,
        }))
      }
    }

    const hasAttachedFiles = uploadedFiles.length > 0 || inlineImages.length > 0
    const prompt = buildGradeSuggestionPrompt(request, {
      customInstructions: config.customInstructions,
      hasVisionImages: hasAttachedFiles,
    })

    const response = await fetch(`${config.baseUrl.replace(/\/+$/, '')}/responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        max_output_tokens: hasAttachedFiles ? 1200 : 800,
        input: [
          {
            role: 'system',
            content: [
              {
                type: 'input_text',
                text: prompt.systemPrompt,
              },
            ],
          },
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: prompt.userPrompt,
              },
              ...(conversionNotes.length > 0
                ? [{
                    type: 'input_text' as const,
                    text: [
                      'Arquivos com fallback de conversao:',
                      ...conversionNotes.map((note, index) => `${index + 1}. ${note}`),
                    ].join('\n'),
                  }]
                : []),
              ...uploadedFiles.map((file) => ({
                type: 'input_file' as const,
                file_id: file.id,
              })),
              ...inlineImages,
            ],
          },
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

    const content = extractResponsesApiText(rawResponse)

    if (!content.trim()) {
      throw new Error('A IA retornou uma resposta vazia.')
    }

    return {
      evaluation: parseAiEvaluationResponse(
        content,
        request.maxGrade,
        request.studentName,
        config.feedbackSignature,
      ),
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
    for (const uploaded of uploadedFiles) {
      await deleteUploadedFile({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        fileId: uploaded.id,
      })
    }

    clearTimeout(timeoutId)
  }
}
