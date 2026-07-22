import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { parseAdminDiagnosticsPayload } from '../../../../supabase/functions/admin-diagnostics/payload.ts';
import { mapGradeDiagnosticResult } from '../../../../supabase/functions/admin-diagnostics/mapper.ts';
import {
  executeAdminDiagnostics,
} from '../../../../supabase/functions/admin-diagnostics/service.ts';
import type {
  AdminDiagnosticsRepository,
  GradeDiagnosticTarget,
} from '../../../../supabase/functions/admin-diagnostics/repository.ts';
import type {
  GradeDiagnosticGateway,
} from '../../../../supabase/functions/admin-diagnostics/gateway.ts';
import { parseDataCleanupPayload } from '../../../../supabase/functions/data-cleanup/payload.ts';
import {
  CLEANUP_DELETE_ORDER,
  CLEANUP_SELECTION_TABLES,
  executeDataCleanup,
} from '../../../../supabase/functions/data-cleanup/service.ts';
import type {
  DataCleanupRepository,
} from '../../../../supabase/functions/data-cleanup/repository.ts';
import { parseMoodleSyncGradesPayload } from '../../../../supabase/functions/moodle-sync-grades/payload.ts';

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const COURSE_ID = '22222222-2222-4222-8222-222222222222';
const STUDENT_ID = '33333333-3333-4333-8333-333333333333';
const CONNECTION_ID = '44444444-4444-4444-8444-444444444444';
const SITE_ID = '55555555-5555-4555-8555-555555555555';

function diagnosticsDb() {
  return {
    from: vi.fn((table: string) => {
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        maybeSingle: vi.fn(async () => ({
          data: table === 'user_moodle_connections'
            ? { id: CONNECTION_ID, moodle_site_id: SITE_ID, status: 'active', user_id: ACTOR_ID }
            : { id: SITE_ID, status: 'approved' },
          error: null,
        })),
      };
      return query;
    }),
  } as never;
}

const target: GradeDiagnosticTarget = {
  course: { id: COURSE_ID, moodleCourseId: '101', name: 'Matematica' },
  student: { id: STUDENT_ID, moodleUserId: '5001', fullName: 'Ana Silva' },
};

function cleanupRepository(
  overrides: Partial<DataCleanupRepository> = {},
): DataCleanupRepository {
  return {
    cleanupTable: vi.fn(async () => ({ success: true, errorMessage: null })),
    recordAudit: vi.fn(async () => undefined),
    ...overrides,
  };
}

function diagnosticsRepository(
  overrides: Partial<AdminDiagnosticsRepository> = {},
): AdminDiagnosticsRepository {
  return {
    findGradeDiagnosticTarget: vi.fn(async () => target),
    listGradeCourses: vi.fn(async () => [target.course]),
    listGradeStudents: vi.fn(async () => [target.student]),
    recordAudit: vi.fn(async () => undefined),
    ...overrides,
  };
}

function diagnosticGateway(
  overrides: Partial<GradeDiagnosticGateway> = {},
): GradeDiagnosticGateway {
  return {
    fetchGrades: vi.fn(async () => ({
      providerTrace: 'must-not-leak',
      usergrades: [{
        studentSecret: 'must-not-leak',
        gradeitems: [{
          itemtype: 'course',
          itemname: 'Total do curso',
          graderaw: 8.5,
          grademax: 10,
          gradeformatted: '8,50',
          percentageformatted: '85%',
          feedback: 'private raw feedback',
        }],
      }],
    })),
    ...overrides,
  };
}

describe('data cleanup backend contract', () => {
  it('keeps every physical cleanup target mapped behind a functional selection', () => {
    const mappedTables = new Set(Object.values(CLEANUP_SELECTION_TABLES).flat());
    expect(CLEANUP_DELETE_ORDER.filter((table) => !mappedTables.has(table))).toEqual([]);
  });

  it('requires an exact destructive intent and rejects browser identity fields', () => {
    expect(parseDataCleanupPayload({
      action: 'execute_cleanup',
      confirmation: 'CONFIRM_OPERATIONAL_DATA_CLEANUP_V1',
      mode: 'selected_cleanup',
      selectionIds: ['academic_activities'],
    })).toEqual({
      action: 'execute_cleanup',
      confirmation: 'CONFIRM_OPERATIONAL_DATA_CLEANUP_V1',
      mode: 'selected_cleanup',
      selectionIds: ['academic_activities'],
    });

    for (const payload of [
      { action: 'execute_cleanup', mode: 'full_cleanup' },
      {
        action: 'execute_cleanup',
        confirmation: 'yes',
        mode: 'full_cleanup',
      },
      {
        action: 'execute_cleanup',
        confirmation: 'CONFIRM_OPERATIONAL_DATA_CLEANUP_V1',
        mode: 'full_cleanup',
        actorId: ACTOR_ID,
      },
      {
        action: 'execute_cleanup',
        confirmation: 'CONFIRM_OPERATIONAL_DATA_CLEANUP_V1',
        mode: 'selected_cleanup',
        tables: ['courses'],
      },
    ]) {
      expect(() => parseDataCleanupPayload(payload)).toThrow();
    }
  });

  it('audits the authenticated actor before and after cleanup and redacts database errors', async () => {
    const repository = cleanupRepository({
      cleanupTable: vi.fn(async (table) => table === 'user_ignored_courses'
        ? { success: false, errorMessage: 'sensitive database error' }
        : { success: true, errorMessage: null }),
    });

    const result = await executeDataCleanup(
      repository,
      ACTOR_ID,
      'cleanup-correlation',
      parseDataCleanupPayload({
        action: 'execute_cleanup',
        confirmation: 'CONFIRM_OPERATIONAL_DATA_CLEANUP_V1',
        mode: 'selected_cleanup',
        selectionIds: ['sync_preferences', 'ignored_courses'],
      }),
    );

    expect(repository.cleanupTable).toHaveBeenCalledWith('user_sync_preferences');
    expect(repository.cleanupTable).toHaveBeenCalledWith('user_ignored_courses');
    expect(repository.recordAudit).toHaveBeenNthCalledWith(1, expect.objectContaining({
      actorId: ACTOR_ID,
      correlationId: 'cleanup-correlation',
      operation: 'data_cleanup',
      phase: 'requested',
      status: 'pending',
    }));
    expect(repository.recordAudit).toHaveBeenNthCalledWith(2, expect.objectContaining({
      phase: 'completed',
      status: 'partial_failure',
    }));
    expect(result).toMatchObject({
      contractVersion: 1,
      success: false,
      errors: [{
        selectionId: 'ignored_courses',
        error: 'Não foi possível concluir esta categoria.',
      }],
    });
    expect(JSON.stringify(result)).not.toContain('sensitive database error');
    expect(JSON.stringify(result)).not.toContain('user_ignored_courses');
  });
});

