type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function getString(value: unknown): string | null {
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function getNestedValue(value: unknown, path: string[]): unknown {
  let current: unknown = value

  for (const segment of path) {
    if (!isRecord(current) || !(segment in current)) {
      return undefined
    }

    current = current[segment]
  }

  return current
}

function normalizeComparableText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

export function normalizePhone(value: string | null): string | null {
  if (!value) return null

  const digits = value.replace(/\D/g, '')
  return digits ? digits : null
}

export function remoteJidToPhone(remoteJid: string | null): string | null {
  if (!remoteJid) return null

  const [numberPart] = remoteJid.split('@')
  return normalizePhone(numberPart)
}

export function isSelfConversationName(value: string | null): boolean {
  if (!value) return false

  const normalized = normalizeComparableText(value)
  return normalized === 'voce' || normalized === 'você'
}

export function isPhoneLikeConversationName(value: string | null, phone: string | null): boolean {
  if (!value) return false

  const normalizedPhone = normalizePhone(value)
  if (!normalizedPhone) return false

  const hasLetters = /[A-Za-zÀ-ÿ]/.test(value)
  if (hasLetters) return false

  return phone ? normalizedPhone === phone : true
}

export function resolveConversationName(rawConversation: unknown, remoteJid: string): string {
  const phone = remoteJidToPhone(remoteJid)
  const fallbackName = phone ? `+${phone}` : remoteJid

  if (!isRecord(rawConversation)) {
    return fallbackName
  }

  const preferredCandidates = [
    rawConversation.name,
    rawConversation.subject,
    getNestedValue(rawConversation, ['contact', 'name']),
    getNestedValue(rawConversation, ['contact', 'pushName']),
    rawConversation.pushName,
    getNestedValue(rawConversation, ['lastMessage', 'pushName']),
  ]

  for (const candidate of preferredCandidates) {
    const text = getString(candidate)
    if (!text) continue
    if (isSelfConversationName(text)) continue
    if (isPhoneLikeConversationName(text, phone)) continue

    return text
  }

  return fallbackName
}
