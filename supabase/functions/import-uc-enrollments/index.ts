import { isApplicationAdmin } from '../_shared/auth/mod.ts'
import { createServiceClient } from '../_shared/db/mod.ts'
import { createHandler, errorResponse, jsonResponse } from '../_shared/http/mod.ts'

interface JsonEnrollmentRecord {
  aluno: string
  cpf: string
  'e-mail': string
  telefone1: string
  telefone2: string
  papel: string
  iduc: string
  cursocaminho: string
  unidadecurricular: string
  notafinal: string
  datadeinciouc: string
  datatrminouc: string
  ltimoacessouc: string
  ltimoacessomoodle: string
  statusuc: string
  datamatricula: string
  categoria: string
}

interface ImportPayload {
  records?: JsonEnrollmentRecord[]
  filename?: string
  batchId?: string
  finalize?: boolean
}

interface ParsedDateParts {
  year: string
  month: string
  day: string
  hour: string
  minute: string
  second: string
}

const IMPORTABLE_ROLES = new Map<string, 'Aluno' | 'Monitor' | 'Tutor'>([
  ['aluno', 'Aluno'],
  ['monitor', 'Monitor'],
  ['tutor', 'Tutor'],
])

const MONTH_MAP: Record<string, string> = {
  jan: '01',
  janeiro: '01',
  fev: '02',
  fevereiro: '02',
  mar: '03',
  marco: '03',
  março: '03',
  abr: '04',
  abril: '04',
  mai: '05',
  maio: '05',
  jun: '06',
  junho: '06',
  jul: '07',
  julho: '07',
  ago: '08',
  agosto: '08',
  set: '09',
  setembro: '09',
  out: '10',
  outubro: '10',
  nov: '11',
  novembro: '11',
  dez: '12',
  dezembro: '12',
}

const DB_UPSERT_CHUNK_SIZE = 200
const SOURCE_TIMEZONE_OFFSET = '-03:00'

function normalizeText(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim()
  return trimmed.length > 0 ? trimmed : null
}

function parseYear(rawYear: string): string {
  if (rawYear.length === 2) {
    return parseInt(rawYear, 10) < 30 ? `20${rawYear}` : `19${rawYear}`
  }

  return rawYear
}

function isValidDateParts(year: string, month: string, day: string): boolean {
  const parsed = new Date(`${year}-${month}-${day}T00:00:00Z`)

  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.getUTCFullYear() === parseInt(year, 10) &&
    parsed.getUTCMonth() + 1 === parseInt(month, 10) &&
    parsed.getUTCDate() === parseInt(day, 10)
  )
}

