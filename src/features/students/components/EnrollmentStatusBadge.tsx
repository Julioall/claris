const ENROLLMENT_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  ativo: {
    label: 'Ativo',
    className: 'bg-card border border-l-2 border-status-success/30 border-l-status-success text-status-success',
  },
  suspenso: {
    label: 'Suspenso',
    className: 'bg-card border border-l-2 border-status-warning/30 border-l-status-warning text-status-warning',
  },
  inativo: {
    label: 'Inativo',
    className: 'bg-card border border-l-2 border-border border-l-muted-foreground/40 text-muted-foreground',
  },
  concluido: {
    label: 'Concluído',
    className: 'bg-card border border-l-2 border-primary/30 border-l-primary text-primary',
  },
};

export function EnrollmentStatusBadge({ status }: { status: string | null | undefined }) {
  const config = ENROLLMENT_STATUS_CONFIG[status?.toLowerCase() || ''] || {
    label: status || 'Ativo',
    className: 'bg-card border border-l-2 border-border border-l-muted-foreground/40 text-muted-foreground',
  };

  return (
    <span className={`inline-flex items-center rounded px-2 py-1 text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}
