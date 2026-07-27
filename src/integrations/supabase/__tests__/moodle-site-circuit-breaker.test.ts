import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const migration = fs.readFileSync(path.join(
  root,
  'supabase/migrations/20260721360000_add_moodle_site_circuit_breakers.sql',
), 'utf8')
const workerMigration = fs.readFileSync(path.join(
  root,
  'supabase/migrations/20260721320000_add_durable_moodle_sync_worker.sql',
), 'utf8')
const runner = fs.readFileSync(path.join(
  root,
  'supabase/functions/_shared/domain/moodle-sync/job-runner.ts',
), 'utf8')

describe('Moodle site circuit breaker contract', () => {
  it('stores service-only site state and opens after bounded transient failures', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.moodle_site_circuit_breakers')
    expect(migration).toContain("CHECK (state IN ('closed', 'open'))")
    expect(migration).toContain("moodle_site_circuit_breakers.consecutive_failures + 1 >= 3")
    expect(migration).toContain("v_now + INTERVAL '5 minutes'")
    expect(migration).toContain('REVOKE ALL ON TABLE public.moodle_site_circuit_breakers')
  })

  it('keeps an open site out of claim selection without affecting another site', () => {
    expect(workerMigration).toContain('FROM public.moodle_site_circuit_breakers circuit_row')
    expect(workerMigration).toContain('circuit_row.moodle_site_id = connection_row.moodle_site_id')
    expect(workerMigration).toContain("circuit_row.state = 'open'")
    expect(workerMigration).toContain('circuit_row.open_until > v_now')
  })

  it('records only successful or retryable provider item results', () => {
    expect(runner).toContain('recordMoodleSiteCircuitResult')
    expect(runner).toContain('if (!isMoodleProviderItem(item)) return')
    expect(runner).toContain('if (classified.retryable && failureStatus !== null)')
    expect(runner).toContain('await safelyRecordMoodleSiteCircuitResult(supabase, item, true)')
  })
})
