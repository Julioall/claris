import { describe, expect, it } from 'vitest';
import {
  buildBulkMessageVariableAvailability,
  extractTemplateVariables,
  getUnavailableTemplateVariables,
  resolveStudentCourseContext,
} from '@/lib/message-template-context';

const filters = {
  school: 'todos',
  course: 'todos',
  className: 'todos',
  uc: 'todos',
};

describe('message-template-context', () => {
  it('extracts known variables from template content', () => {
    expect(extractTemplateVariables('Olá {nome_aluno} {curso} {foo} {nota_media}')).toEqual([
      'nome_aluno',
      'curso',
      'nota_media',
    ]);
  });

  it('keeps school, course and class available when multiple UCs share the same hierarchy', () => {
    const availability = buildBulkMessageVariableAvailability([
      {
        id: 's-1',
        courses: [
          { course_id: 'c-1', course_name: 'UC 1', category: 'Senai > Escola A > Curso X > Turma 1' },
          { course_id: 'c-2', course_name: 'UC 2', category: 'Senai > Escola A > Curso X > Turma 1' },
        ],
      },
    ], filters);

    expect(availability.escola.available).toBe(true);
    expect(availability.curso.available).toBe(true);
    expect(availability.turma.available).toBe(true);
    expect(availability.unidade_curricular.available).toBe(false);
    expect(availability.nota_media.available).toBe(false);
    expect(availability.atividades_pendentes.available).toBe(false);
  });

  it('releases UC-dependent variables when a specific UC is selected', () => {
    const availability = buildBulkMessageVariableAvailability([
      {
        id: 's-1',
        courses: [
          { course_id: 'c-1', course_name: 'UC 1', category: 'Senai > Escola A > Curso X > Turma 1' },
          { course_id: 'c-2', course_name: 'UC 2', category: 'Senai > Escola A > Curso X > Turma 1' },
        ],
      },
    ], {
      ...filters,
      uc: 'UC 2',
    });

    expect(availability.unidade_curricular.available).toBe(true);
    expect(availability.nota_media.available).toBe(true);
    expect(availability.atividades_pendentes.available).toBe(true);
  });

  it('marks template variables as unavailable when the current context does not support them', () => {
    const availability = buildBulkMessageVariableAvailability([
      {
        id: 's-1',
        courses: [
          { course_id: 'c-1', course_name: 'UC 1', category: 'Senai > Escola A > Curso X > Turma 1' },
          { course_id: 'c-2', course_name: 'UC 2', category: 'Senai > Escola A > Curso X > Turma 1' },
        ],
      },
    ], filters);

    expect(getUnavailableTemplateVariables('Olá {nome_aluno} {nota_media} {curso}', availability)).toEqual([
      {
        key: 'nota_media',
        reason: 'Selecione uma Unidade Curricular específica para liberar esta variável.',
      },
    ]);
  });

  it('resolves a single selected UC to one course context', () => {
    const resolved = resolveStudentCourseContext({
      id: 's-1',
      courses: [
        { course_id: 'c-1', course_name: 'UC 1', category: 'Senai > Escola A > Curso X > Turma 1' },
        { course_id: 'c-2', course_name: 'UC 2', category: 'Senai > Escola A > Curso X > Turma 1' },
      ],
    }, {
      ...filters,
      uc: 'UC 2',
    });

    expect(resolved.school).toBe('Escola A');
    expect(resolved.course).toBe('Curso X');
    expect(resolved.className).toBe('Turma 1');
    expect(resolved.unidadeCurricular).toBe('UC 2');
    expect(resolved.selectedCourse?.course_id).toBe('c-2');
  });
});
