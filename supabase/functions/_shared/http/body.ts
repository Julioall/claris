import {
  validateMoodleUrl,
  validatePositiveInteger,
  validateString,
  validateStringArray,
} from '../validation/mod.ts'

export class RequestBodyValidationError extends Error {
  readonly status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = 'RequestBodyValidationError'
    this.status = status
  }
}

export type JsonBody = Record<string, unknown>

export function expectBodyObject(body: unknown): JsonBody {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new RequestBodyValidationError('JSON body must be an object')
  }

  return body as JsonBody
}

export function readRequiredString(body: JsonBody, fieldName: string, maxLength = 2048): string {
  const value = body[fieldName]
  if (!validateString(value, maxLength)) {
    throw new RequestBodyValidationError(`Invalid ${fieldName}`)
  }

  return value
}

export function readOptionalString(body: JsonBody, fieldName: string, maxLength = 2048): string | undefined {
  const value = body[fieldName]
  if (value === undefined || value === null || value === '') {
    return undefined
  }

  if (!validateString(value, maxLength)) {
    throw new RequestBodyValidationError(`Invalid ${fieldName}`)
  }

  return value
}

export function readRequiredMoodleUrl(body: JsonBody, fieldName = 'moodleUrl'): string {
  const value = body[fieldName]
  if (!validateMoodleUrl(value)) {
    throw new RequestBodyValidationError('Invalid Moodle URL format.')
  }

  return value
}

export function readRequiredPositiveInteger(body: JsonBody, fieldName: string): number {
  const value = body[fieldName]
  if (!validatePositiveInteger(value)) {
    throw new RequestBodyValidationError(`Invalid ${fieldName}`)
  }

  return typeof value === 'number' ? value : parseInt(String(value), 10)
}

export function readOptionalPositiveInteger(body: JsonBody, fieldName: string): number | undefined {
  const value = body[fieldName]
  if (value === undefined || value === null || value === '') {
    return undefined
  }

  if (!validatePositiveInteger(value)) {
    throw new RequestBodyValidationError(`Invalid ${fieldName}`)
  }

  return typeof value === 'number' ? value : parseInt(String(value), 10)
}

export function readOptionalStringArray(body: JsonBody, fieldName: string): string[] | undefined {
  const value = body[fieldName]
  if (value === undefined || value === null) {
    return undefined
  }

  if (!validateStringArray(value)) {
    throw new RequestBodyValidationError(`Invalid ${fieldName}`)
  }

  return value
}

export function readRequiredStringArray(body: JsonBody, fieldName: string): string[] {
  const value = readOptionalStringArray(body, fieldName)
  if (!value) {
    throw new RequestBodyValidationError(`Invalid ${fieldName}`)
  }

  return value
}

export function readOptionalLiteral<TValue extends string>(
  body: JsonBody,
  fieldName: string,
  allowedValues: readonly TValue[],
): TValue | undefined {
  const value = body[fieldName]
  if (value === undefined || value === null || value === '') {
    return undefined
  }

  if (typeof value !== 'string' || !allowedValues.includes(value as TValue)) {
    throw new RequestBodyValidationError(`Invalid ${fieldName}`)
  }

  return value as TValue
}

export function readRequiredLiteral<TValue extends string>(
  body: JsonBody,
  fieldName: string,
  allowedValues: readonly TValue[],
): TValue {
  const value = readOptionalLiteral(body, fieldName, allowedValues)
  if (!value) {
    throw new RequestBodyValidationError(`Invalid ${fieldName}`)
  }

  return value
}