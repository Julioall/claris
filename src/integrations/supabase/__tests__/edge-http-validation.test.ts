import { describe, expect, it } from 'vitest';

import {
  readOptionalArray,
  readPageRequest,
  readRequiredBoolean,
  readRequiredInteger,
  readRequiredIsoDate,
  readRequiredObject,
  readRequiredUuid,
  RequestBodyValidationError,
} from '../../../../supabase/functions/_shared/http/body.ts';

describe('Edge HTTP payload validation', () => {
  it('reads strict primitive and structured fields', () => {
    const body = {
      enabled: true,
      count: 4,
      dueAt: '2026-07-21T13:00:00.000Z',
      id: 'd9427b7f-456b-44e6-a16b-e55042a26f32',
      filters: { status: 'active' },
      labels: ['one', 'two'],
    };

    expect(readRequiredBoolean(body, 'enabled')).toBe(true);
    expect(readRequiredInteger(body, 'count', 1, 10)).toBe(4);
    expect(readRequiredIsoDate(body, 'dueAt')).toBe(body.dueAt);
    expect(readRequiredUuid(body, 'id')).toBe(body.id);
    expect(readRequiredObject(body, 'filters')).toEqual({ status: 'active' });
    expect(readOptionalArray(body, 'labels', (value): value is string => typeof value === 'string', 2))
      .toEqual(['one', 'two']);
  });

  it.each([
    [{ enabled: 'true' }, () => readRequiredBoolean({ enabled: 'true' }, 'enabled')],
    [{ count: 1.5 }, () => readRequiredInteger({ count: 1.5 }, 'count')],
    [{ dueAt: '2026-07-21' }, () => readRequiredIsoDate({ dueAt: '2026-07-21' }, 'dueAt')],
    [{ id: 'not-a-uuid' }, () => readRequiredUuid({ id: 'not-a-uuid' }, 'id')],
  ])('rejects invalid semantic fields', (_body, read) => {
    expect(read).toThrow(RequestBodyValidationError);
    try {
      read();
    } catch (error) {
      expect((error as RequestBodyValidationError).status).toBe(422);
    }
  });

  it('normalizes and limits pagination', () => {
    expect(readPageRequest({ page: 2, pageSize: 50, filters: { risk: 'high' } })).toEqual({
      page: 2,
      pageSize: 50,
      filters: { risk: 'high' },
    });
    expect(readPageRequest({})).toEqual({ page: 1, pageSize: 25, filters: undefined });
    expect(() => readPageRequest({ pageSize: 101 })).toThrow(RequestBodyValidationError);
  });
});
