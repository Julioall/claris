import type { ExtractionQuality } from './types.ts'

export function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

export function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
}

export function stripHtmlToText(value: string): string {
  return collapseWhitespace(
    decodeXmlEntities(
      value
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<\/li>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
    )
  )
}

export function normalizeForComparison(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

export function tokenizeForComparison(value: string): string[] {
  return normalizeForComparison(value)
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length > 1)
}

export function computeTokenSimilarity(left: string, right: string): number {
  const leftTokens = new Set(tokenizeForComparison(left))
  const rightTokens = new Set(tokenizeForComparison(right))

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0
  }

  let shared = 0
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      shared += 1
    }
  }

  return shared / Math.max(leftTokens.size, rightTokens.size)
}

export function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

export function classifyExtractionQuality(text: string): ExtractionQuality {
  const length = text.trim().length

  if (length >= 1200) return 'high'
  if (length >= 250) return 'medium'
  if (length >= 30) return 'low'
  return 'none'
}
