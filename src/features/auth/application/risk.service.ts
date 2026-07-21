import { recalculateMoodleRisk } from '../api/moodle-sync-jobs';
import type { RiskUpdateResult } from '../domain/sync';

export async function recalculateRiskForCourses(courseIds: string[]): Promise<RiskUpdateResult> {
  if (courseIds.length === 0) {
    return {
      failedCount: 0,
      missingRpc: false,
      updatedCount: 0,
      usedFallback: false,
    };
  }

  const result = await recalculateMoodleRisk([...new Set(courseIds)]);
  return {
    failedCount: result.failedCount,
    missingRpc: result.missingRpc,
    updatedCount: result.updatedCount,
    usedFallback: result.usedFallback,
  };
}
