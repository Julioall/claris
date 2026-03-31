import { classifyExtractionQuality, collapseWhitespace, decodeXmlEntities, stripHtmlToText, truncateText } from './text.ts'
import { inflateZlib, unzipArchive } from './zip.ts'
import type { ExtractedFile } from './types.ts'

const DEFAULT_TEXT_LIMIT = 12000
const VISUAL_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'])
const VISION_ENCODABLE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp'])
const DIRECT_TEXT_EXTENSIONS = new Set(['txt', 'csv', 'md'])

function bytesToString(bytes: Uint8Array, encoding: string): string {
  return new TextDecoder(encoding, { fatal: false }).decode(bytes)
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 8192
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)))
  }
  return btoa(binary)
}

function decodeBestEffortText(bytes: Uint8Array): string {
  const utf8 = bytesToString(bytes, 'utf-8')
  if (utf8.includes('\uFFFD')) {
    return bytesToString(bytes, 'latin1')
  }

  return utf8
}

function detectExtension(fileName: string, mimeType: string): string {
  const normalizedName = fileName.toLowerCase()
  const dotIndex = normalizedName.lastIndexOf('.')

  if (dotIndex >= 0 && dotIndex < normalizedName.length - 1) {
    return normalizedName.slice(dotIndex + 1)
  }

  if (mimeType === 'text/plain') return 'txt'
  if (mimeType === 'text/html') return 'html'
  if (mimeType === 'application/pdf') return 'pdf'

  return ''
}

function decodePdfEscapes(value: string): string {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\')
    .replace(/\\([0-7]{3})/g, (_, octal: string) => String.fromCharCode(parseInt(octal, 8)))
}

function readXmlText(xml: string): string {
  const chunks: string[] = []
  const regex = /<(?:w:t|a:t|t)(?:\s[^>]*)?>([\s\S]*?)<\/(?:w:t|a:t|t)>/g

  for (const match of xml.matchAll(regex)) {
    const value = collapseWhitespace(decodeXmlEntities(match[1] ?? ''))
    if (value) {
      chunks.push(value)
    }
  }

  return chunks.join('\n')
}

async function extractDocxText(bytes: Uint8Array): Promise<string> {
  const archive = await unzipArchive(bytes)
  const relevantEntries = Object.entries(archive)
    .filter(([name]) => /^word\/(document|header\d+|footer\d+|footnotes|endnotes)\.xml$/i.test(name))
    .sort(([left], [right]) => left.localeCompare(right, 'en'))

  return relevantEntries
    .map(([, entry]) => readXmlText(bytesToString(entry, 'utf-8')))
    .filter(Boolean)
    .join('\n\n')
}