function parsePtBrDateParts(raw: string): ParsedDateParts | null {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return null

  const numericMatch = trimmed.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  )

  if (numericMatch) {
    const day = numericMatch[1].padStart(2, '0')
    const month = numericMatch[2].padStart(2, '0')
    const year = parseYear(numericMatch[3])

    if (!isValidDateParts(year, month, day)) return null

    return {
      year,
      month,
      day,
      hour: (numericMatch[4] ?? '00').padStart(2, '0'),
      minute: (numericMatch[5] ?? '00').padStart(2, '0'),
      second: (numericMatch[6] ?? '00').padStart(2, '0'),
    }
  }

  const textualMatch = trimmed.match(
    /^(?:[^,]+,\s*)?(\d{1,2})\s+([^\s,]+)\s+(\d{2,4})(?:,\s*(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/u,
  )

  if (!textualMatch) return null

  const day = textualMatch[1].padStart(2, '0')
  const month = MONTH_MAP[normalizeText(textualMatch[2]).replace(/\./g, '')]
  const year = parseYear(textualMatch[3])

  if (!month || !isValidDateParts(year, month, day)) {
    return null
  }

  return {
    year,
    month,
    day,
    hour: (textualMatch[4] ?? '00').padStart(2, '0'),
    minute: (textualMatch[5] ?? '00').padStart(2, '0'),
    second: (textualMatch[6] ?? '00').padStart(2, '0'),
  }
}

function parsePtBrDate(raw: string): string | null {
  const parsed = parsePtBrDateParts(raw)
  if (!parsed) return null

  return `${parsed.year}-${parsed.month}-${parsed.day}`
}

function parsePtBrDateTime(raw: string): string | null {
  if (normalizeText(raw) === 'nunca') return null

  const parsed = parsePtBrDateParts(raw)
  if (!parsed) return null

  return (
    `${parsed.year}-${parsed.month}-${parsed.day}` +
    `T${parsed.hour}:${parsed.minute}:${parsed.second}${SOURCE_TIMEZONE_OFFSET}`
  )
}

function parsePtBrGrade(raw: string): number | null {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return null

  const parsed = Number.parseFloat(trimmed.replace(',', '.'))
  return Number.isNaN(parsed) ? null : parsed
}

function resolveRole(rawRole: string | null | undefined): 'Aluno' | 'Monitor' | 'Tutor' | null {
  return IMPORTABLE_ROLES.get(normalizeText(rawRole)) ?? null
}

function parseBody(rawBody: unknown): ImportPayload {
  if (typeof rawBody !== 'object' || rawBody === null) {
    throw new Error('Request body must be a JSON object.')
  }

  const body = rawBody as Record<string, unknown>
  const finalize = body.finalize === true
  const records = Array.isArray(body.records)
    ? body.records as JsonEnrollmentRecord[]
    : undefined

  if (!finalize && (!records || records.length === 0)) {
    throw new Error('Field "records" must contain at least one enrollment object.')
  }

  if (records && records.length > 0) {
    const first = records[0] as Record<string, unknown>
    if (typeof first.aluno !== 'string' || typeof first.iduc !== 'string') {
      throw new Error('Each record must contain at least the fields: aluno and iduc.')
    }
  }

  if (finalize && typeof body.batchId !== 'string') {
    throw new Error('Field "batchId" is required when finalize=true.')
  }

  return {
    records,
    filename: typeof body.filename === 'string' ? body.filename : undefined,
    batchId: typeof body.batchId === 'string' ? body.batchId : undefined,
    finalize,
  }
}

async function markBatchFailed(
  supabase: ReturnType<typeof createServiceClient>,
  batchId: string,
  message: string,
) {
  await supabase
    .from('uc_import_batches')
    .update({
      status: 'failed',
      error_message: message,
    })
    .eq('id', batchId)
}

function buildChunkDeduplicationKey(row: Record<string, unknown>, index: number): string {
  const cpf = typeof row.cpf === 'string' ? row.cpf.trim() : ''
  const idUc = typeof row.id_uc === 'string' ? row.id_uc.trim() : ''
  const papel = typeof row.papel === 'string' ? row.papel.trim() : ''

  if (!cpf) {
    return `row:${index}`
  }

  return `${idUc}::${cpf}::${papel}`
}

function deduplicatePreparedRows(rows: Array<Record<string, unknown>>) {
  const byKey = new Map<string, Record<string, unknown>>()

  rows.forEach((row, index) => {
    byKey.set(buildChunkDeduplicationKey(row, index), row)
  })

  return Array.from(byKey.values())
}

async function upsertPreparedChunk(
  supabase: ReturnType<typeof createServiceClient>,
  batchId: string,
  rows: Array<Record<string, unknown>>,
) {
  if (rows.length === 0) {
    return { importedCount: 0, ignoredCount: 0 }
  }

  const { error: upsertError } = await supabase
    .from('uc_enrollments')
    .upsert(rows, {
      onConflict: 'id_uc,cpf,papel',
    })

  if (!upsertError) {
    return { importedCount: rows.length, ignoredCount: 0 }
  }

  console.warn('[import-uc-enrollments] Chunk upsert failed, retrying row by row:', upsertError)

  let importedCount = 0
  let ignoredCount = 0

  for (const row of rows) {
    const { error: rowError } = await supabase
      .from('uc_enrollments')
      .upsert(row, {
        onConflict: 'id_uc,cpf,papel',
      })

    if (rowError) {
      ignoredCount += 1
      console.warn('[import-uc-enrollments] Ignoring invalid row during fallback:', rowError)
      continue
    }

    importedCount += 1
  }

  if (ignoredCount > 0) {
    await supabase
      .from('uc_import_batches')
      .update({
        error_message: `Some rows were ignored during import fallback in batch ${batchId}.`,
      })
      .eq('id', batchId)
  }

  return { importedCount, ignoredCount }
}

Deno.serve(createHandler(async ({ body, user }) => {
  const supabase = createServiceClient()

  const isAdmin = await isApplicationAdmin(supabase, user.id)
  if (!isAdmin) {
    return errorResponse('Only application administrators can import enrollment data.', 403)
  }

  let batchId = body.batchId
  let batchTotalRecords = 0
  let batchUpsertedRecords = 0

  if (batchId) {
    const { data: batch, error: batchError } = await supabase
      .from('uc_import_batches')
      .select('id, total_records, upserted_records, status')
      .eq('id', batchId)
      .single()

    if (batchError || !batch) {
      return errorResponse('Import batch not found.', 404)
    }

    if (batch.status === 'completed' && !body.finalize) {
      return errorResponse('This import batch has already been completed.', 409)
    }

    batchTotalRecords = batch.total_records ?? 0
    batchUpsertedRecords = batch.upserted_records ?? 0
  } else {
    const { data: batch, error: batchError } = await supabase
      .from('uc_import_batches')
      .insert({
        imported_by: user.id,
        filename: body.filename ?? null,
        status: 'processing',
      })
      .select('id, total_records, upserted_records')
      .single()

    if (batchError || !batch) {
      console.error('[import-uc-enrollments] Failed to create batch:', batchError)
      return errorResponse('Failed to initialize import batch.', 500)
    }

    batchId = batch.id
    batchTotalRecords = batch.total_records ?? 0
    batchUpsertedRecords = batch.upserted_records ?? 0
  }

  if (!batchId) {
    return errorResponse('Failed to initialize import batch.', 500)
  }

  let processedCount = 0
  let ignoredCount = 0
  let importedCount = 0

  if (body.records && body.records.length > 0) {
    const rows = [] as Array<Record<string, unknown>>

    for (const record of body.records) {
      processedCount += 1

      const role = resolveRole(record.papel)
      const personName = (record.aluno ?? '').trim()
      const ucEnrollmentId = (record.iduc ?? '').trim()
      const ucName = (record.unidadecurricular ?? '').trim()

      if (!role || !personName || !ucEnrollmentId || !ucName) {
        ignoredCount += 1
        continue
      }

      const lastUcRaw = (record.ltimoacessouc ?? '').trim()
      const neverAccessedUc = normalizeText(lastUcRaw) === 'nunca'

      rows.push({
        nome_pessoa: personName,
        cpf: blankToNull(record.cpf),
        email: blankToNull(record['e-mail']),
        telefone1: blankToNull(record.telefone1),
        telefone2: blankToNull(record.telefone2),
        papel: role,
        id_uc: ucEnrollmentId,
        caminho_curso: blankToNull(record.cursocaminho),
        nome_uc: ucName,
        nota_final_raw: blankToNull(record.notafinal),
        nota_final_num: parsePtBrGrade(record.notafinal),
        inicio_uc_at: parsePtBrDate(record.datadeinciouc),
        termino_uc_at: parsePtBrDate(record.datatrminouc),
        ultimo_acesso_uc_at: neverAccessedUc ? null : parsePtBrDateTime(record.ltimoacessouc),
        nunca_acessou_uc: neverAccessedUc,
        ultimo_acesso_plataforma_at: parsePtBrDateTime(record.ltimoacessomoodle),
        status_uc: blankToNull(record.statusuc),
        matriculado_em_at: parsePtBrDate(record.datamatricula),
        categoria: blankToNull(record.categoria),
        import_batch_id: batchId,
        updated_at: new Date().toISOString(),
      })
    }

    for (let index = 0; index < rows.length; index += DB_UPSERT_CHUNK_SIZE) {
      const rawChunk = rows.slice(index, index + DB_UPSERT_CHUNK_SIZE)
      const chunk = deduplicatePreparedRows(rawChunk)
      ignoredCount += rawChunk.length - chunk.length

      const result = await upsertPreparedChunk(supabase, batchId, chunk)
      importedCount += result.importedCount
      ignoredCount += result.ignoredCount
    }

    batchTotalRecords += processedCount
    batchUpsertedRecords += importedCount

    const { error: batchUpdateError } = await supabase
      .from('uc_import_batches')
      .update({
        total_records: batchTotalRecords,
        upserted_records: batchUpsertedRecords,
        status: 'processing',
        error_message: null,
      })
      .eq('id', batchId)

    if (batchUpdateError) {
      console.error('[import-uc-enrollments] Failed to update batch progress:', batchUpdateError)
      await markBatchFailed(supabase, batchId, batchUpdateError.message)
      return errorResponse('Failed to update import progress.', 500)
    }
  }

  let deletedCount = 0

  if (body.finalize) {
    const { error: deleteOldError, count: deletedOldCount } = await supabase
      .from('uc_enrollments')
      .delete({ count: 'exact' })
      .neq('import_batch_id', batchId)

    if (deleteOldError) {
      console.error('[import-uc-enrollments] Failed to cleanup old rows:', deleteOldError)
      await markBatchFailed(supabase, batchId, deleteOldError.message)
      return errorResponse('Failed to cleanup previous snapshot data.', 500)
    }

    deletedCount += deletedOldCount ?? 0

    const { error: deleteNullError, count: deletedNullCount } = await supabase
      .from('uc_enrollments')
      .delete({ count: 'exact' })
      .is('import_batch_id', null)

    if (deleteNullError) {
      console.error('[import-uc-enrollments] Failed to cleanup null-batch rows:', deleteNullError)
      await markBatchFailed(supabase, batchId, deleteNullError.message)
      return errorResponse('Failed to cleanup previous snapshot data.', 500)
    }

    deletedCount += deletedNullCount ?? 0

    const { error: completeBatchError } = await supabase
      .from('uc_import_batches')
      .update({
        status: 'completed',
        error_message: null,
      })
      .eq('id', batchId)

    if (completeBatchError) {
      console.error('[import-uc-enrollments] Failed to finalize batch:', completeBatchError)
      await markBatchFailed(supabase, batchId, completeBatchError.message)
      return errorResponse('Failed to finalize the import batch.', 500)
    }
  }

  return jsonResponse({
    batchId,
    processed: processedCount,
    imported: importedCount,
    ignored: ignoredCount,
    totalImported: batchUpsertedRecords,
    deleted: body.finalize ? deletedCount : undefined,
    completed: Boolean(body.finalize),
  })
}, { requireAuth: true, parseBody }))
