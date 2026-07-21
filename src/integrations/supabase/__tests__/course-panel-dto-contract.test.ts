import { describe, expect, it } from 'vitest';

import type { CoursePanelDto as BackendCoursePanelDto } from '../../../../supabase/functions/course-panel/contract.ts';
import type { CoursePanelDto as FrontendCoursePanelDto } from '../../../features/courses/api/contracts/course-panel.contract';

function backendToFrontend(dto: BackendCoursePanelDto): FrontendCoursePanelDto {
  return dto;
}

function frontendToBackend(dto: FrontendCoursePanelDto): BackendCoursePanelDto {
  return dto;
}

describe('course panel frontend/backend DTO contract', () => {
  it('keeps the versioned DTO structurally compatible', () => {
    const dto = {
      activities: [],
      attendanceEnabled: false,
      course: {
        category: null,
        effectiveEndsAt: null,
        endsAt: null,
        id: 'course-1',
        lastSyncedAt: null,
        lifecycle: 'inProgress',
        moodleCourseId: '1',
        name: 'Curso',
        shortName: null,
        startsAt: null,
      },
      metadata: {
        contractVersion: 1,
        dataUpdatedAt: null,
        generatedAt: '2026-07-21T00:00:00.000Z',
      },
      stats: {
        atRiskStudents: 0,
        completionRate: 0,
        riskDistribution: { atencao: 0, critico: 0, normal: 0, risco: 0 },
        totalActivities: 0,
        totalStudents: 0,
      },
      students: [],
    } satisfies BackendCoursePanelDto & FrontendCoursePanelDto;

    expect(backendToFrontend(dto).metadata.contractVersion).toBe(1);
    expect(frontendToBackend(dto).metadata.contractVersion).toBe(1);
  });
});