describe('admin grade diagnostics backend contract', () => {
  it('accepts internal IDs and rejects credentials or provider IDs from the browser', () => {
    expect(parseAdminDiagnosticsPayload({
      action: 'run_grade_diagnostic',
      connectionId: CONNECTION_ID,
      courseId: COURSE_ID,
      studentId: STUDENT_ID,
    })).toEqual({
      action: 'run_grade_diagnostic',
      connectionId: CONNECTION_ID,
      courseId: COURSE_ID,
      studentId: STUDENT_ID,
    });

    for (const payload of [
      {
        action: 'run_grade_diagnostic',
        connectionId: CONNECTION_ID,
        courseId: COURSE_ID,
        studentId: STUDENT_ID,
        token: 'browser-token',
      },
      {
        action: 'run_grade_diagnostic',
        connectionId: CONNECTION_ID,
        courseId: COURSE_ID,
        studentId: STUDENT_ID,
        moodleUserId: 5001,
      },
    ]) {
      expect(() => parseAdminDiagnosticsPayload(payload)).toThrowError(
        expect.objectContaining({ status: 422 }),
      );
    }
  });

  it('returns bounded DTOs without Moodle IDs or raw provider payloads', async () => {
    const result = await executeAdminDiagnostics(
      diagnosticsRepository(),
      diagnosticGateway(),
      diagnosticsDb(),
      ACTOR_ID,
      'diagnostic-correlation',
      { action: 'list_grade_courses', connectionId: CONNECTION_ID },
    );
    expect(result).toEqual({
      contractVersion: 1,
      items: [{ id: COURSE_ID, name: 'Matematica' }],
    });
    expect(JSON.stringify(result)).not.toContain('101');

    const mapped = mapGradeDiagnosticResult(
      await diagnosticGateway().fetchGrades(ACTOR_ID, CONNECTION_ID, target),
      '44444444-4444-4444-8444-444444444444',
      target,
    );
    expect(mapped.courseGrade).toMatchObject({ itemType: 'course', gradeRaw: 8.5 });
    expect(JSON.stringify(mapped)).not.toContain('providerTrace');
    expect(JSON.stringify(mapped)).not.toContain('studentSecret');
    expect(JSON.stringify(mapped)).not.toContain('private raw feedback');
    expect(JSON.stringify(mapped)).not.toContain('moodleUserId');
  });

  it('derives the provider credential actor and writes requested/completed audit events', async () => {
    const repository = diagnosticsRepository();
    const gateway = diagnosticGateway();

    const result = await executeAdminDiagnostics(
      repository,
      gateway,
      diagnosticsDb(),
      ACTOR_ID,
      'diagnostic-correlation',
      { action: 'run_grade_diagnostic', connectionId: CONNECTION_ID, courseId: COURSE_ID, studentId: STUDENT_ID },
    );

    expect(gateway.fetchGrades).toHaveBeenCalledWith(ACTOR_ID, CONNECTION_ID, target);
    expect(repository.recordAudit).toHaveBeenNthCalledWith(1, expect.objectContaining({
      actorId: ACTOR_ID,
      correlationId: 'diagnostic-correlation',
      operation: 'grade_diagnostic',
      phase: 'requested',
    }));
    expect(repository.recordAudit).toHaveBeenNthCalledWith(2, expect.objectContaining({
      phase: 'completed',
      status: 'success',
    }));
    expect(result.contractVersion).toBe(1);
  });

  it('removes the legacy grade debug contract that accepted browser credentials', () => {
    expect(() => parseMoodleSyncGradesPayload({
      action: 'debug_grades',
      courseId: 101,
      userId: 5001,
      moodleUrl: 'https://moodle.example.com',
      token: 'browser-token',
    })).toThrow();
  });
});

describe('administrative operation audit database boundary', () => {
  const migration = readFileSync(resolve(
    process.cwd(),
    'supabase/migrations/20260721260000_secure_admin_diagnostics.sql',
  ), 'utf8');

  it('makes the audit service-only and immutable', () => {
    expect(migration).toMatch(
      /REVOKE ALL PRIVILEGES ON TABLE public\.app_admin_operation_audit_log\s+FROM PUBLIC, anon, authenticated/i,
    );
    expect(migration).toMatch(
      /BEFORE UPDATE OR DELETE ON public\.app_admin_operation_audit_log/i,
    );
    expect(migration).toMatch(
      /GRANT SELECT, INSERT ON TABLE public\.app_admin_operation_audit_log\s+TO service_role/i,
    );
  });
});
