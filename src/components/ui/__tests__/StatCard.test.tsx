import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatCard } from '../StatCard';
import { Users } from 'lucide-react';

describe('StatCard', () => {
  it('renders title and value', () => {
    render(<StatCard title="Alunos" value={42} icon={Users} />);
    expect(screen.getByText('Alunos')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('renders string value', () => {
    render(<StatCard title="Status" value="Ativo" icon={Users} />);
    expect(screen.getByText('Ativo')).toBeInTheDocument();
  });
});
