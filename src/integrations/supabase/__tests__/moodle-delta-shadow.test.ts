import { describe, expect, it } from 'vitest'
import { evaluateDeltaShadow } from '../../../../supabase/functions/_shared/domain/moodle-sync/delta-shadow'

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
})

