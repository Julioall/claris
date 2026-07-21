export interface RequestLogger {
  error(event: string, error?: unknown, metadata?: Record<string, unknown>): void
  info(event: string, metadata?: Record<string, unknown>): void
}

function safeError(error: unknown): Record<string, unknown> | undefined {
  if (!error) return undefined
  if (error instanceof Error) return { name: error.name }
  return { name: 'UnknownError' }
}

function safeMetadata(metadata?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!metadata) return undefined

  return Object.fromEntries(
    Object.entries(metadata).filter(([key, value]) => (
      !/authorization|token|secret|password|credential|body/i.test(key)
      && ['string', 'number', 'boolean'].includes(typeof value)
    )),
  )
}

export function createRequestLogger(correlationId: string): RequestLogger {
  return {
    error(event, error, metadata) {
      console.error(JSON.stringify({
        level: 'error',
        event,
        correlationId,
        error: safeError(error),
        metadata: safeMetadata(metadata),
      }))
    },
    info(event, metadata) {
      console.log(JSON.stringify({
        level: 'info',
        event,
        correlationId,
        metadata: safeMetadata(metadata),
      }))
    },
  }
}
