import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { evaluateDeltaShadow } from '../../../../supabase/functions/_shared/domain/moodle-sync/delta-shadow'

const ROOT = process.cwd()

describe('Moodle delta shadow safety', () => {
  const base = {
    capabilityAvailable: true,
    currentRelease: '5.1.2',
    watermarkRelease: '5.1.2',
    watermarkSince: '2026-07-21T10:00:00.000Z',
  }

  it('never skips the full sync while delta is in shadow mode', () => {
    expect(evaluateDeltaShadow({
      ...base,
      response: { instances: [] },
    })).toEqual({ changed: false, instanceCount: 0, mode: 'shadow_full', updateCount: 0 })
  })

  it.each([
    [{ ...base, capabilityAvailable: false, response: null }, 'capability_missing'],
    [{ ...base, watermarkSince: null, response: null }, 'no_watermark'],
    [{ ...base, currentRelease: '4.5.5', response: { instances: [] } }, 'release_changed'],
    [{ ...base, response: { warnings: [{ warningcode: 'x' }], instances: [] } }, 'warning'],
    [{ ...base, response: {} }, 'ambiguous'],
  ] as const)('forces full synchronization for unsafe input', (input, reason) => {
    expect(evaluateDeltaShadow(input)).toEqual({ mode: 'full', reason })
  })

  it('counts normalized instances and updates for comparison telemetry', () => {
    expect(evaluateDeltaShadow({
      ...base,
      response: { instances: [{ updates: [{ name: 'configuration' }, { name: 'content' }] }] },
    })).toEqual({ changed: true, instanceCount: 1, mode: 'shadow_full', updateCount: 2 })
  })

  it('is wired into the worker and advances a safe transactional watermark', () => {
    const runner = fs.readFileSync(path.join(
      ROOT,
      'supabase/functions/_shared/domain/moodle-sync/job-runner.ts',
    ), 'utf8')
    const migration = fs.readFileSync(path.join(
      ROOT,
      'supabase/migrations/20260721320000_add_durable_moodle_sync_worker.sql',
    ), 'utf8')

    expect(runner).toContain('getCourseUpdatesSince(')
    expect(runner).toContain("capability: 'delta'")
    expect(runner).toContain("reason: 'rollout_disabled'")
    expect(runner).toContain('Delta shadow signal unavailable; full sync preserved.')
    expect(migration).toContain("v_item_metadata ->> 'watermark_candidate'")
    expect(migration).toContain('moodle_since = EXCLUDED.moodle_since')
  })
})
