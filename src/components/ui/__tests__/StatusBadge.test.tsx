import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from '../StatusBadge';

describe('StatusBadge', () => {
  it('renders "Aberta" for status aberta', () => {
    render(<StatusBadge status="aberta" />);
    expect(screen.getByText('Aberta')).toBeInTheDocument();
  });

  it('renders "Em andamento" for status em_andamento', () => {
    render(<StatusBadge status="em_andamento" />);
    expect(screen.getByText('Em andamento')).toBeInTheDocument();
  });

  it('renders "Resolvida" for status resolvida', () => {
    render(<StatusBadge status="resolvida" />);
    expect(screen.getByText('Resolvida')).toBeInTheDocument();
  });

  it('renders "Planejada" for action status planejada', () => {
    render(<StatusBadge status="planejada" />);
    expect(screen.getByText('Planejada')).toBeInTheDocument();
  });

  it('renders "Concluída" for action status concluida', () => {
    render(<StatusBadge status="concluida" />);
    expect(screen.getByText('Concluída')).toBeInTheDocument();
  });

  it('applies small size classes', () => {
    const { container } = render(<StatusBadge status="aberta" size="sm" />);
    expect(container.firstChild).toHaveClass('text-xs', 'px-1.5', 'py-0.5');
  });

  it('applies custom className', () => {
    const { container } = render(<StatusBadge status="aberta" className="custom-class" />);
    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('falls back gracefully for unknown status', () => {
    render(<StatusBadge status={'desconhecido' as any} />);
    expect(screen.getByText('desconhecido')).toBeInTheDocument();
  });
});
