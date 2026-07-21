import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { StudentGradesTab } from '@/components/student/StudentGradesTab';
import type { StudentProfileCourse } from '@/features/students/types';

function buildCourse(overrides: Partial<StudentProfileCourse> = {}): StudentProfileCourse {
  return {
    activities: [],
    grade: null,
    id: 'c-1',
    name: 'Matematica',
    shortName: 'MAT',
    ...overrides,
  };
}

describe('StudentGradesTab', () => {
  it('shows empty state when the profile DTO has no grade sections', () => {
    render(<StudentGradesTab courses={[]} />);

    expect(screen.getByText(/nenhuma nota encontrada/i)).toBeInTheDocument();
    expect(screen.getByText(/apos a sincronizacao dos cursos/i)).toBeInTheDocument();
  });

  it('renders the course total from the backend DTO instead of summing activities', async () => {
    const user = userEvent.setup();
    render(<StudentGradesTab courses={[buildCourse({
      grade: {
        formatted: '18/20',
        letter: 'A',
        maximum: 20,
        percentage: 90,
        raw: 18,
        synchronizedAt: '2026-02-23T00:00:00.000Z',
      },
      activities: [
        {
          dueAt: null, grade: 7, gradeMaximum: 10, hidden: false, id: 'a-1',
          moodleActivityId: '1', name: 'Trabalho 1', percentage: 70,
          type: 'assignment', workflowStatus: 'corrected',
        },
        {
          dueAt: null, grade: 8, gradeMaximum: 10, hidden: false, id: 'a-2',
          moodleActivityId: '2', name: 'Prova 1', percentage: 80,
          type: 'quiz', workflowStatus: 'corrected',
        },
        {
          dueAt: null, grade: 10, gradeMaximum: 10, hidden: true, id: 'a-3',
          moodleActivityId: '3', name: 'Atividade Oculta', percentage: 100,
          type: 'quiz', workflowStatus: 'corrected',
        },
      ],
    })]} />);

    expect(screen.getByText('Matematica')).toBeInTheDocument();
    expect(screen.getByText('18/20')).toBeInTheDocument();
    expect(screen.getByText('90.0%')).toBeInTheDocument();
    expect(screen.getByText(/livro de notas/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /atividades e notas separadas/i }));
    expect(screen.getByText('Trabalho 1')).toBeInTheDocument();
    expect(screen.getByText('Prova 1')).toBeInTheDocument();
    expect(screen.getByText('Atividade Oculta')).toBeInTheDocument();
    expect(screen.getByText('Oculta das metricas')).toBeInTheDocument();
  });

  it('renders pending weighted activities when the total grade is unavailable', async () => {
    const user = userEvent.setup();
    render(<StudentGradesTab courses={[buildCourse({
      activities: [
        {
          dueAt: '2026-03-10T00:00:00.000Z', grade: null, gradeMaximum: 20,
          hidden: false, id: 'a-1', moodleActivityId: '1', name: 'Trabalho Final',
          percentage: null, type: 'assign', workflowStatus: 'pendingSubmission',
        },
        {
          dueAt: '2026-03-18T00:00:00.000Z', grade: null, gradeMaximum: 10,
          hidden: false, id: 'a-2', moodleActivityId: '2', name: 'Projeto 2',
          percentage: null, type: 'assign', workflowStatus: 'pendingSubmission',
        },
      ],
    })]} />);

    expect(screen.getByText('Sem nota total sincronizada')).toBeInTheDocument();
    expect(screen.getByText('Sem nota total')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /atividades e notas separadas/i }));

    expect(screen.getByText('Trabalho Final')).toBeInTheDocument();
    expect(screen.getByText('Projeto 2')).toBeInTheDocument();
    expect(screen.getAllByText('Pendente de Envio')).toHaveLength(2);
  });

  it('does not expose AI suggestion actions in the student grade screen', async () => {
    const user = userEvent.setup();
    render(<StudentGradesTab courses={[buildCourse({
      activities: [{
        dueAt: null, grade: null, gradeMaximum: 10, hidden: false, id: 'a-1',
        moodleActivityId: '77', name: 'SAP 4', percentage: null,
        type: 'assign', workflowStatus: 'pendingCorrection',
      }],
    })]} />);

    await user.click(screen.getByRole('button', { name: /atividades e notas separadas/i }));
    expect(screen.queryByRole('button', { name: /gerar sugestao com ia/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sugerir ia/i })).not.toBeInTheDocument();
  });
});
