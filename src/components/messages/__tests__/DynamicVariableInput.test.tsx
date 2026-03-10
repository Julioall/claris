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

  it('does not render the old help button', () => {
    render(<DynamicVariableInput value="" onChange={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /ver ajuda sobre variaveis dinamicas/i })).not.toBeInTheDocument();
  });

  it('keeps unavailable variables out of the slash menu', async () => {
    const user = userEvent.setup();

    render(
      <DynamicVariableInput
        value=""
        onChange={vi.fn()}
        availableVariableKeys={['nome_aluno']}
      />,
    );

    const input = screen.getByRole('textbox');
    await user.type(input, '/nota');

    expect(screen.queryByText('Nota Media')).not.toBeInTheDocument();
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
