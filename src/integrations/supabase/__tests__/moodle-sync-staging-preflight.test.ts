import { describe, expect, it } from 'vitest'

import {
  normalizeFunctionsUrl,
  validateOperationalMetrics,
  validateRollouts,
} from '../../../../scripts/validate-moodle-sync-staging.mjs'

describe('Moodle sync staging preflight', () => {
  it('accepts only a safe HTTPS staging URL and derives the Functions base once', () => {
    expect(normalizeFunctionsUrl('https://claris-staging.example'))
      .toBe('https://claris-staging.example/functions/v1')
    expect(normalizeFunctionsUrl('https://claris-staging.example/functions/v1/'))
      .toBe('https://claris-staging.example/functions/v1')
    expect(() => normalizeFunctionsUrl('http://claris-staging.example')).toThrow(/HTTPS/)
    expect(() => normalizeFunctionsUrl('https://user@claris-staging.example')).toThrow(/sem credenciais/)
    expect(() => normalizeFunctionsUrl('https://claris-staging.example?next=x')).toThrow(/query/)
  })

  it('keeps Gate A deny-by-default and validates only safe operational aggregates', () => {
    expect(validateRollouts({ contractVersion: 1, items: [] }, false))
      .toEqual({ enabledCount: 0, itemCount: 0 })
    expect(() => validateRollouts({
      contractVersion: 1,
      items: [{ enabled: true }],
    }, false)).toThrow(/rollout Moodle habilitado/)
    expect(validateRollouts({ contractVersion: 1, items: [{ enabled: true }] }, true))
      .toEqual({ enabledCount: 1, itemCount: 1 })

    expect(validateOperationalMetrics({
      contractVersion: 1,
      items: [{
        siteSlug: 'fieg',
        transport: { apiCalls: 12, responseBytes: 3400 },
      }],
    })).toEqual({ siteMetricCount: 1 })
    expect(() => validateOperationalMetrics({
      contractVersion: 1,
      items: [{ siteSlug: 'fieg', transport: { apiCalls: 1.5, responseBytes: 1 } }],
    })).toThrow(/metrica Moodle incompleta/)
  })
})
