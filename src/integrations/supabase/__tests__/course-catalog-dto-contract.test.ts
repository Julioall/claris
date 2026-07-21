import { describe, expect, it } from 'vitest';

import type { CourseCatalogDto as BackendCourseCatalogDto } from '../../../../supabase/functions/courses-catalog/contract.ts';
import type { CourseCatalogDto as FrontendCourseCatalogDto } from '../../../features/courses/api/contracts/course-catalog.contract';

function backendToFrontend(dto: BackendCourseCatalogDto): FrontendCourseCatalogDto {
  return dto;
}

function frontendToBackend(dto: FrontendCourseCatalogDto): BackendCourseCatalogDto {
  return dto;
}

describe('course catalog frontend/backend DTO contract', () => {
  it('keeps the versioned DTO structurally compatible in both directions', () => {
    const dto = {
      items: [],
      metadata: {
        contractVersion: 1,
        generatedAt: '2026-07-21T00:00:00.000Z',
      },
    } satisfies BackendCourseCatalogDto & FrontendCourseCatalogDto;

    expect(backendToFrontend(dto).metadata.contractVersion).toBe(1);
    expect(frontendToBackend(dto).metadata.contractVersion).toBe(1);
  });
});
