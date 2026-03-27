import { describe, expect, it } from 'vitest';
import { buildClarisSystemPrompt, selectClarisToolsForMessage } from '../../../supabase/functions/_shared/claris/chat-config.ts';

describe('claris chat configuration', () => {
  it('selects agenda tools for bulk schedules', () => {
    const tools = selectClarisToolsForMessage({
      latestUserMessage: '{"titulo":"Evento","dataHoraInicio":"2026-03-25T14:00:00-03:00","tipoEvento":"alignment"}',
    });
    const toolNames = tools.map((tool) => tool.function.name);

    expect(toolNames).toContain('batch_create_events');
    expect(toolNames).toContain('list_events');
    expect(toolNames).not.toContain('prepare_bulk_message_send');
  });

  it('selects messaging tools for explicit send confirmations', () => {
    const tools = selectClarisToolsForMessage({
      latestUserMessage: 'Confirmo o envio do job abc123.',
      actionKind: 'quick_reply',
      actionJobId: 'abc123',
    });
    const toolNames = tools.map((tool) => tool.function.name);

    expect(toolNames).toContain('confirm_bulk_message_send');
    expect(toolNames).toContain('cancel_bulk_message_send');
    expect(toolNames).toContain('find_students_for_messaging');
    expect(toolNames).not.toContain('batch_create_events');
  });

  it('selects task batch tools for checklists and task lists', () => {
    const tools = selectClarisToolsForMessage({
      latestUserMessage: 'Crie uma lista de tarefas para acompanhar os alunos em risco esta semana.',
    });
    const toolNames = tools.map((tool) => tool.function.name);

    expect(toolNames).toContain('batch_create_tasks');
    expect(toolNames).toContain('list_tasks');
    expect(toolNames).not.toContain('batch_create_events');
  });

  it('falls back to the full tool catalog when the request is generic', () => {
    const tools = selectClarisToolsForMessage({
      latestUserMessage: 'Oi',
    });

    expect(tools.length).toBeGreaterThan(20);
  });

  it('builds a compact prompt listing only active tools', () => {
    const tools = selectClarisToolsForMessage({
      latestUserMessage: 'Quais sao minhas tarefas pendentes desta semana?',
    });
    const prompt = buildClarisSystemPrompt(tools);

    expect(prompt).toContain('Ferramentas ativas nesta conversa:');
    expect(prompt).toContain('batch_create_tasks');
    expect(prompt).toContain('list_tasks');
    expect(prompt).not.toContain('Camada 4');
  });

  it('includes admin custom instructions in the Claris system prompt', () => {
    const tools = selectClarisToolsForMessage({
      latestUserMessage: 'Monte um resumo da semana.',
    });
    const prompt = buildClarisSystemPrompt(tools, 'Responda em tom mais consultivo e sempre destaque proximos passos.');

    expect(prompt).toContain('Instrucoes personalizadas do administrador');
    expect(prompt).toContain('Responda em tom mais consultivo');
    expect(prompt).toContain('Ferramentas ativas nesta conversa:');
  });
});
