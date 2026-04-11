import { isApplicationAdmin } from '../_shared/auth/mod.ts'
import { createServiceClient } from '../_shared/db/mod.ts'
import { createHandler, errorResponse, jsonResponse } from '../_shared/http/mod.ts'

// ─────────────────────────────────────────────────────────────────────────────
// JSON source record shape (as received from the external report)
// ─────────────────────────────────────────────────────────────────────────────
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
  records: JsonEnrollmentRecord[]
  filename?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalisation helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Parse a PT-BR date string (dd/MM/yyyy or dd/MM/yy) to ISO date. */
function parsePtBrDate(raw: string): string | null {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return null

  // Match dd/MM/yyyy or dd/MM/yy
  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (!match) return null

  const day = match[1].padStart(2, '0')
  const month = match[2].padStart(2, '0')
  let year = match[3]
  if (year.length === 2) {
    // Treat 00-29 as 2000s, 30-99 as 1900s
    year = parseInt(year) < 30 ? `20${year}` : `19${year}`
  }

  const iso = `${year}-${month}-${day}`
  // Validate
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  return iso
}

/** Parse a PT-BR datetime string to ISO timestamp. Handles "dd/MM/yyyy HH:mm" etc. */
function parsePtBrDateTime(raw: string): string | null {
  const trimmed = (raw ?? '').trim()
  if (!trimmed || trimmed.toLowerCase() === 'nunca') return null

  // Try "dd/MM/yyyy, HH:mm" or "dd/MM/yyyy HH:mm"
  const matchDT = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (matchDT) {
    const day   = matchDT[1].padStart(2, '0')
    const month = matchDT[2].padStart(2, '0')
    let   year  = matchDT[3]
    if (year.length === 2) year = parseInt(year) < 30 ? `20${year}` : `19${year}`
    const h  = matchDT[4].padStart(2, '0')
    const m  = matchDT[5].padStart(2, '0')
    const s  = (matchDT[6] ?? '00').padStart(2, '0')
    const iso = `${year}-${month}-${day}T${h}:${m}:${s}`
    const d = new Date(iso)
    if (!isNaN(d.getTime())) return d.toISOString()
  }

  // Fallback: pure date
  const dateOnly = parsePtBrDate(trimmed)
  if (dateOnly) return new Date(dateOnly).toISOString()

  return null
}

/** Parse a PT-BR decimal grade string ("8,50", "10,00") to number. */
function parsePtBrGrade(raw: string): number | null {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return null
  const normalised = trimmed.replace(',', '.')
  const n = parseFloat(normalised)
  return isNaN(n) ? null : n
}

/** Return null for blank/whitespace-only strings. */
function blankToNull(value: string): string | null {
  const t = (value ?? '').trim()
  return t.length > 0 ? t : null
}

// ─────────────────────────────────────────────────────────────────────────────
// Body parser / validator
// ─────────────────────────────────────────────────────────────────────────────
function parseBody(rawBody: unknown): ImportPayload {
  if (typeof rawBody !== 'object' || rawBody === null) {
    throw new Error('Request body must be a JSON object.')
  }

  const body = rawBody as Record<string, unknown>

  if (!Array.isArray(body.records)) {
    throw new Error('Field "records" must be an array of enrollment objects.')
  }

  if (body.records.length === 0) {
    throw new Error('Field "records" must not be empty.')
  }

  // Light structural check on first item
  const first = body.records[0] as Record<string, unknown>
  if (typeof first.aluno !== 'string' || typeof first.papel !== 'string' || typeof first.iduc !== 'string') {
    throw new Error('Each record must contain at least the fields: aluno, papel, iduc.')
  }

  return {
    records: body.records as JsonEnrollmentRecord[],
    filename: typeof body.filename === 'string' ? body.filename : undefined,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────
Deno.serve(createHandler(async ({ body, user }) => {
  const supabase = createServiceClient()

  // Only application admins may import enrollment data
  const isAdmin = await isApplicationAdmin(supabase, user.id)
  if (!isAdmin) {
    return errorResponse('Only application administrators can import enrollment data.', 403)
  }

  const { records, filename } = body

  // ── 1. Create import batch record ────────────────────────────────────────
  const { data: batch, error: batchError } = await supabase
    .from('uc_import_batches')
    .insert({
      imported_by:   user.id,
      filename:      filename ?? null,
      total_records: records.length,
      status:        'processing',
    })
    .select('id')
    .single()

  if (batchError || !batch) {
    console.error('[import-uc-enrollments] Failed to create batch:', batchError)
    return errorResponse('Failed to initialise import batch.', 500)
  }

  const batchId = batch.id

  // ── 2. Normalise & upsert records ────────────────────────────────────────
  const now = new Date().toISOString()
  let upsertedCount = 0
  const errors: string[] = []

  // Process in chunks to avoid hitting request size limits
  const CHUNK_SIZE = 200
  for (let i = 0; i < records.length; i += CHUNK_SIZE) {
    const chunk = records.slice(i, i + CHUNK_SIZE)

    const rows = chunk.map((r) => {
      const lastUcRaw = (r.ltimoacessouc ?? '').trim()
      const neverAccessed = lastUcRaw.toLowerCase() === 'nunca'

      return {
        nome_pessoa:                 (r.aluno ?? '').trim(),
        cpf:                         blankToNull(r.cpf),
        email:                       blankToNull(r['e-mail']),
        telefone1:                   blankToNull(r.telefone1),
        telefone2:                   blankToNull(r.telefone2),
        papel:                       (r.papel ?? '').trim(),
        id_uc:                       (r.iduc ?? '').trim(),
        caminho_curso:               blankToNull(r.cursocaminho),
        nome_uc:                     (r.unidadecurricular ?? '').trim(),
        nota_final_raw:              blankToNull(r.notafinal),
        nota_final_num:              parsePtBrGrade(r.notafinal),
        inicio_uc_at:                parsePtBrDate(r.datadeinciouc),
        termino_uc_at:               parsePtBrDate(r.datatrminouc),
        ultimo_acesso_uc_at:         neverAccessed ? null : parsePtBrDateTime(r.ltimoacessouc),
        nunca_acessou_uc:            neverAccessed,
        ultimo_acesso_plataforma_at: parsePtBrDateTime(r.ltimoacessomoodle),
        status_uc:                   blankToNull(r.statusuc),
        matriculado_em_at:           parsePtBrDate(r.datamatricula),
        categoria:                   blankToNull(r.categoria),
        import_batch_id:             batchId,
        updated_at:                  now,
      }
    })

    const { error: upsertError, count } = await supabase
      .from('uc_enrollments')
      .upsert(rows, {
        onConflict: 'id_uc,cpf,papel',
        count: 'exact',
      })

    if (upsertError) {
      console.error('[import-uc-enrollments] Upsert error at chunk', i, upsertError)
      errors.push(`Chunk ${Math.floor(i / CHUNK_SIZE) + 1}: ${upsertError.message}`)
    } else {
      upsertedCount += count ?? chunk.length
    }
  }

  // ── 3. Update batch record with results ──────────────────────────────────
  await supabase
    .from('uc_import_batches')
    .update({
      upserted_records: upsertedCount,
      status:           errors.length > 0 ? 'partial' : 'completed',
      error_message:    errors.length > 0 ? errors.join('\n') : null,
    })
    .eq('id', batchId)

  return jsonResponse({
    batchId,
    total:    records.length,
    upserted: upsertedCount,
    errors:   errors.length > 0 ? errors : undefined,
  })
}, { requireAuth: true, parseBody }))
