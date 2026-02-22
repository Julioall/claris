import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PriorityBadge } from '../PriorityBadge';

describe('PriorityBadge', () => {
  it('renders "Baixa" for baixa priority', () => {
    render(<PriorityBadge priority="baixa" />);
    expect(screen.getByText('Baixa')).toBeInTheDocument();
  });

  it('renders "Média" for media priority', () => {
    render(<PriorityBadge priority="media" />);
    expect(screen.getByText('Média')).toBeInTheDocument();
  });

  it('renders "Alta" for alta priority', () => {
    render(<PriorityBadge priority="alta" />);
    expect(screen.getByText('Alta')).toBeInTheDocument();
  });

  it('renders "Urgente" for urgente priority', () => {
    render(<PriorityBadge priority="urgente" />);
    expect(screen.getByText('Urgente')).toBeInTheDocument();
  });

  it('applies small size classes', () => {
    const { container } = render(<PriorityBadge priority="alta" size="sm" />);
    expect(container.firstChild).toHaveClass('text-xs', 'px-1.5', 'py-0.5');
  });

  it('applies custom className', () => {
    const { container } = render(<PriorityBadge priority="urgente" className="ml-2" />);
    expect(container.firstChild).toHaveClass('ml-2');
  });
});
