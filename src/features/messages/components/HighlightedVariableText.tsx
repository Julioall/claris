import { DYNAMIC_VARIABLES } from './DynamicVariableInput';
import { cn } from '@/lib/utils';

const CATEGORY_COLORS: Record<string, string> = {
  Aluno: 'text-blue-600 dark:text-blue-400',
  Academico: 'text-emerald-600 dark:text-emerald-400',
  Tutor: 'text-amber-600 dark:text-amber-400',
};

interface HighlightedVariableTextProps {
  text: string;
  className?: string;
}

export function HighlightedVariableText({ text, className }: HighlightedVariableTextProps) {
  const parts = text.split(/(\{[a-z_]+\})/g);

  return (
    <span className={className}>
      {parts.map((part, i) => {
        const match = part.match(/^\{([a-z_]+)\}$/);
        if (!match) return <span key={i}>{part}</span>;

        const variable = DYNAMIC_VARIABLES.find(v => v.key === match[1]);
        if (!variable) return <span key={i}>{part}</span>;

        return (
          <span
            key={i}
            className={cn('font-semibold', CATEGORY_COLORS[variable.category] ?? 'text-primary')}
          >
            {part}
          </span>
        );
      })}
    </span>
  );
}
