import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(
  process.cwd(),
  'supabase/migrations/20260721200000_secure_sync_and_background_jobs.sql',
), 'utf8');

describe('sync and background jobs security migration', () => {
  it('prevents concurrent active jobs for the canonical sync request', () => {
    expect(migration).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS idx_background_jobs_active_sync_request/i);
    expect(migration).toMatch(/status IN \('pending', 'processing'\)/i);
  });

  it.each([
    'background_jobs',
    'background_job_items',
    'background_job_events',
    'activity_feed',
    'user_sync_preferences',
  ])('removes browser grants from %s', (table) => {
    expect(migration).toMatch(new RegExp(
      `REVOKE ALL ON TABLE public\\.${table} FROM anon, authenticated`,
      'i',
    ));
  });
});
