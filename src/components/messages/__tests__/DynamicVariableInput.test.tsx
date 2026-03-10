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
});
