import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(resolve(
  process.cwd(),
  'supabase/migrations/20260721370000_add_moodle_sync_rollouts.sql',
), 'utf8')
const snapshotRepository = readFileSync(resolve(
  process.cwd(),
  'supabase/functions/moodle-course-snapshot/repository.ts',
), 'utf8')

describe('Moodle sync rollout migration', () => {
  it('defaults all capabilities to disabled and exposes only service-side controls', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.moodle_sync_rollouts')
    expect(migration).toContain('enabled BOOLEAN NOT NULL DEFAULT false')
    expect(migration).toContain("CHECK (capability IN ('worker', 'bulk', 'delta', 'freshness'))")
    expect(migration).toContain('REVOKE ALL ON TABLE public.moodle_sync_rollouts FROM PUBLIC, anon, authenticated;')
    expect(migration).toContain('GRANT ALL ON TABLE public.moodle_sync_rollouts TO service_role;')
  })

  it('uses a site kill switch before optional user allow-list rules', () => {
    expect(migration).toContain('IF COALESCE(v_site_enabled, FALSE) IS NOT TRUE THEN')
    expect(migration).toContain('IF NOT v_has_user_rules THEN')
    expect(migration).toContain('RETURN COALESCE(v_user_enabled, FALSE);')
  })

  it('gates every remote initiation path and preserves pending work while worker is off', () => {
    expect(migration).toContain('backend_create_moodle_sync_job_v2_gated')
    expect(migration).toContain("p_user_id, p_moodle_connection_id, 'bulk'")
    expect(migration).toContain('backend_request_course_refresh_gated')
    expect(migration).toContain("p_user_id, p_moodle_connection_id, 'freshness'")
    expect(migration).toContain("connection_row.moodle_site_id, job_row.user_id, 'worker'")
    expect(migration).toContain('attempt_count = item_row.attempt_count + 1')
    expect(migration).toContain('moodle_site_circuit_breakers circuit_row')
    expect(migration).toContain('REVOKE EXECUTE ON FUNCTION public.backend_create_moodle_sync_job_v2')
    expect(migration).toContain('REVOKE EXECUTE ON FUNCTION public.backend_request_course_refresh')
    expect(snapshotRepository).toContain("'backend_request_course_refresh_gated'")
  })
})
