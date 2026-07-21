import { describe, expect, it, vi } from 'vitest';

import { parseTaskTagSuggestionsPayload } from '../../../../supabase/functions/task-tag-suggestions/payload.ts';
import type { TaskTagSuggestionsRepository } from '../../../../supabase/functions/task-tag-suggestions/repository.ts';
import { searchTaskTagSuggestions } from '../../../../supabase/functions/task-tag-suggestions/service.ts';

function repository(): TaskTagSuggestionsRepository {
  return { search: vi.fn(async () => []) };
}

describe('task-tag-suggestions contract', () => {
  it('accepts every supported prefix and normalizes the search text', () => {
    for (const prefix of ['aluno', 'uc', 'turma', 'curso', 'escola'] as const) {
      expect(parseTaskTagSuggestionsPayload({
        action: 'search_suggestions',
        prefix,
        query: '  busca  ',
      })).toEqual({ action: 'search_suggestions', prefix, query: 'busca' });
    }
  });

  it.each([
    {},
    { action: 'unknown', prefix: 'aluno', query: '' },
    { action: 'search_suggestions', prefix: 'unknown', query: '' },
    { action: 'search_suggestions', prefix: 'aluno', query: 1 },
    { action: 'search_suggestions', prefix: 'aluno', query: 'x'.repeat(101) },
    { action: 'search_suggestions', prefix: 'aluno', query: '', userId: 'spoofed' },
    { action: 'search_suggestions', prefix: 'aluno', query: '', courseIds: ['spoofed'] },
  ])('rejects invalid payloads and client-provided authorization scope', (payload) => {
    expect(() => parseTaskTagSuggestionsPayload(payload)).toThrowError(
      expect.objectContaining({ status: 422 }),
    );
  });

  it('derives scope from the authenticated actor and maps persistence records to DTOs', async () => {
    const repo = repository();
    vi.mocked(repo.search).mockResolvedValue([
      { entityId: 'student-1', label: 'Ana' },
    ]);

    const result = await searchTaskTagSuggestions(repo, 'authenticated-user', {
      action: 'search_suggestions',
      prefix: 'aluno',
      query: 'Ana',
    });

    expect(repo.search).toHaveBeenCalledWith({
      limit: 10,
      prefix: 'aluno',
      query: 'Ana',
      userId: 'authenticated-user',
    });
    expect(result).toEqual({
      items: [{
        entityId: 'student-1',
        entityType: 'aluno',
        label: 'Ana',
        prefix: 'aluno',
      }],
    });
  });

  it('enforces the response limit even when a repository returns extra rows', async () => {
    const repo = repository();
    vi.mocked(repo.search).mockResolvedValue(Array.from({ length: 12 }, (_, index) => ({
      entityId: `course-${index}`,
      label: `Course ${index}`,
    })));

    const result = await searchTaskTagSuggestions(repo, 'user-1', {
      action: 'search_suggestions',
      prefix: 'uc',
      query: '',
    });

    expect(result.items).toHaveLength(10);
  });
});
