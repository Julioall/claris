import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Expand, MessageCircle, MoreHorizontal, Pencil, Plus, Sparkles, Send, Trash2, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ClarisIcon } from '@/components/ui/claris-logo';
import { cn } from '@/lib/utils';
import { CLARIS_CONFIGURED_STORAGE_KEY } from '@/lib/claris-settings';
import { supabase } from '@/integrations/supabase/client';
import { Spinner } from '@/components/ui/spinner';
import { useAuth } from '@/contexts/AuthContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type ChatRole = 'assistant' | 'user';

type ChatActionKind = 'quick_reply';

interface ChatAction {
  id: string;
  label: string;
  value: string;
  kind: ChatActionKind;
  jobId?: string;
}

// ---- Rich blocks ----

interface RichColumn {
  key: string;
  label: string;
}

interface DataTableBlock {
  type: 'data_table';
  tool: string;
  title: string;
  empty_message: string;
  columns: RichColumn[];
  rows: Record<string, string>[];
}

interface StatCard {
  label: string;
  value: string;
  variant: 'default' | 'warning' | 'danger';
}

interface StatCardsBlock {
  type: 'stat_cards';
  title: string;
  stats: StatCard[];
}

type ChatRichBlock = DataTableBlock | StatCardsBlock;

interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  actions?: ChatAction[];
  richBlocks?: ChatRichBlock[];
}

interface ClarisChatHistoryItem {
  role: ChatRole;
  content: string;
}

interface ClarisChatFunctionResponse {
  reply?: unknown;
  uiActions?: unknown;
  richBlocks?: unknown;
}

const CLARIS_PLACEHOLDER_REPLY =
  'Ainda estou em desenvolvimento, mas em breve estarei aqui para te ajudar no acompanhamento dos nossos alunos com orientações e insights em tempo real.';

const CLARIS_NOT_CONFIGURED_REPLY =
  'Ainda não estou configurada. Vá em Configurações > Claris IA para conectar um modelo.';

const INITIAL_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content: 'Olá! Eu sou a Claris IA. Em breve estarei disponível para conversar com você por aqui.',
};

const CLARIS_HISTORY_STORAGE_PREFIX = 'claris_chat_history';
const CLARIS_WIDGET_OPEN_STORAGE_KEY = 'claris_chat_widget_open';
const GENERIC_QUICK_SUGGESTIONS = [
  'Alunos em risco — quem contatar hoje?',
  'Atividades aguardando correção',
  'Resumo geral da operação',
  'Pendências mais urgentes',
  'Alunos para acompanhar esta semana',
];

const ROUTE_QUICK_SUGGESTIONS: Array<{ match: RegExp; suggestions: string[] }> = [
  {
    match: /\/alunos(?:\/|$)/,
    suggestions: [
      'Alunos em risco com último acesso',
      'Piora de engajamento esta semana',
      'Plano de acompanhamento — 5 mais críticos',
    ],
  },
  {
    match: /\/pendencias(?:\/|$)/,
    suggestions: [
      'Pendências por prioridade e prazo',
      'Pendências atrasadas — ação hoje',
      'Resumo por curso para distribuir',
    ],
  },
  {
    match: /\/mensagens(?:\/|$)/,
    suggestions: [
      'Templates para alunos em risco',
      'Rascunho de acompanhamento',
      'Alunos que precisam de contato',
    ],
  },
];

const CLEAR_HISTORY_COMMANDS = new Set([
  '/limpar',
  '/limparhistorico',
  '/limpar-historico',
  '/clear',
]);

function normalizeCommand(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '');
}

function isClearHistoryCommand(value: string) {
  const normalized = normalizeCommand(value);
  if (CLEAR_HISTORY_COMMANDS.has(normalized)) return true;
  return normalized === 'limparhistorico' || normalized === 'limparconversa';
}

function parseStoredHistory(raw: string | null): ClarisChatHistoryItem[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item): item is ClarisChatHistoryItem => (
        item !== null
        && typeof item === 'object'
        && (item as { role?: unknown }).role !== undefined
        && ((item as { role?: unknown }).role === 'assistant' || (item as { role?: unknown }).role === 'user')
        && typeof (item as { content?: unknown }).content === 'string'
      ))
      .slice(-40);
  } catch {
    return [];
  }
}

function clearStoredHistory(historyStorageKey: string) {
  localStorage.removeItem(historyStorageKey);
}

