import {
  RequestBodyValidationError,
  expectBodyObject,
} from '../_shared/http/mod.ts'

interface TemplateInput {
  category: string
  content: string
  title: string
}

export type MessageTemplatesPayload =
  | { action: 'list_templates' | 'list_template_options' }
  | { action: 'create_template'; input: TemplateInput }
  | { action: 'update_template'; input: TemplateInput; templateId: string }
  | { action: 'delete_template'; templateId: string }
  | { action: 'set_favorite'; isFavorite: boolean; templateId: string }

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function invalid(field: string): never {
  throw new RequestBodyValidationError(`Invalid ${field}`, 422)
}

function exactFields(body: Record<string, unknown>, fields: string[]) {
  const allowed = new Set(fields)
  if (Object.keys(body).some((field) => !allowed.has(field))) invalid('request fields')
}

function requiredString(value: unknown, field: string, maximum: number): string {
  if (typeof value !== 'string') invalid(field)
  const parsed = value.trim()
  if (!parsed || parsed.length > maximum) invalid(field)
  return parsed
}

function uuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) invalid(field)
  return value
}

function templateInput(value: unknown): TemplateInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('input')
  const input = value as Record<string, unknown>
  exactFields(input, ['category', 'content', 'title'])
  return {
    category: requiredString(input.category, 'input.category', 80),
    content: requiredString(input.content, 'input.content', 12_000),
    title: requiredString(input.title, 'input.title', 240),
  }
}

export function parseMessageTemplatesPayload(rawBody: unknown): MessageTemplatesPayload {
  const body = expectBodyObject(rawBody)
  switch (body.action) {
    case 'list_templates':
    case 'list_template_options':
      exactFields(body, ['action'])
      return { action: body.action }
    case 'create_template':
      exactFields(body, ['action', 'input'])
      return { action: 'create_template', input: templateInput(body.input) }
    case 'update_template':
      exactFields(body, ['action', 'input', 'templateId'])
      return {
        action: 'update_template',
        input: templateInput(body.input),
        templateId: uuid(body.templateId, 'templateId'),
      }
    case 'delete_template':
      exactFields(body, ['action', 'templateId'])
      return { action: 'delete_template', templateId: uuid(body.templateId, 'templateId') }
    case 'set_favorite':
      exactFields(body, ['action', 'isFavorite', 'templateId'])
      if (typeof body.isFavorite !== 'boolean') invalid('isFavorite')
      return {
        action: 'set_favorite',
        isFavorite: body.isFavorite,
        templateId: uuid(body.templateId, 'templateId'),
      }
    default:
      invalid('action')
  }
}
