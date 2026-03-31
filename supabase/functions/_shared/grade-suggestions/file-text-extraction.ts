import type { ExtractedFile } from './types.ts'

export async function extractTextFromFileBuffer(input: {
  fileName: string
  mimeType?: string | null
  bytes: Uint8Array
  sourceUrl?: string | null
}): Promise<ExtractedFile> {
  return {
    name: input.fileName,
    mimeType: input.mimeType?.trim() || 'application/octet-stream',
    extractedText: '',
    extractionQuality: 'none',
    requiresVisualAnalysis: true,
    textLength: 0,
    sourceUrl: input.sourceUrl ?? null,
    warning: null,
    fileBytes: input.bytes,
  }
}
