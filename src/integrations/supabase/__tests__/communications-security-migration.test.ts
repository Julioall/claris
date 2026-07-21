import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(
  process.cwd(),
  'supabase/migrations/20260721170000_secure_communications.sql',
), 'utf8');

describe('communications backend-only migration', () => {
  it('keeps default template seeding service-only and race-safe', () => {
    expect(migration).toMatch(/pg_advisory_xact_lock/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.backend_seed_message_templates[\s\S]*FROM PUBLIC, anon, authenticated/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.backend_seed_message_templates[\s\S]*TO service_role/i);
  });

  it('removes every browser grant from migrated communication tables', () => {
    for (const table of ['message_templates', 'bulk_message_jobs', 'bulk_message_recipients']) {
      expect(migration).toContain(`public.${table}`);
    }
    expect(migration).toMatch(/REVOKE ALL ON TABLE[\s\S]*FROM anon, authenticated/i);
  });
});