function buildContextualSuggestions(routeContext: string): string[] {
  const contextual = ROUTE_QUICK_SUGGESTIONS.find((entry) => entry.match.test(routeContext))?.suggestions ?? [];
  return [...contextual, ...GENERIC_QUICK_SUGGESTIONS].slice(0, 6);
}

function parseHistoryFromJson(raw: unknown): ClarisChatHistoryItem[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((item): item is ClarisChatHistoryItem => (
      item !== null
      && typeof item === 'object'
      && ((item as { role?: unknown }).role === 'assistant' || (item as { role?: unknown }).role === 'user')
      && typeof (item as { content?: unknown }).content === 'string'
    ))
    .slice(-40);
}

function historyToChatMessages(history: ClarisChatHistoryItem[]): ChatMessage[] {
  return history.map((item, index) => ({
    id: `history-${index}-${Date.now()}`,
    role: item.role,
    content: item.content,
  }));
}

function deriveConversationTitle(history: ClarisChatHistoryItem[]): string {
  const firstUserMessage = history.find((item) => item.role === 'user')?.content.trim();
  if (firstUserMessage && firstUserMessage.length > 0) {
    return firstUserMessage.length > 64 ? `${firstUserMessage.slice(0, 61)}...` : firstUserMessage;
  }
  return 'Nova conversa';
}

function parseUiActions(raw: unknown): ChatAction[] {
  if (!Array.isArray(raw)) return [];

  const parsed: ChatAction[] = [];

  for (let index = 0; index < raw.length; index += 1) {
    const item = raw[index];
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;

    const record = item as Record<string, unknown>;
    const id = typeof record.id === 'string' && record.id.trim()
      ? record.id.trim()
      : `action-${index}-${Date.now()}`;
    const label = typeof record.label === 'string' ? record.label.trim() : '';
    const value = typeof record.value === 'string' ? record.value.trim() : '';
    const kind: ChatActionKind | null = record.kind === 'quick_reply' ? 'quick_reply' : null;
    const jobId = typeof record.job_id === 'string' && record.job_id.trim().length > 0
      ? record.job_id.trim()
      : undefined;

    if (!label || !value || !kind) continue;

    parsed.push({ id, label, value, kind, jobId });

    if (parsed.length >= 6) break;
  }

  return parsed;
}

function parseRichBlocks(raw: unknown): ChatRichBlock[] {
  if (!Array.isArray(raw)) return [];

  const result: ChatRichBlock[] = [];

  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const r = item as Record<string, unknown>;

    if (r.type === 'data_table') {
      const columns = Array.isArray(r.columns)
        ? r.columns.filter((c): c is RichColumn =>
            c !== null && typeof c === 'object' && typeof c.key === 'string' && typeof c.label === 'string')
        : [];

      const rows = Array.isArray(r.rows)
        ? r.rows.filter((row): row is Record<string, string> =>
            row !== null && typeof row === 'object' && !Array.isArray(row))
        : [];

      result.push({
        type: 'data_table',
        tool: typeof r.tool === 'string' ? r.tool : '',
        title: typeof r.title === 'string' ? r.title : '',
        empty_message: typeof r.empty_message === 'string' ? r.empty_message : 'Nenhum resultado.',
        columns,
        rows,
      });
    } else if (r.type === 'stat_cards') {
      const stats = Array.isArray(r.stats)
        ? r.stats.filter((s): s is StatCard =>
            s !== null && typeof s === 'object'
            && typeof s.label === 'string' && typeof s.value === 'string')
        : [];

      result.push({
        type: 'stat_cards',
        title: typeof r.title === 'string' ? r.title : '',
        stats,
      });
    }
  }

  return result;
}

// ---- Block renderers ----

const RISK_COLORS: Record<string, string> = {
  'Crítico':  'text-destructive font-semibold',
  'Risco':    'text-orange-500 font-medium',
  'Atenção':  'text-yellow-600 font-medium',
  'Normal':   'text-green-600',
  'Inativo':  'text-muted-foreground',
};

const PRIORITY_COLORS: Record<string, string> = {
  alta:  'text-destructive font-semibold',
  media: 'text-orange-500',
  media_alta: 'text-orange-500',
  baixa: 'text-muted-foreground',
};

function cellClass(col: RichColumn, value: string): string {
  if (col.key === 'risco') return RISK_COLORS[value] ?? '';
  if (col.key === 'prioridade') return PRIORITY_COLORS[value.toLowerCase()] ?? '';
  if (col.key === 'status' && value === 'aberta') return 'text-yellow-600';
  if (col.key === 'status' && value === 'em_andamento') return 'text-blue-500';
  if (col.key === 'status' && value === 'concluida') return 'text-green-600';
  return '';
}

