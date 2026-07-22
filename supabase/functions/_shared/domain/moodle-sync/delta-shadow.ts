import type { MoodleCourseUpdatesSince } from '../../moodle/mod.ts'

export type DeltaShadowDecision =
  | { mode: 'full'; reason: 'capability_missing' | 'no_watermark' | 'release_changed' | 'warning' | 'ambiguous' }
  | { mode: 'shadow_full'; changed: boolean; instanceCount: number; updateCount: number }

export function evaluateDeltaShadow(input: {
  capabilityAvailable: boolean
  currentRelease: string | null
  response: MoodleCourseUpdatesSince | null
  watermarkRelease: string | null
  watermarkSince: string | null
}): DeltaShadowDecision {
  if (!input.capabilityAvailable) return { mode: 'full', reason: 'capability_missing' }
  if (!input.watermarkSince || !Number.isFinite(Date.parse(input.watermarkSince))) {
    return { mode: 'full', reason: 'no_watermark' }
  }
  if (input.watermarkRelease && input.currentRelease !== input.watermarkRelease) {
    return { mode: 'full', reason: 'release_changed' }
  }
  if (!input.response || !Array.isArray(input.response.instances)) {
    return { mode: 'full', reason: 'ambiguous' }
  }
  if (Array.isArray(input.response.warnings) && input.response.warnings.length > 0) {
    return { mode: 'full', reason: 'warning' }
  }
  const updateCount = input.response.instances.reduce(
    (total, instance) => total + (Array.isArray(instance.updates) ? instance.updates.length : 0),
    0,
  )
  return {
    changed: updateCount > 0,
    instanceCount: input.response.instances.length,
    mode: 'shadow_full',
    updateCount,
  }
}

