import { useState, useRef, useCallback, useEffect } from 'react';
import { X } from 'lucide-react';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import type { Tag } from '@/features/tasks/types';

interface TagSuggestion {
  label: string;
  prefix: string;
  entityId?: string;
  entityType: string;
}

const PREFIX_HINTS = [
  { prefix: 'aluno', label: '/aluno — Aluno', entityType: 'aluno' },
  { prefix: 'uc', label: '/uc — Unidade Curricular', entityType: 'uc' },
  { prefix: 'turma', label: '/turma — Turma', entityType: 'turma' },
  { prefix: 'curso', label: '/curso — Curso', entityType: 'curso' },
  { prefix: 'escola', label: '/escola — Escola', entityType: 'escola' },
];

/** Colors applied to tag badges based on entity type */
const ENTITY_TYPE_CLASSES: Record<string, string> = {
  aluno: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
  uc: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800',
  turma: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800',
  curso: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800',
  escola: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
  custom: 'bg-secondary text-secondary-foreground border-secondary',
};

/** Returns the human-readable label for a tag, stripping legacy `/prefix:` prefix if present. */
function getDisplayLabel(tag: Tag): string {
  const { label, prefix } = tag;
  if (prefix && label.startsWith(`/${prefix}:`)) {
    return label.slice(prefix.length + 2); // 2 = length of "/" and ":"
  }
  return label;
}

async function fetchEntitySuggestions(prefix: string, search: string): Promise<TagSuggestion[]> {
  const q = search.toLowerCase();
  if (prefix === 'aluno') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase.from('students' as never) as any)
      .select('id, full_name')
      .ilike('full_name', `%${q}%`)
      .limit(10);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((data ?? []) as any[]).map((s: any) => ({ label: s.full_name, prefix: 'aluno', entityId: s.id, entityType: 'aluno' }));
  }
  if (prefix === 'uc') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase.from('courses' as never) as any)
      .select('id, name, short_name')
      .ilike('name', `%${q}%`)
      .limit(10);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((data ?? []) as any[]).map((c: any) => ({ label: c.short_name ?? c.name, prefix: 'uc', entityId: c.id, entityType: 'uc' }));
  }
  if (prefix === 'turma') {
    // Turma links to individual course/UC rows. These are conceptually "class-level" entries
    // and share the same table as /uc, but differ in the tagging context: /uc refers to a
    // specific discipline, while /turma refers to the course enrollment group.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase.from('courses' as never) as any)
      .select('id, name, short_name')
      .ilike('name', `%${q}%`)
      .limit(10);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((data ?? []) as any[]).map((c: any) => ({ label: c.short_name ?? c.name, prefix: 'turma', entityId: c.id, entityType: 'turma' }));
  }
  if (prefix === 'curso' || prefix === 'escola') {
    // Fetch distinct course-program (parts[2]) or school (parts[1]) names from the
    // category hierarchy: "Institution > School > Course > Class".
    // We fetch broadly with ilike and deduplicate in JS, since SQL DISTINCT on a path segment
    // would require a stored function.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase.from('courses' as never) as any)
      .select('category')
      .not('category', 'is', null)
      .ilike('category', `%${q}%`)
      .limit(300);

    const seen = new Set<string>();
    const results: TagSuggestion[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((data ?? []) as any[]).forEach((c: any) => {
      if (!c.category) return;
      const parts = (c.category as string).split(' > ').map((p: string) => p.trim());
      // parts[0] = institution, parts[1] = school, parts[2] = course/program, parts[3] = class
      const name = prefix === 'escola' ? parts[1] : parts[2];
      if (name && name.toLowerCase().includes(q) && !seen.has(name)) {
        seen.add(name);
        results.push({ label: name, prefix, entityType: prefix });
      }
    });
    return results.slice(0, 10);
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
      {tags.map(tag => {
        const typeClass = ENTITY_TYPE_CLASSES[tag.entity_type ?? 'custom'] ?? ENTITY_TYPE_CLASSES.custom;
        const displayLabel = getDisplayLabel(tag);
        return (
          <span
            key={tag.id}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
              typeClass,
            )}
          >
            {displayLabel}
            {!disabled && (
              <button
                type="button"
                onClick={() => onRemove(tag.id)}
                className="ml-0.5 rounded-full hover:opacity-70"
                aria-label={`Remover tag ${displayLabel}`}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        );
      })}

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
