import { describe, it, expect } from 'vitest';
import type {
  PendingTaskPriority,
  PendingTaskStatus,
  RecurrencePattern,
  RiskLevel,
  TaskPriority,
  TaskStatus,
  TaskType,
} from '../index';

describe('Type contracts', () => {
  it('RiskLevel values are valid', () => {
    const levels: RiskLevel[] = ['normal', 'atencao', 'risco', 'critico'];
    expect(levels).toHaveLength(4);
  });

  it('TaskStatus values are valid', () => {
    const statuses: TaskStatus[] = ['todo', 'in_progress', 'done'];
    expect(statuses).toHaveLength(3);
  });

  it('TaskPriority values are valid', () => {
    const priorities: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];
    expect(priorities).toHaveLength(4);
  });

  it('PendingTaskStatus values are valid', () => {
    const statuses: PendingTaskStatus[] = ['aberta', 'em_andamento', 'resolvida'];
    expect(statuses).toHaveLength(3);
  });

  it('PendingTaskPriority values are valid', () => {
    const priorities: PendingTaskPriority[] = ['baixa', 'media', 'alta', 'urgente'];
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
