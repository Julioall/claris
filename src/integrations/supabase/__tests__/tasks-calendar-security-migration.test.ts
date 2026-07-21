import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(
  process.cwd(),
  'supabase/migrations/20260721160000_secure_tasks_and_calendar.sql',
), 'utf8');

describe('tasks and calendar backend-only migration', () => {
  it('enforces an actor-owned normalized tag identity', () => {
    expect(migration).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS tags_actor_identity_uidx/i);
    expect(migration).toMatch(/created_by[\s\S]*lower\(btrim\(label\)\)[\s\S]*coalesce/i);
  });

  it('keeps list and atomic tag RPCs service-only', () => {
    for (const rpc of ['backend_list_tasks_page', 'backend_add_task_tag']) {
      expect(migration).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${rpc}[\\s\\S]*FROM PUBLIC, anon, authenticated`, 'i'));
      expect(migration).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${rpc}[\\s\\S]*TO service_role`, 'i'));
    }
  });

  it('removes direct browser grants from all migrated tables', () => {
    for (const table of ['tasks', 'task_comments', 'task_history', 'tags', 'task_tags', 'calendar_events']) {
      expect(migration).toContain(`public.${table}`);
    }
    expect(migration).toMatch(/REVOKE ALL ON TABLE[\s\S]*FROM anon, authenticated/i);
  });
});
