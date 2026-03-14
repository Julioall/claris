import { describe, it, expect } from 'vitest';
import type {
  RiskLevel,
  TaskStatus,
  TaskPriority,
  TaskType,
  RecurrencePattern,
} from '../index';

describe('Type contracts', () => {
  it('RiskLevel values are valid', () => {
    const levels: RiskLevel[] = ['normal', 'atencao', 'risco', 'critico'];
    expect(levels).toHaveLength(4);
  });

  it('TaskStatus values are valid', () => {
    const statuses: TaskStatus[] = ['aberta', 'em_andamento', 'resolvida'];
    expect(statuses).toHaveLength(3);
  });

  it('TaskPriority values are valid', () => {
    const priorities: TaskPriority[] = ['baixa', 'media', 'alta', 'urgente'];
    expect(priorities).toHaveLength(4);
  });

  it('TaskType values are valid', () => {
    const types: TaskType[] = ['moodle', 'interna'];
    expect(types).toHaveLength(2);
  });

  it('RecurrencePattern values are valid', () => {
    const patterns: RecurrencePattern[] = ['diario', 'semanal', 'quinzenal', 'mensal', 'bimestral', 'trimestral'];
    expect(patterns).toHaveLength(6);
  });
});
