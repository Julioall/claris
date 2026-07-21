import { describe, expect, it } from 'vitest';

import { parseAttendanceDateSummaries } from '../../../../supabase/functions/course-attendance/date-summary.ts';

describe('course attendance date summary parser', () => {
  it('normalizes safe Postgres bigint strings without losing totals', () => {
    expect(parseAttendanceDateSummaries([{
      ausente: '2',
      date: '2026-07-21',
      justificado: '1',
      presente: '37',
      total: '40',
    }])).toEqual([{
      ausente: 2,
      date: '2026-07-21',
      justificado: 1,
      presente: 37,
      total: 40,
    }]);
  });

  it.each([
    { ausente: 0, date: '2026-02-30', justificado: 0, presente: 1, total: 1 },
    { ausente: -1, date: '2026-07-21', justificado: 0, presente: 1, total: 0 },
    { ausente: 1, date: '2026-07-21', justificado: 0, presente: 1, total: 3 },
    { ausente: 0, date: '2026-07-21', justificado: 0, presente: '9007199254740992', total: '9007199254740992' },
  ])('rejects an unsafe summary row: %o', (row) => {
    expect(() => parseAttendanceDateSummaries([row])).toThrow(/Invalid attendance date summary/);
  });
});
