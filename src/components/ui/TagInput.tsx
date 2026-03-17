import { useState, useRef, useCallback, useEffect } from 'react';
import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import type { Tag } from '@/types';

interface TagSuggestion {
  label: string;
  prefix: string;
  entityId?: string;
  entityType: string;
}

const PREFIX_HINTS = [
  { prefix: 'uc', label: '/uc — Unidade Curricular', entityType: 'uc' },
  { prefix: 'aluno', label: '/aluno — Aluno', entityType: 'aluno' },
  { prefix: 'turma', label: '/turma — Turma', entityType: 'turma' },
  { prefix: 'curso', label: '/curso — Curso', entityType: 'curso' },
];

async function fetchEntitySuggestions(prefix: string, search: string): Promise<TagSuggestion[]> {
  const q = search.toLowerCase();
  if (prefix === 'aluno') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase.from('students' as never) as any)
      .select('id, full_name')
      .ilike('full_name', `%${q}%`)
      .limit(10);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((data ?? []) as any[]).map((s: any) => ({ label: `/aluno:${s.full_name}`, prefix: 'aluno', entityId: s.id, entityType: 'aluno' }));
  }
  if (prefix === 'curso' || prefix === 'uc') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase.from('courses' as never) as any)
      .select('id, name, short_name')
      .ilike('name', `%${q}%`)
      .limit(10);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((data ?? []) as any[]).map((c: any) => ({ label: `/${prefix}:${c.short_name ?? c.name}`, prefix, entityId: c.id, entityType: prefix }));
  }
  return [];
}

interface TagInputProps {
  tags: Tag[];
  onAdd: (params: { label: string; prefix?: string; entityId?: string; entityType?: string }) => void;
  onRemove: (tagId: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function TagInput({ tags, onAdd, onRemove, placeholder = 'Adicionar tag... (/ para entidades)', disabled, className }: TagInputProps) {
  const [value, setValue] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [suggestions, setSuggestions] = useState<TagSuggestion[]>([]);
  const [prefixHints, setPrefixHints] = useState<typeof PREFIX_HINTS>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const activePrefix = useRef<string | null>(null);

  const closeMenu = useCallback(() => {
    setShowMenu(false);
    setSuggestions([]);
    setPrefixHints([]);
    setSelectedIndex(0);
    activePrefix.current = null;
  }, []);

  const addTag = useCallback((suggestion: TagSuggestion) => {
    onAdd({ label: suggestion.label, prefix: suggestion.prefix, entityId: suggestion.entityId, entityType: suggestion.entityType });
    setValue('');
    closeMenu();
    inputRef.current?.focus();
  }, [onAdd, closeMenu]);

  const addFreeTag = useCallback((label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    onAdd({ label: trimmed, entityType: 'custom' });
    setValue('');
    closeMenu();
  }, [onAdd, closeMenu]);

  useEffect(() => {
    if (!showMenu || activePrefix.current === null) return;
    const prefix = activePrefix.current;
    const search = value.replace(new RegExp(`^/${prefix}:?`), '');

    const timer = setTimeout(() => {
      let cancelled = false;
      fetchEntitySuggestions(prefix, search)
        .then(results => { if (!cancelled) setSuggestions(results); })
        .catch(() => { if (!cancelled) setSuggestions([]); });
      return () => { cancelled = true; };
    }, 200);

    return () => clearTimeout(timer);
  }, [value, showMenu]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setValue(v);

    if (v === '/') {
      setPrefixHints(PREFIX_HINTS);
      setSuggestions([]);
      setShowMenu(true);
      setSelectedIndex(0);
      activePrefix.current = null;
      return;
    }

    if (v.startsWith('/')) {
      const parts = v.slice(1).split(':');
      const typedPrefix = parts[0].toLowerCase();
      const matched = PREFIX_HINTS.find(h => h.prefix.startsWith(typedPrefix));
      if (parts.length === 1) {
        const filtered = PREFIX_HINTS.filter(h => h.prefix.startsWith(typedPrefix));
        setPrefixHints(filtered);
        setSuggestions([]);
        setShowMenu(filtered.length > 0);
        activePrefix.current = null;
        setSelectedIndex(0);
      } else if (matched) {
        activePrefix.current = matched.prefix;
        setPrefixHints([]);
        setShowMenu(true);
        setSelectedIndex(0);
      }
      return;
    }

    setShowMenu(false);
    activePrefix.current = null;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const allItems = [...prefixHints.map(h => ({ label: h.label, prefix: h.prefix, entityType: h.entityType, entityId: undefined as string | undefined })), ...suggestions];

    if (showMenu) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, allItems.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, 0)); return; }
      if (e.key === 'Enter' && allItems[selectedIndex]) {
        e.preventDefault();
        if (selectedIndex < prefixHints.length) {
          const ph = prefixHints[selectedIndex];
          setValue(`/${ph.prefix}:`);
          activePrefix.current = ph.prefix;
          setPrefixHints([]);
          setShowMenu(true);
        } else {
          addTag(suggestions[selectedIndex - prefixHints.length]);
        }
        return;
      }
      if (e.key === 'Escape') { e.preventDefault(); closeMenu(); return; }
    }

    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (!showMenu) addFreeTag(value);
    }

    if (e.key === 'Backspace' && value === '' && tags.length > 0) {
      onRemove(tags[tags.length - 1].id);
    }
  };

  const allMenuItems = [
    ...prefixHints.map(h => ({ label: h.label, prefix: h.prefix, entityType: h.entityType, entityId: undefined as string | undefined })),
    ...suggestions,
  ];

  return (
    <div className={cn('flex flex-wrap gap-1.5 rounded-md border bg-background px-3 py-2 min-h-[2.5rem] items-center', disabled && 'opacity-50 cursor-not-allowed', className)}>
      {tags.map(tag => (
        <Badge key={tag.id} variant="secondary" className="gap-1 pr-1 text-xs">
          {tag.label}
          {!disabled && (
            <button
              type="button"
              onClick={() => onRemove(tag.id)}
              className="ml-0.5 rounded hover:text-destructive"
              aria-label={`Remover tag ${tag.label}`}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </Badge>
      ))}

      <Popover open={showMenu} onOpenChange={open => { if (!open) closeMenu(); }} modal={false}>
        <PopoverAnchor asChild>
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={tags.length === 0 ? placeholder : ''}
            disabled={disabled}
            className="min-w-[120px] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </PopoverAnchor>

        <PopoverContent align="start" side="bottom" sideOffset={6} className="w-72 p-0" onOpenAutoFocus={e => e.preventDefault()}>
          <Command shouldFilter={false}>
            <CommandList className="max-h-52 p-1">
              <CommandEmpty className="px-3 py-4 text-xs text-muted-foreground">
                Nenhuma sugestão encontrada
              </CommandEmpty>
              {allMenuItems.length > 0 && (
                <CommandGroup>
                  {allMenuItems.map((item, idx) => (
                    <CommandItem
                      key={idx}
                      value={item.label}
                      data-index={idx}
                      className={cn('text-sm', idx === selectedIndex && 'bg-accent text-accent-foreground')}
                      onMouseDown={e => e.preventDefault()}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      onSelect={() => {
                        if (idx < prefixHints.length) {
                          const ph = prefixHints[idx];
                          setValue(`/${ph.prefix}:`);
                          activePrefix.current = ph.prefix;
                          setPrefixHints([]);
                          setShowMenu(true);
                        } else {
                          addTag(suggestions[idx - prefixHints.length]);
                        }
                      }}
                    >
                      {item.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
