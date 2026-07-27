import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

interface BenchmarkResult {
  id: string
  metrics: {
    activityMetadataApiCalls: number
    activityMetadataCacheReuses: number
    activityUpsertBatches: number
    bulkGradeApiCalls: number
    completionApiCalls: number
    courseGradeUpsertBatches: number
    gradeActivityUpsertBatches: number
    gradeFallbackApiCalls: number
    moodleApiCalls: number
    rows: Record<string, number>
  }
  studentCount: number
  timing: {
    heapDeltaBytes: number
    wallMs: number
  }
}

interface BenchmarkOutput {
  benchmark: string
  benchmarkVersion: number
  execution: string
  results: BenchmarkResult[]
}

function runBenchmark(): BenchmarkOutput {
  const output = execFileSync(process.execPath, ['scripts/benchmark-moodle-sync.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 15_000,
  })
  return JSON.parse(output) as BenchmarkOutput
}

describe('synthetic Moodle sync benchmark', () => {
  it('versions the zero, small, medium and 500+ student performance contract', () => {
    const fixturePath = path.join(
      process.cwd(),
      'docs/benchmarks/moodle-sync-synthetic-contract.json',
    )
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as {
      benchmark: string
      benchmarkVersion: number
      scenarios: Array<{ id: string; studentCount: number }>
    }

    expect(fixture).toMatchObject({
      benchmark: 'moodle-sync-synthetic',
      benchmarkVersion: 1,
    })
    expect(fixture.scenarios.map((scenario) => scenario.studentCount)).toEqual([0, 10, 100, 500])
    expect(fixture.scenarios.at(-1)?.id).toBe('five-hundred-plus-students')
  })

  it('runs fully locally and preserves metadata/bulk limits for 500+ students', () => {
    const output = runBenchmark()

    expect(output).toMatchObject({
      benchmark: 'moodle-sync-synthetic',
      benchmarkVersion: 1,
      execution: 'local-synthetic-no-network',
    })
    expect(output.results.map((result) => result.studentCount)).toEqual([0, 10, 100, 500])

    const large = output.results.at(-1)
    expect(large).toMatchObject({
      studentCount: 500,
      metrics: {
        activityMetadataApiCalls: 3,
        activityMetadataCacheReuses: 41,
        activityUpsertBatches: 42,
        bulkGradeApiCalls: 1,
        completionApiCalls: 500,
        courseGradeUpsertBatches: 5,
        gradeActivityUpsertBatches: 20,
        gradeFallbackApiCalls: 0,
        moodleApiCalls: 504,
        rows: {
          activityCompletion: 6000,
          courseGrades: 500,
          gradeActivities: 4000,
          total: 10500,
        },
      },
    })
    expect(large?.timing.wallMs).toBeGreaterThanOrEqual(0)
    expect(large?.timing.heapDeltaBytes).toBeGreaterThanOrEqual(0)
  })
})
