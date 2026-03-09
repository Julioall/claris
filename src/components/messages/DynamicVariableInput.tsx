import { useState, useRef, useEffect, useCallback } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface DynamicVariable {
  key: string;
  label: string;
  description: string;
  category: string;
  example: string;
}

export const DYNAMIC_VARIABLES: DynamicVariable[] = [
  // Aluno
  { key: 'nome_aluno', label: 'Nome do Aluno', description: 'Nome completo do aluno', category: 'Aluno', example: 'João Silva' },
  { key: 'email_aluno', label: 'Email do Aluno', description: 'Email do aluno', category: 'Aluno', example: 'joao@email.com' },
  { key: 'ultimo_acesso', label: 'Último Acesso', description: 'Data do último acesso do aluno', category: 'Aluno', example: '15/01/2026' },
  { key: 'nivel_risco', label: 'Nível de Risco', description: 'Nível de risco atual do aluno', category: 'Aluno', example: 'Atenção' },
  { key: 'nota_media', label: 'Nota Média', description: 'Nota média do aluno', category: 'Aluno', example: '7.5' },
  { key: 'atividades_pendentes', label: 'Atividades Pendentes', description: 'Número de atividades pendentes', category: 'Aluno', example: '3' },
  // Acadêmico
  { key: 'unidade_curricular', label: 'Unidade Curricular', description: 'Nome da UC do aluno', category: 'Acadêmico', example: 'Matemática Aplicada' },
  { key: 'turma', label: 'Turma', description: 'Nome da turma/classe', category: 'Acadêmico', example: 'Turma A - 2026' },
  { key: 'curso', label: 'Curso', description: 'Nome do curso', category: 'Acadêmico', example: 'Técnico em Mecatrônica' },
  { key: 'escola', label: 'Escola', description: 'Nome da escola/unidade', category: 'Acadêmico', example: 'SENAI Joinville' },
  // Tutor
  { key: 'nome_tutor', label: 'Nome do Tutor', description: 'Seu nome como tutor', category: 'Tutor', example: 'Prof. Maria' },
];

const CATEGORY_COLORS: Record<string, string> = {
  'Aluno': 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  'Acadêmico': 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  'Tutor': 'bg-purple-500/10 text-purple-700 dark:text-purple-400',
};

interface DynamicVariableInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  disabled?: boolean;
}

