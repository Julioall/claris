import { HelpCircle } from 'lucide-react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface KpiTooltipProps {
  content: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
}

/**
 * Ícone "?" com tooltip explicativo para indicadores e gráficos do painel.
 * Uso: coloque ao lado do título do indicador ou gráfico.
 */
export function KpiTooltip({ content, side = 'top' }: KpiTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex shrink-0 items-center justify-center rounded-full text-muted-foreground/50 hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Mais informações sobre este indicador"
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-xs text-xs leading-relaxed">
        {content}
      </TooltipContent>
    </Tooltip>
  );
}
