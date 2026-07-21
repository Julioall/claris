import { describe, expect, it } from 'vitest';

import type {
  CourseAttendanceOverviewDto as BackendOverviewDto,
  CourseAttendanceSheetDto as BackendSheetDto,
  SaveCourseAttendanceDto as BackendSaveDto,
} from '../../../../supabase/functions/course-attendance/contract.ts';
import type {
  CourseAttendanceOverviewDto as FrontendOverviewDto,
  CourseAttendanceSheetDto as FrontendSheetDto,
  SaveCourseAttendanceDto as FrontendSaveDto,
} from '../../../features/courses/api/contracts/course-attendance.contract';

function backendOverviewToFrontend(dto: BackendOverviewDto): FrontendOverviewDto {
  return dto;
}

function frontendOverviewToBackend(dto: FrontendOverviewDto): BackendOverviewDto {
  return dto;
}

function backendSheetToFrontend(dto: BackendSheetDto): FrontendSheetDto {
  return dto;
}

function frontendSheetToBackend(dto: FrontendSheetDto): BackendSheetDto {
  return dto;
}

function backendSaveToFrontend(dto: BackendSaveDto): FrontendSaveDto {
  return dto;
}

function frontendSaveToBackend(dto: FrontendSaveDto): BackendSaveDto {
  return dto;
}

describe('course attendance frontend/backend DTO contract', () => {
  it('keeps overview, sheet and command DTOs compatible in both directions', () => {
    const metadata = {
      contractVersion: 1 as const,
      generatedAt: '2026-07-21T00:00:00.000Z',
    };
    const overview = {
      dateSummaries: [],
      metadata: { ...metadata, hasMore: false, limit: 120, offset: 0 },
      records: [],
      students: [],
    } satisfies BackendOverviewDto & FrontendOverviewDto;
    const sheet = {
      courseId: 'course-1',
      date: '2026-07-21',
      entries: [],
      metadata,
    } satisfies BackendSheetDto & FrontendSheetDto;
    const save = {
      courseId: 'course-1',
      date: '2026-07-21',
      metadata,
      savedCount: 0,
    } satisfies BackendSaveDto & FrontendSaveDto;

    expect(backendOverviewToFrontend(overview)).toBe(frontendOverviewToBackend(overview));
    expect(backendSheetToFrontend(sheet)).toBe(frontendSheetToBackend(sheet));
    expect(backendSaveToFrontend(save)).toBe(frontendSaveToBackend(save));
  });
});
