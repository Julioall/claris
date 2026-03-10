import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DynamicVariableInput } from '@/components/messages/DynamicVariableInput';

function DynamicVariableInputHarness() {
  const [value, setValue] = useState('');

  return <DynamicVariableInput value={value} onChange={setValue} />;
}

describe('DynamicVariableInput', () => {
  it('shows a simplified slash menu and inserts the selected variable', async () => {
    const user = userEvent.setup();

    render(<DynamicVariableInputHarness />);

    const input = screen.getByRole('textbox');
    await user.type(input, '/nome');

    expect(screen.getByText('Nome do Aluno')).toBeInTheDocument();
    expect(screen.getByText('{nome_aluno}')).toBeInTheDocument();
    expect(screen.queryByText(/Nome completo do aluno/i)).not.toBeInTheDocument();

    await user.click(screen.getByText('Nome do Aluno'));

    expect(screen.getByRole('textbox')).toHaveValue('{nome_aluno}');
  });

  it('opens the help popover with detailed variable information', async () => {
    const user = userEvent.setup();

    render(<DynamicVariableInput value="" onChange={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /ver ajuda sobre variaveis dinamicas/i }));

    expect(screen.getByText('Variaveis dinamicas')).toBeInTheDocument();
    expect(screen.getByText(/Nome completo do aluno/i)).toBeInTheDocument();
    expect(screen.getByText('Joao Silva')).toBeInTheDocument();
  });

  it('keeps restricted variables out of the slash menu and explains them in help', async () => {
    const user = userEvent.setup();

    render(
      <DynamicVariableInput
        value=""
        onChange={vi.fn()}
        availableVariableKeys={['nome_aluno']}
        variableRestrictions={{
          nota_media: 'Selecione uma Unidade Curricular especifica para liberar esta variavel.',
        }}
      />,
    );

    const input = screen.getByRole('textbox');
    await user.type(input, '/nota');

    expect(screen.queryByText('Nota Media')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /ver ajuda sobre variaveis dinamicas/i }));

    expect(screen.getByText('Indisponivel neste contexto')).toBeInTheDocument();
    expect(screen.getByText(/Selecione uma Unidade Curricular especifica/i)).toBeInTheDocument();
  });

  it('can hide the inline preview when the parent uses a dedicated preview action', () => {
    render(
      <DynamicVariableInput
        value="Ola, {nome_aluno}"
        onChange={vi.fn()}
        showInlinePreview={false}
      />,
    );

    expect(screen.queryByText(/Pre-visualizacao/i)).not.toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('Ola, {nome_aluno}');
  });
});
