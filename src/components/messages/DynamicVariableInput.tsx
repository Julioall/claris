import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';

export interface DynamicVariable {
  key: string;
  label: string;
  description: string;
  category: string;
  example: string;
}

export const DYNAMIC_VARIABLES: DynamicVariable[] = [
  { key: 'nome_aluno', label: 'Nome do Aluno', description: 'Nome completo do aluno', category: 'Aluno', example: 'Joao Silva' },
  { key: 'email_aluno', label: 'Email do Aluno', description: 'Email do aluno', category: 'Aluno', example: 'joao@email.com' },
  { key: 'ultimo_acesso', label: 'Ultimo Acesso', description: 'Data do ultimo acesso do aluno', category: 'Aluno', example: '15/01/2026' },
  { key: 'nivel_risco', label: 'Nivel de Risco', description: 'Nivel de risco atual do aluno', category: 'Aluno', example: 'Atencao' },
  { key: 'nota_media', label: 'Nota Media', description: 'Nota media do aluno', category: 'Aluno', example: '7.5' },
  { key: 'atividades_pendentes', label: 'Atividades Pendentes', description: 'Numero de atividades pendentes', category: 'Aluno', example: '3' },
  { key: 'unidade_curricular', label: 'Unidade Curricular', description: 'Nome da UC do aluno', category: 'Academico', example: 'Matematica Aplicada' },
  { key: 'turma', label: 'Turma', description: 'Nome da turma ou classe', category: 'Academico', example: 'Turma A - 2026' },
  { key: 'curso', label: 'Curso', description: 'Nome do curso', category: 'Academico', example: 'Tecnico em Mecatronica' },
  { key: 'escola', label: 'Escola', description: 'Nome da escola ou unidade', category: 'Academico', example: 'SENAI Joinville' },
  { key: 'nome_tutor', label: 'Nome do Tutor', description: 'Seu nome como tutor', category: 'Tutor', example: 'Prof. Maria' },
];

const CATEGORY_COLORS: Record<string, string> = {
  Aluno: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  Academico: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  Tutor: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
};

interface DynamicVariableInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  disabled?: boolean;
  availableVariableKeys?: string[];
  showInlinePreview?: boolean;
}

