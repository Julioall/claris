import { describe, expect, it } from 'vitest';

import type { AcademicGradesReportDto as BackendGradesReportDto } from '../../../../supabase/functions/academic-reports/contract.ts';
import type { AcademicGradesReportDto as FrontendGradesReportDto } from '@/features/reports/api/contracts/academic-reports.contract';

describe('academic reports DTO contract', () => {
  it('remains assignable in both directions between backend and frontend', () => {
    const backendToFrontend: FrontendGradesReportDto = {} as BackendGradesReportDto;
    const frontendToBackend: BackendGradesReportDto = {} as FrontendGradesReportDto;

    expect(backendToFrontend).toBeDefined();
    expect(frontendToBackend).toBeDefined();
  });
});
