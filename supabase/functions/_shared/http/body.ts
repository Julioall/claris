import {
  validateArray,
  validateBoolean,
  validateInteger,
  validateIsoDate,
  validateMoodleUrl,
  validateObject,
  validatePositiveInteger,
  validateString,
  validateStringArray,
  validateUuid,
} from '../validation/mod.ts'
import type { PageRequest } from './contract.ts'

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

function validationError(fieldName: string): RequestBodyValidationError {
  return new RequestBodyValidationError(`Invalid ${fieldName}`, 422)
}

export function readOptionalBoolean(body: JsonBody, fieldName: string): boolean | undefined {
  const value = body[fieldName]
  if (value === undefined || value === null) return undefined
  if (!validateBoolean(value)) throw validationError(fieldName)
  return value
}

export function readRequiredBoolean(body: JsonBody, fieldName: string): boolean {
  const value = readOptionalBoolean(body, fieldName)
  if (value === undefined) throw validationError(fieldName)
  return value
}

export function readOptionalInteger(
  body: JsonBody,
  fieldName: string,
  min = Number.MIN_SAFE_INTEGER,
  max = Number.MAX_SAFE_INTEGER,
): number | undefined {
  const value = body[fieldName]
  if (value === undefined || value === null) return undefined
  if (!validateInteger(value, min, max)) throw validationError(fieldName)
  return value
}

export function readRequiredInteger(
  body: JsonBody,
  fieldName: string,
  min = Number.MIN_SAFE_INTEGER,
  max = Number.MAX_SAFE_INTEGER,
): number {
  const value = readOptionalInteger(body, fieldName, min, max)
  if (value === undefined) throw validationError(fieldName)
  return value
}

export function readOptionalUuid(body: JsonBody, fieldName: string): string | undefined {
  const value = body[fieldName]
  if (value === undefined || value === null || value === '') return undefined
  if (!validateUuid(value)) throw validationError(fieldName)
  return value
}

export function readRequiredUuid(body: JsonBody, fieldName: string): string {
  const value = readOptionalUuid(body, fieldName)
  if (!value) throw validationError(fieldName)
  return value
}

export function readOptionalIsoDate(body: JsonBody, fieldName: string): string | undefined {
  const value = body[fieldName]
  if (value === undefined || value === null || value === '') return undefined
  if (!validateIsoDate(value)) throw validationError(fieldName)
  return value
}

export function readRequiredIsoDate(body: JsonBody, fieldName: string): string {
  const value = readOptionalIsoDate(body, fieldName)
  if (!value) throw validationError(fieldName)
  return value
}

export function readOptionalObject(body: JsonBody, fieldName: string): JsonBody | undefined {
  const value = body[fieldName]
  if (value === undefined || value === null) return undefined
  if (!validateObject(value)) throw validationError(fieldName)
  return value
}

export function readRequiredObject(body: JsonBody, fieldName: string): JsonBody {
  const value = readOptionalObject(body, fieldName)
  if (!value) throw validationError(fieldName)
  return value
}

export function readOptionalArray<TValue>(
  body: JsonBody,
  fieldName: string,
  itemValidator: (item: unknown) => item is TValue,
  maxItems = 500,
): TValue[] | undefined {
  const value = body[fieldName]
  if (value === undefined || value === null) return undefined
  if (!validateArray(value, itemValidator, maxItems)) throw validationError(fieldName)
  return value
}

export function readPageRequest<TFilters extends JsonBody = JsonBody>(
  body: JsonBody,
  options: { defaultPageSize?: number; maxPageSize?: number } = {},
): PageRequest<TFilters> {
  const maxPageSize = options.maxPageSize ?? 100
  const pageSize = readOptionalInteger(body, 'pageSize', 1, maxPageSize) ?? options.defaultPageSize ?? 25
  const page = readOptionalInteger(body, 'page', 1) ?? 1
  const filters = readOptionalObject(body, 'filters') as TFilters | undefined
  return { page, pageSize, filters }
}