export function DynamicVariableInput({
  value,
  onChange,
  placeholder = 'Digite sua mensagem... Use / para inserir variaveis dinamicas',
  rows = 6,
  className,
  disabled,
  availableVariableKeys,
  showInlinePreview = true,
}: DynamicVariableInputProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [filter, setFilter] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const slashPosRef = useRef<number>(-1);
  const availableKeySet = useMemo(
    () => new Set(availableVariableKeys ?? DYNAMIC_VARIABLES.map(variable => variable.key)),
    [availableVariableKeys],
  );

  const filtered = useMemo(() => (
    DYNAMIC_VARIABLES.filter(variable => {
      if (!availableKeySet.has(variable.key)) return false;
      if (filter === '') return true;

      const normalizedFilter = filter.toLowerCase();
      return (
        variable.label.toLowerCase().includes(normalizedFilter) ||
        variable.key.toLowerCase().includes(normalizedFilter)
      );
    })
  ), [availableKeySet, filter]);

  const grouped = useMemo(() => (
    filtered.reduce<Record<string, DynamicVariable[]>>((acc, variable) => {
      if (!acc[variable.category]) acc[variable.category] = [];
      acc[variable.category].push(variable);
      return acc;
    }, {})
  ), [filtered]);

  const flatFiltered = useMemo(() => Object.values(grouped).flat(), [grouped]);

  const closeMenu = useCallback(() => {
    setShowMenu(false);
    setFilter('');
    setSelectedIndex(0);
  }, []);

  const insertVariable = useCallback((variable: DynamicVariable) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const before = value.substring(0, slashPosRef.current);
    const after = value.substring(textarea.selectionStart);
    const tag = `{${variable.key}}`;
    const nextValue = before + tag + after;
    onChange(nextValue);
    closeMenu();

    requestAnimationFrame(() => {
      const cursorPos = before.length + tag.length;
      textarea.focus();
      textarea.setSelectionRange(cursorPos, cursorPos);
    });
  }, [closeMenu, onChange, value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showMenu) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, Math.max(flatFiltered.length - 1, 0)));
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
      return;
    }

    if (e.key === 'Enter' && flatFiltered[selectedIndex]) {
      e.preventDefault();
      insertVariable(flatFiltered[selectedIndex]);
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      closeMenu();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextValue = e.target.value;
    const cursorPos = e.target.selectionStart;
    onChange(nextValue);

    const charBeforeCursor = cursorPos > 0 ? nextValue[cursorPos - 1] : '';
    if (charBeforeCursor === '/') {
      const charBeforeSlash = cursorPos > 1 ? nextValue[cursorPos - 2] : '';
      if (cursorPos === 1 || charBeforeSlash === ' ' || charBeforeSlash === '\n') {
        slashPosRef.current = cursorPos - 1;
        setShowMenu(true);
        setFilter('');
        setSelectedIndex(0);
        return;
      }
    }

    if (!showMenu) return;

    const textAfterSlash = nextValue.substring(slashPosRef.current + 1, cursorPos);
    if (textAfterSlash.includes(' ') || textAfterSlash.includes('\n') || cursorPos <= slashPosRef.current) {
      closeMenu();
      return;
    }

    setFilter(textAfterSlash);
    setSelectedIndex(0);
  };

  useEffect(() => {
    if (!showMenu) return;

    const selectedItem = menuRef.current?.querySelector<HTMLElement>(`[data-variable-index="${selectedIndex}"]`);
    selectedItem?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex, showMenu]);

  const renderPreview = () => {
    if (!value) return null;

    const parts = value.split(/(\{[a-z_]+\})/g);
    return parts.map((part, index) => {
      const match = part.match(/^\{([a-z_]+)\}$/);
      if (!match) {
        return <span key={index}>{part}</span>;
      }

      const variable = DYNAMIC_VARIABLES.find(item => item.key === match[1]);
      if (!variable) {
        return <span key={index}>{part}</span>;
      }

      const colorClass = {
        Aluno: 'text-blue-600 dark:text-blue-400',
        Academico: 'text-emerald-600 dark:text-emerald-400',
        Tutor: 'text-amber-600 dark:text-amber-400',
      }[variable.category] ?? 'text-primary';

      return (
        <span key={index} className={cn('font-semibold', colorClass)}>
          {`{${variable.key}}`}
        </span>
      );
    });
  };

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted-foreground">
        Digite <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">/</code> para inserir variaveis rapidamente
      </p>

      <Popover
        open={showMenu}
        onOpenChange={(open) => {
          if (!open) closeMenu();
        }}
        modal={false}
      >
        <PopoverAnchor asChild>
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
          </div>
        </PopoverAnchor>

        <PopoverContent
          align="start"
          side="bottom"
          sideOffset={8}
          className="w-[min(92vw,26rem)] p-0"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Command shouldFilter={false} className="rounded-lg border-0">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <p className="text-xs font-medium text-foreground">Variaveis dinamicas</p>
              <span className="text-[10px] text-muted-foreground">Setas navegar | Enter inserir</span>
            </div>

            <CommandList ref={menuRef} className="max-h-64 p-1">
              <CommandEmpty className="px-3 py-6 text-left text-xs text-muted-foreground">
                Nenhuma variavel encontrada para "{filter}".
              </CommandEmpty>

              {Object.entries(grouped).map(([category, variables]) => (
                <CommandGroup key={category} heading={category}>
                  {variables.map(variable => {
                    const globalIdx = flatFiltered.indexOf(variable);
                    return (
                      <CommandItem
                        key={variable.key}
                        value={variable.key}
                        data-variable-index={globalIdx}
                        className={cn(
                          'gap-2 rounded-md px-3 py-2',
                          globalIdx === selectedIndex && 'bg-accent text-accent-foreground'
                        )}
                        onMouseDown={(e) => e.preventDefault()}
                        onMouseEnter={() => setSelectedIndex(globalIdx)}
                        onSelect={() => insertVariable(variable)}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-primary">
                            {`{${variable.key}}`}
                          </code>
                          <span className="truncate text-sm">{variable.label}</span>
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {showInlinePreview && value && value.includes('{') && (
        <div className="rounded-md border bg-muted/30 p-3">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Pre-visualizacao
          </p>
          <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
            {renderPreview()}
          </div>
        </div>
      )}
    </div>
  );
}

export function resolveVariables(
  template: string,
  data: Record<string, string | number | undefined | null>,
): string {
  return template.replace(/\{([a-z_]+)\}/g, (match, key) => {
    const value = data[key];
    return value != null ? String(value) : match;
  });
}