export function DynamicVariableInput({
  value,
  onChange,
  placeholder = 'Digite sua mensagem... Use / para inserir variáveis dinâmicas',
  rows = 6,
  className,
  disabled,
}: DynamicVariableInputProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [filter, setFilter] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const slashPosRef = useRef<number>(-1);

  const filtered = DYNAMIC_VARIABLES.filter(v =>
    filter === '' ||
    v.label.toLowerCase().includes(filter.toLowerCase()) ||
    v.key.toLowerCase().includes(filter.toLowerCase())
  );

  const grouped = filtered.reduce<Record<string, DynamicVariable[]>>((acc, v) => {
    if (!acc[v.category]) acc[v.category] = [];
    acc[v.category].push(v);
    return acc;
  }, {});

  const flatFiltered = Object.values(grouped).flat();

  const insertVariable = useCallback((variable: DynamicVariable) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const before = value.substring(0, slashPosRef.current);
    const after = value.substring(textarea.selectionStart);
    const tag = `{${variable.key}}`;
    const newValue = before + tag + after;
    onChange(newValue);
    setShowMenu(false);
    setFilter('');

    // Restore cursor position
    requestAnimationFrame(() => {
      const pos = before.length + tag.length;
      textarea.focus();
      textarea.setSelectionRange(pos, pos);
    });
  }, [value, onChange]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showMenu) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, flatFiltered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && flatFiltered[selectedIndex]) {
      e.preventDefault();
      insertVariable(flatFiltered[selectedIndex]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setShowMenu(false);
      setFilter('');
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const cursorPos = e.target.selectionStart;
    onChange(newValue);

    // Check if / was just typed
    const charBefore = cursorPos > 0 ? newValue[cursorPos - 1] : '';
    if (charBefore === '/') {
      // Check if it's at start or preceded by a space/newline
      const charBeforeSlash = cursorPos > 1 ? newValue[cursorPos - 2] : '';
      if (cursorPos === 1 || charBeforeSlash === ' ' || charBeforeSlash === '\n') {
        slashPosRef.current = cursorPos - 1;
        setShowMenu(true);
        setFilter('');
        setSelectedIndex(0);

        // Calculate menu position relative to textarea
        const textarea = textareaRef.current;
        if (textarea) {
          const rect = textarea.getBoundingClientRect();
          setMenuPosition({ top: rect.height + 4, left: 0 });
        }
        return;
      }
    }

    // Update filter if menu is showing
    if (showMenu) {
      const textAfterSlash = newValue.substring(slashPosRef.current + 1, cursorPos);
      if (textAfterSlash.includes(' ') || textAfterSlash.includes('\n') || cursorPos <= slashPosRef.current) {
        setShowMenu(false);
        setFilter('');
      } else {
        setFilter(textAfterSlash);
        setSelectedIndex(0);
      }
    }
  };

  // Close menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) &&
          textareaRef.current && !textareaRef.current.contains(e.target as Node)) {
        setShowMenu(false);
        setFilter('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Highlight variables in preview
  const renderPreview = () => {
    if (!value) return null;
    const parts = value.split(/(\{[a-z_]+\})/g);
    return parts.map((part, i) => {
      const match = part.match(/^\{([a-z_]+)\}$/);
      if (match) {
        const variable = DYNAMIC_VARIABLES.find(v => v.key === match[1]);
        if (variable) {
          return (
            <Badge
              key={i}
              variant="secondary"
              className={cn('text-xs mx-0.5 cursor-default', CATEGORY_COLORS[variable.category])}
            >
              {variable.label}
            </Badge>
          );
        }
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={rows}
          className={cn('font-mono text-sm', className)}
          disabled={disabled}
        />

        {showMenu && flatFiltered.length > 0 && (
          <div
            ref={menuRef}
            className="absolute z-50 w-full max-h-64 overflow-y-auto rounded-lg border bg-popover shadow-lg"
            style={menuPosition ? { top: menuPosition.top, left: menuPosition.left } : undefined}
          >
            <div className="p-2 border-b">
              <p className="text-xs text-muted-foreground">
                Variáveis dinâmicas — use ↑↓ para navegar, Enter para inserir
              </p>
            </div>
            {Object.entries(grouped).map(([category, vars]) => (
              <div key={category}>
                <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold bg-muted/30">
                  {category}
                </div>
                {vars.map(variable => {
                  const globalIdx = flatFiltered.indexOf(variable);
                  return (
                    <button
                      key={variable.key}
                      type="button"
                      className={cn(
                        'w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 hover:bg-accent transition-colors',
                        globalIdx === selectedIndex && 'bg-accent'
                      )}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        insertVariable(variable);
                      }}
                      onMouseEnter={() => setSelectedIndex(globalIdx)}
                    >
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2">
                          <code className="text-xs text-primary font-mono">{`{${variable.key}}`}</code>
                          <span className="text-xs text-muted-foreground truncate">{variable.description}</span>
                        </div>
                      </div>
                      <span className="text-[10px] text-muted-foreground/60 shrink-0 italic">
                        ex: {variable.example}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Preview with highlighted variables */}
      {value && value.includes('{') && (
        <div className="rounded-md border bg-muted/30 p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 font-semibold">
            Pré-visualização
          </p>
          <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">
            {renderPreview()}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Replace dynamic variable placeholders with actual student data.
 */
export function resolveVariables(
  template: string,
  data: Record<string, string | number | undefined | null>,
): string {
  return template.replace(/\{([a-z_]+)\}/g, (match, key) => {
    const val = data[key];
    return val != null ? String(val) : match;
  });
}
