import {
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react';
import { X } from 'lucide-react';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { searchCategories, searchCourses, searchStudents } from './api/tagInput';
import type { Tag } from '@/features/tasks/types';

interface TagSuggestion {
  label: string;
  prefix: string;
  entityId?: string;
  entityType: string;
}

const PREFIX_HINTS = [
  { prefix: 'aluno', label: '/aluno - Aluno', entityType: 'aluno' },
  { prefix: 'uc', label: '/uc - Unidade Curricular', entityType: 'uc' },
  { prefix: 'turma', label: '/turma - Turma', entityType: 'turma' },
  { prefix: 'curso', label: '/curso - Curso', entityType: 'curso' },
  { prefix: 'escola', label: '/escola - Escola', entityType: 'escola' },
];

const ENTITY_TYPE_CLASSES: Record<string, string> = {
  aluno: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
  uc: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800',
  turma: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800',
  curso: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800',
  escola: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
  custom: 'bg-secondary text-secondary-foreground border-secondary',
};

function getDisplayLabel(tag: Tag): string {
  const { label, prefix } = tag;

  if (prefix && label.startsWith(`/${prefix}:`)) {
    return label.slice(prefix.length + 2);
  }

  return label;
}

function mapCategorySuggestions(
  rows: Array<{ category: string | null }>,
  prefix: 'curso' | 'escola',
  query: string,
) {
  const normalizedQuery = query.toLowerCase();
  const seen = new Set<string>();
  const results: TagSuggestion[] = [];

  rows.forEach((row) => {
    if (!row.category) return;

    const parts = row.category.split(' > ').map((part) => part.trim());
    const name = prefix === 'escola' ? parts[1] : parts[2];

    if (!name) return;
    if (normalizedQuery && !name.toLowerCase().includes(normalizedQuery)) return;
    if (seen.has(name)) return;

    seen.add(name);
    results.push({
      label: name,
      prefix,
      entityId: name,
      entityType: prefix,
    });
  });

  return results.slice(0, 10);
}

async function fetchEntitySuggestions(prefix: string, search: string): Promise<TagSuggestion[]> {
  const normalizedSearch = search.trim();

  if (prefix === 'aluno') {
    const { data } = await searchStudents(normalizedSearch);
    return (data ?? []).map((student) => ({
      label: student.full_name,
      prefix: 'aluno',
      entityId: student.id,
      entityType: 'aluno',
    }));
  }

  if (prefix === 'uc') {
    const { data } = await searchCourses(normalizedSearch);
    return (data ?? []).map((course) => ({
      label: course.short_name ?? course.name,
      prefix: 'uc',
      entityId: course.id,
      entityType: 'uc',
    }));
  }

  if (prefix === 'turma') {
    const { data } = await searchCourses(normalizedSearch);
    return (data ?? []).map((course) => ({
      label: course.short_name ?? course.name,
      prefix: 'turma',
      entityId: course.id,
      entityType: 'turma',
    }));
  }

  if (prefix === 'curso' || prefix === 'escola') {
    const { data } = await searchCategories(normalizedSearch);
    return mapCategorySuggestions(data ?? [], prefix, normalizedSearch);
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

export function TagInput({
  tags,
  onAdd,
  onRemove,
  placeholder = 'Adicionar tag... (/ para entidades)',
  disabled,
  className,
}: TagInputProps) {
  const [value, setValue] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [suggestions, setSuggestions] = useState<TagSuggestion[]>([]);
  const [prefixHints, setPrefixHints] = useState<typeof PREFIX_HINTS>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const requestIdRef = useRef(0);

  const closeMenu = useCallback(() => {
    setShowMenu(false);
    setSuggestions([]);
    setPrefixHints([]);
    setSelectedIndex(0);
  }, []);

  const resetComposer = useCallback(() => {
    setValue('');
    closeMenu();
  }, [closeMenu]);

  const addTag = useCallback((suggestion: TagSuggestion) => {
    onAdd({
      label: suggestion.label,
      prefix: suggestion.prefix,
      entityId: suggestion.entityId,
      entityType: suggestion.entityType,
    });
    resetComposer();
  }, [onAdd, resetComposer]);

  const addFreeTag = useCallback((rawValue: string) => {
    const trimmed = rawValue.trim().replace(/,$/, '');
    if (!trimmed) return;

    const prefixedTag = trimmed.match(/^\/([^:\s]+):(.*)$/);
    if (prefixedTag) {
      const prefix = prefixedTag[1].trim().toLowerCase();
      const label = prefixedTag[2].trim();

      if (!label) return;

      onAdd({
        label,
        prefix,
        entityType: prefix,
      });
      resetComposer();
      return;
    }

    onAdd({
      label: trimmed,
      entityType: 'custom',
    });
    resetComposer();
  }, [onAdd, resetComposer]);

  const loadSuggestions = useCallback(async (nextValue: string) => {
    const requestId = ++requestIdRef.current;
    const trimmed = nextValue.trimStart();

    if (!trimmed) {
      closeMenu();
      return;
    }

    if (trimmed === '/') {
      setSuggestions([]);
      setPrefixHints(PREFIX_HINTS);
      setSelectedIndex(0);
      setShowMenu(true);
      return;
    }

    const prefixMatch = trimmed.match(/^\/([^:\s]*)(?::(.*))?$/);
    if (!prefixMatch) {
      closeMenu();
      return;
    }

    const rawPrefix = prefixMatch[1].toLowerCase();
    const rawSearch = prefixMatch[2];

    if (rawSearch === undefined) {
      const filteredHints = PREFIX_HINTS.filter((hint) => hint.prefix.includes(rawPrefix));
      setSuggestions([]);
      setPrefixHints(filteredHints);
      setSelectedIndex(0);
      setShowMenu(filteredHints.length > 0);
      return;
    }

    const matchedHint = PREFIX_HINTS.find((hint) => hint.prefix === rawPrefix);
    if (!matchedHint) {
      closeMenu();
      return;
    }

    const nextSuggestions = await fetchEntitySuggestions(matchedHint.prefix, rawSearch);
    if (requestId !== requestIdRef.current) return;

    setPrefixHints([]);
    setSuggestions(nextSuggestions);
    setSelectedIndex(0);
    setShowMenu(nextSuggestions.length > 0);
  }, [closeMenu]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value;
    setValue(nextValue);
    void loadSuggestions(nextValue);
  };

  const choosePrefixHint = (prefix: string) => {
    const nextValue = `/${prefix}:`;
    setValue(nextValue);
    void loadSuggestions(nextValue);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const allItems = [
      ...prefixHints.map((hint) => ({
        label: hint.label,
        prefix: hint.prefix,
        entityId: undefined as string | undefined,
        entityType: hint.entityType,
      })),
      ...suggestions,
    ];

    if (showMenu) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedIndex((current) => Math.min(current + 1, allItems.length - 1));
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedIndex((current) => Math.max(current - 1, 0));
        return;
      }

      if (event.key === 'Enter' && allItems[selectedIndex]) {
        event.preventDefault();
        if (selectedIndex < prefixHints.length) {
          choosePrefixHint(prefixHints[selectedIndex].prefix);
        } else {
          addTag(suggestions[selectedIndex - prefixHints.length]);
        }
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        closeMenu();
        return;
      }
    }

    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      if (!showMenu) {
        addFreeTag(value);
      }
    }

    if (event.key === 'Backspace' && value === '' && tags.length > 0) {
      onRemove(tags[tags.length - 1].id);
    }
  };

  const allMenuItems = [
    ...prefixHints.map((hint) => ({
      label: hint.label,
      prefix: hint.prefix,
      entityId: undefined as string | undefined,
      entityType: hint.entityType,
    })),
    ...suggestions,
  ];

  return (
    <div
      className={cn(
        'flex min-h-[2.5rem] flex-wrap items-center gap-1.5 rounded-md border bg-background px-3 py-2',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      {tags.map((tag) => {
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

      <Popover
        open={showMenu}
        onOpenChange={(open) => {
          if (!open) {
            closeMenu();
          }
        }}
        modal={false}
      >
        <PopoverAnchor asChild>
          <input
            type="text"
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={tags.length === 0 ? placeholder : ''}
            disabled={disabled}
            className="min-w-[120px] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </PopoverAnchor>

        <PopoverContent
          align="start"
          side="bottom"
          sideOffset={6}
          className="w-72 p-0"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <Command shouldFilter={false}>
            <CommandList className="max-h-52 p-1">
              <CommandEmpty className="px-3 py-4 text-xs text-muted-foreground">
                Nenhuma sugestao encontrada
              </CommandEmpty>
              {allMenuItems.length > 0 && (
                <CommandGroup>
                  {allMenuItems.map((item, index) => (
                    <CommandItem
                      key={`${item.prefix}-${item.label}-${index}`}
                      value={item.label}
                      className={cn('text-sm', index === selectedIndex && 'bg-accent text-accent-foreground')}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setSelectedIndex(index)}
                      onSelect={() => {
                        if (index < prefixHints.length) {
                          choosePrefixHint(prefixHints[index].prefix);
                        } else {
                          addTag(suggestions[index - prefixHints.length]);
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
