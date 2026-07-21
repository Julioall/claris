import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { ActivitiesToReview } from '@/features/dashboard/components/ActivitiesToReview';

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: ReactNode }) => (
    <div data-testid="scroll-area">{children}</div>
  ),
}));

describe('ActivitiesToReview', () => {
  it('renders the camelCase review DTO and its total queue count', () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ActivitiesToReview
          totalCount={8}
          activities={[{
            course: { id: 'c-1', name: 'Curso 1', shortName: 'CUR-1' },
            courseId: 'c-1',
            dueAt: '2026-07-20T12:00:00.000Z',
            id: 'a-1',
            name: 'Trabalho final',
            student: { id: 's-1', name: 'Ana', riskLevel: 'risco' },
            studentId: 's-1',
            submittedAt: '2026-07-19T12:00:00.000Z',
          }]}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('8 na fila')).toBeInTheDocument();
    expect(screen.getByText('Trabalho final')).toBeInTheDocument();
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.getByText('CUR-1')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/alunos/s-1');
  });
});