function DataTableBlockView({ block }: { block: DataTableBlock }) {
  const visibleCols = block.columns.filter((c) => c.key !== 'id');

  // Pick 2 "primary" cols (first two) and the rest as secondary
  const primaryCols = visibleCols.slice(0, 2);
  const secondaryCols = visibleCols.slice(2);

  if (block.rows.length === 0) {
    return (
      <div className="mt-1.5 rounded-md border text-xs overflow-hidden">
        <div className="bg-primary/10 px-2.5 py-1.5 font-semibold text-primary">{block.title}</div>
        <div className="px-2.5 py-2 text-muted-foreground">{block.empty_message}</div>
      </div>
    );
  }

  return (
    <div className="mt-1.5 rounded-md border text-xs overflow-hidden">
      <div className="bg-primary/10 px-2.5 py-1.5 font-semibold text-primary">{block.title}</div>
      <div className="divide-y">
        {block.rows.map((row, i) => (
          <div key={i} className="px-2.5 py-1.5 hover:bg-muted/50">
            {/* Primary row */}
            <div className="flex items-center justify-between gap-2">
              {primaryCols.map((col) => (
                <span
                  key={col.key}
                  className={cn('truncate', cellClass(col, row[col.key] ?? ''))}
                  title={row[col.key] ?? '—'}
                >
                  {row[col.key] ?? '—'}
                </span>
              ))}
            </div>
            {/* Secondary row */}
            {secondaryCols.length > 0 && (
              <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 mt-0.5 text-muted-foreground">
                {secondaryCols.map((col) => {
                  const val = row[col.key] ?? '—';
                  if (val === '—') return null;
                  return (
                    <span key={col.key} className={cn(cellClass(col, val))}>
                      {col.label}: <span className="text-foreground/80">{val}</span>
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const VARIANT_STYLES: Record<string, string> = {
  default: 'bg-muted',
  warning: 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
  danger:  'bg-red-50 border-red-200 text-red-900 dark:bg-red-950/40 dark:text-red-200',
};

function StatCardsBlockView({ block }: { block: StatCardsBlock }) {
  return (
    <div className="mt-1.5 rounded-md border text-xs overflow-hidden">
      <div className="bg-primary/10 px-2.5 py-1.5 font-semibold text-primary">{block.title}</div>
      <div className="grid grid-cols-2 gap-px bg-border p-px">
        {block.stats.map((stat, i) => (
          <div
            key={i}
            className={cn(
              'flex flex-col px-2.5 py-2 rounded',
              VARIANT_STYLES[stat.variant] ?? VARIANT_STYLES.default,
            )}
          >
            <span className="text-muted-foreground leading-tight">{stat.label}</span>
            <span className="text-base font-bold leading-tight mt-0.5">{stat.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RichBlocksView({ blocks }: { blocks: ChatRichBlock[] }) {
  return (
    <div className="mt-1 space-y-1.5">
      {blocks.map((block, i) =>
        block.type === 'data_table'
          ? <DataTableBlockView key={i} block={block} />
          : <StatCardsBlockView key={i} block={block} />,
      )}
    </div>
  );
}

interface FloatingClarisChatProps {
  variant?: 'floating' | 'page';
}

interface ClarisConversationThread {
  id: string;
  title: string;
  history: ClarisChatHistoryItem[];
  updatedAt: string;
  lastContextRoute: string;
  isLocalOnly?: boolean;
}

export function FloatingClarisChat({ variant = 'floating' }: FloatingClarisChatProps) {
  const auth = useAuth() as { moodleSession?: { moodleUrl: string; moodleToken: string } | null; user?: { id: string } | null };
  const navigate = useNavigate();
  const location = useLocation();
  const moodleSession = auth.moodleSession ?? null;
  const userId = auth.user?.id ?? 'anonymous';
  const isFloating = variant === 'floating';
  const historyStorageKey = `${CLARIS_HISTORY_STORAGE_PREFIX}:${userId}`;
  const contextFromQuery = new URLSearchParams(location.search).get('context')?.trim() ?? '';
  const activeRouteContext = contextFromQuery || location.pathname;

  const [isOpen, setIsOpen] = useState(() => {
    if (!isFloating) return true;
    return localStorage.getItem(CLARIS_WIDGET_OPEN_STORAGE_KEY) === 'true';
  });
  const [isChatVisible, setIsChatVisible] = useState(() => !isFloating || localStorage.getItem(CLARIS_WIDGET_OPEN_STORAGE_KEY) === 'true');
  const [inputValue, setInputValue] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [conversations, setConversations] = useState<ClarisConversationThread[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isConfigured, setIsConfigured] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isHydratingConversations, setIsHydratingConversations] = useState(true);
  const [editingConversationId, setEditingConversationId] = useState<string | null>(null);
  const [editingConversationTitle, setEditingConversationTitle] = useState('');
  const [editingConversationError, setEditingConversationError] = useState('');
  const [isIcebreakersOpen, setIsIcebreakersOpen] = useState(true);
  const scrollEndRef = useRef<HTMLDivElement>(null);

  const canSend = useMemo(() => inputValue.trim().length > 0 && !isSending, [inputValue, isSending]);
  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) ?? null,
    [conversations, activeConversationId],
  );
  const suggestionsRoute = activeConversation?.lastContextRoute || activeRouteContext;
  const contextualSuggestions = useMemo(
    () => buildContextualSuggestions(suggestionsRoute),
    [suggestionsRoute],
  );
  const activeConversationHasMessages = (activeConversation?.history.length ?? 0) > 0;
  const shouldShowIcebreakers = !isHydratingConversations && !activeConversationHasMessages;
  const visibleConversations = useMemo(
    () => conversations.filter((conversation) => conversation.history.length > 0),
    [conversations],
  );

  useEffect(() => {
    const configured = localStorage.getItem(CLARIS_CONFIGURED_STORAGE_KEY) === 'true';
    setIsConfigured(configured);
  }, []);

  useEffect(() => {
    if (!isFloating) return;
    localStorage.setItem(CLARIS_WIDGET_OPEN_STORAGE_KEY, String(isOpen));
  }, [isFloating, isOpen]);

  useEffect(() => {
    if (!isFloating) return;

    if (isOpen) {
      setIsChatVisible(true);
      const configured = localStorage.getItem(CLARIS_CONFIGURED_STORAGE_KEY) === 'true';
      setIsConfigured(configured);
      return;
    }

    const timeoutId = window.setTimeout(() => setIsChatVisible(false), 180);
    return () => window.clearTimeout(timeoutId);
  }, [isFloating, isOpen]);

  useEffect(() => {
    if (!isFloating) {
      setIsOpen(true);
      setIsChatVisible(true);
    }
  }, [isFloating]);

  useEffect(() => {
    if (scrollEndRef.current) {
      scrollEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  useEffect(() => {
    if (shouldShowIcebreakers) {
      setIsIcebreakersOpen(true);
    } else {
      setIsIcebreakersOpen(false);
    }
  }, [shouldShowIcebreakers]);

  useEffect(() => {
    let isMounted = true;

    const hydrateConversations = async () => {
      setIsHydratingConversations(true);

      const localHistory = parseStoredHistory(localStorage.getItem(historyStorageKey));
      let fallbackThread: ClarisConversationThread | null = null;
      if (localHistory.length > 0) {
        fallbackThread = {
          id: `local-${Date.now()}`,
          title: deriveConversationTitle(localHistory),
          history: localHistory,
          updatedAt: new Date().toISOString(),
          lastContextRoute: activeRouteContext,
          isLocalOnly: true,
        };
      }

      try {
        const { data, error } = await supabase
          .from('claris_conversations')
          .select('id, title, messages, updated_at, last_context_route')
          .eq('user_id', userId)
          .order('updated_at', { ascending: false })
          .limit(30);

        if (error) throw error;

        const remoteConversations: ClarisConversationThread[] = (data ?? []).map((row) => {
          const history = parseHistoryFromJson(row.messages);
          return {
            id: row.id,
            title: row.title || deriveConversationTitle(history),
            history,
            updatedAt: row.updated_at,
            lastContextRoute: row.last_context_route || activeRouteContext,
          };
        });

        if (!isMounted) return;

        if (remoteConversations.length > 0) {
          const selected = remoteConversations[0];
          setConversations(remoteConversations);
          setActiveConversationId(selected.id);
          setMessages([INITIAL_MESSAGE, ...historyToChatMessages(selected.history)]);
          localStorage.setItem(historyStorageKey, JSON.stringify(selected.history));
        } else if (fallbackThread) {
          setConversations([fallbackThread]);
          setActiveConversationId(fallbackThread.id);
          setMessages([INITIAL_MESSAGE, ...historyToChatMessages(fallbackThread.history)]);
        } else {
          const emptyThread: ClarisConversationThread = {
            id: `local-${Date.now()}`,
            title: 'Nova conversa',
            history: [],
            updatedAt: new Date().toISOString(),
            lastContextRoute: activeRouteContext,
            isLocalOnly: true,
          };
          setConversations([emptyThread]);
          setActiveConversationId(emptyThread.id);
          setMessages([INITIAL_MESSAGE]);
        }
      } catch {
        if (!isMounted) return;

        if (fallbackThread) {
          setConversations([fallbackThread]);
          setActiveConversationId(fallbackThread.id);
          setMessages([INITIAL_MESSAGE, ...historyToChatMessages(fallbackThread.history)]);
        } else {
          const emptyThread: ClarisConversationThread = {
            id: `local-${Date.now()}`,
            title: 'Nova conversa',
            history: [],
            updatedAt: new Date().toISOString(),
            lastContextRoute: activeRouteContext,
            isLocalOnly: true,
          };
          setConversations([emptyThread]);
          setActiveConversationId(emptyThread.id);
          setMessages([INITIAL_MESSAGE]);
        }
      } finally {
        if (isMounted) setIsHydratingConversations(false);
      }
    };

    hydrateConversations();

    return () => {
      isMounted = false;
    };
  }, [activeRouteContext, historyStorageKey, userId]);

  useEffect(() => {
    if (isHydratingConversations || !activeConversationId) return;

    const historyToPersist = messages
      .filter((message) => message.id !== 'welcome')
      .map(({ role, content }) => ({ role, content }))
      .slice(-40);

    localStorage.setItem(historyStorageKey, JSON.stringify(historyToPersist));

    const nextTitle = deriveConversationTitle(historyToPersist);
    const nowIso = new Date().toISOString();
    setConversations((prev) => {
      const updated = prev.map((conversation) =>
        conversation.id === activeConversationId
          ? {
              ...conversation,
              title: nextTitle,
              history: historyToPersist,
              updatedAt: nowIso,
              lastContextRoute: activeRouteContext,
            }
          : conversation,
      );
      return [...updated].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    });

    if (activeConversationId.startsWith('local-')) {
      void supabase
        .from('claris_conversations')
        .insert({
          user_id: userId,
          title: nextTitle,
          messages: historyToPersist,
          last_context_route: activeRouteContext,
        })
        .select('id, title, messages, updated_at, last_context_route')
        .single()
        .then(({ data, error }) => {
          if (error || !data) return;
          setConversations((prev) => prev.map((conversation) =>
            conversation.id === activeConversationId
              ? {
                  id: data.id,
                  title: data.title,
                  history: parseHistoryFromJson(data.messages),
                  updatedAt: data.updated_at,
                  lastContextRoute: data.last_context_route || activeRouteContext,
                }
              : conversation,
          ));
          setActiveConversationId(data.id);
        });
      return;
    }

    void supabase
      .from('claris_conversations')
      .update({
        title: nextTitle,
        messages: historyToPersist,
        last_context_route: activeRouteContext,
      })
      .eq('id', activeConversationId)
      .eq('user_id', userId);
  }, [activeConversationId, activeRouteContext, historyStorageKey, isHydratingConversations, messages, userId]);

  const selectConversation = (conversationId: string) => {
    const selected = conversations.find((conversation) => conversation.id === conversationId);
    if (!selected) return;
    setActiveConversationId(selected.id);
    setMessages([INITIAL_MESSAGE, ...historyToChatMessages(selected.history)]);
    setInputValue('');
  };

  const createNewConversation = async () => {
    const reusableEmptyConversation = conversations.find((conversation) => conversation.history.length === 0);
    if (reusableEmptyConversation) {
      setActiveConversationId(reusableEmptyConversation.id);
      setMessages([INITIAL_MESSAGE]);
      setInputValue('');
      return;
    }

    const localConversation: ClarisConversationThread = {
      id: `local-${Date.now()}`,
      title: 'Nova conversa',
      history: [],
      updatedAt: new Date().toISOString(),
      lastContextRoute: activeRouteContext,
      isLocalOnly: true,
    };

    try {
      const { data, error } = await supabase
        .from('claris_conversations')
        .insert({
          user_id: userId,
          title: 'Nova conversa',
          messages: [],
          last_context_route: activeRouteContext,
        })
        .select('id, title, messages, updated_at, last_context_route')
        .single();

      if (error) throw error;

      const created: ClarisConversationThread = {
        id: data.id,
        title: data.title,
        history: parseHistoryFromJson(data.messages),
        updatedAt: data.updated_at,
        lastContextRoute: data.last_context_route || activeRouteContext,
      };

      setConversations((prev) => [created, ...prev]);
      setActiveConversationId(created.id);
    } catch {
      setConversations((prev) => [localConversation, ...prev]);
      setActiveConversationId(localConversation.id);
    }

    clearStoredHistory(historyStorageKey);
    setMessages([INITIAL_MESSAGE]);
    setInputValue('');
  };

  const startRenameConversation = (conversationId: string, currentTitle: string) => {
    setEditingConversationId(conversationId);
    setEditingConversationTitle(currentTitle);
    setEditingConversationError('');
  };

  const cancelRenameConversation = () => {
    setEditingConversationId(null);
    setEditingConversationTitle('');
    setEditingConversationError('');
  };

  const saveConversationRename = async () => {
    if (!editingConversationId) return;
    const nextTitle = editingConversationTitle.trim();
    if (!nextTitle) {
      setEditingConversationError('O título não pode ficar vazio.');
      return;
    }

    setEditingConversationError('');

    setConversations((prev) => prev.map((conversation) =>
      conversation.id === editingConversationId
        ? { ...conversation, title: nextTitle, updatedAt: new Date().toISOString() }
        : conversation,
    ));

    if (!editingConversationId.startsWith('local-')) {
      await supabase
        .from('claris_conversations')
        .update({ title: nextTitle })
        .eq('id', editingConversationId)
        .eq('user_id', userId);
    }

    cancelRenameConversation();
  };

  const deleteConversation = async (conversationId: string) => {
    const conversation = conversations.find((item) => item.id === conversationId);
    if (!conversation) return;

    const confirmed = window.confirm(`Deseja excluir a conversa "${conversation.title}"? Esta ação não pode ser desfeita.`);
    if (!confirmed) return;

    const remaining = conversations.filter((item) => item.id !== conversationId);
    setConversations(remaining);

    if (!conversationId.startsWith('local-')) {
      await supabase
        .from('claris_conversations')
        .delete()
        .eq('id', conversationId)
        .eq('user_id', userId);
    }

    if (activeConversationId === conversationId) {
      if (remaining.length > 0) {
        const nextConversation = [...remaining].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
        setActiveConversationId(nextConversation.id);
        setMessages([INITIAL_MESSAGE, ...historyToChatMessages(nextConversation.history)]);
      } else {
        await createNewConversation();
      }
    }

    if (editingConversationId === conversationId) {
      cancelRenameConversation();
    }
  };

  const clearConversation = () => {
    clearStoredHistory(historyStorageKey);
    setMessages([
      INITIAL_MESSAGE,
      {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: 'Histórico da conversa limpo com sucesso.',
      },
    ]);
    setInputValue('');
  };

  const handleSend = async (messageOverride?: string, action?: ChatAction) => {
    const sourceMessage = messageOverride ?? inputValue;
    const trimmedMessage = sourceMessage.trim();
    if (!trimmedMessage) return;

    if (isClearHistoryCommand(trimmedMessage)) {
      clearConversation();
      return;
    }

    // Capture history BEFORE the new message is added (exclude welcome message)
    const history = messages
      .filter((m) => m.id !== 'welcome')
      .map(({ role, content }) => ({ role, content }));

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmedMessage,
    };

    setMessages((prev) => ([
      ...prev.map((message): ChatMessage => ({ ...message, actions: undefined })),
      userMessage,
    ]));
    if (!messageOverride) {
      setInputValue('');
    }

    if (!isConfigured) {
      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: CLARIS_NOT_CONFIGURED_REPLY,
      };
      setMessages((prev) => [...prev, assistantMessage]);
      return;
    }

    setIsSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('claris-chat', {
        body: {
          message: trimmedMessage,
          history,
          moodleUrl: moodleSession?.moodleUrl,
          moodleToken: moodleSession?.moodleToken,
          action: action ? {
            kind: action.kind,
            value: action.value,
            jobId: action.jobId,
          } : undefined,
        },
      });

      if (error) throw error;

      const typedData = (data ?? {}) as ClarisChatFunctionResponse;
      const assistantReply = typeof typedData.reply === 'string' && typedData.reply.trim().length > 0
        ? typedData.reply
        : CLARIS_PLACEHOLDER_REPLY;
      const uiActions = parseUiActions(typedData.uiActions);
      const richBlocks = parseRichBlocks(typedData.richBlocks);

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: assistantReply,
        actions: uiActions.length > 0 ? uiActions : undefined,
        richBlocks: richBlocks.length > 0 ? richBlocks : undefined,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch {
      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: 'Não consegui me conectar ao modelo agora. Verifique as configurações da Claris IA e tente novamente.',
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } finally {
      setIsSending(false);
    }
  };

  const chatPanel = (
    <div
      className={cn(
        'overflow-hidden rounded-xl border bg-card shadow-xl',
        isFloating
          ? 'w-full sm:w-[360px] max-w-full'
          : 'flex h-full min-h-[calc(100vh-12rem)] w-full flex-col border-border/60 shadow-sm',
      )}
    >
          <div
            className={cn(
              'transition-all duration-200 ease-out',
              isFloating && !isOpen ? 'translate-y-2 scale-95 opacity-0 pointer-events-none' : 'translate-y-0 scale-100 opacity-100'
            )}
          >
          <div className="flex items-center justify-between border-b px-3 py-2">
            <div className="flex items-center gap-2">
              <ClarisIcon className="h-5 w-5 text-primary" />
              <span className="text-sm font-semibold">Claris IA</span>
            </div>
            <div className="flex items-center gap-1">
              {!isFloating && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={createNewConversation}
                  aria-label="Nova conversa"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Nova conversa
                </Button>
              )}
              {isFloating && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => navigate(`/claris?context=${encodeURIComponent(location.pathname)}`)}
                  aria-label="Abrir chat expandido da Claris IA"
                >
                  <Expand className="h-4 w-4" />
                </Button>
              )}
              {isFloating && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setIsOpen(false)}
                  aria-label="Fechar chat"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          <ScrollArea className={cn('px-3 py-3', isFloating ? 'h-[320px]' : 'h-[calc(100vh-18rem)] min-h-[360px]')}>
            <div className="space-y-2" data-testid="message-list">
              {messages.map((message) => (
                <div
                  data-testid="chat-message"
                  key={message.id}
                  className={cn(
                    'max-w-full min-w-0 break-words whitespace-pre-wrap rounded-lg px-3 py-2 text-sm sm:max-w-[90%]',
                    message.role === 'assistant'
                      ? 'bg-muted text-foreground'
                      : 'ml-auto bg-primary text-primary-foreground'
                  )}
                >
                  {message.content}
                  {message.role === 'assistant' && message.richBlocks && message.richBlocks.length > 0 && (
                    <RichBlocksView blocks={message.richBlocks} />
                  )}
                  {message.role === 'assistant' && message.actions && message.actions.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {message.actions.map((action) => (
                        <Button
                          key={action.id}
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8"
                          disabled={isSending}
                          onClick={() => handleSend(action.value, action)}
                        >
                          {action.label}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {shouldShowIcebreakers && (
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between gap-2 px-1">
                    <span className="text-[11px] font-medium text-muted-foreground">Quebra-gelos da Claris</span>
                    <button
                      type="button"
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      onClick={() => setIsIcebreakersOpen((prev) => !prev)}
                      aria-label="Alternar quebra-gelos da Claris"
                      aria-expanded={isIcebreakersOpen}
                    >
                      {isIcebreakersOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  {isIcebreakersOpen && (
                    <div className="flex flex-wrap gap-2">
                      {contextualSuggestions.map((suggestion) => (
                        <Button
                          key={suggestion}
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-auto max-w-[280px] rounded-[20px] border-border/70 bg-background px-3 py-2 text-left text-xs leading-4 text-foreground/90 shadow-sm hover:bg-muted sm:max-w-[320px]"
                          onClick={() => handleSend(suggestion)}
                          disabled={isSending}
                        >
                          <Sparkles className="mr-1.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="line-clamp-2 min-w-0 break-words">{suggestion}</span>
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div ref={scrollEndRef} />
            </div>
          </ScrollArea>

          <div className="border-t p-2">
            <form
              className="flex items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                handleSend();
              }}
            >
              <Input
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                placeholder="Digite sua mensagem..."
                aria-label="Mensagem para Claris IA"
                disabled={isSending}
              />
              {isFloating && (
                <Button type="button" variant="ghost" size="icon" onClick={createNewConversation} aria-label="Nova conversa">
                  <Plus className="h-4 w-4" />
                </Button>
              )}
              <Button type="submit" size="icon" disabled={!canSend} aria-label="Enviar mensagem">
                {isSending ? <Spinner className="h-4 w-4" onAccent /> : <Send className="h-4 w-4" />}
              </Button>
            </form>
          </div>
          </div>
        </div>
  );

  if (!isFloating) {
    return (
      <div className="flex h-full min-h-[calc(100vh-12rem)] w-full flex-col lg:flex-row">
        <aside className="flex w-full shrink-0 flex-col border-b border-border/60 bg-muted/20 lg:w-[320px] lg:border-b-0 lg:border-r">
          <div className="min-h-0 flex-1 overflow-hidden px-4 py-4">
            <div className="mb-3 flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-semibold">Conversas</p>
                <p className="text-xs text-muted-foreground">Histórico sincronizado entre dispositivos</p>
              </div>
            </div>

            <ScrollArea className="h-[240px] lg:h-full pr-2">
              {isHydratingConversations ? (
                <div className="flex items-center justify-center py-8">
                  <Spinner className="h-5 w-5" />
                </div>
              ) : visibleConversations.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/70 bg-background/80 px-3 py-4 text-sm text-muted-foreground">
                  Ainda não há conversas iniciadas.
                </div>
              ) : (
                <div className="space-y-2">
                  {visibleConversations.map((conversation) => (
                    <div
                      key={conversation.id}
                      className={cn(
                        'w-full rounded-xl border px-3 py-2 transition-colors',
                        activeConversationId === conversation.id
                          ? 'border-primary/40 bg-primary/10'
                          : 'border-border/70 bg-background/80 hover:bg-background',
                      )}
                    >
                      {editingConversationId === conversation.id ? (
                        <div className="space-y-2">
                          <Input
                            value={editingConversationTitle}
                            onChange={(event) => {
                              setEditingConversationTitle(event.target.value);
                              if (editingConversationError) {
                                setEditingConversationError('');
                              }
                            }}
                            autoFocus
                            onFocus={(event) => event.currentTarget.select()}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                void saveConversationRename();
                              }
                              if (event.key === 'Escape') {
                                event.preventDefault();
                                cancelRenameConversation();
                              }
                            }}
                            aria-label={`Renomear conversa ${conversation.title}`}
                            className="h-8"
                          />
                          {editingConversationError && (
                            <p className="text-[11px] text-destructive" role="alert">
                              {editingConversationError}
                            </p>
                          )}
                          <div className="flex justify-end gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={cancelRenameConversation}
                              aria-label={`Cancelar renomear conversa ${conversation.title}`}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => void saveConversationRename()}
                              aria-label={`Salvar renomear conversa ${conversation.title}`}
                            >
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start gap-2">
                          <button
                            type="button"
                            className="min-w-0 flex-1 text-left"
                            onClick={() => selectConversation(conversation.id)}
                            aria-label={`Abrir conversa ${conversation.title}`}
                          >
                            <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                              <span className="font-semibold uppercase tracking-wide truncate">{conversation.title}</span>
                            </div>
                            <div className="line-clamp-2 text-sm break-words text-foreground/90">
                              {conversation.history[conversation.history.length - 1]?.content ?? 'Sem mensagens ainda'}
                            </div>
                          </button>

                          <div className="flex items-center gap-1">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  aria-label={`Mais opções da conversa ${conversation.title}`}
                                >
                                  <MoreHorizontal className="h-3.5 w-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onSelect={() => startRenameConversation(conversation.id, conversation.title)}>
                                  <Pencil className="mr-2 h-3.5 w-3.5" />
                                  Renomear
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onSelect={() => {
                                    void deleteConversation(conversation.id);
                                  }}
                                >
                                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                                  Excluir
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </aside>

        <div className="flex min-h-0 flex-1">{chatPanel}</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-x-2 bottom-4 z-50 flex flex-col items-end gap-2 sm:left-auto sm:right-4 sm:inset-x-auto">
      {isChatVisible && chatPanel}

      {!isOpen && (
        <Button
          type="button"
          size="icon"
          className="h-14 w-14 rounded-full shadow-lg [&_svg]:h-12 [&_svg]:w-12"
          onClick={() => setIsOpen(true)}
          aria-label="Abrir chat da Claris IA"
        >
          <ClarisIcon className="h-full w-full" />
          <MessageCircle className="sr-only" />
        </Button>
      )}
    </div>
  );
}