async function extractPptxText(bytes: Uint8Array): Promise<string> {
  const archive = await unzipArchive(bytes)
  const slideEntries = Object.entries(archive)
    .filter(([name]) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort(([left], [right]) => left.localeCompare(right, 'en'))

  return slideEntries
    .map(([, entry]) => readXmlText(bytesToString(entry, 'utf-8')))
    .filter(Boolean)
    .join('\n\n')
}

function parseSharedStrings(xml: string): string[] {
  const items: string[] = []
  const regex = /<si>([\s\S]*?)<\/si>/g

  for (const match of xml.matchAll(regex)) {
    items.push(readXmlText(match[1] ?? ''))
  }

  return items
}

function parseWorksheetText(xml: string, sharedStrings: string[]): string {
  const rows: string[] = []
  const rowRegex = /<row[\s\S]*?>([\s\S]*?)<\/row>/g

  for (const rowMatch of xml.matchAll(rowRegex)) {
    const rowXml = rowMatch[1] ?? ''
    const cellValues: string[] = []
    const cellRegex = /<c\b([^>]*)>([\s\S]*?)<\/c>/g

    for (const cellMatch of rowXml.matchAll(cellRegex)) {
      const attrs = cellMatch[1] ?? ''
      const cellXml = cellMatch[2] ?? ''
      const sharedType = /\bt="s"/.test(attrs)
      const inlineType = /\bt="inlineStr"/.test(attrs)

      let value = ''

      if (sharedType) {
        const sharedIndexMatch = cellXml.match(/<v>(\d+)<\/v>/)
        const sharedIndex = sharedIndexMatch ? Number(sharedIndexMatch[1]) : Number.NaN
        value = Number.isFinite(sharedIndex) ? sharedStrings[sharedIndex] ?? '' : ''
      } else if (inlineType) {
        value = readXmlText(cellXml)
      } else {
        const directValueMatch = cellXml.match(/<v>([\s\S]*?)<\/v>/)
        value = collapseWhitespace(decodeXmlEntities(directValueMatch?.[1] ?? ''))
      }

      if (value) {
        cellValues.push(value)
      }
    }

    if (cellValues.length > 0) {
      rows.push(cellValues.join(' ; '))
    }
  }

  return rows.join('\n')
}

async function extractXlsxText(bytes: Uint8Array): Promise<string> {
  const archive = await unzipArchive(bytes)
  const sharedStrings = archive['xl/sharedStrings.xml']
    ? parseSharedStrings(bytesToString(archive['xl/sharedStrings.xml'], 'utf-8'))
    : []

  const sheetEntries = Object.entries(archive)
    .filter(([name]) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
    .sort(([left], [right]) => left.localeCompare(right, 'en'))

  return sheetEntries
    .map(([, entry]) => parseWorksheetText(bytesToString(entry, 'utf-8'), sharedStrings))
    .filter(Boolean)
    .join('\n\n')
}

async function extractPdfText(bytes: Uint8Array): Promise<{ text: string; requiresVisualAnalysis: boolean }> {
  const rawString = bytesToString(bytes, 'latin1')
  const chunks: string[] = []
  const streamRegex = /stream\r?\n([\s\S]*?)endstream/g

  for (const match of rawString.matchAll(streamRegex)) {
    const fullMatch = match[0]
    const streamStart = rawString.indexOf(fullMatch)
    const dictPreview = rawString.slice(Math.max(0, streamStart - 200), streamStart)
    const isFlate = /\/Filter\s*\/FlateDecode/.test(dictPreview)

    let decodedStream = match[1] ?? ''
    if (isFlate) {
      try {
        const startOffset = match.index ?? 0
        const prefixLength = fullMatch.indexOf(decodedStream)
        const bytesStart = startOffset + Math.max(0, prefixLength)
        const bytesEnd = bytesStart + decodedStream.length
        const inflated = await inflateZlib(bytes.slice(bytesStart, bytesEnd))
        decodedStream = bytesToString(inflated, 'latin1')
      } catch {
        // Ignore broken streams; other streams may still contain extractable text.
      }
    }

    for (const textMatch of decodedStream.matchAll(/\((?:\\.|[^\\()])*\)\s*(?:Tj|'|")/g)) {
      const literal = textMatch[0]
      const start = literal.indexOf('(')
      const end = literal.lastIndexOf(')')
      if (start >= 0 && end > start) {
        const value = collapseWhitespace(decodePdfEscapes(literal.slice(start + 1, end)))
        if (value) {
          chunks.push(value)
        }
      }
    }

    for (const arrayMatch of decodedStream.matchAll(/\[(.*?)\]\s*TJ/gs)) {
      const pieces: string[] = []
      for (const pieceMatch of arrayMatch[1].matchAll(/\((?:\\.|[^\\()])*\)/g)) {
        const literal = pieceMatch[0]
        pieces.push(collapseWhitespace(decodePdfEscapes(literal.slice(1, -1))))
      }

      const line = collapseWhitespace(pieces.join(' '))
      if (line) {
        chunks.push(line)
      }
    }
  }

  const text = collapseWhitespace(chunks.join('\n'))
  const likelyImageOnly = /\/Subtype\s*\/Image/.test(rawString) && text.length < 40

  return {
    text,
    requiresVisualAnalysis: likelyImageOnly || text.length < 20,
  }
}

function buildResult(params: {
  fileName: string
  mimeType: string
  text: string
  requiresVisualAnalysis: boolean
  warning?: string | null
  sourceUrl?: string | null
  maxTextLength?: number
  imageBase64?: string
}): ExtractedFile {
  const normalizedText = truncateText(collapseWhitespace(params.text), params.maxTextLength ?? DEFAULT_TEXT_LIMIT)

  return {
    name: params.fileName,
    mimeType: params.mimeType,
    extractedText: normalizedText,
    extractionQuality: classifyExtractionQuality(normalizedText),
    requiresVisualAnalysis: params.requiresVisualAnalysis,
    textLength: normalizedText.length,
    sourceUrl: params.sourceUrl ?? null,
    warning: params.warning ?? null,
    imageBase64: params.imageBase64,
  }
}

export async function extractTextFromFileBuffer(input: {
  fileName: string
  mimeType?: string | null
  bytes: Uint8Array
  maxTextLength?: number
  sourceUrl?: string | null
}): Promise<ExtractedFile> {
  const mimeType = input.mimeType?.trim() || 'application/octet-stream'
  const extension = detectExtension(input.fileName, mimeType)

  if (VISUAL_EXTENSIONS.has(extension) || mimeType.startsWith('image/')) {
    const imageBase64 = VISION_ENCODABLE_EXTENSIONS.has(extension) ? uint8ToBase64(input.bytes) : undefined
    return buildResult({
      fileName: input.fileName,
      mimeType,
      text: '',
      requiresVisualAnalysis: true,
      imageBase64,
      warning: imageBase64 ? null : 'Arquivo depende de análise visual.',
      sourceUrl: input.sourceUrl,
      maxTextLength: input.maxTextLength,
    })
  }

  if (DIRECT_TEXT_EXTENSIONS.has(extension)) {
    return buildResult({
      fileName: input.fileName,
      mimeType,
      text: decodeBestEffortText(input.bytes),
      requiresVisualAnalysis: false,
      sourceUrl: input.sourceUrl,
      maxTextLength: input.maxTextLength,
    })
  }

  if (extension === 'html' || extension === 'htm' || mimeType === 'text/html') {
    return buildResult({
      fileName: input.fileName,
      mimeType,
      text: stripHtmlToText(decodeBestEffortText(input.bytes)),
      requiresVisualAnalysis: false,
      sourceUrl: input.sourceUrl,
      maxTextLength: input.maxTextLength,
    })
  }

  if (extension === 'docx') {
    return buildResult({
      fileName: input.fileName,
      mimeType,
      text: await extractDocxText(input.bytes),
      requiresVisualAnalysis: false,
      sourceUrl: input.sourceUrl,
      maxTextLength: input.maxTextLength,
    })
  }

  if (extension === 'xlsx') {
    return buildResult({
      fileName: input.fileName,
      mimeType,
      text: await extractXlsxText(input.bytes),
      requiresVisualAnalysis: false,
      sourceUrl: input.sourceUrl,
      maxTextLength: input.maxTextLength,
    })
  }

  if (extension === 'pptx') {
    return buildResult({
      fileName: input.fileName,
      mimeType,
      text: await extractPptxText(input.bytes),
      requiresVisualAnalysis: false,
      sourceUrl: input.sourceUrl,
      maxTextLength: input.maxTextLength,
    })
  }

  if (extension === 'pdf' || mimeType === 'application/pdf') {
    const pdf = await extractPdfText(input.bytes)
    return buildResult({
      fileName: input.fileName,
      mimeType,
      text: pdf.text,
      requiresVisualAnalysis: pdf.requiresVisualAnalysis,
      sourceUrl: input.sourceUrl,
      maxTextLength: input.maxTextLength,
      warning: pdf.requiresVisualAnalysis && pdf.text.length < 20
        ? 'PDF sem texto suficiente para correção confiável.'
        : null,
    })
  }

  return buildResult({
    fileName: input.fileName,
    mimeType,
    text: '',
    requiresVisualAnalysis: false,
    warning: 'Tipo de arquivo ainda não suportado para extração textual.',
    sourceUrl: input.sourceUrl,
    maxTextLength: input.maxTextLength,
  })
}
